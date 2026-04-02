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
    <header className="h-12 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-red-500 rounded-md flex items-center justify-center">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        <h1 className="text-sm font-semibold text-white tracking-tight">MaestroRecorder</h1>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedDevice || ''}
          onChange={(e) => e.target.value && selectDevice(e.target.value)}
          className="bg-slate-800 text-white text-xs border border-slate-700 rounded-md px-2.5 py-1.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 min-w-[160px]"
        >
          <option value="">
            {loading ? 'Scanning...' : devices.length === 0 ? 'No devices' : 'Select device'}
          </option>
          {devices.map((d) => (
            <option key={d.serial} value={d.serial}>
              {d.model || d.serial}
            </option>
          ))}
        </select>

        {selectedDevice && (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>Connected</span>
          </div>
        )}
      </div>
    </header>
  );
}
