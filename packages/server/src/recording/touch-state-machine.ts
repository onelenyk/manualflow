import type { UserAction } from '@maestro-recorder/shared';
import type { GeteventLine, TouchPhase } from './types.js';
import type { CoordinateConverter } from './coordinate-converter.js';

// Thresholds
const TAP_MAX_DURATION_MS = 500;
const LONG_PRESS_MIN_DURATION_MS = 600;
const SCROLL_VERTICAL_THRESHOLD = 0.7;
const TAP_MAX_DISTANCE_PX = 60;
const MIN_SWIPE_DISTANCE_PX = 100;
const FLING_VELOCITY_THRESHOLD = 0.5;

export class TouchStateMachine {
  private phase: TouchPhase = 'idle';
  private downTimestamp = 0;
  private currentRawX = 0;
  private currentRawY = 0;
  private startRawX = 0;
  private startRawY = 0;
  private startCaptured = false; // whether we've captured the start position for this touch

  private maxDistanceFromStart = 0;
  private totalPathLength = 0;
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
    if (line.code === 'ABS_MT_POSITION_X') {
      this.currentRawX = parseHex(line.value);
    } else if (line.code === 'ABS_MT_POSITION_Y') {
      this.currentRawY = parseHex(line.value);
    } else {
      return null;
    }

    if (this.phase === 'touchActive') {
      // Capture start position from FIRST position update after DOWN
      if (!this.startCaptured) {
        this.startRawX = this.currentRawX;
        this.startRawY = this.currentRawY;
        this.lastRawX = this.currentRawX;
        this.lastRawY = this.currentRawY;
        this.startCaptured = true;
        return null;
      }

      // Track movement
      const dxFromStart = this.currentRawX - this.startRawX;
      const dyFromStart = this.currentRawY - this.startRawY;
      const distFromStart = Math.sqrt(dxFromStart * dxFromStart + dyFromStart * dyFromStart);
      if (distFromStart > this.maxDistanceFromStart) {
        this.maxDistanceFromStart = distFromStart;
      }

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
      this.startCaptured = false; // will be set on first ABS event
      this.maxDistanceFromStart = 0;
      this.totalPathLength = 0;
      this.sampleCount = 0;
      return null;
    }

    if (line.value === 'UP') {
      if (this.phase === 'idle') return null;

      // If we never got position events, use currentRaw as fallback
      if (!this.startCaptured) {
        this.startRawX = this.currentRawX;
        this.startRawY = this.currentRawY;
      }

      const durationMs = (line.timestamp - this.downTimestamp) * 1000;
      const startX = converter.toPixelX(this.startRawX);
      const startY = converter.toPixelY(this.startRawY);
      const endX = converter.toPixelX(this.currentRawX);
      const endY = converter.toPixelY(this.currentRawY);

      const dx = endX - startX;
      const dy = endY - startY;
      const endDistance = Math.sqrt(dx * dx + dy * dy);
      const maxDistPx = converter.toPixelX(this.maxDistanceFromStart);
      const velocity = durationMs > 0 ? endDistance / durationMs : 0;
      const verticalRatio = (Math.abs(dx) + Math.abs(dy)) > 0
        ? Math.abs(dy) / (Math.abs(dx) + Math.abs(dy)) : 0;

      const timestampMs = Math.floor(this.downTimestamp * 1000);
      this.phase = 'idle';

      const mkDebug = (reason: string) => ({
        durationMs: Math.round(durationMs),
        endDistance: Math.round(endDistance),
        maxDistFromStart: Math.round(maxDistPx),
        velocity: Math.round(velocity * 1000) / 1000,
        verticalRatio: Math.round(verticalRatio * 100) / 100,
        reason,
      });

      // === CLASSIFICATION ===

      // 1. Finger never moved far from start
      if (maxDistPx <= TAP_MAX_DISTANCE_PX) {
        if (durationMs >= LONG_PRESS_MIN_DURATION_MS) {
          return { type: 'longPress', x: startX, y: startY, durationMs, timestampMs, debug: mkDebug(`maxDist ${Math.round(maxDistPx)}px <= ${TAP_MAX_DISTANCE_PX}px + duration ${Math.round(durationMs)}ms >= ${LONG_PRESS_MIN_DURATION_MS}ms`) };
        }
        return { type: 'tap', x: startX, y: startY, timestampMs, debug: mkDebug(`maxDist ${Math.round(maxDistPx)}px <= ${TAP_MAX_DISTANCE_PX}px`) };
      }

      // 2. End position close to start (finger came back)
      if (endDistance < TAP_MAX_DISTANCE_PX) {
        return { type: 'tap', x: startX, y: startY, timestampMs, debug: mkDebug(`endDist ${Math.round(endDistance)}px < ${TAP_MAX_DISTANCE_PX}px (returned to start)`) };
      }

      // 3. Not enough intentional movement
      if (endDistance < MIN_SWIPE_DISTANCE_PX && velocity < FLING_VELOCITY_THRESHOLD) {
        return { type: 'tap', x: startX, y: startY, timestampMs, debug: mkDebug(`endDist ${Math.round(endDistance)}px < ${MIN_SWIPE_DISTANCE_PX}px + vel ${velocity.toFixed(3)} < ${FLING_VELOCITY_THRESHOLD}`) };
      }

      // 4. Short duration + small movement
      if (durationMs < 200 && endDistance < MIN_SWIPE_DISTANCE_PX) {
        return { type: 'tap', x: startX, y: startY, timestampMs, debug: mkDebug(`dur ${Math.round(durationMs)}ms < 200ms + endDist ${Math.round(endDistance)}px < ${MIN_SWIPE_DISTANCE_PX}px`) };
      }

      // 5. Clear movement → SCROLL or SWIPE
      if (verticalRatio >= SCROLL_VERTICAL_THRESHOLD) {
        const direction = dy < 0 ? 'up' : 'down';
        return { type: 'scroll', startX, startY, endX, endY, direction: direction as 'up' | 'down', timestampMs,
          debug: mkDebug(`vertRatio ${verticalRatio.toFixed(2)} >= ${SCROLL_VERTICAL_THRESHOLD} → scroll ${direction}`) };
      }

      if (verticalRatio <= 0.3) {
        const direction = dx < 0 ? 'left' : 'right';
        return { type: 'scroll', startX, startY, endX, endY, direction: direction as 'left' | 'right', timestampMs,
          debug: mkDebug(`vertRatio ${verticalRatio.toFixed(2)} <= 0.3 → horizontal scroll ${direction}`) };
      }

      return { type: 'swipe', startX, startY, endX, endY, durationMs, timestampMs,
        debug: mkDebug(`endDist ${Math.round(endDistance)}px, vertRatio ${verticalRatio.toFixed(2)} → diagonal swipe`) };
    }

    return null;
  }
}

function parseHex(value: string): number {
  if (value.startsWith('0x')) return parseInt(value, 16) || 0;
  return parseInt(value, 16) || parseInt(value, 10) || 0;
}
