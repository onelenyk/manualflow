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

/**
 * Pure function: converts a single RecordedInteraction into MaestroCommand(s).
 * No side effects, no state — all data comes from the interaction object.
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

/** Batch version: map all interactions and flatten */
export function mapInteractionsToCommands(interactions: RecordedInteraction[]): MaestroCommand[] {
  return interactions.flatMap(mapInteractionToCommands);
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

  // Check for text input from correlated accessibility events
  const textCommand = extractTextInput(interaction);
  if (textCommand) commands.push(textCommand);

  // Check for window change from correlated accessibility events
  const assertCommand = extractWindowAssert(interaction);
  if (assertCommand) commands.push(assertCommand);

  return commands;
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
  // FIX: pass through the direction instead of emitting bare { type: 'scroll' }
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
        const text = extractFinalText(interaction.accessibilityEvents);
        if (text) commands.push({ type: 'inputText', text });
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

// --- Helpers: text input extraction ---

function extractTextInput(interaction: RecordedInteraction): MaestroCommand | null {
  const textEvents = interaction.accessibilityEvents.filter(e => e.type === 'textChanged');
  if (textEvents.length === 0) return null;

  const finalText = extractFinalText(textEvents);
  if (!finalText) return null;

  return { type: 'inputText', text: finalText };
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

// --- Helpers: window assertion ---

function extractWindowAssert(interaction: RecordedInteraction): MaestroCommand | null {
  const windowEvents = interaction.accessibilityEvents.filter(e => e.type === 'windowChanged');
  if (windowEvents.length === 0) return null;

  // Use the last window change event
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

// --- Helpers: selectors ---

function buildAccessibilitySelector(event: AccessibilityEventData, element?: UiElement): TapOnSelector {
  if (element) {
    return selectBestSelector(element, 0, 0);
  }
  // Build from event data directly
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

function toPercent(x: number, y: number, screenWidth: number, screenHeight: number): string {
  const px = Math.round((x / screenWidth) * 100);
  const py = Math.round((y / screenHeight) * 100);
  return `${px}%, ${py}%`;
}

