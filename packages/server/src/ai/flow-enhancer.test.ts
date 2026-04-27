import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeFlow } from './flow-enhancer.js';

describe('flow-enhancer', () => {
  beforeEach(() => {
    // Mock OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'test-key-for-testing';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';
  });

  it('should accept YAML string and return EnhancementResult structure', async () => {
    const sampleYaml = `- tapOn:
    text: "Submit"
- tapOn:
    text: "Submit"
- inputText: "test@email.com"
- swipe:
    direction: up
`;

    // Mock fetch to avoid actual API call
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: '- Removed duplicate tap on Submit button\n- Added id-based selector for better stability\n- Added assertion after input',
                suggestions: [
                  {
                    type: 'remove',
                    description: 'Remove duplicate tap command',
                    original: { type: 'tapOn', selector: { kind: 'text', text: 'Submit' } },
                    suggested: { type: 'tapOn', selector: { kind: 'text', text: 'Submit' } },
                    reason: 'Duplicate tap on same element serves no purpose'
                  },
                  {
                    type: 'add',
                    description: 'Add assertion after input',
                    suggested: { type: 'assertVisible', selector: { kind: 'text', text: 'Submit' } },
                    reason: 'Verify element is still visible after typing'
                  }
                ],
                enhancedYaml: `- tapOn:
    id: "submit_button"
- inputText: "test@email.com"
- assertVisible:
    id: "submit_button"
`
              })
            }
          }]
        })
      })
    ) as any;

    const result = await analyzeFlow(sampleYaml);

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('suggestions');
    expect(result).toHaveProperty('enhancedYaml');
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(typeof result.enhancedYaml).toBe('string');
  });

  it('should handle API errors gracefully', async () => {
    const sampleYaml = `- tapOn: "test"`;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      })
    ) as any;

    const result = await analyzeFlow(sampleYaml);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('500');
    expect(result.enhancedYaml).toBe(sampleYaml); // Returns original YAML on error
  });

  it('should handle timeout errors', async () => {
    const sampleYaml = `- tapOn: "test"`;

    // Create a proper AbortError
    const abortError = new DOMException('Aborted', 'AbortError');

    global.fetch = vi.fn(() =>
      Promise.reject(abortError)
    ) as any;

    const result = await analyzeFlow(sampleYaml);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('timeout');
  });

  it('should detect text selectors and suggest id selectors where applicable', async () => {
    const sampleYaml = `- tapOn:
    text: "Login Button"
- inputText: "user@example.com"
- tapOn:
    text: "Login Button"
`;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: '- Converted text selectors to id-based selectors for better stability\n- Removed duplicate tap on Login Button',
                suggestions: [
                  {
                    type: 'optimize',
                    description: 'Use id selector instead of text',
                    original: { type: 'tapOn', selector: { kind: 'text', text: 'Login Button' } },
                    suggested: { type: 'tapOn', selector: { kind: 'id', id: 'loginButton' } },
                    reason: 'ID selectors are more stable than text selectors'
                  }
                ],
                enhancedYaml: `- tapOn:
    id: "loginButton"
- inputText: "user@example.com"
`
              })
            }
          }]
        })
      })
    ) as any;

    const result = await analyzeFlow(sampleYaml);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.enhancedYaml).not.toContain('text: "Login Button"');
  });

  it('should remove redundant duplicate commands', async () => {
    const sampleYaml = `- tapOn:
    text: "Submit"
- tapOn:
    text: "Submit"
- tapOn:
    text: "Submit"
`;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: '- Removed duplicate tap commands (2 duplicates removed)',
                suggestions: [
                  {
                    type: 'remove',
                    description: 'Remove duplicate tap commands',
                    reason: 'Tapping the same button 3 times in a row is redundant'
                  }
                ],
                enhancedYaml: `- tapOn:
    text: "Submit"
`
              })
            }
          }]
        })
      })
    ) as any;

    const result = await analyzeFlow(sampleYaml);

    const enhancedLines = result.enhancedYaml.trim().split('\n');
    const tapCount = enhancedLines.filter((line: string) => line.includes('tapOn')).length;
    expect(tapCount).toBeLessThan(3);
  });
});
