import { useEffect, useState } from 'react';
import { useDeviceStore } from '../../../../stores/deviceStore';
import { useStreamStore } from '../../../../stores/streamStore';
import { useLiveFlowStore } from '../../../../stores/liveFlowStore';
import { api } from '../../../../api/client';
import { DeviceCard } from '../../shared/DeviceCard';

export interface RecordPrepareStepProps {
  onStartRecording: (deviceSerial: string) => void;
  /** Reports the currently picked device serial (or null) so the wizard
      can enable/disable its Forward button. */
  onSelectedDeviceChange?: (serial: string | null) => void;
  /** Reports the currently picked app package (or empty string) so the wizard
      can pin it to the flow before starting. */
  onSelectedAppChange?: (appId: string) => void;
}

export function RecordPrepareStep({ onStartRecording, onSelectedDeviceChange, onSelectedAppChange }: RecordPrepareStepProps) {
  const devices = useDeviceStore((s) => s.devices);
  const { connectSSE, disconnectSSE } = useStreamStore();
  const setAppId = useLiveFlowStore((s) => s.setAppId);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [apps, setApps] = useState<string[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Establish SSE connection on mount
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE]);

  // Report selection upward so wizard Forward button reflects can-proceed state.
  useEffect(() => {
    onSelectedDeviceChange?.(selectedDevice);
  }, [selectedDevice, onSelectedDeviceChange]);

  // Report the selected app package upward so the wizard can pin it via
  // liveFlowStore.setAppId() before starting recording.
  useEffect(() => {
    onSelectedAppChange?.(selectedApp);
  }, [selectedApp, onSelectedAppChange]);

  // Whenever the device changes, refresh the list of third-party apps installed on it.
  useEffect(() => {
    if (!selectedDevice) {
      setApps([]);
      setSelectedApp('');
      setAppsError(null);
      return;
    }
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(null);
    api.listApps(selectedDevice)
      .then((res) => {
        if (cancelled) return;
        setApps(res.apps ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setAppsError(e?.message || 'Failed to list apps');
        setApps([]);
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedDevice]);

  const handleDeviceClick = async (serial: string) => {
    setSelectedDevice(serial);
    setError(null);
  };

  const handleStart = () => {
    if (!selectedDevice) {
      setError('Please select a device first');
      return;
    }
    // Persist the chosen app's package as the flow's appId. Blank = leave
    // auto-detection in liveFlowStore.addFromInteraction to derive from
    // accessibility events / resource IDs.
    if (selectedApp) setAppId(selectedApp);
    onStartRecording(selectedDevice);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  if (devices.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-500 mb-4">No devices found. Connect a device and refresh.</div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Which device are you testing?</h2>
        <p className="text-sm text-slate-500">Select a device to start recording</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device) => (
          <DeviceCard
            key={device.serial}
            deviceName={device.model || device.serial}
            status="ready" // TODO: Check actual agent status
            selected={selectedDevice === device.serial}
            onClick={() => handleDeviceClick(device.serial)}
          />
        ))}
      </div>

      {/* App picker — shown once a device is selected */}
      {selectedDevice && (
        <div>
          <label htmlFor="app-id" className="block text-sm font-medium text-white mb-2">
            App to test (optional)
          </label>
          <input
            list="apps-list"
            id="app-id"
            type="text"
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            placeholder={appsLoading ? 'Loading installed apps…' : 'Pick or type a package, e.g. com.example.app'}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            spellCheck={false}
          />
          <datalist id="apps-list">
            {apps.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {appsError && (
            <p className="text-[11px] text-amber-400 mt-1">{appsError}</p>
          )}
          {!appsError && (
            <p className="text-[11px] text-slate-500 mt-1">
              Pick from the device's installed apps, or leave blank to auto-detect from recorded events.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
          <div className="text-sm text-red-400">{error}</div>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={!selectedDevice}
        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-base font-medium rounded-lg transition-all active:scale-95 min-h-[48px]"
      >
        Start Recording
      </button>
    </div>
  );
}
