import { useEffect, useState } from 'react';
import { useDeviceStore } from '../../../../stores/deviceStore';
import { useStreamStore } from '../../../../stores/streamStore';
import { DeviceCard } from '../../shared/DeviceCard';

export interface RecordPrepareStepProps {
  onStartRecording: (deviceSerial: string) => void;
}

export function RecordPrepareStep({ onStartRecording }: RecordPrepareStepProps) {
  const devices = useDeviceStore((s) => s.devices);
  const { connectSSE, disconnectSSE } = useStreamStore();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Establish SSE connection on mount
  useEffect(() => {
    connectSSE();
    return () => disconnectSSE();
  }, [connectSSE, disconnectSSE]);

  const handleDeviceClick = async (serial: string) => {
    setSelectedDevice(serial);
    setError(null);
  };

  const handleStart = () => {
    if (selectedDevice) {
      onStartRecording(selectedDevice);
    } else {
      setError('Please select a device first');
    }
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
