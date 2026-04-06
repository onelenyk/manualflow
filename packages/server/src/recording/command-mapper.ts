/**
 * Server-side command mapper.
 * Re-exports single-interaction mapper from shared.
 * Adds sequence-aware batch mapping (scrollUntilVisible, doubleTap, hideKeyboard, etc.)
 */
import type {
  RecordedInteraction,
  MaestroCommand,
  ScrollAction,
} from '@maestro-recorder/shared';
import { mapInteractionToCommands, selectBestSelector } from '@maestro-recorder/shared';

export { mapInteractionToCommands };

const DOUBLE_TAP_MS = 400;
const ANIMATION_GAP_MS = 3000;

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

    // --- Pattern: double tap ---
    if (curr.touchAction?.type === 'tap' && next?.touchAction?.type === 'tap') {
      const gap = next.timestampMs - curr.timestampMs;
      if (gap < DOUBLE_TAP_MS && sameElement(curr.element, next.element)) {
        const selector = selectBestSelector(curr.element ?? null, curr.touchAction.x, curr.touchAction.y);
        commands.push({ type: 'doubleTapOn', selector });
        i += 2;
        continue;
      }
    }

    // --- Pattern: scroll(s) → tap → scrollUntilVisible ---
    if (curr.touchAction?.type === 'scroll') {
      const scrollDir = (curr.touchAction as ScrollAction).direction;
      let j = i + 1;
      while (j < interactions.length && interactions[j].touchAction?.type === 'scroll') j++;
      const tapAfterScroll = j < interactions.length ? interactions[j] : null;
      if (tapAfterScroll?.touchAction?.type === 'tap' && tapAfterScroll.element) {
        const selector = selectBestSelector(tapAfterScroll.element, tapAfterScroll.touchAction.x, tapAfterScroll.touchAction.y);
        if (selector.kind !== 'point') {
          commands.push({ type: 'scrollUntilVisible', selector, direction: scrollDir });
          commands.push({ type: 'tapOn', selector });
          commands.push(...mapInteractionToCommands(tapAfterScroll).filter(c => c.type !== 'tapOn'));
          i = j + 1;
          continue;
        }
      }
    }

    // --- Default: single interaction mapping ---
    commands.push(...mapInteractionToCommands(curr));
    i++;
  }

  return commands;
}

function sameElement(a?: any, b?: any): boolean {
  if (!a || !b) return false;
  if (a.resourceId && a.resourceId === b.resourceId) return true;
  if (a.text && a.text === b.text) return true;
  if (a.bounds && b.bounds &&
    a.bounds.left === b.bounds.left && a.bounds.top === b.bounds.top &&
    a.bounds.right === b.bounds.right && a.bounds.bottom === b.bounds.bottom) return true;
  return false;
}
