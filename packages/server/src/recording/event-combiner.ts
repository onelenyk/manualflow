import { EventEmitter } from 'events';
import type { UserAction, MaestroCommand, UiElement } from '@maestro-recorder/shared';
import { AgentClient } from './agent-client.js';
import { selectBestSelector } from './element-selector.js';

interface AccessibilityEvent {
  type: string;
  text?: string;
  beforeText?: string;
  resourceId?: string;
  contentDescription?: string;
  className?: string;
  packageName?: string;
  bounds?: { left: number; top: number; right: number; bottom: number };
  timestamp?: number;
  [key: string]: any;
}

/**
 * Combines 4 data sources into MaestroCommands:
 * 1. getevent (UserAction) — tap coordinates, swipe, scroll
 * 2. accessibility events — text input, screen changes
 * 3. /element-at — element at tap coordinates
 * 4. /tree — full screen tree (for screen change assertions)
 *
 * Emits: 'command', 'element', 'action', 'raw'
 */
export class EventCombiner extends EventEmitter {
  private agent: AgentClient;
  private screenWidth: number;
  private screenHeight: number;

  // Dedup: track recent getevent taps to avoid duplicate accessibility clicks
  private recentTaps: { timestamp: number; x: number; y: number }[] = [];

  // Text input accumulation
  private pendingText: { resourceId: string; text: string; timer: NodeJS.Timeout } | null = null;

  // Track last window for assertVisible
  private lastWindowPackage: string = '';

  constructor(agent: AgentClient, screenWidth: number, screenHeight: number) {
    super();
    this.agent = agent;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  /** Handle a gesture from getevent + TouchStateMachine */
  async onUserAction(action: UserAction): Promise<void> {
    this.emit('action', action);

    switch (action.type) {
      case 'tap':
        await this.handleTap(action);
        break;
      case 'longPress':
        await this.handleLongPress(action);
        break;
      case 'swipe':
        this.handleSwipe(action);
        break;
      case 'scroll':
        this.emitCommand({ type: 'scroll' });
        break;
    }
  }

  /** Handle an accessibility event from agent stream */
  onAccessibilityEvent(event: AccessibilityEvent): void {
    switch (event.type) {
      case 'textChanged':
        this.handleTextChanged(event);
        break;
      case 'windowChanged':
        this.handleWindowChanged(event);
        break;
      case 'click':
        this.handleAccessibilityClick(event);
        break;
      // scroll, focused, selected — ignored (getevent handles gestures)
    }
  }

  // --- Handlers ---

  private async handleTap(action: { x: number; y: number; timestampMs: number }) {
    this.recentTaps.push({ timestamp: action.timestampMs, x: action.x, y: action.y });
    if (this.recentTaps.length > 10) this.recentTaps.shift();

    const element = await this.agent.elementAt(action.x, action.y);
    if (element) {
      this.emit('element', { action, element });
    }

    const selector = selectBestSelector(element, action.x, action.y);
    this.emitCommand({ type: 'tapOn', selector });

    // Text input detection: if tapped on editable field, poll for text changes
    if (element && (element.editable || element.className?.includes('EditText') || element.className?.includes('TextField'))) {
      this.pollForTextInput(action.x, action.y, element.text || '');
    }
  }

  /** Poll element text after tapping a text field — works for Compose and Views */
  private async pollForTextInput(x: number, y: number, originalText: string) {
    // Poll every 500ms for 5 seconds
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const updated = await this.agent.elementAt(x, y);
      if (updated?.text && updated.text !== originalText && updated.text.length > 0) {
        // Text changed — wait a bit more for user to finish typing
        await new Promise(r => setTimeout(r, 1000));
        const final = await this.agent.elementAt(x, y);
        const finalText = final?.text || updated.text;
        if (finalText !== originalText) {
          this.emitCommand({ type: 'inputText', text: finalText });
        }
        return;
      }
    }
  }

  private async handleLongPress(action: { x: number; y: number; durationMs: number; timestampMs: number }) {
    const element = await this.agent.elementAt(action.x, action.y);
    if (element) {
      this.emit('element', { action, element });
    }

    const selector = selectBestSelector(element, action.x, action.y);
    this.emitCommand({ type: 'longPressOn', selector });
  }

  private handleSwipe(action: { startX: number; startY: number; endX: number; endY: number }) {
    const start = this.toPercent(action.startX, action.startY);
    const end = this.toPercent(action.endX, action.endY);
    this.emitCommand({ type: 'swipe', start, end } as MaestroCommand);
  }

  private handleTextChanged(event: AccessibilityEvent) {
    const text = event.text || '';
    const resourceId = event.resourceId || '';

    if (!text) return;

    // Debounce: accumulate text changes, emit after 1s of no changes
    if (this.pendingText) {
      clearTimeout(this.pendingText.timer);
    }

    this.pendingText = {
      resourceId,
      text,
      timer: setTimeout(() => {
        this.emitCommand({ type: 'inputText', text: this.pendingText!.text });
        this.pendingText = null;
      }, 1000),
    };
  }

  private handleWindowChanged(event: AccessibilityEvent) {
    const pkg = event.packageName || '';

    // Skip duplicate window events for same package
    if (pkg === this.lastWindowPackage) return;
    if (!pkg || pkg === 'com.google.android.apps.nexuslauncher') return;

    this.lastWindowPackage = pkg;

    // Extract screen name from className or text
    const screenName = event.text ||
      event.className?.split('.')?.pop() ||
      pkg.split('.').pop() || '';

    if (screenName) {
      this.emitCommand({
        type: 'assertVisible',
        selector: { kind: 'text', text: screenName },
      });
    }
  }

  private handleAccessibilityClick(event: AccessibilityEvent) {
    // Check if getevent already captured this tap (dedup)
    const now = event.timestamp || Date.now();
    const isDuplicate = this.recentTaps.some(
      tap => Math.abs(tap.timestamp - now) < 500
    );

    if (isDuplicate) return; // getevent already handled this

    // Accessibility-only click (Compose apps, or getevent missed it)
    const element: UiElement = {
      text: event.text,
      resourceId: event.resourceId,
      contentDescription: event.contentDescription,
      className: event.className,
      bounds: event.bounds || { left: 0, top: 0, right: 0, bottom: 0 },
      clickable: true,
      enabled: true,
      focused: false,
    };

    this.emit('element', { action: { type: 'tap', x: 0, y: 0 }, element });
    const selector = selectBestSelector(element, 0, 0);
    this.emitCommand({ type: 'tapOn', selector });
  }

  // --- Helpers ---

  private emitCommand(command: MaestroCommand): void {
    this.emit('command', command);
  }

  private toPercent(x: number, y: number): string {
    const px = Math.round((x / this.screenWidth) * 100);
    const py = Math.round((y / this.screenHeight) * 100);
    return `${px}%, ${py}%`;
  }

  /** Flush any pending text input */
  flush(): void {
    if (this.pendingText) {
      clearTimeout(this.pendingText.timer);
      this.emitCommand({ type: 'inputText', text: this.pendingText.text });
      this.pendingText = null;
    }
  }
}
