import { EventEmitter } from 'events';
import type {
  UserAction,
  UiElement,
  RecordedInteraction,
  AccessibilityEventData,
  KeyboardState,
  InteractionSource,
} from '@maestro-recorder/shared';
import { AgentClient } from './agent-client.js';

const CORRELATION_WINDOW_MS = 2000;
const MAX_TEXT_EXTENSION_MS = 10_000;

/**
 * Assembles RecordedInteraction objects from all data sources.
 *
 * Data sources:
 * 1. getevent → UserAction (touch gestures)
 * 2. agent /element-at → UiElement (semantic element at coordinates)
 * 3. accessibility events → text changes, window transitions, clicks
 * 4. dumpsys input_method → keyboard state
 *
 * Emits:
 *  - 'interaction:created'  (RecordedInteraction) — immediately on creation
 *  - 'interaction:updated'  (RecordedInteraction) — when enriched with element or a11y data
 *  - 'interaction:complete' (RecordedInteraction) — when finalized
 */
export class InteractionCollector extends EventEmitter {
  private agent: AgentClient;
  private screenWidth: number;
  private screenHeight: number;

  private nextId = 1;
  private pending: RecordedInteraction | null = null;
  private correlationTimer: NodeJS.Timeout | null = null;
  private correlationStart = 0; // timestamp when correlation window opened
  private keyboardState: KeyboardState = { open: false, top: 0 };

  // Dedup: track recent getevent-initiated interactions for accessibility click dedup
  private recentTouchTimestamps: number[] = [];

  constructor(agent: AgentClient, screenWidth: number, screenHeight: number) {
    super();
    this.agent = agent;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  /** Update keyboard state from dumpsys polling */
  setKeyboardState(open: boolean, keyboardTop?: number): void {
    this.keyboardState = {
      open,
      top: keyboardTop ?? this.keyboardState.top,
    };
  }

  /** Handle a gesture from getevent + TouchStateMachine.
   *  prefetchedElement: element looked up on touch-down (before navigation) */
  async onUserAction(action: UserAction, prefetchedElement?: UiElement | null): Promise<void> {
    // Check if this is a keyboard tap while we have a pending editable interaction
    const isKbdTap = this.isKeyboardTap(action);
    if (isKbdTap && this.pending && this.pending.status === 'pending' && this.isEditablePending()) {
      // Don't finalize — keyboard taps are part of typing on the pending editable field
      // Just extend the correlation timer so textChanged events keep attaching
      this.extendCorrelationTimer();
      // Still emit the keyboard tap as its own interaction for visibility
      const kbdInteraction: RecordedInteraction = {
        id: this.nextId++,
        source: 'getevent',
        status: 'complete',
        timestampMs: action.timestampMs,
        touchAction: action,
        accessibilityEvents: [],
        keyboardState: { ...this.keyboardState },
        filteredAsKeyboardTap: true,
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
      };
      this.emit('interaction:created', kbdInteraction);
      this.emit('interaction:complete', kbdInteraction);
      return;
    }

    // Finalize any existing pending interaction first
    this.finalizePending();

    // Create new interaction
    const interaction: RecordedInteraction = {
      id: this.nextId++,
      source: 'getevent',
      status: 'pending',
      timestampMs: action.timestampMs,
      touchAction: action,
      accessibilityEvents: [],
      keyboardState: { ...this.keyboardState },
      filteredAsKeyboardTap: false,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
    };

    // Tag keyboard taps but don't filter — let the user decide
    if (this.isKeyboardTap(action)) {
      interaction.filteredAsKeyboardTap = true;
    }

    // Track for accessibility click dedup
    this.recentTouchTimestamps.push(action.timestampMs);
    if (this.recentTouchTimestamps.length > 10) this.recentTouchTimestamps.shift();

    this.pending = interaction;
    this.emit('interaction:created', interaction);

    // Use pre-fetched element (from touch-down) or start async lookup
    if (prefetchedElement) {
      interaction.element = prefetchedElement;
      this.emit('interaction:updated', interaction);
    } else if (action.type === 'tap' || action.type === 'longPress') {
      this.lookupElement(interaction, action.x, action.y);
    }

    // Start correlation timer
    this.startCorrelationTimer();
  }

  /** Handle an accessibility event from agent stream */
  onAccessibilityEvent(event: AccessibilityEventData): void {
    if (this.pending && this.pending.status === 'pending') {
      // Attach to pending interaction based on event type
      switch (event.type) {
        case 'textChanged':
          this.handleTextChangedCorrelation(event);
          return;
        case 'windowChanged':
          this.handleWindowChangedCorrelation(event);
          return;
        case 'click':
          this.handleAccessibilityClickCorrelation(event);
          return;
        default:
          // focused, selected, scroll — attach silently
          this.pending.accessibilityEvents.push(event);
          this.emit('interaction:updated', this.pending);
          return;
      }
    }

    // No pending interaction — create standalone
    this.createStandaloneInteraction(event);
  }

  /** Finalize any pending interaction (call on recording stop) */
  flush(): void {
    this.finalizePending();
  }

  // --- Private: Correlation handlers ---

  private handleTextChangedCorrelation(event: AccessibilityEventData): void {
    const pending = this.pending!;
    const element = pending.element;
    const isEditable = element?.editable ||
      element?.className?.includes('EditText') ||
      element?.className?.includes('TextField');

    if (isEditable) {
      // Strongly correlated: text input after tapping editable field
      pending.accessibilityEvents.push(event);
      this.emit('interaction:updated', pending);
      // Extend correlation window for continued typing (up to max)
      this.extendCorrelationTimer();
    } else {
      // Not related to the pending tap — standalone
      this.createStandaloneInteraction(event);
    }
  }

  private handleWindowChangedCorrelation(event: AccessibilityEventData): void {
    const pending = this.pending!;
    const elapsed = event.timestampMs - pending.timestampMs;

    if (elapsed < 500 && pending.touchAction) {
      // Window changed shortly after a tap — likely caused by it
      pending.accessibilityEvents.push(event);
      this.emit('interaction:updated', pending);
    } else {
      // Too late or no touch — standalone
      this.createStandaloneInteraction(event);
    }
  }

  private handleAccessibilityClickCorrelation(event: AccessibilityEventData): void {
    // Check if getevent already captured this tap (dedup)
    const isDuplicate = this.recentTouchTimestamps.some(
      ts => Math.abs(ts - event.timestampMs) < 500
    );

    if (isDuplicate) {
      // Already have a touch interaction for this — attach as extra data
      this.pending!.accessibilityEvents.push(event);
      this.emit('interaction:updated', this.pending!);
    } else {
      // Accessibility-only click (getevent missed it)
      this.createStandaloneInteraction(event);
    }
  }

  // --- Private: Interaction lifecycle ---

  private createStandaloneInteraction(event: AccessibilityEventData): void {
    const interaction: RecordedInteraction = {
      id: this.nextId++,
      source: 'accessibility',
      status: 'complete',
      timestampMs: event.timestampMs,
      accessibilityEvents: [event],
      keyboardState: { ...this.keyboardState },
      filteredAsKeyboardTap: false,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
    };

    // For accessibility clicks, build a UiElement from the event data
    if (event.type === 'click' || event.type === 'longClick') {
      interaction.element = {
        text: event.text,
        resourceId: event.resourceId,
        contentDescription: event.contentDescription,
        className: event.className,
        bounds: event.bounds || { left: 0, top: 0, right: 0, bottom: 0 },
        clickable: true,
        editable: false,
        enabled: true,
        focused: false,
      };
    }

    this.emit('interaction:created', interaction);
    this.emit('interaction:complete', interaction);
  }

  private async lookupElement(interaction: RecordedInteraction, x: number, y: number): Promise<void> {
    const element = await this.agent.elementAt(x, y);
    if (element && interaction.status === 'pending') {
      interaction.element = element;
      this.emit('interaction:updated', interaction);
    }
  }

  private finalizePending(): void {
    if (!this.pending) return;
    this.clearCorrelationTimer();
    this.pending.status = 'complete';
    this.emit('interaction:complete', this.pending);
    this.pending = null;
  }

  // --- Private: Timers ---

  private startCorrelationTimer(): void {
    this.clearCorrelationTimer();
    this.correlationStart = Date.now();
    this.correlationTimer = setTimeout(() => this.finalizePending(), CORRELATION_WINDOW_MS);
  }

  private extendCorrelationTimer(): void {
    const elapsed = Date.now() - this.correlationStart;
    if (elapsed >= MAX_TEXT_EXTENSION_MS) {
      // Max extension reached — finalize now
      this.finalizePending();
      return;
    }
    // Reset the timer for another window
    this.clearCorrelationTimer();
    this.correlationTimer = setTimeout(() => this.finalizePending(), CORRELATION_WINDOW_MS);
  }

  private clearCorrelationTimer(): void {
    if (this.correlationTimer) {
      clearTimeout(this.correlationTimer);
      this.correlationTimer = null;
    }
  }

  // --- Private: Filters ---

  private isEditablePending(): boolean {
    if (!this.pending) return false;
    // Element lookup may not have resolved yet, so also check if keyboard
    // opened after the pending tap (strong signal it was an editable field)
    const el = this.pending.element;
    const elementIsEditable = !!(el?.editable ||
      el?.className?.includes('EditText') ||
      el?.className?.includes('TextField'));
    const keyboardJustOpened = this.keyboardState.open;
    return elementIsEditable || keyboardJustOpened;
  }

  private isKeyboardTap(action: UserAction): boolean {
    if (!this.keyboardState.open) return false;
    if (action.type !== 'tap' && action.type !== 'longPress') return false;

    const y = action.y;
    const threshold = this.keyboardState.top > 0
      ? this.keyboardState.top
      : this.screenHeight * 0.55;

    return y > threshold;
  }
}
