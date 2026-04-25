#!/usr/bin/env bash
# ManualFlow QA installer.
#
# Installs Node 20+, adb, and Maestro CLI via the platform package manager,
# downloads the latest release tarball, and drops a `manualflow` shim on PATH.
#
# Usage:
#   curl -sSL <RELEASE_URL>/install.sh | bash
#   # or, with a specific tarball you have locally:
#   MANUALFLOW_TARBALL=./dist/manualflow-0.1.0-abcd123.tar.gz bash install.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Configure where releases live. Override at runtime if the user has the
# tarball locally (MANUALFLOW_TARBALL=...) or hosts releases somewhere other
# than GitHub (MANUALFLOW_RELEASE_URL=https://example.com/manualflow.tar.gz).
# ---------------------------------------------------------------------------
RELEASE_URL_DEFAULT="${MANUALFLOW_RELEASE_URL:-https://github.com/onelenyk/manualflow/releases/latest/download/manualflow.tar.gz}"
INSTALL_DIR="${MANUALFLOW_HOME:-$HOME/.manualflow}"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM=mac ;;
  Linux)  PLATFORM=linux ;;
  *)      red "❌ Unsupported OS: $OS (mac/linux only)"; exit 1 ;;
esac

echo "→ ManualFlow installer ($PLATFORM)"

# ── Prereqs ────────────────────────────────────────────────────────────────
install_mac() {
  if ! command -v brew >/dev/null; then
    red "Homebrew is required. Install from https://brew.sh and re-run."
    exit 1
  fi
  command -v node >/dev/null || { echo "→ installing node"; brew install node; }
  command -v adb  >/dev/null || { echo "→ installing android-platform-tools"; brew install --cask android-platform-tools; }
  if [ ! -x "$HOME/.maestro/bin/maestro" ]; then
    echo "→ installing Maestro CLI"
    curl -Ls "https://get.maestro.mobile.dev" | bash
  fi
}

install_linux() {
  if command -v apt-get >/dev/null; then
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    command -v node >/dev/null || { echo "→ installing nodejs"; $SUDO apt-get update -qq && $SUDO apt-get install -y nodejs npm; }
    command -v adb  >/dev/null || { echo "→ installing adb";    $SUDO apt-get install -y android-tools-adb; }
  else
    yellow "⚠️  apt-get not found. Install node + adb manually, then re-run."
    command -v node >/dev/null || exit 1
    command -v adb  >/dev/null || exit 1
  fi
  if [ ! -x "$HOME/.maestro/bin/maestro" ]; then
    echo "→ installing Maestro CLI"
    curl -Ls "https://get.maestro.mobile.dev" | bash
  fi
}

[ "$PLATFORM" = mac ] && install_mac || install_linux

# ── Fetch release ──────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
TMPDIR_X="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_X"' EXIT

if [ -n "${MANUALFLOW_TARBALL:-}" ]; then
  echo "→ using local tarball: $MANUALFLOW_TARBALL"
  cp "$MANUALFLOW_TARBALL" "$TMPDIR_X/manualflow.tar.gz"
else
  echo "→ downloading $RELEASE_URL_DEFAULT"
  curl -fSL "$RELEASE_URL_DEFAULT" -o "$TMPDIR_X/manualflow.tar.gz"
fi

echo "→ extracting to $INSTALL_DIR"
rm -rf "$INSTALL_DIR"/{server.mjs,agent.apk,static,manualflow,VERSION,README.txt} 2>/dev/null || true
tar -xzf "$TMPDIR_X/manualflow.tar.gz" -C "$TMPDIR_X"
EXTRACTED="$(find "$TMPDIR_X" -mindepth 1 -maxdepth 1 -type d | head -1)"
cp -R "$EXTRACTED"/* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/manualflow"

# ── Symlink ────────────────────────────────────────────────────────────────
LINK_DIR=""
for candidate in /usr/local/bin "$HOME/.local/bin"; do
  if [ -d "$candidate" ] && [ -w "$candidate" ]; then LINK_DIR="$candidate"; break; fi
done
if [ -z "$LINK_DIR" ] && [ -d /usr/local/bin ]; then
  echo "→ /usr/local/bin needs sudo for the symlink"
  sudo ln -sf "$INSTALL_DIR/manualflow" /usr/local/bin/manualflow
  LINK_DIR=/usr/local/bin
elif [ -n "$LINK_DIR" ]; then
  ln -sf "$INSTALL_DIR/manualflow" "$LINK_DIR/manualflow"
else
  mkdir -p "$HOME/.local/bin"
  ln -sf "$INSTALL_DIR/manualflow" "$HOME/.local/bin/manualflow"
  LINK_DIR="$HOME/.local/bin"
  yellow "⚠️  Add $HOME/.local/bin to your PATH if it isn't already."
fi

green "✅ Installed manualflow → $LINK_DIR/manualflow"
echo
echo "Next steps:"
echo "  1. Plug in an Android device with USB debugging enabled."
echo "  2. Run: manualflow doctor"
echo "  3. Run: manualflow start"
echo "  4. Open: http://localhost:2344"
