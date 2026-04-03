import type { UserAction, MaestroCommand, UiElement } from '@maestro-recorder/shared';
import { AgentClient } from './agent-client.js';
import { selectBestSelector } from './element-selector.js';

export class EventMerger {
  constructor(
    private agent: AgentClient,
    private screenWidth: number,
    private screenHeight: number,
  ) {}

  async merge(action: UserAction): Promise<{ command: MaestroCommand; element: UiElement | null }> {
    switch (action.type) {
      case 'tap': return this.mergeTap(action);
      case 'longPress': return this.mergeLongPress(action);
      case 'swipe': return { command: this.mergeSwipe(action), element: null };
      case 'scroll': return { command: this.mergeScroll(action), element: null };
    }
  }

  private async mergeTap(action: { x: number; y: number }): Promise<{ command: MaestroCommand; element: UiElement | null }> {
    const element = await this.agent.elementAt(action.x, action.y);
    const selector = selectBestSelector(element, action.x, action.y);
    return { command: { type: 'tapOn', selector }, element };
  }

  private async mergeLongPress(action: { x: number; y: number }): Promise<{ command: MaestroCommand; element: UiElement | null }> {
    const element = await this.agent.elementAt(action.x, action.y);
    const selector = selectBestSelector(element, action.x, action.y);
    return { command: { type: 'longPressOn', selector }, element };
  }

  private mergeSwipe(action: { startX: number; startY: number; endX: number; endY: number }): MaestroCommand {
    const start = this.toPercent(action.startX, action.startY);
    const end = this.toPercent(action.endX, action.endY);
    return { type: 'swipe', start, end } as MaestroCommand;
  }

  private mergeScroll(action: { direction: string }): MaestroCommand {
    return { type: 'scroll' };
  }

  /** Detect if a tap landed on a text field and capture subsequent text input */
  async detectTextInput(element: UiElement | null, x: number, y: number): Promise<string | null> {
    if (!element) return null;

    const isTextField =
      element.focused ||
      element.className?.includes('EditText') === true ||
      element.className?.includes('TextField') === true;

    if (!isTextField) return null;

    const originalText = element.text || '';

    // Wait for user to type, then poll
    await sleep(2000);

    const updated = await this.agent.elementAt(x, y);
    if (!updated?.text || updated.text === originalText) return null;

    return updated.text;
  }

  private toPercent(x: number, y: number): string {
    const px = Math.round((x / this.screenWidth) * 100);
    const py = Math.round((y / this.screenHeight) * 100);
    return `${px}%, ${py}%`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
