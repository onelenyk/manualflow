import { describe, it, expect } from 'vitest';
import { CoordinateConverter } from './coordinate-converter.js';

describe('CoordinateConverter', () => {
  // Typical Android device: touch sensor 0-32767, screen 1080x1920
  const converter = new CoordinateConverter(32767, 32767, 1080, 1920);

  describe('toPixelX', () => {
    it('converts 0 to 0', () => {
      expect(converter.toPixelX(0)).toBe(0);
    });

    it('converts max to screen width', () => {
      // 32767 * 1080 / 32767 = 1080
      expect(converter.toPixelX(32767)).toBe(1080);
    });

    it('converts midpoint correctly', () => {
      const mid = converter.toPixelX(16383);
      expect(mid).toBeGreaterThan(530);
      expect(mid).toBeLessThan(545);
    });
  });

  describe('toPixelY', () => {
    it('converts 0 to 0', () => {
      expect(converter.toPixelY(0)).toBe(0);
    });

    it('converts max to screen height', () => {
      expect(converter.toPixelY(32767)).toBe(1920);
    });
  });

  describe('pixelsToRawDistance', () => {
    it('converts pixel distance to raw sensor units', () => {
      const raw = converter.pixelsToRawDistance(100);
      // 100 * 32767 / 1080 ≈ 3034
      expect(raw).toBeGreaterThan(3000);
      expect(raw).toBeLessThan(3100);
    });

    it('returns 0 for 0 pixels', () => {
      expect(converter.pixelsToRawDistance(0)).toBe(0);
    });
  });
});
