import type { UserAction } from '@maestro-recorder/shared';
import type { GeteventLine, TouchPhase } from './types.js';
import type { CoordinateConverter } from './coordinate-converter.js';

const TAP_MAX_DURATION_MS = 400;     // was 200 — real taps can be 300ms+
const LONG_PRESS_MIN_DURATION_MS = 600;
const TAP_MAX_DISTANCE_PX = 50;      // was 20 — finger naturally wiggles 30-40px
const SCROLL_VERTICAL_THRESHOLD = 0.7;
const MIN_SWIPE_DISTANCE_PX = 80;    // ignore tiny accidental drags

export class TouchStateMachine {
  private phase: TouchPhase = 'idle';
  private downTimestamp = 0;
  private currentRawX = 0;
  private currentRawY = 0;
  private startRawX = 0;
  private startRawY = 0;

  feed(line: GeteventLine, converter: CoordinateConverter): UserAction | null {
    switch (line.type) {
      case 'EV_ABS': return this.handleAbs(line);
      case 'EV_KEY': return this.handleKey(line, converter);
      default: return null;
    }
  }

  private handleAbs(line: GeteventLine): null {
    if (line.code === 'ABS_MT_POSITION_X') {
      this.currentRawX = parseHex(line.value);
    } else if (line.code === 'ABS_MT_POSITION_Y') {
      this.currentRawY = parseHex(line.value);
    }
    return null;
  }

  private handleKey(line: GeteventLine, converter: CoordinateConverter): UserAction | null {
    if (line.code !== 'BTN_TOUCH') return null;

    if (line.value === 'DOWN') {
      this.phase = 'touchActive';
      this.downTimestamp = line.timestamp;
      this.startRawX = this.currentRawX;
      this.startRawY = this.currentRawY;
      return null;
    }

    if (line.value === 'UP') {
      if (this.phase === 'idle') return null;

      const durationMs = (line.timestamp - this.downTimestamp) * 1000;
      const startX = converter.toPixelX(this.startRawX);
      const startY = converter.toPixelY(this.startRawY);
      const endX = converter.toPixelX(this.currentRawX);
      const endY = converter.toPixelY(this.currentRawY);
      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timestampMs = Math.floor(this.downTimestamp * 1000);

      this.phase = 'idle';

      // Classify gesture
      if (distance <= TAP_MAX_DISTANCE_PX) {
        // Stationary touch — tap or long press
        if (durationMs >= LONG_PRESS_MIN_DURATION_MS) {
          return { type: 'longPress', x: startX, y: startY, durationMs, timestampMs };
        }
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // Small movement but not enough for a real swipe — treat as tap
      if (distance < MIN_SWIPE_DISTANCE_PX) {
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // Clear movement — swipe or scroll
      const verticalRatio = Math.abs(dy) / (Math.abs(dx) + Math.abs(dy));

      if (verticalRatio >= SCROLL_VERTICAL_THRESHOLD) {
        const direction = dy < 0 ? 'up' : 'down';
        return {
          type: 'scroll', startX, startY, endX, endY,
          direction: direction as 'up' | 'down',
          timestampMs,
        };
      }

      return {
        type: 'swipe', startX, startY, endX, endY,
        durationMs, timestampMs,
      };
    }

    return null;
  }
}

function parseHex(value: string): number {
  if (value.startsWith('0x')) return parseInt(value, 16) || 0;
  return parseInt(value, 16) || parseInt(value, 10) || 0;
}
