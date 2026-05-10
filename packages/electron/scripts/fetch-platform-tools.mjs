#!/usr/bin/env node
// Materializes resources/platform-tools/<arch>/adb for the host platform.
// Idempotent: skips if the binary already exists.
//
// Strategy: prefer to copy the locally installed `adb` (so corp/proxy builds
// just work). Fall back to downloading the Apache-2.0-licensed platform-tools
// archive from dl.google.com if no system adb is present.
//
// Plan reference: §6 supervisor env (MANUALFLOW_ADB_PATH), §13 Q6 (adb
// redistribution under Apache-2.0).

import { execSync, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, copyFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ELECTRON = path.resolve(__dirname, '..');
const RESOURCES = path.join(REPO_ELECTRON, 'resources', 'platform-tools');

const PLATFORM_KEY = `${process.platform}-${process.arch}`; // e.g. darwin-arm64
const TARGET_DIR = path.join(RESOURCES, PLATFORM_KEY);
const TARGET_ADB = path.join(TARGET_DIR, process.platform === 'win32' ? 'adb.exe' : 'adb');

function log(...args) {
  console.log('[fetch-platform-tools]', ...args);
}

function which(bin) {
  try {
    return execSync(process.platform === 'win32' ? `where ${bin}` : `which ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')[0];
  } catch {
    return null;
  }
}

function copyAuxLibs(srcAdb) {
  // Some platforms ship adb with companion shared libraries that must travel
  // alongside the binary (rare on macOS arm64, more common on Linux/Windows).
  const srcDir = path.dirname(srcAdb);
  for (const entry of readdirSync(srcDir)) {
    const ext = entry.toLowerCase();
    if (ext === 'adb' || ext === 'adb.exe') continue;
    if (!ext.endsWith('.dll') && !ext.endsWith('.dylib') && !ext.endsWith('.so')) continue;
    const src = path.join(srcDir, entry);
    if (!statSync(src).isFile()) continue;
    const dst = path.join(TARGET_DIR, entry);
    copyFileSync(src, dst);
    log(`copied ${entry}`);
  }
}

function copyFromSystem() {
  const sysAdb = which('adb');
  if (!sysAdb) return false;
  log(`copying system adb from ${sysAdb}`);
  copyFileSync(sysAdb, TARGET_ADB);
  chmodSync(TARGET_ADB, 0o755);
  copyAuxLibs(sysAdb);
  return true;
}

function downloadFromGoogle() {
  // Google publishes one zip per platform.
  const URLS = {
    'darwin-arm64': 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
    'darwin-x64': 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
    'linux-x64': 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
    'win32-x64': 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  };
  const url = URLS[PLATFORM_KEY];
  if (!url) throw new Error(`No platform-tools URL for ${PLATFORM_KEY}`);

  const tmp = path.join(os.tmpdir(), `platform-tools-${PLATFORM_KEY}.zip`);
  log(`downloading ${url}`);
  execFileSync('curl', ['-fsSL', '-o', tmp, url], { stdio: 'inherit' });
  log(`extracting to ${TARGET_DIR}`);
  execFileSync('unzip', ['-oq', tmp, '-d', os.tmpdir()], { stdio: 'inherit' });
  const extractedRoot = path.join(os.tmpdir(), 'platform-tools');
  const extractedAdb = path.join(extractedRoot, process.platform === 'win32' ? 'adb.exe' : 'adb');
  copyFileSync(extractedAdb, TARGET_ADB);
  chmodSync(TARGET_ADB, 0o755);
  copyAuxLibs(extractedAdb);
}

function main() {
  if (existsSync(TARGET_ADB)) {
    log(`already present: ${TARGET_ADB}`);
    return;
  }
  mkdirSync(TARGET_DIR, { recursive: true });
  if (copyFromSystem()) return;
  downloadFromGoogle();
}

main();
