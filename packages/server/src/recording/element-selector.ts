import type { TapOnSelector, UiElement } from '@maestro-recorder/shared';

export function selectBestSelector(element: UiElement | null, x: number, y: number): TapOnSelector {
  if (!element) return { kind: 'point', x, y };

  // Priority 1: resource-id (strip package prefix)
  if (element.resourceId) {
    const id = element.resourceId.includes(':id/')
      ? element.resourceId.split(':id/')[1]
      : element.resourceId;
    return { kind: 'id', id };
  }

  // Priority 2: visible text (non-empty, reasonable length)
  if (element.text && element.text.trim().length > 0 && element.text.length < 50) {
    return { kind: 'text', text: element.text };
  }

  // Priority 3: content description
  if (element.contentDescription) {
    return { kind: 'contentDescription', description: element.contentDescription };
  }

  // Priority 4: coordinate fallback
  return { kind: 'point', x, y };
}
