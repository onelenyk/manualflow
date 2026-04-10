import { describe, it, expect, beforeEach } from 'vitest';
import { TouchStateMachine } from './touch-state-machine.js';
import { CoordinateConverter } from './coordinate-converter.js';
import type { GeteventLine } from './types.js';

// Simulates a 1080x1920 screen with touch sensor range 0-32767
const converter = new CoordinateConverter(32767, 32767, 1080, 1920);

function makeAbsLine(code: string, value: number, timestamp = 0): GeteventLine {
  return { timestamp, device: '/dev/input/event1', type: 'EV_ABS', code, value: `0x${value.toString(16)}` };
}

function makeKeyLine(code: string, value: string, timestamp = 0): GeteventLine {
  return { timestamp, device: '/dev/input/event1', type: 'EV_KEY', code, value };
}

describe('TouchStateMachine', () => {
  let sm: TouchStateMachine;

  beforeEach(() => {
    sm = new TouchStateMachine();
  });

  describe('tap detection', () => {
    it('classifies a quick stationary touch as a tap', () => {
      // Touch down
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);

      // Touch up (100ms later)
      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.1), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('tap');
      if (result!.type === 'tap') {
        expect(result!.x).toBe(converter.toPixelX(16383));
        expect(result!.y).toBe(converter.toPixelY(16383));
      }
    });

    it('classifies short movement + short duration as tap', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);
      // Small movement (within TAP_MAX_DISTANCE)
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16400, 1.05), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16400, 1.05), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.1), converter);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('tap');
    });

    it('classifies finger returning to start as tap', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);
      // Move away
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 20000, 1.1), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 20000, 1.1), converter);
      // Return to start
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.2), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.2), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.3), converter);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('tap');
    });
  });

  describe('long press detection', () => {
    it('classifies stationary long touch as longPress', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);

      // Touch up 700ms later (> LONG_PRESS_MIN_DURATION_MS = 600)
      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.7), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('longPress');
      if (result!.type === 'longPress') {
        expect(result!.durationMs).toBeGreaterThanOrEqual(600);
      }
    });
  });

  describe('scroll detection', () => {
    it('classifies vertical movement as scroll', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 24000, 1.0), converter);

      // Move up significantly (vertical dominant)
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 8000, 1.3), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.5), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('scroll');
      if (result!.type === 'scroll') {
        expect(result!.direction).toBe('up');
      }
    });

    it('detects downward scroll', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 8000, 1.0), converter);

      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 24000, 1.3), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.5), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('scroll');
      if (result!.type === 'scroll') {
        expect(result!.direction).toBe('down');
      }
    });

    it('detects horizontal scroll', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 8000, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);

      // Move right significantly (horizontal dominant)
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 26000, 1.3), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.5), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('scroll');
      if (result!.type === 'scroll') {
        expect(result!.direction).toBe('right');
      }
    });
  });

  describe('swipe detection', () => {
    it('classifies diagonal movement as swipe', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 8000, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 8000, 1.0), converter);

      // Move diagonally
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 24000, 1.2), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 20000, 1.2), converter);

      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.4), converter);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('swipe');
      if (result!.type === 'swipe') {
        expect(result!.startX).toBeDefined();
        expect(result!.startY).toBeDefined();
        expect(result!.endX).toBeDefined();
        expect(result!.endY).toBeDefined();
      }
    });
  });

  describe('state machine reset', () => {
    it('handles consecutive gestures independently', () => {
      // First tap
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);
      const tap1 = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.1), converter);
      expect(tap1!.type).toBe('tap');

      // Second tap at different position
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 2.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 8000, 2.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 8000, 2.0), converter);
      const tap2 = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 2.1), converter);
      expect(tap2!.type).toBe('tap');

      if (tap1!.type === 'tap' && tap2!.type === 'tap') {
        expect(tap1!.x).not.toBe(tap2!.x);
      }
    });

    it('ignores UP when idle', () => {
      const result = sm.feed(makeKeyLine('BTN_TOUCH', 'UP', 1.0), converter);
      expect(result).toBeNull();
    });

    it('ignores non-BTN_TOUCH key events', () => {
      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      const result = sm.feed(makeKeyLine('BTN_TOOL_FINGER', 'DOWN', 1.0), converter);
      expect(result).toBeNull();
    });
  });

  describe('touch-start hint', () => {
    it('emits onTouchStart callback on first coordinate frame', () => {
      let hint: { pixelX: number; pixelY: number } | null = null;
      sm.onTouchStart = (h) => { hint = h; };

      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      expect(hint).toBeNull(); // Only X captured, not yet both

      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);
      expect(hint).not.toBeNull(); // Both axes captured
      expect(hint!.pixelX).toBe(converter.toPixelX(16383));
    });

    it('emits hint only once per touch', () => {
      let callCount = 0;
      sm.onTouchStart = () => { callCount++; };

      sm.feed(makeKeyLine('BTN_TOUCH', 'DOWN', 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16383, 1.0), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_X', 16400, 1.05), converter);
      sm.feed(makeAbsLine('ABS_MT_POSITION_Y', 16400, 1.05), converter);

      expect(callCount).toBe(1);
    });
  });
});
