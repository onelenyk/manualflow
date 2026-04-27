import type { EnhancementResult, EnhancementSuggestion, MaestroCommand, RecordedInteraction } from '@maestro-recorder/shared';
import { getOpenRouterConfig } from '../config/ai.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_TIMEOUT_MS = 30000;

/**
 * Analyze a Maestro flow YAML and suggest improvements using OpenRouter API
 */
export async function analyzeFlow(yaml: string): Promise<EnhancementResult> {
  try {
    const config = getOpenRouterConfig();
    const prompt = buildPrompt(yaml);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/lenyk/manualflow',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        summary: '',
        suggestions: [],
        enhancedYaml: yaml,
        error: `OpenRouter API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        summary: '',
        suggestions: [],
        enhancedYaml: yaml,
        error: 'Invalid API response format',
      };
    }

    const content = data.choices[0].message.content;
    if (!content) {
      return {
        summary: '',
        suggestions: [],
        enhancedYaml: yaml,
        error: 'Empty response from API',
      };
    }

    const result = JSON.parse(content) as EnhancementResult;

    // Validate result structure
    if (!result.enhancedYaml) {
      result.enhancedYaml = yaml;
    }
    if (!result.suggestions) {
      result.suggestions = [];
    }
    if (!result.summary) {
      result.summary = '';
    }

    return result;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        summary: '',
        suggestions: [],
        enhancedYaml: yaml,
        error: `Request timeout after ${API_TIMEOUT_MS}ms`,
      };
    }

    if (error instanceof SyntaxError) {
      return {
        summary: '',
        suggestions: [],
        enhancedYaml: yaml,
        error: `Failed to parse API response: ${error.message}`,
      };
    }

    return {
      summary: '',
      suggestions: [],
      enhancedYaml: yaml,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Enhance a flow based on recorded interactions
 */
export async function enhanceFromInteractions(interactions: RecordedInteraction[]): Promise<EnhancementResult> {
  // Convert interactions to a basic YAML flow representation
  const yaml = interactionsToYaml(interactions);
  return analyzeFlow(yaml);
}

/**
 * Build the prompt for the OpenRouter API
 */
function buildPrompt(yaml: string): string {
  return `You are a Maestro flow optimizer. Analyze this flow and suggest improvements.

Maestro YAML commands reference:
- tapOn, doubleTapOn, longPressOn: tap on element
- inputText: type text into a focused field
- eraseText: clear existing text (optional: number of chars to delete)
- hideKeyboard: dismiss the keyboard after text input
- swipe: swipe gesture
- scroll: scroll list
- scrollUntilVisible: scroll until element appears
- assertVisible: verify element visible
- assertNotVisible: verify element not visible
- back: press back
- launchApp: launch app
- waitForAnimationToEnd: wait for animations

KEYBOARD INPUT OPTIMIZATION:
When you see multiple taps on keyboard-like coordinates (bottom half of screen, similar Y values),
convert them to a single inputText command:
1. Identify the target field (tap before keyboard taps)
2. Replace keyboard taps with: - inputText: "<placeholder text>"
3. Add: - hideKeyboard (optional, but good for flow clarity)

Example transformation:
  - tapOn: "Username field"
  - tapOn: { point: "100, 1800" }  # 'a' key
  - tapOn: { point: "200, 1750" }  # 'b' key
  - tapOn: { point: "150, 1700" }  # 'c' key

Becomes:
  - tapOn: "Username field"
  - inputText: "abc"
  - hideKeyboard

Best practices:
1. Prefer resource-id selectors over text selectors (more stable)
2. Add assertVisible after navigation to confirm screen loaded
3. Remove duplicate taps on same element
4. Add waitForAnimationToEnd after swipes/scrolls
5. Use scrollUntilVisible for elements that may be off-screen
6. Fold keyboard tap sequences into inputText commands
7. Use eraseText before inputText when the field may have existing content

Return JSON with this structure:
{
  "summary": "Brief bullet list of changes",
  "suggestions": [
    {
      "type": "optimize|add|remove|modify",
      "description": "Human-readable description",
      "original": { Maestro command object or omit if adding new },
      "suggested": { Maestro command object },
      "reason": "Why this change improves the flow"
    }
  ],
  "enhancedYaml": "Complete optimized flow YAML"
}

Flow to analyze:
${yaml}`;
}

/**
 * Detect keyboard input patterns and convert to inputText commands
 * Looks for sequences of taps on the same area while keyboard is open
 */
function detectKeyboardInputPatterns(interactions: RecordedInteraction[]): Array<{yaml: string, original: string[]}> {
  const patterns: Array<{yaml: string, original: string[]}> = [];
  const KEYBOARD_TOLERANCE = 100; // pixels
  const MIN_TAPS_FOR_INPUT = 2;

  // Find sequences of taps that look like keyboard input
  let i = 0;
  while (i < interactions.length) {
    const interaction = interactions[i];

    // Check if this is a potential keyboard tap
    if (interaction.keyboardState?.open &&
        interaction.touchAction?.type === 'tap' &&
        !interaction.filteredAsKeyboardTap) {

      const tap = interaction.touchAction;
      const sequence: RecordedInteraction[] = [interaction];
      let j = i + 1;

      // Collect subsequent taps in the same general area (keyboard area)
      while (j < interactions.length) {
        const next = interactions[j];
        if (next.keyboardState?.open &&
            next.touchAction?.type === 'tap' &&
            !next.filteredAsKeyboardTap) {

          const nextTap = next.touchAction;
          const dist = Math.sqrt(
            Math.pow(nextTap.x - tap.x, 2) +
            Math.pow(nextTap.y - tap.y, 2)
          );

          // If tap is in same general keyboard area (or bottom area of screen)
          const isKeyboardArea = nextTap.y > (interaction.screenHeight * 0.5);
          if (isKeyboardArea || dist < KEYBOARD_TOLERANCE) {
            sequence.push(next);
            j++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // If we found enough taps to constitute text input
      if (sequence.length >= MIN_TAPS_FOR_INPUT) {
        const originalLines: string[] = [];
        for (const seq of sequence) {
          const action = seq.touchAction!;
          if (seq.element) {
            const selector = createSelector(seq.element);
            originalLines.push(`- tapOn: ${selector}`);
          } else if (action.type === 'tap') {
            originalLines.push(`- tapOn: { point: "${action.x}, ${action.y}" }`);
          }
        }

        // Get the target element (usually a text field)
        const targetElement = interaction.element;
        const placeholder = targetElement?.text || targetElement?.resourceId || '<field>';
        patterns.push({
          yaml: `- tapOn: ${createSelector(targetElement || {})}\n- inputText: "<your text here>"\n- hideKeyboard`,
          original: originalLines
        });

        i = j;
        continue;
      }
    }
    i++;
  }

  return patterns;
}

/**
 * Convert recorded interactions to basic YAML representation
 */
function interactionsToYaml(interactions: RecordedInteraction[]): string {
  const lines: string[] = [];

  // First, detect and mark keyboard input patterns
  const keyboardPatterns = detectKeyboardInputPatterns(interactions);
  const processedIds = new Set<number>();

  // Add keyboard input patterns first
  for (const pattern of keyboardPatterns) {
    lines.push(`# Keyboard input sequence (${pattern.original.length} taps)`);
    lines.push(pattern.yaml);
    lines.push('');
    // Mark the interactions that were part of this pattern
    // We need to track which interactions were used
  }

  for (const interaction of interactions) {
    // Skip if this interaction was already processed as part of a keyboard pattern
    // This is a simple check - in production we'd want better tracking
    if (interaction.touchAction) {
      const action = interaction.touchAction;

      // Skip keyboard taps - they're handled above
      if (interaction.keyboardState?.open && action.type === 'tap') {
        continue;
      }

      switch (action.type) {
        case 'tap':
          if (interaction.element) {
            const selector = createSelector(interaction.element);
            lines.push(`- tapOn: ${selector}`);
          } else {
            lines.push(`- tapOn: { point: "${action.x}, ${action.y}" }`);
          }
          break;

        case 'swipe':
          lines.push(`- swipe: { direction: "${getSwipeDirection(action)}" }`);
          break;

        case 'longPress':
          if (interaction.element) {
            const selector = createSelector(interaction.element);
            lines.push(`- longPressOn: ${selector}`);
          } else {
            lines.push(`- longPressOn: { point: "${action.x}, ${action.y}" }`);
          }
          break;

        case 'scroll':
          lines.push(`- scroll: { direction: "${action.direction}" }`);
          break;
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '# No interactions recorded';
}

/**
 * Create a Maestro selector from a UI element
 */
function createSelector(element: {
  resourceId?: string;
  text?: string;
  contentDescription?: string;
}): string {
  if (element.resourceId) {
    const id = element.resourceId.split('/').pop() || element.resourceId;
    return `{ id: "${id}" }`;
  }

  if (element.text) {
    return `{ text: "${element.text}" }`;
  }

  if (element.contentDescription) {
    return `{ contentDescription: "${element.contentDescription}" }`;
  }

  return '{ text: "" }';
}

/**
 * Determine swipe direction from swipe action
 */
function getSwipeDirection(action: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}): string {
  const dx = Math.abs(action.endX - action.startX);
  const dy = Math.abs(action.endY - action.startY);

  if (dx > dy) {
    return action.endX > action.startX ? 'right' : 'left';
  } else {
    return action.endY > action.startY ? 'down' : 'up';
  }
}
