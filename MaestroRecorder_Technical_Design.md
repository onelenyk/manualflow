# MaestroRecorder

**Automated Test Flow Recorder for Android**
*UIAutomator + getevent → Maestro YAML*

Technical Design Document | Version 1.0 | April 2026 | Author: Nazar Lenyk

---

## 1. Overview

MaestroRecorder is a developer tool that records real user interactions with an Android application and automatically generates Maestro-compatible YAML test flows. The tool combines two complementary data sources: **UIAutomator** for semantic UI tree information and **Linux getevent** for precise input event capture.

The core idea: instead of manually writing Maestro YAML files, a developer or QA engineer simply uses the app as a normal user while MaestroRecorder captures every action. The output is a ready-to-run Maestro test flow.

### 1.1 Problem Statement

- Writing Maestro YAML tests manually is time-consuming, especially for apps with many complex flows
- Maestro Studio provides limited recording capabilities but lacks full gesture support and intelligent element identification
- Existing ADB-based recorders capture only raw coordinates, producing fragile tests that break on different screen sizes
- No existing tool combines semantic UI understanding with precise gesture recording

### 1.2 Solution

A two-component system consisting of a **CLI tool** running on the developer's computer and an **instrumentation APK** on the Android device. The CLI orchestrates recording sessions, merges data from both sources, and generates stable Maestro YAML output.

---

## 2. Architecture

### 2.1 System Components

| Component | Runs On | Role |
|-----------|---------|------|
| Recorder CLI | Developer machine | Orchestrates recording, merges events, generates YAML |
| Instrumentation APK | Android device | GRPC/HTTP server with UIAutomator access |
| getevent stream | Android device (via ADB) | Raw kernel input events (touch, gestures) |
| UIAutomator | Android device (in APK) | UI hierarchy dumps, element identification |

### 2.2 Data Flow

```
┌───────────────────────────────┐     ┌─────────────────────────────┐
│  Android Device               │     │  Developer Machine          │
│                               │     │                             │
│  getevent -lt ──────────────────────▶ Event Parser              │
│                               │     │      │                      │
│  UIAutomator (GRPC) ─────────────────▶ Event Merger ──▶ YAML    │
│                               │     │      │            Generator │
│  Screenshots ───────────────────────▶ Screen Differ             │
└───────────────────────────────┘     └─────────────────────────────┘
```

### 2.3 Recording Sequence

When a recording session starts, the CLI initiates three parallel processes:

1. **getevent stream:** `adb shell getevent -lt` pipes raw kernel input events to the CLI in real-time. The Event Parser classifies each sequence as tap, swipe, long press, or multi-touch gesture.

2. **UIAutomator queries:** After each detected user action (triggered by `BTN_TOUCH UP`), the CLI requests a UI hierarchy dump from the instrumentation APK via GRPC. The dump provides element text, resource-id, content description, bounds, and class name.

3. **Screenshot capture:** Periodic screenshots via ADB are compared to detect screen transitions (new Activity, dialog, navigation). These become `assertVisible` statements in the output YAML.

---

## 3. getevent Parser

### 3.1 Input Format

The `getevent` utility reads raw Linux kernel input events from `/dev/input/eventX`. With the `-lt` flags, output includes human-readable labels and timestamps:

```
[  1234.567890] /dev/input/event2: EV_ABS  ABS_MT_POSITION_X   00000218
[  1234.567890] /dev/input/event2: EV_ABS  ABS_MT_POSITION_Y   000004b0
[  1234.567890] /dev/input/event2: EV_KEY  BTN_TOUCH           DOWN
[  1234.567890] /dev/input/event2: EV_SYN  SYN_REPORT          00000000
[  1234.620000] /dev/input/event2: EV_KEY  BTN_TOUCH           UP
[  1234.620000] /dev/input/event2: EV_SYN  SYN_REPORT          00000000
```

### 3.2 Coordinate Conversion

getevent reports raw sensor values, not screen pixels. Conversion requires querying the input device range:

```bash
adb shell getevent -lp /dev/input/event2
# Output:
#   ABS_MT_POSITION_X: min=0, max=4095
#   ABS_MT_POSITION_Y: min=0, max=4095
```

Pixel coordinates are calculated as:

```
pixel_x = (raw_x / max_x) * screen_width
pixel_y = (raw_y / max_y) * screen_height
```

Screen dimensions are obtained via `adb shell wm size`.

### 3.3 Gesture Classification

| Gesture | Detection Pattern | Maestro Command |
|---------|-------------------|-----------------|
| Tap | BTN_TOUCH DOWN → stable X/Y → UP within 200ms | `- tapOn: {element}` |
| Long Press | BTN_TOUCH DOWN → stable X/Y → UP after >500ms | `- longPressOn: {element}` |
| Swipe | BTN_TOUCH DOWN → X/Y changes → UP | `- swipe: {direction/coords}` |
| Scroll | Swipe with primarily vertical movement | `- scroll` / `- scrollUntilVisible` |
| Pinch/Zoom | Two TRACKING_IDs active simultaneously | `- pinch: {scale}` |
| Double Tap | Two taps at same position within 300ms | `- doubleTapOn: {element}` |

### 3.4 State Machine

The parser maintains a finite state machine per `TRACKING_ID`:

```
IDLE ─── BTN_TOUCH DOWN ───▶ TOUCH_ACTIVE
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                   X/Y stable              X/Y moving
                        │                       │
                        ▼                       ▼
                  POTENTIAL_TAP            SWIPING
                        │                       │
                   BTN_TOUCH UP            BTN_TOUCH UP
                        │                       │
              ┌─────────┴────────┐              ▼
              │                  │        SWIPE_COMPLETE
           <200ms             >500ms
              │                  │
              ▼                  ▼
            TAP             LONG_PRESS
```

### 3.5 Thresholds

| Parameter | Value | Description |
|-----------|-------|-------------|
| `TAP_MAX_DURATION` | 200ms | Maximum touch duration for a tap |
| `LONG_PRESS_MIN_DURATION` | 500ms | Minimum touch duration for long press |
| `TAP_MAX_DISTANCE` | 20px | Maximum finger movement to still classify as tap |
| `DOUBLE_TAP_MAX_INTERVAL` | 300ms | Maximum gap between two taps for double-tap |
| `SCROLL_VERTICAL_THRESHOLD` | 70% | Minimum vertical component ratio for scroll vs swipe |

---

## 4. UIAutomator Integration

### 4.1 Instrumentation APK

An Android instrumentation test APK is installed on the device. It contains a GRPC server (Netty-based) that accepts requests from the CLI and uses UIAutomator to interact with the device's accessibility tree.

The APK is installed and launched via:

```bash
adb install maestro-recorder-agent.apk
adb shell am instrument -w com.maestrorecorder.agent/.RecorderInstrumentation
```

### 4.2 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hierarchy` | GET | Returns full UI tree as JSON with bounds, text, resource-id, class, contentDescription, enabled, clickable, focused for each node |
| `/element-at` | POST | Accepts x,y coordinates, returns the most specific (deepest) element at that position with all its properties |
| `/screenshot` | GET | Returns current screen as PNG via UIAutomator |
| `/device-info` | GET | Returns screen dimensions, density, and input device ranges for coordinate mapping |
| `/wait-idle` | POST | Blocks until UI is idle (no pending animations or layout passes) |

### 4.3 Element Identification Strategy

When the CLI detects a user action at coordinates (x, y), it calls `/element-at` to resolve the target element. The element is then identified for Maestro YAML using a priority-based strategy:

**Priority 1 — testTag (resource-id):** If the element has a resource-id (especially with Compose `testTagsAsResourceId` enabled), use it. This produces the most stable selectors:
```yaml
- tapOn:
    id: "btn_next"
```

**Priority 2 — Text content:** If the element has visible text, use it directly. Works well for buttons, labels, menu items:
```yaml
- tapOn: "Next"
```

**Priority 3 — Content description:** For image buttons and icons that have contentDescription set:
```yaml
- tapOn: "Navigate up"
```

**Priority 4 — Relative position:** If none of the above are available, use a combination of class name and relative position to nearby labeled elements. This is the least stable but covers edge cases.

### 4.4 Compose Compatibility

Jetpack Compose and Compose Multiplatform automatically generate accessibility nodes from semantics properties. For optimal recording quality, the target app should include:

```kotlin
// In the root composable or Application class
AndroidView.testTagsAsResourceId = true
```

This makes Compose `testTag` values visible as `resource-id` in UIAutomator, providing stable element identifiers that survive UI refactoring.

### 4.5 Hierarchy Response Format

```json
{
  "timestamp": 1234567890,
  "activity": "com.vanongo.app.OrderActivity",
  "nodes": [
    {
      "class": "android.widget.Button",
      "text": "Next",
      "resourceId": "com.vanongo.app:id/btn_next",
      "contentDescription": null,
      "bounds": { "left": 400, "top": 1100, "right": 680, "bottom": 1200 },
      "clickable": true,
      "enabled": true,
      "focused": false,
      "children": []
    }
  ]
}
```

---

## 5. Event Merger

### 5.1 Merge Algorithm

The Event Merger combines the getevent stream (precise timing and gesture data) with UIAutomator queries (semantic element identification). Both streams are correlated by timestamp.

| Timestamp | getevent | UIAutomator | YAML Output |
|-----------|----------|-------------|-------------|
| 10.001 | TAP at (540, 1200) | Button text="Next" id="btn_next" | `- tapOn: "Next"` |
| 10.350 | SWIPE (100,800)→(900,800) | (gesture, no element lookup) | `- swipe: { start: "10%,50%", end: "90%,50%" }` |
| 10.800 | TAP at (540, 400) | TextField id="address_field" | `- tapOn: id: "address_field"` |
| 10.810 | KEY_INPUT "Burshtyn" | (text input detected) | `- inputText: "Burshtyn"` |
| 11.200 | (no event) | Window changed → Step2Activity | `- assertVisible: "Step 2"` |

### 5.2 Merge Rules

- **Tap + Element:** If getevent detects a tap and UIAutomator resolves an element at those coordinates, generate `tapOn` with the element's identifier (using the priority strategy from section 4.3).

- **Swipe/Scroll:** Gestures are converted to relative coordinates (percentages) for screen-size independence. Vertical swipes with >70% vertical component become `scroll` commands.

- **Text Input:** Sequential KEY events after a tap on a text field are grouped into a single `inputText` command.

- **Screen Transition:** When UIAutomator reports a different Activity or a significant hierarchy change, an `assertVisible` command is inserted for the new screen's identifying element.

- **Deduplication:** Rapid repeated events (e.g., multiple scroll events within 100ms) are consolidated into a single command.

### 5.3 Timing Correlation

The merger uses a sliding window of ±100ms to correlate getevent actions with UIAutomator responses. Since UIAutomator dumps have latency (~200–500ms), the lookup is performed asynchronously:

1. getevent detects TAP at timestamp T with coordinates (x, y)
2. CLI immediately sends `/element-at` request with (x, y)
3. While waiting for response, CLI continues parsing getevent stream
4. When response arrives, CLI attaches element data to the action at timestamp T
5. YAML generation is deferred until element data is available

---

## 6. YAML Generator

### 6.1 Output Format

The generator produces standard Maestro YAML that can be executed with `maestro test` without any modifications:

```yaml
# Generated by MaestroRecorder v1.0
# Recorded: 2026-04-01 14:30:00
# App: com.vanongo.app
appId: com.vanongo.app
---
- launchApp
- tapOn: "Sign In"
- tapOn:
    id: "email_field"
- inputText: "test@vanongo.com"
- tapOn:
    id: "password_field"
- inputText: "test123"
- tapOn: "Next"
- assertVisible: "Dashboard"
- swipe:
    start: "50%, 80%"
    end: "50%, 20%"
- tapOn: "New Order"
- assertVisible: "Step 1"
```

### 6.2 Smart Assertions

The generator automatically inserts `assertVisible` statements at key points:

- After navigation events (new Activity detected)
- After actions that trigger screen transitions (submit buttons, navigation taps)
- At the end of the flow as a final verification

This ensures generated tests verify not just that actions execute, but that the app reaches the expected state.

### 6.3 Post-Processing

Before writing the final YAML, the generator applies several optimization passes:

- Removes redundant assertions (e.g., `assertVisible` immediately followed by `tapOn` on the same element)
- Converts absolute swipe coordinates to relative percentages
- Groups consecutive text inputs into single `inputText` commands
- Adds `waitForAnimationToEnd` after actions that typically trigger animations

---

## 7. CLI Interface

### 7.1 Commands

| Command | Description |
|---------|-------------|
| `maestro-recorder record -o flow.yaml` | Start recording session, output to file |
| `maestro-recorder record --app com.example.app` | Record with auto-launch of target app |
| `maestro-recorder record --live` | Live preview mode with real-time YAML output |
| `maestro-recorder devices` | List connected ADB devices |
| `maestro-recorder verify flow.yaml` | Verify generated YAML is valid Maestro syntax |
| `maestro-recorder convert events.log` | Convert raw event log to YAML (offline mode) |

### 7.2 Recording Session Lifecycle

```
$ maestro-recorder record -o login_flow.yaml

▶ Connected to device: Pixel 7 (emulator-5554)
▶ Installed instrumentation APK
▶ Started GRPC server on device (port 50051)
▶ Forwarding port: adb forward tcp:50051 tcp:50051
▶ Started getevent stream
▶ Recording... (press Ctrl+C to stop)

  [14:30:01] TAP → "Sign In" (Button)
  [14:30:03] TAP → id:email_field (TextField)
  [14:30:05] INPUT → "test@vanongo.com"
  [14:30:08] TAP → "Next" (Button)
  [14:30:09] SCREEN → DashboardActivity

^C
▶ Recording stopped. 5 actions captured.
▶ Generated: login_flow.yaml
▶ Run with: maestro test login_flow.yaml
```

### 7.3 Configuration

Optional `.maestro-recorder.yaml` in project root:

```yaml
# Default target app
appId: com.vanongo.app

# Element identification preferences
prefer: id          # id | text | contentDescription
fallback: text

# Gesture thresholds (override defaults)
thresholds:
  tapMaxDuration: 200
  longPressMinDuration: 500
  tapMaxDistance: 20

# Auto-assertions
assertions:
  onScreenChange: true
  onFlowEnd: true

# Output
output:
  directory: .maestro/flows/
  addTimestampComments: true
```

---

## 8. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| CLI | Kotlin/JVM | Same language as Android; coroutines for concurrent streams; shared data models with APK |
| GRPC | grpc-kotlin + Netty | Same approach as Maestro; bidirectional streaming; protobuf for typed API |
| Instrumentation | AndroidX Test + UIAutomator 2.4 | Official Google framework; best Compose support; actively maintained |
| Input Capture | `adb shell getevent -lt` | Kernel-level precision; no device modification needed; captures all gestures |
| YAML Output | kaml (Kotlin YAML) | Type-safe YAML generation; ensures valid Maestro syntax |
| Build | Gradle KMP | Single build for CLI (JVM) and APK (Android); shared models in commonMain |

---

## 9. Project Structure

```
maestro-recorder/
├── cli/                              # CLI application (Kotlin/JVM)
│   ├── src/main/kotlin/
│   │   ├── Main.kt                   # Entry point, arg parsing
│   │   ├── recorder/
│   │   │   ├── RecordingSession.kt   # Orchestrates recording
│   │   │   ├── GeteventParser.kt     # Raw event stream parser
│   │   │   ├── EventMerger.kt        # Combines gesture + UI data
│   │   │   └── ScreenTransition.kt   # Detects Activity changes
│   │   ├── generator/
│   │   │   ├── YamlGenerator.kt      # Produces Maestro YAML
│   │   │   └── PostProcessor.kt      # Optimizes generated output
│   │   └── adb/
│   │       ├── AdbBridge.kt          # ADB command wrapper
│   │       └── DeviceManager.kt      # Device discovery, setup
│   └── build.gradle.kts
│
├── agent/                            # Instrumentation APK
│   ├── src/main/kotlin/
│   │   ├── GrpcServer.kt             # On-device GRPC server
│   │   ├── HierarchyDumper.kt        # UIAutomator tree dump
│   │   ├── ElementResolver.kt        # Coordinate → element lookup
│   │   └── ScreenCapture.kt          # Screenshot provider
│   └── build.gradle.kts
│
├── shared/                           # Shared models (KMP commonMain)
│   └── src/commonMain/kotlin/
│       ├── models/
│       │   ├── UserAction.kt         # Tap, Swipe, LongPress, etc.
│       │   ├── UiElement.kt          # Element with properties
│       │   └── MaestroCommand.kt     # YAML command data class
│       └── proto/
│           └── recorder.proto        # GRPC service definition
│
└── build.gradle.kts                  # Root build file
```

---

## 10. GRPC Service Definition

```protobuf
syntax = "proto3";

package maestrorecorder;

service RecorderAgent {
  // Get full UI hierarchy
  rpc GetHierarchy (Empty) returns (HierarchyResponse);
  
  // Find element at coordinates
  rpc GetElementAt (Coordinates) returns (UiElementResponse);
  
  // Get device information
  rpc GetDeviceInfo (Empty) returns (DeviceInfoResponse);
  
  // Take screenshot
  rpc TakeScreenshot (Empty) returns (ScreenshotResponse);
  
  // Wait for UI idle
  rpc WaitForIdle (WaitOptions) returns (IdleResponse);
  
  // Stream hierarchy changes (for screen transition detection)
  rpc WatchHierarchy (Empty) returns (stream HierarchyEvent);
}

message Coordinates {
  int32 x = 1;
  int32 y = 2;
}

message UiElementResponse {
  string class_name = 1;
  string text = 2;
  string resource_id = 3;
  string content_description = 4;
  Bounds bounds = 5;
  bool clickable = 6;
  bool enabled = 7;
  bool focused = 8;
}

message Bounds {
  int32 left = 1;
  int32 top = 2;
  int32 right = 3;
  int32 bottom = 4;
}

message DeviceInfoResponse {
  int32 screen_width = 1;
  int32 screen_height = 2;
  int32 density = 3;
  int32 input_max_x = 4;
  int32 input_max_y = 5;
}

message HierarchyEvent {
  string activity_name = 1;
  string window_title = 2;
  int64 timestamp = 3;
}
```

---

## 11. Implementation Plan

### Phase 1 — MVP (1–2 weeks)

Minimal viable recording with tap-only support.

- CLI that starts getevent and parses taps (BTN_TOUCH DOWN/UP with stable coordinates)
- Instrumentation APK with single endpoint: `/element-at` returning JSON
- Basic YAML generator producing `tapOn` and `inputText` commands
- Manual start/stop via Ctrl+C

**Deliverable:** record a simple login flow and run it with `maestro test`.

### Phase 2 — Gestures (1–2 weeks)

Full gesture recognition and smart merging.

- Swipe, long press, and scroll detection in getevent parser
- Screen transition detection via periodic hierarchy diff
- Automatic `assertVisible` insertion
- Post-processing optimizations (deduplication, relative coordinates)

### Phase 3 — Developer Experience (1–2 weeks)

Polish for daily use.

- Live preview mode with real-time YAML output in terminal
- Auto-install and auto-setup of instrumentation APK
- Port forwarding and device discovery automation
- YAML validation command
- Support for recording multiple flows in a session

### Phase 4 — Advanced Features (optional)

- Desktop GUI with scrcpy integration and visual flow editor
- AI-powered element selector optimization (choose most stable selector)
- Integration with Maestro Cloud for recorded flow execution
- Support for multi-app flows (system dialogs, permissions)
- Export to other formats (Appium, Espresso)

---

## 12. Known Limitations and Mitigations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| UIAutomator dump latency (~200–500ms) | Element lookup may miss rapidly changing UI | Queue lookups; use last known hierarchy if dump fails; retry with backoff |
| getevent coordinate mapping varies by device | Raw sensor range differs across hardware | Query device input range at session start; cache per device model |
| Custom Canvas/OpenGL views invisible to UIAutomator | Cannot identify elements in games or custom drawing | Fall back to coordinate-based tap; warn user in CLI output |
| Compose without testTag lacks stable identifiers | Elements matched by text only (fragile for i18n) | Recommend `testTagsAsResourceId`; warn when fallback to text-only |
| uiautomator dump fails during animations | Hierarchy unavailable momentarily | Retry after `waitForIdle`; use cached hierarchy from previous successful dump |
| Multi-touch gestures complex to serialize | Pinch/zoom may not produce clean YAML | Record as raw coordinate swipes; document for manual refinement |

---

## 13. Success Criteria

- Generated YAML executes successfully with `maestro test` on the same device without manual edits for simple flows (login, navigation, form submission)
- Tap actions use semantic selectors (text or id) in >90% of cases rather than coordinates
- Swipe/scroll gestures are correctly classified and produce working Maestro commands
- Recording session setup requires a single CLI command with no manual device configuration
- Full recording session (start to YAML output) adds <500ms overhead per user action
- Generated flows are portable across devices with same app version (no hardcoded coordinates)
