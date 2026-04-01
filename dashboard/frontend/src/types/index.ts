export interface Device {
  serial: string;
  status: string;
  model?: string;
}

export interface DeviceInfo {
  screenWidth: number;
  screenHeight: number;
  density: number;
}

export interface CommandDto {
  type: string;
  selector?: SelectorDto;
  text?: string;
}

export interface SelectorDto {
  type: string;
  value: string;
}

export interface FlowDto {
  id: string;
  name: string;
  commandCount: number;
  createdAt: number;
}

export interface FlowDetailDto {
  id: string;
  name: string;
  yaml: string;
  commands: CommandDto[];
}

export interface ElementDto {
  className?: string;
  text?: string;
  resourceId?: string;
  contentDescription?: string;
  bounds?: BoundsDto;
  clickable: boolean;
  enabled: boolean;
  focused: boolean;
}

export interface BoundsDto {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RecordingWsMessage {
  type: 'command' | 'status';
  command?: CommandDto;
  state?: string;
  message?: string;
}

export interface RunWsMessage {
  type: 'stdout' | 'completed';
  line?: string;
  exitCode?: number;
}
