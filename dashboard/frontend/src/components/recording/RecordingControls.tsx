import { useRecordingStore } from '../../stores/recordingStore';
import { useDeviceStore } from '../../stores/deviceStore';

export function RecordingControls() {
  const { state, commands, startRecording, stopRecording } = useRecordingStore();
  const { selectedDevice } = useDeviceStore();

  const handleStart = () => {
    startRecording(selectedDevice || undefined);
  };

  return (
    <div className="flex items-center gap-3">
      {state === 'idle' ? (
        <button
          onClick={handleStart}
          disabled={!selectedDevice}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Record
        </button>
      ) : (
        <button
          onClick={stopRecording}
          disabled={state === 'stopping'}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {state === 'stopping' ? 'Stopping...' : 'Stop'}
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-slate-400">
            Recording... {commands.length} actions
          </span>
        </div>
      )}
    </div>
  );
}
