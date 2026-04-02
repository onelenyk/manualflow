import { DeviceInfo } from '../device/DeviceInfo';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { ActionFeed } from './ActionFeed';
import { useRecordingStore } from '../../stores/recordingStore';

export function RecordView() {
  const { yaml } = useRecordingStore();

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">Record Flow</h2>
          <DeviceInfo />
        </div>
        <RecordingControls />
      </div>

      {/* Main: device mirror (center) + actions (right) */}
      <div className="flex gap-3 flex-1 min-h-0 justify-center">
        {/* Device screen — constrained width to avoid grey waste */}
        <div className="flex flex-col min-h-0 w-[320px] shrink-0">
          <ScreenMirror />
        </div>

        {/* Actions panel */}
        <div className="flex flex-col w-[300px] shrink-0">
          <h3 className="text-sm font-medium text-slate-400 mb-2 shrink-0">Actions</h3>
          <div className="flex-1 overflow-auto">
            <ActionFeed />
          </div>

          {yaml && (
            <div className="mt-3 shrink-0">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Generated YAML</h3>
              <pre className="bg-slate-800 rounded-lg p-3 text-xs text-green-400 overflow-auto max-h-48 border border-slate-700">
                {yaml}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
