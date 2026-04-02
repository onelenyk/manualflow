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
      <div className="flex-1 rounded-xl bg-slate-900/40 border border-slate-800/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-700 text-3xl mb-2">&#9671;</div>
          <div className="text-slate-600 text-xs">Select a device to mirror</div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={selectedDevice}
      src={buildStreamUrl(selectedDevice)}
      className="flex-1 w-full rounded-xl border border-slate-800/50 bg-black"
      style={{ minHeight: 0 }}
      allow="fullscreen"
    />
  );
}
