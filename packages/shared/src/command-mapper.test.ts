import { describe, it, expect } from 'vitest';
import { mapInteractionToCommands, getMappingAlternatives } from './command-mapper.js';
import type { RecordedInteraction } from './types.js';

function makeInteraction(overrides: Partial<RecordedInteraction> = {}): RecordedInteraction {
  return {
    id: 1,
    source: 'getevent',
    status: 'complete',
    timestampMs: 1000,
    accessibilityEvents: [],
    keyboardState: { open: false, top: 0 },
    filteredAsKeyboardTap: false,
    screenWidth: 1080,
    screenHeight: 1920,
    ...overrides,
  };
}

describe('mapInteractionToCommands', () => {
  it('returns empty for filtered keyboard taps', () => {
    const interaction = makeInteraction({ filteredAsKeyboardTap: true });
    expect(mapInteractionToCommands(interaction)).toEqual([]);
  });

  it('returns empty for interaction with no touch action and getevent source', () => {
    const interaction = makeInteraction({ touchAction: undefined });
    expect(mapInteractionToCommands(interaction)).toEqual([]);
  });

  it('maps a tap with element to tapOn', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'tap', x: 540, y: 960, timestampMs: 1000 },
      element: {
        resourceId: 'com.app:id/submit_btn',
        bounds: { left: 400, top: 900, right: 680, bottom: 1020 },
        clickable: true,
        editable: false,
        enabled: true,
        focused: false,
      },
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({ type: 'tapOn', selector: { kind: 'id', id: 'submit_btn' } });
  });

  it('maps a tap without element to tapOn with point selector', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'tap', x: 540, y: 960, timestampMs: 1000 },
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].type).toBe('tapOn');
    if (cmds[0].type === 'tapOn') {
      expect(cmds[0].selector.kind).toBe('point');
    }
  });

  it('maps a longPress to longPressOn', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'longPress', x: 100, y: 200, durationMs: 800, timestampMs: 1000 },
      element: {
        text: 'Hold me',
        bounds: { left: 50, top: 150, right: 150, bottom: 250 },
        clickable: true,
        editable: false,
        enabled: true,
        focused: false,
      },
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({ type: 'longPressOn', selector: { kind: 'text', text: 'Hold me' } });
  });

  it('maps a swipe to swipe with percent coordinates', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'swipe', startX: 540, startY: 1440, endX: 540, endY: 480, durationMs: 300, timestampMs: 1000 },
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].type).toBe('swipe');
    if (cmds[0].type === 'swipe' && 'start' in cmds[0]) {
      expect(cmds[0].start).toBe('50%, 75%');
      expect(cmds[0].end).toBe('50%, 25%');
    }
  });

  it('maps a scroll to swipe with direction', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'scroll', startX: 540, startY: 1440, endX: 540, endY: 480, direction: 'up', timestampMs: 1000 },
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({ type: 'swipe', direction: 'up' });
  });

  it('extracts text input from accessibility events', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'tap', x: 540, y: 960, timestampMs: 1000 },
      element: {
        resourceId: 'com.app:id/input_field',
        bounds: { left: 50, top: 900, right: 1030, bottom: 1000 },
        clickable: true,
        editable: true,
        enabled: true,
        focused: true,
      },
      accessibilityEvents: [
        { type: 'textChanged', text: 'hello', beforeText: '', timestampMs: 1100 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds.some(c => c.type === 'inputText')).toBe(true);
    const inputCmd = cmds.find(c => c.type === 'inputText');
    if (inputCmd?.type === 'inputText') {
      expect(inputCmd.text).toBe('hello');
    }
  });

  it('detects password input from masked text', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'tap', x: 540, y: 960, timestampMs: 1000 },
      element: {
        resourceId: 'com.app:id/password',
        bounds: { left: 50, top: 900, right: 1030, bottom: 1000 },
        clickable: true,
        editable: true,
        enabled: true,
        focused: true,
      },
      accessibilityEvents: [
        { type: 'textChanged', text: '••••', beforeText: '', timestampMs: 1100 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    const inputCmd = cmds.find(c => c.type === 'inputText');
    if (inputCmd?.type === 'inputText') {
      expect(inputCmd.text).toBe('<PASSWORD>');
    }
  });

  // Accessibility-source interactions
  it('maps accessibility click to tapOn', () => {
    const interaction = makeInteraction({
      source: 'accessibility',
      touchAction: undefined,
      accessibilityEvents: [
        { type: 'click', text: 'OK', timestampMs: 1000 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].type).toBe('tapOn');
  });

  it('maps accessibility windowChanged to assertVisible', () => {
    const interaction = makeInteraction({
      source: 'accessibility',
      touchAction: undefined,
      accessibilityEvents: [
        { type: 'windowChanged', text: 'LoginActivity', packageName: 'com.myapp', timestampMs: 1000 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toEqual({ type: 'assertVisible', selector: { kind: 'text', text: 'LoginActivity' } });
  });

  it('filters noise window names', () => {
    const interaction = makeInteraction({
      source: 'accessibility',
      touchAction: undefined,
      accessibilityEvents: [
        { type: 'windowChanged', text: 'FrameLayout', packageName: 'com.myapp', timestampMs: 1000 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(0);
  });

  it('filters launcher/systemui packages', () => {
    const interaction = makeInteraction({
      source: 'accessibility',
      touchAction: undefined,
      accessibilityEvents: [
        { type: 'windowChanged', text: 'Home', packageName: 'com.android.launcher3', timestampMs: 1000 },
      ],
    });
    const cmds = mapInteractionToCommands(interaction);
    expect(cmds).toHaveLength(0);
  });
});

describe('getMappingAlternatives', () => {
  it('returns alternatives for a tap interaction', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'tap', x: 540, y: 960, timestampMs: 1000 },
      element: {
        text: 'Submit',
        bounds: { left: 400, top: 900, right: 680, bottom: 1020 },
        clickable: true,
        editable: false,
        enabled: true,
        focused: false,
      },
    });
    const alts = getMappingAlternatives(interaction);
    expect(alts.length).toBeGreaterThan(0);
    const labels = alts.map(a => a.label);
    expect(labels).toContain('tapOn');
    expect(labels).toContain('assertVisible');
    expect(labels).toContain('ignore');
  });

  it('returns empty for filtered keyboard taps', () => {
    const interaction = makeInteraction({ filteredAsKeyboardTap: true });
    expect(getMappingAlternatives(interaction)).toEqual([]);
  });

  it('returns scroll alternatives for scroll actions', () => {
    const interaction = makeInteraction({
      touchAction: { type: 'scroll', startX: 540, startY: 1440, endX: 540, endY: 480, direction: 'up', timestampMs: 1000 },
    });
    const alts = getMappingAlternatives(interaction);
    const labels = alts.map(a => a.label);
    expect(labels.some(l => l.includes('scroll'))).toBe(true);
  });
});
