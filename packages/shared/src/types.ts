// --- User Actions (from getevent parser) ---

export type UserAction = TapAction | SwipeAction | LongPressAction | ScrollAction;

export interface GestureDebug {
  durationMs: number;
  endDistance: number;
  maxDistFromStart: number;
  velocity: number;
  verticalRatio: number;
  reason: string;
}

export interface TapAction {
  type: 'tap';
  x: number;
  y: number;
  timestampMs: number;
  debug?: GestureDebug;
}

export interface SwipeAction {
  type: 'swipe';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  timestampMs: number;
  debug?: GestureDebug;
}

export interface LongPressAction {
  type: 'longPress';
  x: number;
  y: number;
  durationMs: number;
  timestampMs: number;
  debug?: GestureDebug;
}

export interface ScrollAction {
  type: 'scroll';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'up' | 'down' | 'left' | 'right';
  timestampMs: number;
  debug?: GestureDebug;
}

// --- UI Elements (from agent HTTP responses) ---

export interface UiElement {
  className?: string;
  text?: string;
  resourceId?: string;
  contentDescription?: string;
  bounds: ElementBounds;
  clickable: boolean;
  enabled: boolean;
  focused: boolean;
}

export interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boundsCenter(b: ElementBounds): { x: number; y: number } {
  return { x: Math.floor((b.left + b.right) / 2), y: Math.floor((b.top + b.bottom) / 2) };
}

// --- Maestro Commands (YAML output) ---

export type MaestroCommand =
  | { type: 'launchApp' }
  | { type: 'tapOn'; selector: TapOnSelector }
  | { type: 'doubleTapOn'; selector: TapOnSelector }
  | { type: 'longPressOn'; selector: TapOnSelector }
  | { type: 'inputText'; text: string }
  | { type: 'eraseText'; chars?: number }
  | { type: 'swipe'; start: string; end: string }
  | { type: 'swipe'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'scroll' }
  | { type: 'scrollUntilVisible'; selector: TapOnSelector; direction?: string }
  | { type: 'assertVisible'; selector: TapOnSelector }
  | { type: 'assertNotVisible'; selector: TapOnSelector }
  | { type: 'back' }
  | { type: 'pressKey'; key: string }
  | { type: 'openLink'; url: string }
  | { type: 'hideKeyboard' }
  | { type: 'waitForAnimationToEnd' }
  | { type: 'takeScreenshot' };

export type TapOnSelector =
  | { kind: 'id'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'contentDescription'; description: string }
  | { kind: 'point'; x: number; y: number };

// --- Device Info ---

export interface DeviceInfo {
  screenWidth: number;
  screenHeight: number;
  density: number;
}

export interface InputDeviceInfo {
  devicePath: string;
  maxX: number;
  maxY: number;
}

// --- Templates ---

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'auth' | 'navigation' | 'forms' | 'lists' | 'search' | 'common';
  yaml: string;
}

// --- Validation ---

export interface ValidationError {
  index: number;
  command: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
