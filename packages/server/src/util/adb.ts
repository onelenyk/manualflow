/**
 * Returns the absolute path to the `adb` binary the server should invoke.
 *
 * In packaged Electron mode the supervisor sets MANUALFLOW_ADB_PATH to the
 * bundled platform-tools/<arch>/adb. In dev / standalone runs the env is
 * unset and we fall back to whatever `adb` resolves to on PATH.
 *
 * Plan reference: §6 supervisor env, §8 adb migration.
 */
export function adbExecutable(): string {
  return process.env.MANUALFLOW_ADB_PATH || 'adb';
}
