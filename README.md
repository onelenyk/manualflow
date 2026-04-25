# ManualFlow

**Record real Android interactions → turn them into Maestro test flows → replay them.**

A self-hosted Android test recorder that fuses Linux `getevent` gestures with UiAutomator element resolution, maps each interaction to a [Maestro](https://maestro.mobile.dev) YAML command, and lets you edit and run the resulting flows from a local browser dashboard.

> **Status:** alpha. Actively evolving, single maintainer, no stability guarantees between commits. Built on macOS/Linux. Windows is not supported.

> **The project is named `maestro-recorder` in the Gradle build, `MaestroRecorder` in the dashboard title, and uses the `com.maestrorecorder` Android package namespace — those names are baked into the APK for historical reasons and aren't worth rewriting. Call it "ManualFlow."**

## Status & Scope

- **Alpha.** Pre-1.0, no public release, breaking changes land on `main` without notice.
- **Runs entirely on localhost.** The server binds to `127.0.0.1`, the dashboard is served at `http://localhost:2344`, and the Android agent is reached through an `adb forward` tunnel. **Zero telemetry (no telemetry, no outbound network calls, no cloud component).**
- **Physical Android device only.** Emulators may work but aren't tested. `minSdk` 28.
- **Single device at a time.** The server picks the first `adb` device it sees.
- **macOS / Linux only.** Pause/Resume on test runs uses POSIX `SIGSTOP` / `SIGCONT`, which Windows does not have.
- **Trust model: dev handset only.** The Android side of ManualFlow ships as a debug-signed `androidTest` APK and runs via `am instrument` with UiAutomation/accessibility privileges on your device. Install it only on a hardware phone you control.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | Workspaces are used (`packages/*` + `dashboard/frontend`). |
| JDK | 21 | Gradle toolchain expects it. |
| Android SDK platform-tools | any recent | `adb` must be on `PATH`. |
| Physical Android device | API 28+ | USB debugging enabled, "install via USB" allowed for side-loading. |
| [Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro) | 2.x | Installed at `~/.maestro/bin/maestro`. The test runner invokes this binary directly. |
| `scrcpy` | optional | If installed and on `PATH`, the dashboard can mirror the device screen. |

Run `make doctor` for a quick sanity check of all of the above.

## Quick Start

```sh
git clone <this repo> manualflow
cd manualflow
make setup      # installs deps, builds the frontend bundle, builds the agent APK
make start      # installs + launches the agent on device, starts the server
```

Then open **http://localhost:2344** in your browser. Plug in an Android device before running `make start` — `make doctor` will tell you if it doesn't see one.

Default ports are `2344` for the dashboard/server and `50051` for the on-device agent. To change the server port: `SERVER_PORT=3000 make server` (the Makefile forwards this as the `PORT` env var to the Node process — `PORT=3000 npx tsx packages/server/src/index.ts` works for direct launches). The agent port `50051` is hard-coded in the TypeScript agent client (`packages/server/src/recording/agent-client.ts`, `agent/agent-lifecycle.ts`, and a handful of routes) so overriding `AGENT_PORT` in the Makefile alone will not work — you'd need to edit the TypeScript too.

The server binds to `127.0.0.1` by default. If you need LAN exposure (e.g. dashboard on a build machine), set `HOST=0.0.0.0` explicitly before `make server`. Only do that on a trusted network — the dashboard has no authentication.

## Architecture

ManualFlow is four cooperating processes plus the Maestro CLI.

1. **Node + TypeScript server** (`packages/server/`) — Express + Server-Sent Events. Orchestrates `adb`, runs a `getevent` state machine, reads accessibility events streamed from the on-device agent, polls input-method state for keyboard detection, and fuses all three into `RecordedInteraction` objects. Persists saved flows, drives Maestro runs via a `TestRunner` subprocess, and serves the prebuilt dashboard as static assets.
2. **React + Vite dashboard** (`dashboard/frontend/` → built into `dashboard/src/main/resources/static/`) — Zustand + Tailwind UI with three tabs: live Stream, Flow gallery/runner, and Agent installer. Streams updates from the server over SSE.
3. **Kotlin UiAutomator agent** (`agent/`) — an Android library that runs *as an androidTest instrumentation* via `am instrument`. This is the only way on stock Android to own the `UiAutomation` singleton without root. It exposes a nanohttpd HTTP server (`/element-at`, `/tree`, `/device-info`, plus an accessibility event stream) reachable through an `adb forward tcp:50051`. The recorder calls `/element-at` at every touch-down to attach a semantic element to each captured gesture.
4. **Maestro CLI** — invoked as a child process by the runner. Because Android only lets one instrumentation own `UiAutomation` at a time, the server automatically stops the ManualFlow agent before a Maestro run and restarts it (reconnecting the device stream) when the run finishes.

**Selector strategy**, in priority order, applied to every captured interaction:

1. **resource-id** (stripped of the package prefix)
2. contentDescription
3. visible text (for non-editable elements, ≤ 50 chars)
4. relative ("below / above / containsChild" a nearby labeled neighbour)
5. point fallback as `x%, y%` (screen-relative, portable across screen sizes)

The `getevent` parser reads raw `EV_ABS` / `BTN_TOUCH` events and classifies them as tap, long press, swipe, or scroll via a finite state machine before handing them to the selector resolver. Coordinate conversion from raw sensor values to pixels happens up front.

See [Maestro](https://maestro.mobile.dev) for the YAML command reference and [AndroidX UiAutomator](https://developer.android.com/training/testing/other-components/ui-automator) for the element-tree API the agent wraps.

## Usage

1. **Record.** With `make start` running and the dashboard open, tap around on the device. Every interaction shows up live in the Stream tab with its resolved selector. Select the interactions you want and add them to a flow in the Flow Builder.
2. **Edit.** Rename commands, drop irrelevant taps, insert `assertVisible` / `inputText` / `waitForAnimationToEnd` from the built-in templates. Save the flow to the gallery.
3. **Run.** From the Flows tab, pick a saved flow, pick a device, and hit Run. The runner invokes `maestro test --no-ansi`, streams each step back over SSE, and exposes **Pause** (`SIGSTOP`), **Resume** (`SIGCONT`), **Stop**, and **Run again** controls in the viewer.

### Sample app for end-to-end smoke tests

`testapp/` is a small Jetpack Compose app with four screens: `Home`, `Tagged` (every control has a `testTag`), `Untagged` (zero `testTag`s — forces text/relative selectors), and `Counter`. It exists specifically to exercise the recorder against both extremes.

```sh
make deploy-testapp  # builds, installs and launches the sample on the connected device
```

Three pre-baked Maestro flows that drive the sample ship in the gallery on first run: **TestApp Counter**, **TestApp Tagged Sign-in**, and **TestApp Untagged Sign-in**.

## Development

Common loops:

```sh
make dev              # server in watch mode + agent on device
make frontend-dev     # Vite dev server on 5173 with HMR (dashboard only)
make agent-deploy     # rebuild + reinstall + restart the Android agent
make build-testapp    # build the sample Compose app APK
make status           # show device / server / agent / stream state
make typecheck        # TS typecheck across shared + server packages
make test             # run the vitest suite
make stop             # stop server + agent
```

Layout:

```
packages/server/     Node + Express server, device stream, runner, routes
packages/shared/     TypeScript types + pure logic (selectors, YAML generator)
dashboard/frontend/  React + Vite + Zustand + Tailwind dashboard source
dashboard/src/       Built dashboard served statically by the server
agent/               Kotlin UiAutomator agent (Android library)
testapp/             Jetpack Compose sample app
```

Vitest files live next to the code they test under `packages/*/src/**/*.test.ts`. Run the whole suite with `make test`; there is no hard-coded test count in this README on purpose.

If you change anything under `agent/src/main/kotlin/`, you must run `make agent-deploy` — `make start` alone will not rebuild the APK.

## Troubleshooting

- **`make start` fails with "No Android device connected"** — plug the device in, unlock the screen, accept the RSA prompt, and confirm `adb devices` shows it. Re-run `make doctor`.
- **Agent port 50051 is already in use** — `make agent-stop` clears the existing `adb forward`. If a stale instrumentation from a previous install is still running, `adb shell am force-stop com.maestrorecorder.agent` and re-run `make agent-start`.
- **Install conflicts after switching branches** — `adb uninstall com.maestrorecorder.agent.test` and `adb uninstall com.maestrorecorder.testapp`, then `make agent-deploy` (and `make deploy-testapp` if you use the sample).
- **Server port 2344 is already in use** — either kill the other listener (`lsof -ti:2344 | xargs kill`) or start on another port: `SERVER_PORT=3000 make server-bg`.
- **Maestro runs crash with "UiAutomationService already registered"** — only one instrumentation can hold `UiAutomation` at a time. The server is meant to stop the agent automatically before running a flow; if something gets stuck, `make agent-stop` first and try again.
- **Dashboard shows "Maestro not installed"** — confirm `~/.maestro/bin/maestro --version` works from a shell. The path is currently hard-coded; the dashboard has a Refresh button that re-probes.
- **Dashboard assets 404** — the server serves the pre-built bundle from `dashboard/src/main/resources/static/`. Run `make build-frontend` to regenerate it.
- **Nothing is being captured** — check `make status`; if the agent is not "Responsive", `make agent-restart`. If the device stream says `connected: false`, open the Agent tab and click Reconnect.

## Distributing to QA

The repo above is the *developer* setup. For QA you ship a single tarball — no Gradle, no Vite, no source clone.

**Build a release** (once, on the dev machine):

```sh
make release
# → dist/manualflow-<version>-<sha>.tar.gz
```

The tarball contains a bundled Node server, the prebuilt agent APK, the prebuilt dashboard, and a `manualflow` CLI.

**Publish a release to GitHub** (one command, requires `gh auth login` once):

```sh
make publish    # builds, tags v<version>-<sha>, pushes, creates GH release with assets
```

This uploads the tarball plus `install.sh` to a GitHub Release, so QA's install command becomes:

```sh
curl -sSL https://github.com/onelenyk/manualflow/releases/latest/download/install.sh | bash
```

**Install on a QA machine** — one of two ways:

```sh
# (a) From a hosted release (set MANUALFLOW_RELEASE_URL in scripts/install.sh, or
#     pass it as an env var). Uploads the tarball + install.sh to your release
#     host, then QA runs:
curl -sSL https://your-host/manualflow/install.sh | bash

# (b) From a tarball you hand QA directly (USB stick, Slack, internal share):
MANUALFLOW_TARBALL=./manualflow-0.1.0-abcd123.tar.gz bash scripts/install.sh
```

The installer does three things:
1. Installs Node 20+, `adb`, and the Maestro CLI via `brew` (mac) or `apt` (linux). Any already-present tool is skipped.
2. Extracts the tarball into `~/.manualflow/`.
3. Symlinks the `manualflow` CLI into `/usr/local/bin` (or `~/.local/bin` if writable).

**Then QA's whole workflow is:**

```sh
manualflow doctor    # verify prereqs + device
manualflow start     # install agent on device, start server, open dashboard
manualflow stop      # tear everything down
```

The dashboard opens at `http://localhost:2344`. There is no GUI app — it's just the same browser dashboard, served by a localhost daemon, with the agent APK and Maestro orchestration handled for them.

**What QA still needs themselves:** a physical Android device with USB debugging enabled and the RSA prompt accepted. Everything else is in the tarball or installed by the script.

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 Nazar Lenyk.

ManualFlow wraps and invokes two Apache-2.0 projects at runtime as separate processes: the [Maestro CLI](https://maestro.mobile.dev) and the AndroidX UiAutomator test framework. Neither is redistributed in this repository.
