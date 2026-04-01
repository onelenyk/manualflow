export type UserAction = TapAction;

export interface TapAction {
  type: 'tap';
  x: number;
  y: number;
  timestampMs: number;
}

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

export type MaestroCommand =
  | { type: 'launchApp' }
  | { type: 'tapOn'; selector: TapOnSelector }
  | { type: 'inputText'; text: string };

export type TapOnSelector =
  | { kind: 'id'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'contentDescription'; description: string }
  | { kind: 'point'; x: number; y: number };

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
