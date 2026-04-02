import { useDeviceStore } from '../../stores/deviceStore';

interface ScreenMirrorProps {
  onTap?: (x: number, y: number) => void;
}

const WS_SCRCPY_PORT = 8000;

export function ScreenMirror({ onTap }: ScreenMirrorProps) {
  const { selectedDevice } = useDeviceStore();

  if (!selectedDevice) {
    return (
      <div className="w-full h-[600px] bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 text-sm">
        No device connected
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <iframe
        src={`http://localhost:${WS_SCRCPY_PORT}/`}
        className="w-full h-[700px] rounded-lg border border-slate-700 bg-slate-900"
        allow="fullscreen"
      />
    </div>
  );
}
