#!/usr/bin/env bash
# Publish a ManualFlow release to GitHub Releases.
#
#   make publish
#
# Steps:
#   1. preflight (gh installed + authed, remote = github, tree is clean)
#   2. build (delegates to scripts/build-release.sh)
#   3. tag the current commit as v<version>-<sha>
#   4. push the tag
#   5. create GH release, attach tarball + install.sh
#
# After this, anyone can install with:
#   curl -sSL https://github.com/onelenyk/manualflow/releases/latest/download/install.sh | bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

# ── 1. Preflight ───────────────────────────────────────────────────────────
echo "→ Preflight checks"

command -v gh >/dev/null || { red "❌ gh CLI not installed. Run: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { red "❌ gh not authenticated. Run: gh auth login"; exit 1; }

REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
case "$REMOTE_URL" in
  *github.com*) ;;
  *) red "❌ origin remote is not on GitHub: $REMOTE_URL"; exit 1 ;;
esac

if ! git diff --quiet HEAD -- ; then
  red "❌ Uncommitted changes in the working tree. Commit or stash first."
  git status --short
  exit 1
fi

# ── 2. Compute version + SHA, then build ───────────────────────────────────
VERSION="$(node -p "require('./packages/server/package.json').version")"
SHA="$(git rev-parse --short HEAD)"
TAG="v${VERSION}-${SHA}"
TARBALL="dist/manualflow-${VERSION}-${SHA}.tar.gz"
STABLE_TARBALL="dist/manualflow.tar.gz"

if git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
  yellow "⚠️  tag ${TAG} already exists locally — skipping build, reusing existing tarball"
  [ -f "$TARBALL" ] || { red "❌ tag exists but $TARBALL is missing. Delete the tag or rebuild."; exit 1; }
else
  echo "→ Building release"
  bash scripts/build-release.sh
fi

[ -f "$TARBALL" ] || { red "❌ expected $TARBALL not found after build"; exit 1; }
cp "$TARBALL" "$STABLE_TARBALL"

# ── 3. Tag the commit ──────────────────────────────────────────────────────
if ! git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
  echo "→ Tagging ${TAG}"
  git tag -a "${TAG}" -m "ManualFlow ${TAG}"
fi

# ── 4. Push tag ────────────────────────────────────────────────────────────
echo "→ Pushing tag to origin"
git push origin "${TAG}"

# ── 5. Create GH release ───────────────────────────────────────────────────
if gh release view "${TAG}" >/dev/null 2>&1; then
  yellow "⚠️  release ${TAG} already exists — uploading assets with --clobber"
  gh release upload "${TAG}" "$STABLE_TARBALL" "$TARBALL" scripts/install.sh --clobber
else
  echo "→ Creating GitHub release ${TAG}"
  gh release create "${TAG}" \
    "$STABLE_TARBALL" \
    "$TARBALL" \
    scripts/install.sh \
    --title "ManualFlow ${TAG}" \
    --generate-notes
fi

REPO_URL="$(gh repo view --json url -q .url)"
green ""
green "✅ Published ${TAG}"
echo
echo "QA install command:"
echo "  curl -sSL ${REPO_URL}/releases/latest/download/install.sh | bash"
echo
echo "Or with a versioned tarball:"
echo "  curl -sSL ${REPO_URL}/releases/download/${TAG}/install.sh | bash"
