import { describe, it, expect, beforeEach } from 'vitest';
import { InteractionCollector } from './interaction-collector.js';
import type {
  AccessibilityEventData,
  RecordedInteraction,
  TapAction,
  UiElement,
} from '@maestro-recorder/shared';

class StubAgentClient {
  private queued: (UiElement | null)[] = [];
  private deferred: {
    resolve: (v: UiElement | null) => void;
    promise: Promise<UiElement | null>;
  } | null = null;
  enqueue(element: UiElement | null) {
    this.queued.push(element);
  }
  /** Arm a one-shot deferred that the next elementAt call will await on. */
  armDeferred(): (element: UiElement | null) => void {
    let resolve!: (v: UiElement | null) => void;
    const promise = new Promise<UiElement | null>(r => { resolve = r; });
    this.deferred = { resolve, promise };
    return (element: UiElement | null) => resolve(element);
  }
  async elementAt(_x: number, _y: number): Promise<UiElement | null> {
    if (this.deferred) {
      const d = this.deferred;
      this.deferred = null;
      return d.promise;
    }
    return this.queued.shift() ?? null;
  }
}

function tapAt(x: number, y: number, timestampMs: number): TapAction {
  return { type: 'tap', x, y, timestampMs };
}

function clickEvent(
  overrides: Partial<AccessibilityEventData> = {},
): AccessibilityEventData {
  return {
    type: 'click',
    text: '',
    resourceId: '',
    contentDescription: '',
    className: 'android.view.View',
    timestampMs: 1000,
    bounds: { left: 0, top: 0, right: 100, bottom: 50 },
    ...overrides,
  };
}

async function flushMicrotasks() {
  await new Promise(r => setImmediate(r));
}

function makeCollector(agent: StubAgentClient) {
  const collector = new InteractionCollector(agent as any, 1080, 2280);
  const completed: RecordedInteraction[] = [];
  const updates: RecordedInteraction[] = [];
  collector.on('interaction:complete', i => completed.push(i));
  collector.on('interaction:updated', i => updates.push(i));
  return { collector, completed, updates };
}

describe('InteractionCollector a11y click element upgrade', () => {
  let agent: StubAgentClient;

  beforeEach(() => {
    agent = new StubAgentClient();
  });

  it('upgrades element.resourceId from a11y click when coord lookup returned only nearestLabel (the switch bug)', async () => {
    const coordElement: UiElement = {
      className: 'androidx.compose.material3.Switch',
      text: '',
      resourceId: undefined,
      contentDescription: undefined,
      bounds: { left: 800, top: 200, right: 960, bottom: 280 },
      clickable: true,
      editable: false,
      enabled: true,
      focused: false,
      nearestLabel: 'Enable notifications',
      labelRelation: 'below',
    };
    agent.enqueue(coordElement);

    const { collector } = makeCollector(agent);
    await collector.onUserAction(tapAt(880, 240, 1000));
    await flushMicrotasks();

    collector.onAccessibilityEvent(
      clickEvent({
        resourceId: 'my_switch_tag',
        className: 'androidx.compose.material3.Switch',
        timestampMs: 1050,
        bounds: { left: 800, top: 200, right: 960, bottom: 280 },
      }),
    );

    collector.flush();
    expect(coordElement.resourceId).toBe('my_switch_tag');
  });

  it('initializes element from a11y click when coord lookup returned nothing', async () => {
    agent.enqueue(null);

    const { collector, completed } = makeCollector(agent);
    await collector.onUserAction(tapAt(100, 200, 2000));
    await flushMicrotasks();

    collector.onAccessibilityEvent(
      clickEvent({
        resourceId: 'login_btn',
        contentDescription: 'Login',
        className: 'android.widget.Button',
        timestampMs: 2050,
      }),
    );

    collector.flush();
    const interaction = completed.at(-1)!;
    expect(interaction.element).toBeDefined();
    expect(interaction.element!.resourceId).toBe('login_btn');
    expect(interaction.element!.contentDescription).toBe('Login');
  });

  it('does not downgrade an existing strong resourceId', async () => {
    const coordElement: UiElement = {
      className: 'android.widget.Button',
      resourceId: 'strong_id',
      bounds: { left: 0, top: 0, right: 100, bottom: 50 },
      clickable: true,
      editable: false,
      enabled: true,
      focused: false,
    };
    agent.enqueue(coordElement);

    const { collector } = makeCollector(agent);
    await collector.onUserAction(tapAt(50, 25, 3000));
    await flushMicrotasks();

    collector.onAccessibilityEvent(
      clickEvent({
        resourceId: 'some_other_id',
        timestampMs: 3050,
      }),
    );

    collector.flush();
    expect(coordElement.resourceId).toBe('strong_id');
  });

  it('preserves editable=true from coord lookup (click event does not flip it off)', async () => {
    const coordElement: UiElement = {
      className: 'androidx.compose.foundation.text.TextField',
      resourceId: 'email_field',
      bounds: { left: 0, top: 0, right: 500, bottom: 80 },
      clickable: true,
      editable: true,
      enabled: true,
      focused: false,
    };
    agent.enqueue(coordElement);

    const { collector } = makeCollector(agent);
    await collector.onUserAction(tapAt(100, 40, 4000));
    await flushMicrotasks();

    collector.onAccessibilityEvent(
      clickEvent({
        resourceId: 'email_field',
        timestampMs: 4050,
      }),
    );

    collector.flush();
    expect(coordElement.editable).toBe(true);
  });

  it('preserves a11y-upgraded resourceId even when coord lookup resolves later (race)', async () => {
    const resolveCoord = agent.armDeferred();

    const { collector, completed } = makeCollector(agent);
    // onUserAction awaits prefetch branch only; lookupElement is fire-and-forget.
    await collector.onUserAction(tapAt(880, 240, 6000));

    // A11y click arrives before coord lookup resolves — upgrade path initializes element.
    collector.onAccessibilityEvent(
      clickEvent({
        resourceId: 'my_switch_tag',
        className: 'androidx.compose.material3.Switch',
        timestampMs: 6050,
      }),
    );

    // Now coord lookup finally resolves with a labeled-neighbor element (no id).
    resolveCoord({
      className: 'androidx.compose.material3.Switch',
      text: '',
      resourceId: undefined,
      contentDescription: undefined,
      bounds: { left: 800, top: 200, right: 960, bottom: 280 },
      clickable: true,
      editable: false,
      enabled: true,
      focused: false,
      nearestLabel: 'Enable notifications',
      labelRelation: 'below',
    });
    await flushMicrotasks();

    collector.flush();
    const interaction = completed.at(-1)!;
    expect(interaction.element?.resourceId).toBe('my_switch_tag');
    // Coord-lookup fields (bounds, nearestLabel) should still be merged in.
    expect(interaction.element?.bounds).toEqual({ left: 800, top: 200, right: 960, bottom: 280 });
  });

  it('emits interaction:updated exactly once for the correlated a11y click', async () => {
    const coordElement: UiElement = {
      className: 'android.view.View',
      bounds: { left: 0, top: 0, right: 100, bottom: 50 },
      clickable: true,
      editable: false,
      enabled: true,
      focused: false,
    };
    agent.enqueue(coordElement);

    const { collector, updates } = makeCollector(agent);
    await collector.onUserAction(tapAt(50, 25, 7000));
    await flushMicrotasks();
    const updatesBeforeA11y = updates.length;

    collector.onAccessibilityEvent(
      clickEvent({ resourceId: 'some_id', timestampMs: 7050 }),
    );

    expect(updates.length - updatesBeforeA11y).toBe(1);
  });

  it('non-duplicate a11y click (no recent touch) creates a standalone interaction', () => {
    const { collector, completed, updates } = makeCollector(agent);
    collector.onAccessibilityEvent(
      clickEvent({ resourceId: 'orphan_btn', timestampMs: 5000 }),
    );

    expect(completed).toHaveLength(1);
    expect(completed[0].source).toBe('accessibility');
    expect(completed[0].element?.resourceId).toBe('orphan_btn');
    expect(updates).toHaveLength(0);
  });
});
