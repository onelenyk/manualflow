import type { TapOnSelector, UiElement } from './types.js';

export function selectBestSelector(element: UiElement | null, x: number, y: number): TapOnSelector {
  if (!element) return { kind: 'point', x, y };

  const isEditable = element.editable ||
    element.className?.includes('EditText') ||
    element.className?.includes('TextField');

  // Priority 1: resource-id (strip package prefix)
  if (element.resourceId) {
    const id = element.resourceId.includes(':id/')
      ? element.resourceId.split(':id/')[1]
      : element.resourceId;
    return { kind: 'id', id };
  }

  // Priority 2: content description (reliable, doesn't change with input)
  if (element.contentDescription) {
    return { kind: 'contentDescription', description: element.contentDescription };
  }

  // Priority 3: visible text — but NOT for editable fields (placeholder text is unreliable)
  if (!isEditable && element.text && element.text.trim().length > 0 && element.text.length < 50) {
    return { kind: 'text', text: element.text };
  }

  // Priority 4: coordinate fallback
  return { kind: 'point', x, y };
}
