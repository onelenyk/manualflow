import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { ActionFeed } from './ActionFeed';
import { useRecordingStore } from '../../stores/recordingStore';
import { useDeviceStore } from '../../stores/deviceStore';

export function RecordView() {
  const { yaml } = useRecordingStore();
  const { deviceInfo } = useDeviceStore();

  return (
    <div className="flex h-full gap-4">
      {/* Left: Device screen */}
      <div className="flex min-h-0 shrink-0">
        <ScreenMirror />
      </div>

      {/* Right: Controls + Actions */}
      <div className="flex flex-col flex-1 min-w-[280px] max-w-[400px] gap-3">
        {/* Recording controls card */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Record Flow</h2>
            <RecordingControls />
          </div>
          {deviceInfo && (
            <div className="flex gap-3 text-[11px] text-slate-500">
              <span>{deviceInfo.screenWidth}x{deviceInfo.screenHeight}</span>
              <span>{deviceInfo.density}dpi</span>
            </div>
          )}
        </div>

        {/* Actions card */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex-1 min-h-0 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 shrink-0">Actions</h3>
          <div className="flex-1 overflow-auto">
            <ActionFeed />
          </div>
        </div>

        {/* YAML output */}
        {yaml && (
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shrink-0">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Generated YAML</h3>
            <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-green-400 overflow-auto max-h-48 font-mono leading-relaxed">
              {yaml}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
