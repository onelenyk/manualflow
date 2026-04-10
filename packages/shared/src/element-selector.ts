import type { TapOnSelector, UiElement } from './types.js';

export function selectBestSelector(
  element: UiElement | null,
  x: number, y: number,
  screenWidth?: number, screenHeight?: number,
): TapOnSelector {
  if (!element) return toPointPercent(x, y, screenWidth, screenHeight);

  const isEditable = element.editable ||
    element.className?.includes('EditText') ||
    element.className?.includes('TextField');

  // Priority 1: resource-id (strip package prefix, skip generic root IDs)
  if (element.resourceId) {
    const id = element.resourceId.includes(':id/')
      ? element.resourceId.split(':id/')[1]
      : element.resourceId;
    const JUNK_IDS = ['action_bar_root', 'content', 'decor_content_parent', 'statusBarBackground', 'navigationBarBackground'];
    if (!JUNK_IDS.includes(id)) {
      return { kind: 'id', id };
    }
  }

  // Priority 2: content description (reliable, doesn't change with input)
  if (element.contentDescription) {
    return { kind: 'contentDescription', description: element.contentDescription };
  }

  // Priority 3: visible text — but NOT for editable fields (placeholder text is unreliable)
  if (!isEditable && element.text && element.text.trim().length > 0 && element.text.length < 50) {
    return { kind: 'text', text: element.text };
  }

  // Priority 4: relative selector (child text, or nearest neighbor)
  if (element.nearestLabel && element.labelRelation) {
    return { kind: 'relative', relation: element.labelRelation as 'below' | 'above' | 'containsChild', anchor: element.nearestLabel };
  }

  // Priority 5: coordinate fallback (as percentages)
  return toPointPercent(x, y, screenWidth, screenHeight);
}

function toPointPercent(x: number, y: number, screenWidth?: number, screenHeight?: number): TapOnSelector {
  if (screenWidth && screenHeight && screenWidth > 0 && screenHeight > 0) {
    return { kind: 'point', x: Math.round((x / screenWidth) * 100), y: Math.round((y / screenHeight) * 100) };
  }
  return { kind: 'point', x, y };
}
