import { useRecordingStore } from '../../stores/recordingStore';
import { useDeviceStore } from '../../stores/deviceStore';

export function RecordingControls() {
  const { state, commands, startRecording, stopRecording } = useRecordingStore();
  const { selectedDevice } = useDeviceStore();

  const handleStart = () => {
    startRecording(selectedDevice || undefined);
  };

  return (
    <div className="flex items-center gap-2">
      {state === 'recording' && (
        <div className="flex items-center gap-1.5 mr-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] text-slate-400 tabular-nums">{commands.length}</span>
        </div>
      )}

      {state === 'idle' ? (
        <button
          onClick={handleStart}
          disabled={!selectedDevice}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
        >
          Record
        </button>
      ) : (
        <button
          onClick={stopRecording}
          disabled={state === 'stopping'}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
        >
          {state === 'stopping' ? 'Stopping...' : 'Stop'}
        </button>
      )}
    </div>
  );
}
