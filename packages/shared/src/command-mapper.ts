import type {
  RecordedInteraction,
  MaestroCommand,
  TapOnSelector,
  UiElement,
  AccessibilityEventData,
  ScrollAction,
} from './types.js';
import { selectBestSelector } from './element-selector.js';

const NOISE_NAMES = new Set([
  'FrameLayout', 'LinearLayout', 'View', 'ViewGroup', 'ComposeView',
  'normal keyboard', 'Application icon', 'Keyboard', 'DecorView',
  'RelativeLayout', 'ConstraintLayout',
]);

/**
 * Single interaction → commands. Used client-side for real-time flow building.
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
 * Returns alternative mapping options for a given interaction.
 * Used for the mapping chooser dropdown.
 */
export function getMappingAlternatives(interaction: RecordedInteraction): { label: string; commands: MaestroCommand[] }[] {
  if (interaction.filteredAsKeyboardTap) return [];

  const action = interaction.touchAction;
  const el = interaction.element;
  const isEditable = el?.editable || el?.className?.includes('EditText') || el?.className?.includes('TextField');
  const actionX = action ? ('x' in action ? action.x : action.startX) : 0;
  const actionY = action ? ('y' in action ? action.y : action.startY) : 0;
  const selector = selectBestSelector(el ?? null, actionX, actionY, interaction.screenWidth, interaction.screenHeight);

  const alternatives: { label: string; commands: MaestroCommand[] }[] = [];

  if (action?.type === 'tap') {
    alternatives.push({ label: 'tapOn', commands: [{ type: 'tapOn', selector }] });
    alternatives.push({
      label: 'tapOn + inputText',
      commands: [{ type: 'tapOn', selector }, { type: 'inputText', text: '' }],
    });
    alternatives.push({
      label: 'inputText',
      commands: [{ type: 'inputText', text: '' }],
    });
    alternatives.push({
      label: 'assertVisible',
      commands: [{ type: 'assertVisible', selector }],
    });
    alternatives.push({
      label: 'longPressOn',
      commands: [{ type: 'longPressOn', selector }],
    });
  }

  if (action?.type === 'longPress') {
    alternatives.push({ label: 'longPressOn', commands: [{ type: 'longPressOn', selector }] });
    alternatives.push({ label: 'tapOn', commands: [{ type: 'tapOn', selector }] });
  }

  if (action?.type === 'scroll') {
    const dir = (action as ScrollAction).direction;
    alternatives.push({ label: `scroll ${dir}`, commands: [{ type: 'swipe', direction: dir }] });
    alternatives.push({ label: 'scroll (generic)', commands: [{ type: 'scroll' }] });
  }

  if (action?.type === 'swipe') {
    const start = toPercent(action.startX, action.startY, interaction.screenWidth, interaction.screenHeight);
    const end = toPercent(action.endX, action.endY, interaction.screenWidth, interaction.screenHeight);
    alternatives.push({ label: 'swipe', commands: [{ type: 'swipe', start, end }] });
  }

  // Accessibility-only
  if (interaction.source === 'accessibility') {
    for (const evt of interaction.accessibilityEvents) {
      if (evt.type === 'windowChanged') {
        const screenName = evt.text || evt.className?.split('.')?.pop() || '';
        if (screenName && !NOISE_NAMES.has(screenName)) {
          alternatives.push({
            label: `assertVisible: "${screenName}"`,
            commands: [{ type: 'assertVisible', selector: { kind: 'text', text: screenName } }],
          });
        }
      }
      if (evt.type === 'textChanged' && evt.text) {
        alternatives.push({
          label: `inputText: "${evt.text}"`,
          commands: [{ type: 'inputText', text: evt.text }],
        });
      }
    }
  }

  alternatives.push({ label: 'ignore', commands: [] });

  return alternatives;
}

// --- Touch interactions ---

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

  const textCmds = extractTextInput(interaction);
  commands.push(...textCmds);

  const assertCmd = extractWindowAssert(interaction);
  if (assertCmd) commands.push(assertCmd);

  return commands;
}

function mapTap(interaction: RecordedInteraction): MaestroCommand[] {
  const action = interaction.touchAction!;
  if (action.type !== 'tap') return [];
  const selector = selectBestSelector(interaction.element ?? null, action.x, action.y, interaction.screenWidth, interaction.screenHeight);
  return [{ type: 'tapOn', selector }];
}

function mapLongPress(interaction: RecordedInteraction): MaestroCommand[] {
  const action = interaction.touchAction!;
  if (action.type !== 'longPress') return [];
  const selector = selectBestSelector(interaction.element ?? null, action.x, action.y, interaction.screenWidth, interaction.screenHeight);
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
  return { type: 'swipe', direction: action.direction };
}

// --- Accessibility interactions ---

function mapAccessibilityInteraction(interaction: RecordedInteraction): MaestroCommand[] {
  const commands: MaestroCommand[] = [];
  for (const event of interaction.accessibilityEvents) {
    switch (event.type) {
      case 'click':
      case 'longClick': {
        const selector = buildAccessibilitySelector(event, interaction.element);
        commands.push(event.type === 'longClick'
          ? { type: 'longPressOn', selector }
          : { type: 'tapOn', selector });
        break;
      }
      case 'textChanged': {
        const text = extractFinalText(interaction.accessibilityEvents);
        if (text) commands.push({ type: 'inputText', text });
        return commands;
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

// --- Helpers ---

function extractTextInput(interaction: RecordedInteraction): MaestroCommand[] {
  const textEvents = interaction.accessibilityEvents.filter(e => e.type === 'textChanged');
  if (textEvents.length === 0) return [];

  const firstEvent = textEvents[0];
  const initialText = firstEvent.beforeText || '';
  const finalText = extractFinalText(textEvents);
  if (!finalText && !initialText) return [];

  const commands: MaestroCommand[] = [];

  if (finalText && /^[•·*●\u2022\u25CF\u2027]+$/.test(finalText)) {
    if (initialText) commands.push({ type: 'eraseText', chars: initialText.length });
    commands.push({ type: 'inputText', text: '<PASSWORD>' });
    return commands;
  }

  if (initialText && finalText && initialText !== finalText && !finalText.startsWith(initialText)) {
    commands.push({ type: 'eraseText', chars: initialText.length });
  }

  if (finalText) {
    const erasedFirst = commands.some(c => c.type === 'eraseText');
    if (erasedFirst || !initialText) {
      commands.push({ type: 'inputText', text: finalText });
    } else if (finalText.startsWith(initialText)) {
      const added = finalText.slice(initialText.length);
      if (added) commands.push({ type: 'inputText', text: added });
    } else {
      commands.push({ type: 'inputText', text: finalText });
    }
  } else if (initialText) {
    commands.push({ type: 'eraseText', chars: initialText.length });
  }

  return commands;
}

function extractFinalText(events: AccessibilityEventData[]): string | null {
  const textEvents = events.filter(e => e.type === 'textChanged');
  for (let i = textEvents.length - 1; i >= 0; i--) {
    const text = textEvents[i].text;
    if (text && text.trim().length > 0) return text;
  }
  return null;
}

function extractWindowAssert(interaction: RecordedInteraction): MaestroCommand | null {
  const windowEvents = interaction.accessibilityEvents.filter(e => e.type === 'windowChanged');
  if (windowEvents.length === 0) return null;
  return buildWindowAssert(windowEvents[windowEvents.length - 1]);
}

function buildWindowAssert(event: AccessibilityEventData): MaestroCommand | null {
  const pkg = event.packageName || '';
  if (!pkg || pkg.includes('launcher') || pkg.includes('systemui') || pkg.includes('inputmethod')) return null;
  const screenName = event.text || event.className?.split('.')?.pop() || '';
  if (!screenName || NOISE_NAMES.has(screenName)) return null;
  return { type: 'assertVisible', selector: { kind: 'text', text: screenName } };
}

function buildAccessibilitySelector(event: AccessibilityEventData, element?: UiElement, screenWidth?: number, screenHeight?: number): TapOnSelector {
  if (element) return selectBestSelector(element, 0, 0, screenWidth, screenHeight);
  if (event.resourceId) {
    const id = event.resourceId.includes(':id/') ? event.resourceId.split(':id/')[1] : event.resourceId;
    return { kind: 'id', id };
  }
  if (event.text && event.text.trim().length > 0 && event.text.length < 50) return { kind: 'text', text: event.text };
  if (event.contentDescription) return { kind: 'contentDescription', description: event.contentDescription };
  return { kind: 'point', x: 0, y: 0 };
}

function toPercent(x: number, y: number, screenWidth: number, screenHeight: number): string {
  const px = Math.round((x / screenWidth) * 100);
  const py = Math.round((y / screenHeight) * 100);
  return `${px}%, ${py}%`;
}

export { selectBestSelector } from './element-selector.js';
