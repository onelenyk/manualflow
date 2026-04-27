import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyYaml,
  verifyFlow,
  prettifyFlow,
  createFromPrompt,
  PRETTIFY_MAX_BYTES,
  VERIFY_YAML_MAX_BYTES,
  VERIFY_FLOW_MAX_BYTES,
  CREATE_PROMPT_MAX_BYTES,
  EXTRACT_MAX_FLOWS,
  EXTRACT_MAX_TOTAL_BYTES,
} from './flow-ops.js';

const VALID_FLOW = `appId: com.example.app
commands:
  - tapOn:
      text: "Login"
  - inputText: "user@example.com"
  - assertVisible:
      text: "Welcome"
`;

const FLOW_WITHOUT_APP_ID = `commands:
  - tapOn:
      text: "Login"
`;

describe('flow-ops', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key-for-testing';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('verifyYaml', () => {
    it('returns ok: true for a valid flow', () => {
      const result = verifyYaml(VALID_FLOW);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns ok: false with MISSING_APP_ID for a flow without appId', () => {
      const result = verifyYaml(FLOW_WITHOUT_APP_ID);
      expect(result.ok).toBe(false);
      const appIdError = result.errors.find(e => e.code === 'MISSING_APP_ID');
      expect(appIdError).toBeDefined();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('verifyFlow', () => {
    it('short-circuits to semantic: null when deterministic fails', async () => {
      const result = await verifyFlow(FLOW_WITHOUT_APP_ID);
      expect(result.deterministic.ok).toBe(false);
      expect(result.semantic).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('calls model for semantic pass when deterministic passes', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({ ok: true, notes: ['Flow looks good'], suggestions: [] }),
            },
          }],
        }),
      } as any);

      const result = await verifyFlow(VALID_FLOW);
      expect(result.deterministic.ok).toBe(true);
      expect(result.semantic).not.toBeNull();
      expect(result.semantic!.ok).toBe(true);
      expect(Array.isArray(result.semantic!.notes)).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  describe('prettifyFlow', () => {
    it('returns yaml and changesSummary from model response', async () => {
      const prettifiedYaml = 'appId: com.example.app\n---\n- tapOn:\n    text: "Login"\n';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({ yaml: prettifiedYaml, changesSummary: '- Fixed indentation' }),
            },
          }],
        }),
      } as any);

      const result = await prettifyFlow(VALID_FLOW);
      expect(result.yaml).toBe(prettifiedYaml);
      expect(result.changesSummary).toBe('- Fixed indentation');
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  describe('createFromPrompt', () => {
    it('throws appId-required when no appId and no exampleFlows', async () => {
      await expect(createFromPrompt({ prompt: 'Login to the app' }))
        .rejects.toThrow('appId-required');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('uses appId from exampleFlows when not explicitly provided', async () => {
      const exampleFlow = 'appId: com.example.app\ncommands:\n  - tapOn:\n      text: "Login"\n';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({ yaml: '- tapOn:\n    text: "Login"\n' }),
            },
          }],
        }),
      } as any);

      const result = await createFromPrompt({ prompt: 'Login to the app', exampleFlows: [exampleFlow] });
      expect(result.appIdUsed).toBe('com.example.app');
      expect(result.yaml).toContain('appId: com.example.app');
      expect(result.relativePath).toMatch(/^flows\/.+\.yaml$/);
    });

    it('uses provided appId and builds relativePath slug from prompt', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({ yaml: '- tapOn:\n    text: "Login"\n' }),
            },
          }],
        }),
      } as any);

      const result = await createFromPrompt({ prompt: 'Login to the app and submit', appId: 'com.myapp' });
      expect(result.appIdUsed).toBe('com.myapp');
      expect(result.relativePath).toBe('flows/login-to-the-app-and-submit.yaml');
    });
  });

  describe('exported caps', () => {
    it('exports all size cap constants', () => {
      expect(PRETTIFY_MAX_BYTES).toBe(16 * 1024);
      expect(VERIFY_YAML_MAX_BYTES).toBe(16 * 1024);
      expect(VERIFY_FLOW_MAX_BYTES).toBe(16 * 1024);
      expect(CREATE_PROMPT_MAX_BYTES).toBe(4 * 1024);
      expect(EXTRACT_MAX_FLOWS).toBe(30);
      expect(EXTRACT_MAX_TOTAL_BYTES).toBe(60 * 1024);
    });
  });
});
