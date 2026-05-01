import { useEffect, useState } from 'react';
import { useDeviceStore } from '../../../stores/deviceStore';
import { api } from '../../../api/client';

export interface FullscreenScreenMirrorProps {
  onScreenshotUrlChange?: (url: string | null) => void;
}

export function FullscreenScreenMirror({ onScreenshotUrlChange }: FullscreenScreenMirrorProps) {
  const deviceStore = useDeviceStore();
  const selectedDevice = deviceStore.selectedDevice;
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Poll for screenshots directly
  useEffect(() => {
    if (!selectedDevice) {
      setScreenshotUrl(null);
      return;
    }

    const refreshUrl = () => {
      setScreenshotUrl(api.screenshotUrl(selectedDevice));
    };

    refreshUrl();
    const interval = setInterval(refreshUrl, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, [selectedDevice]);

  if (!selectedDevice) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="text-slate-600 text-sm">No device selected</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-black">
      {screenshotUrl ? (
        <img
          src={screenshotUrl}
          alt="Device screen"
          className="max-w-full max-h-full object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; onScreenshotUrlChange?.(screenshotUrl); }}
        />
      ) : (
        <div className="text-slate-700 text-sm">Loading screen...</div>
      )}
    </div>
  );
}
