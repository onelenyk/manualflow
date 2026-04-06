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
  editable: boolean;
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

// --- Accessibility Events (from agent event stream) ---

export interface AccessibilityEventData {
  type: 'textChanged' | 'windowChanged' | 'click' | 'longClick' | 'focused' | 'selected' | 'scroll';
  text?: string;
  beforeText?: string;
  resourceId?: string;
  contentDescription?: string;
  className?: string;
  packageName?: string;
  bounds?: ElementBounds;
  timestampMs: number;
  direction?: string;
  addedCount?: number;
  removedCount?: number;
  extras?: Record<string, string>;
}

// --- Keyboard State ---

export interface KeyboardState {
  open: boolean;
  top: number; // y coordinate where keyboard starts (0 if unknown)
}

// --- Recorded Interaction (unified action record) ---

export type InteractionSource = 'getevent' | 'accessibility';

export type InteractionStatus = 'pending' | 'complete';

export interface RecordedInteraction {
  /** Unique incrementing ID */
  id: number;

  /** What triggered this interaction */
  source: InteractionSource;

  /** Whether the correlation window is still open */
  status: InteractionStatus;

  /** Timestamp when this interaction was created */
  timestampMs: number;

  // --- Source 1: getevent touch gesture ---
  touchAction?: UserAction;

  // --- Source 2: UI element found at touch coordinates ---
  element?: UiElement;

  // --- Source 3: Correlated accessibility events ---
  accessibilityEvents: AccessibilityEventData[];

  // --- Source 4: Keyboard state at time of interaction ---
  keyboardState?: KeyboardState;

  /** Was this tap filtered because it landed in the keyboard area? */
  filteredAsKeyboardTap: boolean;

  /** Screen dimensions (needed for coordinate conversion) */
  screenWidth: number;
  screenHeight: number;
}

// --- Flow Builder ---

export interface FlowEntry {
  /** Unique entry ID */
  id: string;
  /** Linked interaction ID (if auto-generated from an interaction) */
  interactionId?: number;
  /** The Maestro command */
  command: MaestroCommand;
  /** How this entry was created */
  source: 'auto' | 'manual';
}
