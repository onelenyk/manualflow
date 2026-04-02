import { useState, useEffect, useRef } from 'react';
import { useDeviceStore } from '../../stores/deviceStore';
import { api } from '../../api/client';

export function ScreenMirror() {
  const { selectedDevice, deviceInfo } = useDeviceStore();
  const [mirrorRunning, setMirrorRunning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const intervalRef = useRef<number>();

  // Poll mirror status + refresh screenshot
  useEffect(() => {
    if (!selectedDevice) {
      setMirrorRunning(false);
      setScreenshotUrl(null);
      return;
    }

    const refresh = () => {
      api.getMirrorStatus(selectedDevice).then(s => setMirrorRunning(s.running)).catch(() => {});
      setScreenshotUrl(api.screenshotUrl(selectedDevice));
    };

    refresh();
    intervalRef.current = window.setInterval(refresh, 3000);
    return () => clearInterval(intervalRef.current);
  }, [selectedDevice]);

  const handleLaunch = async () => {
    if (!selectedDevice) return;
    setLaunching(true);
    try {
      await api.launchMirror(selectedDevice);
      setMirrorRunning(true);
    } catch {}
    setLaunching(false);
  };

  const handleStop = async () => {
    if (!selectedDevice) return;
    try {
      await api.stopMirror(selectedDevice);
      setMirrorRunning(false);
    } catch {}
  };

  if (!selectedDevice) {
    return (
      <div className="flex-1 rounded-xl bg-slate-900/40 border border-slate-800/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-700 text-3xl mb-2">&#9671;</div>
          <div className="text-slate-600 text-xs">Select a device to begin</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Device info + mirror controls */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-white">Device</div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{selectedDevice}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-[11px] ${mirrorRunning ? 'text-green-400' : 'text-slate-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mirrorRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
              {mirrorRunning ? 'Mirror active' : 'Mirror off'}
            </div>
          </div>
        </div>

        {deviceInfo && (
          <div className="flex gap-3 text-[11px] text-slate-500 mb-3">
            <span>{deviceInfo.screenWidth}x{deviceInfo.screenHeight}</span>
            <span>{deviceInfo.density}dpi</span>
          </div>
        )}

        <div className="flex gap-2">
          {!mirrorRunning ? (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
            >
              {launching ? 'Launching...' : 'Launch Mirror'}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
            >
              Stop Mirror
            </button>
          )}
        </div>
      </div>

      {/* Screenshot preview */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-800/50 bg-black overflow-hidden flex items-center justify-center">
        {screenshotUrl ? (
          <img
            src={screenshotUrl}
            alt="Device screen"
            className="max-w-full max-h-full object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
          />
        ) : (
          <div className="text-slate-700 text-xs">No preview</div>
        )}
      </div>
    </div>
  );
}
