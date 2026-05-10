// electron-forge configuration. CJS so it loads without the TS toolchain.
//
// Layout produced inside ManualFlow.app/Contents/Resources/:
//   server-pack/dist/index.js          ← server entry (tsc-emitted CJS)
//   server-pack/node_modules/...       ← cors, express, yaml, @maestro-recorder/shared
//   platform-tools/<arch>/adb          ← bundled platform-tools (Apache-2.0)
//
// Makers are filled in Phase 4. Phase 3 only validates that
// `electron-forge package` produces a runnable .app/.exe in out/.

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    name: 'ManualFlow',
    appBundleId: 'dev.manualflow.app',
    icon: './resources/icons/icon', // forge auto-resolves .icns / .ico / .png
    appCopyright: 'See Resources/NOTICE.txt for third-party attribution.',
    // npm workspaces hoist forge's own deps to the repo-root node_modules;
    // electron-packager's flora-colossus walker can't resolve them from the
    // workspace dir. We don't actually need pruning because the runtime server
    // ships in build/server-pack with its own node_modules via extraResource.
    prune: false,
    ignore: [
      // Don't ship anything from the workspace's node_modules (server-pack
      // brings its own), source TS, scripts, build outputs that are already
      // in extraResource, the docs, etc.
      /^\/node_modules\//,
      /^\/src\//,
      /^\/scripts\//,
      /^\/build\//,
      /^\/resources\//,
      /^\/tsconfig\.json$/,
      /^\/forge\.config\.cjs$/,
      /^\/\.gitignore$/,
      /^\/package-lock\.json$/,
    ],
    asar: {
      // Server JS + node_modules and the bundled adb cannot live inside an
      // asar archive — they are spawned as subprocesses (Node child) and as
      // a native binary respectively, both of which require real filesystem
      // paths.
      unpack: '**/{server-pack,platform-tools}/**',
    },
    extraResource: [
      './build/server-pack',
      './resources/platform-tools',
      './resources/NOTICE.txt',
    ],
    osxSign: undefined,    // TODO: enable in Phase 4 when Developer ID is set
    osxNotarize: undefined, // TODO: enable in Phase 4
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { name: 'ManualFlow' },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
      config: {},
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: { name: 'ManualFlow' },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {},
    },
  ],
  plugins: [],
};

module.exports = config;
