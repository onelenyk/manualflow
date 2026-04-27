# ManualFlow

**Record real Android interactions → turn them into Maestro test flows → replay them.**

A self-hosted, localhost-only Android test recorder. You tap the device, it captures the gesture, resolves it to a stable UI selector, and writes a [Maestro](https://maestro.mobile.dev) YAML step. Edit and replay from a browser dashboard.

---

## 1. The Problem

Writing mobile UI tests is slow and brittle.

- **Manual authoring** of Maestro / Espresso / UiAutomator flows means reading layout dumps, guessing at selectors, and rewriting them every time the UI shifts.
- **Record-and-replay tools** in the cloud ship your taps, screenshots, and sometimes screen content to a third party. Not acceptable for pre-release builds or regulated products.
- **QA hand-offs** are lossy — "tap the thing in the corner" becomes a Jira ticket, not an executable test.

Teams end up with low automated coverage, flaky selectors, and a growing backlog of manual test scripts that nobody runs.

## 2. What ManualFlow Does

1. **Watches the device** while a human uses the app — real touches, real scrolls, real keyboard input.
2. **Resolves each gesture to a semantic selector** (resource-id → contentDescription → visible text → relative → percentage point fallback).
3. **Emits a Maestro YAML command** per interaction, editable in a live browser dashboard.
4. **Runs the saved flow** back through the Maestro CLI, streaming every step live with pause / resume / stop controls.

**Everything is local.** The server binds to `127.0.0.1`. No telemetry. No cloud. No account.

---

## 3. Who It's For

| Audience | What they get |
|---|---|
| **Developers** | Kill the "write a UI test from scratch" tax. Record once, paste into the repo, version it like code. Flows live as plain YAML — diff-friendly, PR-reviewable. |
| **QA / Test engineers** | Turn an exploratory test session into a reusable regression flow without writing a line of code. Edit, rename, and assert from the dashboard. Replay with pause / resume for investigation. |
| **Engineering managers** | Lower the cost of owning a test suite. No SaaS bill, no vendor lock-in, no data leaving the dev machine. MIT-licensed, single-maintainer alpha — evaluate before you commit. |

---

## 4. How It Works

Four cooperating processes plus the Maestro CLI:

```
   ┌──────────────────────┐     SSE      ┌───────────────────────┐
   │  React Dashboard     │ ◀──────────▶ │  Node + TS Server     │
   │  (localhost:2344)    │              │  orchestrates adb,    │
   └──────────────────────┘              │  getevent FSM,        │
                                         │  runs Maestro         │
                                         └──────────┬────────────┘
                                                    │ adb forward :50051
                                                    ▼
                                         ┌───────────────────────┐
                                         │  Kotlin UiAutomator   │
                                         │  agent (androidTest)  │
                                         │  on the device        │
                                         └───────────────────────┘
```

**The trick:** Linux `getevent` gives raw touch coordinates but no clue *what* was tapped. UiAutomator knows the element tree but not gestures. ManualFlow fuses both — every `touch-down` triggers a `/element-at` lookup against the agent, and the gesture FSM (tap / long-press / swipe / scroll) binds the result.

**Selector priority** (portable across screen sizes and builds):
1. `resource-id`
2. `contentDescription`
3. visible text (≤ 50 chars, non-editable)
4. relative ("below / above / containsChild" a labeled neighbour)
5. `x%, y%` percentage point fallback

**Maestro handoff:** Android only lets one instrumentation hold `UiAutomation` at a time. The server stops the ManualFlow agent before a Maestro run and restarts it when the run finishes — automatically.

---

## 5. Use Cases

- **Regression safety net for a small team** — record the golden-path flows once, run them before every release.
- **Flake hunting** — pause a test mid-run (`SIGSTOP`), inspect the device, resume (`SIGCONT`) or stop.
- **Onboarding** — a new QA hire records their first manual test pass; the team keeps it as an executable artifact.
- **Handing bug repros to engineering** — "here's the YAML that reproduces it" beats a screen recording.
- **Offline / air-gapped testing** — no outbound network calls, runs on a laptop with a plugged-in handset.
- **Pre-public apps** — record against builds you don't want uploaded anywhere.

**Not for** (yet): iOS, emulator farms, multi-device parallel runs, CI pipelines, Windows hosts.

---

## 6. Using It — End to End

**Prereqs:** Node 20+, JDK 21, Android SDK `adb`, a physical Android device (API 28+), Maestro CLI at `~/.maestro/bin/maestro`. Run `make doctor` to verify.

```sh
git clone <repo> manualflow
cd manualflow
make setup     # deps + frontend bundle + agent APK
make start     # installs the agent, launches it, starts the server
open http://localhost:2344
```

Then in the dashboard:

1. **Stream tab** — tap around on the device; every interaction appears live with its resolved selector. Select the ones you want and add them to a flow.
2. **Flow tab** — rename commands, drop noise, insert `assertVisible` / `inputText` / `waitForAnimationToEnd` from the built-in templates. Save to the gallery.
3. **Run** — pick a saved flow, pick the device, hit Run. Steps stream back over SSE with **Pause**, **Resume**, **Stop**, **Run again**.

**Try it fast:** `make deploy-testapp` installs a bundled Jetpack Compose sample app with four screens (Home, Tagged, Untagged, Counter) — designed to exercise the recorder against both the easy case (every control has a `testTag`) and the hard case (nothing does, forcing text/relative selectors). Useful as a 2-minute demo without needing your real app.

---

## 7. Status, License, Roadmap Honesty

- **Alpha.** Breaking changes land on `main` without notice. Single maintainer.
- **macOS / Linux only** — pause/resume relies on POSIX signals.
- **One device at a time** — picks the first `adb devices` entry.
- **MIT licensed.** Copyright (c) 2026 Nazar Lenyk. Maestro CLI and AndroidX UiAutomator are invoked as separate Apache-2.0 processes; neither is redistributed here.
- **Trust model:** debug-signed `androidTest` APK with UiAutomation / accessibility privileges. Install on a dev handset you control.

---

## 8. Demo Script (≈ 3 minutes)

1. `make doctor` — show the green checks.
2. `make start` → open `http://localhost:2344`.
3. `make deploy-testapp` (or point at a real app).
4. In **Stream**, tap the sample app's Counter screen three times — point out the resolved selectors (`resource-id`, then a fallback `x%, y%`).
5. Add the taps to a new flow, insert an `assertVisible "3"`, save.
6. Switch to **Flows**, run it. Steps light up in sequence.
7. Hit **Pause** mid-run, then **Resume**. Hit **Run again**.
8. Close the loop: show the saved YAML file — plain text, versionable.

---

## 9. One-Slide Summary

> **ManualFlow** records your real Android taps, resolves each one to a stable UI selector, and emits editable Maestro YAML — all on localhost, no cloud. Alpha, MIT-licensed, macOS/Linux, single device. Run `make setup && make start` and open `http://localhost:2344`.
