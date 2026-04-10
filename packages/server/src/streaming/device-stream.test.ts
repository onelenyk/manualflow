import { describe, it, expect } from 'vitest';
import { isJunkElement } from './device-stream.js';
import type { UiElement } from '@maestro-recorder/shared';

function el(overrides: Partial<UiElement> = {}): UiElement {
  return {
    bounds: { left: 100, top: 200, right: 400, bottom: 300 },
    clickable: true,
    editable: false,
    enabled: true,
    focused: false,
    ...overrides,
  };
}

describe('isJunkElement', () => {
  const W = 1080, H = 2400;

  it('treats elements with a real resourceId as not junk', () => {
    expect(isJunkElement(el({ resourceId: 'com.app:id/submit_button' }), W, H)).toBe(false);
  });

  it('does NOT flag ids that merely contain "content" as a substring', () => {
    // Regression: substring matching previously dropped these.
    expect(isJunkElement(el({ resourceId: 'com.app:id/main_content' }), W, H)).toBe(false);
    expect(isJunkElement(el({ resourceId: 'com.app:id/content_frame' }), W, H)).toBe(false);
    expect(isJunkElement(el({ resourceId: 'com.app:id/toolbar_content' }), W, H)).toBe(false);
  });

  it('flags bare "android:id/content" root (exact match)', () => {
    expect(isJunkElement(
      el({ resourceId: 'android:id/content', bounds: { left: 0, top: 0, right: W, bottom: H } }),
      W, H,
    )).toBe(true);
  });

  it('flags bare action_bar_root', () => {
    expect(isJunkElement(
      el({ resourceId: 'com.app:id/action_bar_root', bounds: { left: 0, top: 0, right: W, bottom: H } }),
      W, H,
    )).toBe(true);
  });

  it('keeps elements that only have text', () => {
    expect(isJunkElement(el({ text: 'Submit' }), W, H)).toBe(false);
  });

  it('keeps elements that only have contentDescription', () => {
    expect(isJunkElement(el({ contentDescription: 'Navigate up' }), W, H)).toBe(false);
  });

  it('keeps elements that only have a nearestLabel', () => {
    expect(isJunkElement(el({ nearestLabel: 'Username', labelRelation: 'below' }), W, H)).toBe(false);
  });

  it('flags elements with no identifiers covering >80% of screen', () => {
    expect(isJunkElement(
      el({ bounds: { left: 0, top: 0, right: W, bottom: H } }),
      W, H,
    )).toBe(true);
  });

  it('keeps small elements with no identifiers and no bounds info as junk', () => {
    // Without bounds we cannot judge — treat as junk (tree wasn't ready).
    expect(isJunkElement(el({ bounds: undefined as any }), W, H)).toBe(true);
  });

  it('keeps small unlabeled elements (layout container, not junk)', () => {
    // No identifiers but small bounds → not junk (may still be useful via child lookup).
    expect(isJunkElement(
      el({ bounds: { left: 0, top: 0, right: 200, bottom: 100 } }),
      W, H,
    )).toBe(false);
  });
});
