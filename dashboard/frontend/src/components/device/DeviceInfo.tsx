import { useDeviceStore } from '../../stores/deviceStore';

export function DeviceInfo() {
  const { deviceInfo, selectedDevice } = useDeviceStore();

  if (!selectedDevice) {
    return (
      <div className="text-slate-500 text-sm">
        Select a device to begin
      </div>
    );
  }

  if (!deviceInfo) {
    return <div className="text-slate-500 text-sm">Loading device info...</div>;
  }

  return (
    <div className="flex gap-4 text-xs text-slate-400">
      <span>Screen: {deviceInfo.screenWidth}x{deviceInfo.screenHeight}</span>
      {deviceInfo.density > 0 && <span>Density: {deviceInfo.density}dpi</span>}
    </div>
  );
}
