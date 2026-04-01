import { DeviceInfo } from '../device/DeviceInfo';
import { ScreenMirror } from '../device/ScreenMirror';
import { RecordingControls } from './RecordingControls';
import { ActionFeed } from './ActionFeed';
import { useRecordingStore } from '../../stores/recordingStore';

export function RecordView() {
  const { yaml } = useRecordingStore();

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Record Flow</h2>
          <DeviceInfo />
        </div>
        <RecordingControls />
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Left: Screen mirror */}
        <div className="flex flex-col items-center gap-2">
          <ScreenMirror />
        </div>

        {/* Right: Action feed */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-slate-400">Actions</h3>
          <ActionFeed />
        </div>
      </div>

      {/* YAML output after recording */}
      {yaml && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Generated YAML</h3>
          <pre className="bg-slate-800 rounded-lg p-4 text-sm text-green-400 overflow-auto max-h-64 border border-slate-700">
            {yaml}
          </pre>
        </div>
      )}
    </div>
  );
}
