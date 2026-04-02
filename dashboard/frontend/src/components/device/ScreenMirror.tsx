import { useDeviceStore } from '../../stores/deviceStore';

const WS_SCRCPY_PORT = 8000;

function buildStreamUrl(serial: string): string {
  const base = `http://localhost:${WS_SCRCPY_PORT}`;
  const wsUrl = `ws://localhost:${WS_SCRCPY_PORT}/?action=proxy-adb&remote=tcp%3A8886&udid=${serial}`;
  return `${base}/#!action=stream&udid=${serial}&player=webcodecs&ws=${encodeURIComponent(wsUrl)}`;
}

export function ScreenMirror() {
  const { selectedDevice } = useDeviceStore();

  if (!selectedDevice) {
    return (
      <div className="flex-1 bg-slate-800/50 rounded-xl flex items-center justify-center text-slate-500 text-sm border border-slate-700/50">
        Select a device to start mirroring
      </div>
    );
  }

  return (
    <iframe
      key={selectedDevice}
      src={buildStreamUrl(selectedDevice)}
      className="flex-1 w-full rounded-xl border border-slate-700/50"
      style={{ minHeight: 0, background: '#000' }}
      allow="fullscreen"
    />
  );
}
