import type { UserAction } from '@maestro-recorder/shared';
import type { GeteventLine, TouchPhase } from './types.js';
import type { CoordinateConverter } from './coordinate-converter.js';

// Thresholds
const TAP_MAX_DURATION_MS = 500;
const LONG_PRESS_MIN_DURATION_MS = 600;
const SCROLL_VERTICAL_THRESHOLD = 0.7;

// Distance thresholds (in pixels, applied AFTER coordinate conversion)
const TAP_MAX_DISTANCE_PX = 60;       // max distance from start for a tap
const MIN_SWIPE_DISTANCE_PX = 100;    // minimum distance for intentional swipe/scroll
const FLING_VELOCITY_THRESHOLD = 0.5; // px/ms — fast release = intentional swipe

export class TouchStateMachine {
  private phase: TouchPhase = 'idle';
  private downTimestamp = 0;
  private currentRawX = 0;
  private currentRawY = 0;
  private startRawX = 0;
  private startRawY = 0;

  // Track movement during touch
  private maxDistanceFromStart = 0;  // furthest point from start (in raw units)
  private totalPathLength = 0;       // sum of all movements
  private lastRawX = 0;
  private lastRawY = 0;
  private sampleCount = 0;

  feed(line: GeteventLine, converter: CoordinateConverter): UserAction | null {
    switch (line.type) {
      case 'EV_ABS': return this.handleAbs(line);
      case 'EV_KEY': return this.handleKey(line, converter);
      default: return null;
    }
  }

  private handleAbs(line: GeteventLine): null {
    const prevX = this.currentRawX;
    const prevY = this.currentRawY;

    if (line.code === 'ABS_MT_POSITION_X') {
      this.currentRawX = parseHex(line.value);
    } else if (line.code === 'ABS_MT_POSITION_Y') {
      this.currentRawY = parseHex(line.value);
    } else {
      return null;
    }

    // Track movement metrics during active touch
    if (this.phase === 'touchActive') {
      // Distance from start point
      const dxFromStart = this.currentRawX - this.startRawX;
      const dyFromStart = this.currentRawY - this.startRawY;
      const distFromStart = Math.sqrt(dxFromStart * dxFromStart + dyFromStart * dyFromStart);
      if (distFromStart > this.maxDistanceFromStart) {
        this.maxDistanceFromStart = distFromStart;
      }

      // Path length (sum of frame-to-frame movements)
      if (this.sampleCount > 0) {
        const frameDx = this.currentRawX - this.lastRawX;
        const frameDy = this.currentRawY - this.lastRawY;
        this.totalPathLength += Math.sqrt(frameDx * frameDx + frameDy * frameDy);
      }

      this.lastRawX = this.currentRawX;
      this.lastRawY = this.currentRawY;
      this.sampleCount++;
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
      this.lastRawX = this.currentRawX;
      this.lastRawY = this.currentRawY;
      this.maxDistanceFromStart = 0;
      this.totalPathLength = 0;
      this.sampleCount = 0;
      return null;
    }

    if (line.value === 'UP') {
      if (this.phase === 'idle') return null;

      const durationMs = (line.timestamp - this.downTimestamp) * 1000;
      const startX = converter.toPixelX(this.startRawX);
      const startY = converter.toPixelY(this.startRawY);
      const endX = converter.toPixelX(this.currentRawX);
      const endY = converter.toPixelY(this.currentRawY);

      // Convert distances to pixels
      const dx = endX - startX;
      const dy = endY - startY;
      const endDistance = Math.sqrt(dx * dx + dy * dy);

      // Max distance the finger ever traveled from start (converted to pixels)
      const maxDistPx = converter.toPixelX(this.maxDistanceFromStart);

      // Velocity at release (pixels per ms)
      const velocity = durationMs > 0 ? endDistance / durationMs : 0;

      const timestampMs = Math.floor(this.downTimestamp * 1000);
      this.phase = 'idle';

      // === CLASSIFICATION ===

      // 1. If finger never moved far from start → TAP or LONG_PRESS
      if (maxDistPx <= TAP_MAX_DISTANCE_PX) {
        if (durationMs >= LONG_PRESS_MIN_DURATION_MS) {
          return { type: 'longPress', x: startX, y: startY, durationMs, timestampMs };
        }
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // 2. End position close to start (finger came back) → likely a tap with wiggle
      if (endDistance < TAP_MAX_DISTANCE_PX) {
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // 3. Not enough intentional movement → treat as tap
      if (endDistance < MIN_SWIPE_DISTANCE_PX && velocity < FLING_VELOCITY_THRESHOLD) {
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // 4. Short duration + some movement + low velocity → probably a sloppy tap
      if (durationMs < 200 && endDistance < MIN_SWIPE_DISTANCE_PX) {
        return { type: 'tap', x: startX, y: startY, timestampMs };
      }

      // 5. Clear intentional movement → SCROLL or SWIPE
      const verticalRatio = Math.abs(dy) / (Math.abs(dx) + Math.abs(dy));

      if (verticalRatio >= SCROLL_VERTICAL_THRESHOLD) {
        const direction = dy < 0 ? 'up' : 'down';
        return {
          type: 'scroll', startX, startY, endX, endY,
          direction: direction as 'up' | 'down',
          timestampMs,
        };
      }

      // Horizontal-dominant movement
      const hDirection = dx < 0 ? 'left' : 'right';
      if (verticalRatio <= 0.3) {
        // Mostly horizontal — could be a horizontal scroll
        return {
          type: 'scroll', startX, startY, endX, endY,
          direction: hDirection as 'left' | 'right',
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
