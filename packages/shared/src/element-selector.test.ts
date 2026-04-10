import { describe, it, expect } from 'vitest';
import { selectBestSelector } from './element-selector.js';
import type { UiElement } from './types.js';

function makeElement(overrides: Partial<UiElement> = {}): UiElement {
  return {
    bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    clickable: true,
    editable: false,
    enabled: true,
    focused: false,
    ...overrides,
  };
}

describe('selectBestSelector', () => {
  it('returns point fallback when element is null', () => {
    const result = selectBestSelector(null, 150, 300, 1080, 1920);
    expect(result).toEqual({ kind: 'point', x: 14, y: 16 });
  });

  it('returns raw coordinates when no screen dimensions', () => {
    const result = selectBestSelector(null, 150, 300);
    expect(result).toEqual({ kind: 'point', x: 150, y: 300 });
  });

  // Priority 1: resource-id
  it('selects by resource-id (priority 1)', () => {
    const el = makeElement({ resourceId: 'com.app:id/login_button' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'id', id: 'login_button' });
  });

  it('uses full id when no :id/ prefix', () => {
    const el = makeElement({ resourceId: 'my_button' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'id', id: 'my_button' });
  });

  it('skips junk resource-ids', () => {
    const el = makeElement({ resourceId: 'action_bar_root', text: 'Settings' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'text', text: 'Settings' });
  });

  // Priority 2: content description
  it('selects by contentDescription (priority 2)', () => {
    const el = makeElement({ contentDescription: 'Navigate up' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'contentDescription', description: 'Navigate up' });
  });

  // Priority 3: visible text (non-editable)
  it('selects by text for non-editable elements (priority 3)', () => {
    const el = makeElement({ text: 'Submit' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'text', text: 'Submit' });
  });

  it('skips text for editable fields', () => {
    const el = makeElement({ text: 'placeholder', editable: true });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    // Should fall through to point since no other selectors
    expect(result.kind).toBe('point');
  });

  it('skips text for EditText className', () => {
    const el = makeElement({ text: 'Enter name', className: 'android.widget.EditText' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result.kind).toBe('point');
  });

  it('skips long text (>50 chars)', () => {
    const el = makeElement({ text: 'A'.repeat(51) });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result.kind).toBe('point');
  });

  // Priority 4: relative selector
  it('selects by relative selector (priority 4)', () => {
    const el = makeElement({ nearestLabel: 'Username', labelRelation: 'below' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result).toEqual({ kind: 'relative', relation: 'below', anchor: 'Username' });
  });

  // Priority order: id > contentDescription > text > relative > point
  it('prefers id over text', () => {
    const el = makeElement({ resourceId: 'com.app:id/btn', text: 'Click me' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result.kind).toBe('id');
  });

  it('prefers contentDescription over text', () => {
    const el = makeElement({ contentDescription: 'Back button', text: 'Back' });
    const result = selectBestSelector(el, 50, 25, 1080, 1920);
    expect(result.kind).toBe('contentDescription');
  });
});
