import { DeviceInfo } from '../device/DeviceInfo';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { ActionFeed } from './ActionFeed';
import { useRecordingStore } from '../../stores/recordingStore';

export function RecordView() {
  const { yaml } = useRecordingStore();

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top bar: title + device info + record button */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">Record Flow</h2>
          <DeviceInfo />
        </div>
        <RecordingControls />
      </div>

      {/* Main content: device mirror + actions panel */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: Device screen (takes most space) */}
        <div className="flex-[3] flex flex-col min-h-0 min-w-0">
          <ScreenMirror />
        </div>

        {/* Right: Actions panel */}
        <div className="flex-[1] flex flex-col min-w-[280px] max-w-[360px]">
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <h3 className="text-sm font-medium text-slate-400 shrink-0">Actions</h3>
            <div className="flex-1 overflow-auto">
              <ActionFeed />
            </div>
          </div>

          {/* YAML output */}
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
