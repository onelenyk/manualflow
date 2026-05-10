#!/usr/bin/env node
// Stages the production server bundle that the packaged Electron app spawns.
//
// Layout produced (under packages/electron/build/server-pack/):
//   dist/                  ← tsc-emitted server JS
//   node_modules/cors/
//   node_modules/express/
//   node_modules/yaml/
//   node_modules/@maestro-recorder/shared/   ← compiled shared package
//   package.json           ← synthesized from server runtime deps
//
// This is the input that forge.config.ts copies into Resources/server/ via
// extraResource + asar.unpack.
//
// Plan reference: §9.x server bundle build recipe.

import { execFileSync } from 'node:child_process';
import {
  mkdirSync, existsSync, rmSync, copyFileSync, cpSync, writeFileSync, readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_PKG = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ELECTRON_PKG, '..', '..');
const SERVER_PKG = path.resolve(REPO_ROOT, 'packages', 'server');
const SHARED_PKG = path.resolve(REPO_ROOT, 'packages', 'shared');
const FRONTEND_PKG = path.resolve(REPO_ROOT, 'dashboard', 'frontend');
const FRONTEND_DIST = path.resolve(REPO_ROOT, 'dashboard', 'src', 'main', 'resources', 'static');
const STAGING = path.resolve(ELECTRON_PKG, 'build', 'server-pack');

function log(...args) { console.log('[build-server]', ...args); }

function pinnedElectronVersion() {
  const pj = JSON.parse(readFileSync(path.join(ELECTRON_PKG, 'package.json'), 'utf8'));
  const raw = pj.devDependencies?.electron;
  if (!raw) throw new Error('electron not found in packages/electron devDependencies');
  return raw.replace(/^[^0-9]*/, '');
}

function compileShared() {
  log('compiling @maestro-recorder/shared');
  execFileSync('npx', ['tsc', '-p', path.join(SHARED_PKG, 'tsconfig.build.json')], {
    cwd: REPO_ROOT, stdio: 'inherit',
  });
}

function compileServer() {
  log('compiling @maestro-recorder/server');
  execFileSync('npx', ['tsc', '-p', path.join(SERVER_PKG, 'tsconfig.build.json')], {
    cwd: REPO_ROOT, stdio: 'inherit',
  });
}

function compileFrontend() {
  log('building dashboard frontend (vite build)');
  execFileSync('npx', ['vite', 'build'], {
    cwd: FRONTEND_PKG, stdio: 'inherit',
  });
}

function copyFrontendToStaging() {
  if (!existsSync(FRONTEND_DIST)) {
    throw new Error(`frontend dist not found at ${FRONTEND_DIST} — did compileFrontend() run?`);
  }
  // Server expects MANUALFLOW_STATIC_DIR/index.html. We stage the built SPA
  // under server-pack/static so the supervisor can pass an absolute path.
  cpSync(FRONTEND_DIST, path.join(STAGING, 'static'), { recursive: true });
}

function synthesizePackageJson() {
  const serverPj = JSON.parse(readFileSync(path.join(SERVER_PKG, 'package.json'), 'utf8'));
  const synth = {
    name: 'manualflow-server-pack',
    version: serverPj.version,
    private: true,
    type: 'module',
    main: 'dist/index.js',
    dependencies: serverPj.dependencies, // cors / express / yaml — pure JS, no native bindings today
  };
  writeFileSync(path.join(STAGING, 'package.json'), JSON.stringify(synth, null, 2));
}

function installRuntimeDeps() {
  log('npm install --omit=dev in staging');
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefix', STAGING], {
    stdio: 'inherit',
  });
}

function dropInSharedPackage() {
  const sharedDist = path.join(SHARED_PKG, 'dist');
  if (!existsSync(sharedDist)) {
    throw new Error(`shared dist not found at ${sharedDist} — did compileShared() run?`);
  }
  const targetDir = path.join(STAGING, 'node_modules', '@maestro-recorder', 'shared');
  mkdirSync(targetDir, { recursive: true });
  // ship the compiled output and a minimal package.json that points main at it
  cpSync(sharedDist, path.join(targetDir, 'dist'), { recursive: true });
  const sharedPj = JSON.parse(readFileSync(path.join(SHARED_PKG, 'package.json'), 'utf8'));
  writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
    name: sharedPj.name,
    version: sharedPj.version,
    type: 'module',
    main: 'dist/index.js',
  }, null, 2));
}

function copyServerDist() {
  const serverDist = path.join(SERVER_PKG, 'dist');
  if (!existsSync(serverDist)) {
    throw new Error(`server dist not found at ${serverDist} — did compileServer() run?`);
  }
  cpSync(serverDist, path.join(STAGING, 'dist'), { recursive: true });
}

function runElectronRebuild() {
  // None of the current runtime deps (cors/express/yaml) ship native bindings,
  // so this is effectively a no-op today — but invoking it now means a future
  // transitive native dep is rebuilt against the Electron-bundled Node ABI
  // automatically (plan §9.x step 6).
  const version = pinnedElectronVersion();
  log(`electron-rebuild (version=${version})`);
  try {
    execFileSync('npx', ['electron-rebuild', '--force', '--module-dir', STAGING, '--version', version], {
      cwd: ELECTRON_PKG, stdio: 'inherit',
    });
  } catch (e) {
    log(`electron-rebuild not installed; skipping (${e.message})`);
  }
}

function main() {
  if (existsSync(STAGING)) {
    log(`cleaning ${STAGING}`);
    rmSync(STAGING, { recursive: true, force: true });
  }
  mkdirSync(STAGING, { recursive: true });

  compileShared();
  compileServer();
  compileFrontend();
  synthesizePackageJson();
  installRuntimeDeps();
  dropInSharedPackage();
  copyServerDist();
  copyFrontendToStaging();
  runElectronRebuild();

  log('staging ready:', STAGING);
}

main();
