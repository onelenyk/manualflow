export interface GeteventLine {
  timestamp: number;
  device: string;
  type: string;
  code: string;
  value: string;
}

export interface InputDeviceRange {
  devicePath: string;
  maxX: number;
  maxY: number;
}

export type TouchPhase = 'idle' | 'touchActive' | 'swiping';

export interface TouchFingerState {
  phase: TouchPhase;
  startTimestamp: number;
  startRawX: number;
  startRawY: number;
  currentRawX: number;
  currentRawY: number;
}
