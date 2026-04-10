import { describe, it, expect } from 'vitest';
import { boundsCenter } from './types.js';

describe('boundsCenter', () => {
  it('returns center of bounds', () => {
    expect(boundsCenter({ left: 0, top: 0, right: 100, bottom: 200 }))
      .toEqual({ x: 50, y: 100 });
  });

  it('floors fractional results', () => {
    expect(boundsCenter({ left: 0, top: 0, right: 101, bottom: 201 }))
      .toEqual({ x: 50, y: 100 });
  });

  it('handles non-zero origin', () => {
    expect(boundsCenter({ left: 100, top: 200, right: 300, bottom: 400 }))
      .toEqual({ x: 200, y: 300 });
  });

  it('handles single pixel bounds', () => {
    expect(boundsCenter({ left: 50, top: 50, right: 50, bottom: 50 }))
      .toEqual({ x: 50, y: 50 });
  });
});
