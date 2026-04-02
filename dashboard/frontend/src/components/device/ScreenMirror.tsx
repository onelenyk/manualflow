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
      <div className="h-full w-[280px] rounded-xl bg-slate-900/40 border border-slate-800/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-700 text-3xl mb-2">&#9671;</div>
          <div className="text-slate-600 text-xs">Select a device to mirror</div>
        </div>
      </div>
    );
  }

  // ws-scrcpy renders phone at fixed size (~200px wide + 40px toolbar).
  // We make the iframe much wider but only show the right portion where the phone is.
  return (
    <div className="h-full w-[280px] shrink-0 overflow-hidden rounded-xl border border-slate-800/50 bg-black relative">
      <iframe
        key={selectedDevice}
        src={buildStreamUrl(selectedDevice)}
        className="absolute top-0 right-0 border-0"
        style={{ width: '1200px', height: '100%' }}
        allow="fullscreen"
      />
    </div>
  );
}
