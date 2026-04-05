import type {
  RecordedInteraction,
  MaestroCommand,
  TapOnSelector,
  UiElement,
  AccessibilityEventData,
  ScrollAction,
} from '@maestro-recorder/shared';
import { selectBestSelector } from './element-selector.js';

// Generic window names to filter from assertVisible
const NOISE_NAMES = new Set([
  'FrameLayout', 'LinearLayout', 'View', 'ViewGroup', 'ComposeView',
  'normal keyboard', 'Application icon', 'Keyboard', 'DecorView',
  'RelativeLayout', 'ConstraintLayout',
]);

// Timing thresholds
const DOUBLE_TAP_MS = 400;
const ANIMATION_GAP_MS = 3000;

/**
 * Single interaction → commands (no sequence context).
 * Used for real-time preview in the frontend.
 */
export function mapInteractionToCommands(interaction: RecordedInteraction): MaestroCommand[] {
  if (interaction.filteredAsKeyboardTap) return [];

  if (interaction.source === 'getevent' && interaction.touchAction) {
    return mapTouchInteraction(interaction);
  }

  if (interaction.source === 'accessibility') {
    return mapAccessibilityInteraction(interaction);
  }

  return [];
}

/**
 * Sequence-aware batch mapping. Looks at adjacent interactions to produce
 * smarter commands: scrollUntilVisible, hideKeyboard, doubleTap, waitForAnimation.
 */
export function mapInteractionsToCommands(interactions: RecordedInteraction[]): MaestroCommand[] {
  const commands: MaestroCommand[] = [];
  let i = 0;

  while (i < interactions.length) {
    const curr = interactions[i];
    const next = i + 1 < interactions.length ? interactions[i + 1] : null;
    const prev = i > 0 ? interactions[i - 1] : null;

    if (curr.filteredAsKeyboardTap) { i++; continue; }

    // --- Pattern: long gap → waitForAnimationToEnd ---
    if (prev && !prev.filteredAsKeyboardTap) {
      const gap = curr.timestampMs - prev.timestampMs;
      if (gap > ANIMATION_GAP_MS) {
        commands.push({ type: 'waitForAnimationToEnd' });
      }
    }

    // --- Pattern: keyboard was open, now closed, non-editable tap → hideKeyboard ---
    if (prev?.keyboardState?.open && !curr.keyboardState?.open && curr.touchAction) {
      const isEditableTap = curr.element?.editable ||
        curr.element?.className?.includes('EditText') ||
        curr.element?.className?.includes('TextField');
      if (!isEditableTap) {
        commands.push({ type: 'hideKeyboard' });
      }
    }

    // --- Pattern: double tap (two taps on same element within threshold) ---
    if (curr.touchAction?.type === 'tap' && next?.touchAction?.type === 'tap') {
      const gap = next.timestampMs - curr.timestampMs;
      if (gap < DOUBLE_TAP_MS && sameElement(curr.element, next.element)) {
        const selector = selectBestSelector(curr.element ?? null, curr.touchAction.x, curr.touchAction.y);
        commands.push({ type: 'doubleTapOn', selector });
        i += 2; // skip both
        continue;
      }
    }

    // --- Pattern: scroll(s) → tap → scrollUntilVisible ---
    if (curr.touchAction?.type === 'scroll' && next?.touchAction?.type === 'tap' && next.element) {
      // Consume all consecutive scrolls in the same direction
      const scrollDir = (curr.touchAction as ScrollAction).direction;
      let j = i + 1;
      while (j < interactions.length && interactions[j].touchAction?.type === 'scroll') {
        j++;
      }
      // Check if the next non-scroll interaction is a tap with an element
      const tapAfterScroll = j < interactions.length ? interactions[j] : null;
      if (tapAfterScroll?.touchAction?.type === 'tap' && tapAfterScroll.element) {
        const selector = selectBestSelector(tapAfterScroll.element, tapAfterScroll.touchAction.x, tapAfterScroll.touchAction.y);
        // Only use scrollUntilVisible if we have a meaningful selector (not point)
        if (selector.kind !== 'point') {
          commands.push({ type: 'scrollUntilVisible', selector, direction: scrollDir });
          commands.push({ type: 'tapOn', selector });
          // Also append text input / window assert from the tap interaction
          appendCorrelatedCommands(tapAfterScroll, commands);
          i = j + 1; // skip all scrolls + the tap
          continue;
        }
      }
    }

    // --- Default: map single interaction ---
    if (curr.source === 'getevent' && curr.touchAction) {
      commands.push(...mapTouchInteraction(curr));
    } else if (curr.source === 'accessibility') {
      commands.push(...mapAccessibilityInteraction(curr));
    }

    i++;
  }

  return commands;
}

// --- Touch-initiated interactions ---

function mapTouchInteraction(interaction: RecordedInteraction): MaestroCommand[] {
  const action = interaction.touchAction!;
  const commands: MaestroCommand[] = [];

  switch (action.type) {
    case 'tap':
      commands.push(...mapTap(interaction));
      break;
    case 'longPress':
      commands.push(...mapLongPress(interaction));
      break;
    case 'swipe':
      commands.push(mapSwipe(interaction));
      break;
    case 'scroll':
      commands.push(mapScroll(interaction));
      break;
  }

  appendCorrelatedCommands(interaction, commands);
  return commands;
}

/** Append text input + window assert from correlated a11y events */
function appendCorrelatedCommands(interaction: RecordedInteraction, commands: MaestroCommand[]): void {
  const textCommands = extractTextInput(interaction);
  commands.push(...textCommands);

  const assertCommand = extractWindowAssert(interaction);
  if (assertCommand) commands.push(assertCommand);
}

function mapTap(interaction: RecordedInteraction): MaestroCommand[] {
  const action = interaction.touchAction!;
  if (action.type !== 'tap') return [];

  const selector = selectBestSelector(interaction.element ?? null, action.x, action.y);
  return [{ type: 'tapOn', selector }];
}

function mapLongPress(interaction: RecordedInteraction): MaestroCommand[] {
  const action = interaction.touchAction!;
  if (action.type !== 'longPress') return [];

  const selector = selectBestSelector(interaction.element ?? null, action.x, action.y);
  return [{ type: 'longPressOn', selector }];
}

function mapSwipe(interaction: RecordedInteraction): MaestroCommand {
  const action = interaction.touchAction!;
  if (action.type !== 'swipe') return { type: 'scroll' };

  const start = toPercent(action.startX, action.startY, interaction.screenWidth, interaction.screenHeight);
  const end = toPercent(action.endX, action.endY, interaction.screenWidth, interaction.screenHeight);
  return { type: 'swipe', start, end };
}

function mapScroll(interaction: RecordedInteraction): MaestroCommand {
  const action = interaction.touchAction as ScrollAction;
  // Use Maestro's scroll (not swipe) — scroll operates on the scrollable container
  // Maestro scroll direction = direction content moves, which matches our detection
  return { type: 'swipe', direction: action.direction };
}

// --- Accessibility-only interactions ---

function mapAccessibilityInteraction(interaction: RecordedInteraction): MaestroCommand[] {
  const commands: MaestroCommand[] = [];

  for (const event of interaction.accessibilityEvents) {
    switch (event.type) {
      case 'click':
      case 'longClick': {
        const selector = buildAccessibilitySelector(event, interaction.element);
        if (event.type === 'longClick') {
          commands.push({ type: 'longPressOn', selector });
        } else {
          commands.push({ type: 'tapOn', selector });
        }
        break;
      }
      case 'textChanged': {
        const textCmds = extractTextInputFromEvents(interaction.accessibilityEvents);
        commands.push(...textCmds);
        return commands; // all textChanged events handled at once
      }
      case 'windowChanged': {
        const cmd = buildWindowAssert(event);
        if (cmd) commands.push(cmd);
        break;
      }
    }
  }

  return commands;
}

// --- Text input extraction ---

function extractTextInput(interaction: RecordedInteraction): MaestroCommand[] {
  const textEvents = interaction.accessibilityEvents.filter(e => e.type === 'textChanged');
  if (textEvents.length === 0) return [];
  return extractTextInputFromEvents(textEvents);
}

/**
 * Analyze textChanged events to produce eraseText + inputText as needed.
 * Handles: fresh input, replacement, deletion, masked passwords.
 */
function extractTextInputFromEvents(events: AccessibilityEventData[]): MaestroCommand[] {
  const textEvents = events.filter(e => e.type === 'textChanged');
  if (textEvents.length === 0) return [];

  const commands: MaestroCommand[] = [];

  // Get the initial state (what was in the field before any changes)
  const firstEvent = textEvents[0];
  const initialText = firstEvent.beforeText || '';

  // Get the final state
  const finalText = extractFinalText(textEvents);
  if (!finalText && !initialText) return [];

  // Detect masked/password fields: all bullets or dots
  if (finalText && /^[•·*●\u2022\u25CF\u2027]+$/.test(finalText)) {
    // Password field — we can't know the actual text, emit a placeholder
    if (initialText) {
      commands.push({ type: 'eraseText', chars: initialText.length });
    }
    commands.push({ type: 'inputText', text: '<PASSWORD>' });
    return commands;
  }

  // If field had existing text that's different from what we're typing
  if (initialText && finalText && initialText !== finalText) {
    // Check if user cleared and retyped, or appended
    if (!finalText.startsWith(initialText)) {
      // Text was replaced — need to clear first
      commands.push({ type: 'eraseText', chars: initialText.length });
    }
  }

  if (finalText) {
    // If we erased first, emit the full new text
    // If we didn't erase, emit only what was added (if it was an append)
    const erasedFirst = commands.some(c => c.type === 'eraseText');
    if (erasedFirst || !initialText) {
      commands.push({ type: 'inputText', text: finalText });
    } else if (finalText.startsWith(initialText)) {
      // Append — only emit the new part
      const added = finalText.slice(initialText.length);
      if (added) commands.push({ type: 'inputText', text: added });
    } else {
      commands.push({ type: 'inputText', text: finalText });
    }
  } else if (initialText) {
    // Text was deleted entirely
    commands.push({ type: 'eraseText', chars: initialText.length });
  }

  return commands;
}

/** Get the last non-empty text value from a sequence of textChanged events */
function extractFinalText(events: AccessibilityEventData[]): string | null {
  const textEvents = events.filter(e => e.type === 'textChanged');
  for (let i = textEvents.length - 1; i >= 0; i--) {
    const text = textEvents[i].text;
    if (text && text.trim().length > 0) return text;
  }
  return null;
}

// --- Window assertion ---

function extractWindowAssert(interaction: RecordedInteraction): MaestroCommand | null {
  const windowEvents = interaction.accessibilityEvents.filter(e => e.type === 'windowChanged');
  if (windowEvents.length === 0) return null;

  const last = windowEvents[windowEvents.length - 1];
  return buildWindowAssert(last);
}

function buildWindowAssert(event: AccessibilityEventData): MaestroCommand | null {
  const pkg = event.packageName || '';
  if (!pkg || pkg.includes('launcher') || pkg.includes('systemui') || pkg.includes('inputmethod')) {
    return null;
  }

  const screenName = event.text ||
    event.className?.split('.')?.pop() ||
    '';

  if (!screenName || NOISE_NAMES.has(screenName)) return null;

  return {
    type: 'assertVisible',
    selector: { kind: 'text', text: screenName },
  };
}

// --- Helpers ---

function buildAccessibilitySelector(event: AccessibilityEventData, element?: UiElement): TapOnSelector {
  if (element) {
    return selectBestSelector(element, 0, 0);
  }
  if (event.resourceId) {
    const id = event.resourceId.includes(':id/')
      ? event.resourceId.split(':id/')[1]
      : event.resourceId;
    return { kind: 'id', id };
  }
  if (event.text && event.text.trim().length > 0 && event.text.length < 50) {
    return { kind: 'text', text: event.text };
  }
  if (event.contentDescription) {
    return { kind: 'contentDescription', description: event.contentDescription };
  }
  return { kind: 'point', x: 0, y: 0 };
}

function sameElement(a?: UiElement | null, b?: UiElement | null): boolean {
  if (!a || !b) return false;
  // Match by ID first
  if (a.resourceId && a.resourceId === b.resourceId) return true;
  // Match by text
  if (a.text && a.text === b.text) return true;
  // Match by bounds (same exact position)
  if (a.bounds && b.bounds &&
    a.bounds.left === b.bounds.left && a.bounds.top === b.bounds.top &&
    a.bounds.right === b.bounds.right && a.bounds.bottom === b.bounds.bottom) return true;
  return false;
}

function toPercent(x: number, y: number, screenWidth: number, screenHeight: number): string {
  const px = Math.round((x / screenWidth) * 100);
  const py = Math.round((y / screenHeight) * 100);
  return `${px}%, ${py}%`;
}
