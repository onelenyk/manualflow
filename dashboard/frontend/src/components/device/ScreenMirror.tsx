import { useDeviceStore } from '../../stores/deviceStore';

interface ScreenMirrorProps {
  onTap?: (x: number, y: number) => void;
}

const WS_SCRCPY_HOST = 'localhost';
const WS_SCRCPY_PORT = 8000;

function buildScrcpyUrl(serial: string): string {
  const base = `http://${WS_SCRCPY_HOST}:${WS_SCRCPY_PORT}`;
  const wsUrl = `ws://${WS_SCRCPY_HOST}:${WS_SCRCPY_PORT}/?action=proxy-adb&remote=tcp%3A8886&udid=${serial}`;
  return `${base}/#!action=stream&udid=${serial}&player=webcodecs&ws=${encodeURIComponent(wsUrl)}`;
}

export function ScreenMirror({ onTap }: ScreenMirrorProps) {
  const { selectedDevice } = useDeviceStore();

  if (!selectedDevice) {
    return (
      <div className="w-full h-[600px] bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 text-sm">
        No device connected
      </div>
    );
  }

  const scrcpyUrl = buildScrcpyUrl(selectedDevice);

  return (
    <div className="w-full flex flex-col gap-2">
      <iframe
        key={selectedDevice}
        src={scrcpyUrl}
        className="w-full h-[700px] rounded-lg border border-slate-700 bg-slate-900"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
