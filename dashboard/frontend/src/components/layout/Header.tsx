import { useEffect } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';

export function Header() {
  const { devices, selectedDevice, fetchDevices, selectDevice, loading } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white">MaestroRecorder</h1>
        <span className="text-xs text-slate-500">Dashboard</span>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Device:</label>
        <select
          value={selectedDevice || ''}
          onChange={(e) => e.target.value && selectDevice(e.target.value)}
          className="bg-slate-800 text-white text-sm border border-slate-600 rounded px-2 py-1 outline-none focus:border-blue-500"
        >
          <option value="">
            {loading ? 'Loading...' : devices.length === 0 ? 'No devices' : 'Select device'}
          </option>
          {devices.map((d) => (
            <option key={d.serial} value={d.serial}>
              {d.model || d.serial}
            </option>
          ))}
        </select>

        {selectedDevice && (
          <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
        )}
      </div>
    </header>
  );
}
