import { getOpenRouterConfig } from '../config/ai.js';
import { validateMaestroYaml, type YamlValidationError, type YamlValidationResult } from '../maestro/yaml-validate.js';

export const PRETTIFY_MAX_BYTES = 16 * 1024;
export const VERIFY_YAML_MAX_BYTES = 16 * 1024;
export const VERIFY_FLOW_MAX_BYTES = 16 * 1024;
export const CREATE_PROMPT_MAX_BYTES = 4 * 1024;
export const CREATE_OUTPUT_TOKENS = 4096;
export const EXTRACT_MAX_FLOWS = 30;
export const EXTRACT_MAX_TOTAL_BYTES = 60 * 1024;

export type { YamlValidationError };

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_TIMEOUT_MS = 30000;

async function callOpenRouter(prompt: string): Promise<string> {
  const config = getOpenRouterConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/lenyk/manualflow',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid API response format');
  }

  const content: string = data.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from API');
  }

  return content;
}

export async function prettifyFlow(yaml: string): Promise<{ yaml: string; changesSummary: string }> {
  const prompt = `You are a Maestro YAML flow formatter. Prettify the following Maestro flow YAML for readability: fix indentation, normalize spacing, and apply consistent style. Do not change the logic or commands.

Return a JSON object with exactly these keys:
{
  "yaml": "<prettified YAML string>",
  "changesSummary": "<short bullet list of formatting changes made>"
}

Flow to prettify:
${yaml}`;

  const raw = await callOpenRouter(prompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model response as JSON: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;
  if (typeof result.yaml !== 'string' || typeof result.changesSummary !== 'string') {
    throw new Error('Model response missing required fields: yaml, changesSummary');
  }

  return { yaml: result.yaml, changesSummary: result.changesSummary };
}

export function verifyYaml(yaml: string): YamlValidationResult {
  return validateMaestroYaml(yaml);
}

export async function verifyFlow(yaml: string): Promise<{
  deterministic: YamlValidationResult;
  semantic: { ok: boolean; notes: string[]; suggestions: string[] } | null;
}> {
  const deterministic = validateMaestroYaml(yaml);

  if (!deterministic.ok) {
    return { deterministic, semantic: null };
  }

  const prompt = `You are a Maestro flow quality reviewer. Analyze the following Maestro YAML flow for semantic issues: unreachable steps, missing assertions, illogical command ordering, fragile selectors, and other best-practice violations.

Return a JSON object with exactly these keys:
{
  "ok": true | false,
  "notes": ["<observation 1>", ...],
  "suggestions": ["<suggestion 1>", ...]
}

"ok" is false if there are significant issues that would likely cause the flow to fail or produce unreliable results.

Flow to review:
${yaml}`;

  const raw = await callOpenRouter(prompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model response as JSON: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;
  if (typeof result.ok !== 'boolean' || !Array.isArray(result.notes) || !Array.isArray(result.suggestions)) {
    throw new Error('Model response missing required fields: ok, notes, suggestions');
  }

  return {
    deterministic,
    semantic: {
      ok: result.ok,
      notes: result.notes as string[],
      suggestions: result.suggestions as string[],
    },
  };
}

export async function extractCommonFlows(flows: { path: string; yaml: string }[]): Promise<{
  subflows: { name: string; yaml: string; sourceFlows: string[] }[];
  refactors: { flowPath: string; before: string; after: string; reason: string }[];
}> {
  const flowsText = flows
    .map(f => `# File: ${f.path}\n${f.yaml}`)
    .join('\n\n---\n\n');

  const prompt = `You are a Maestro flow refactoring expert. Analyze the following set of Maestro YAML flows and identify repeated command sequences that can be extracted into reusable subflows.

Return a JSON object with exactly these keys:
{
  "subflows": [
    {
      "name": "<subflow name, kebab-case>",
      "yaml": "<complete subflow YAML with appId and commands>",
      "sourceFlows": ["<path of flow 1>", ...]
    }
  ],
  "refactors": [
    {
      "flowPath": "<path of the flow being modified>",
      "before": "<original YAML snippet>",
      "after": "<YAML snippet using runFlow to call the extracted subflow>",
      "reason": "<why this was extracted>"
    }
  ]
}

Return empty arrays if no common patterns are found.

Flows to analyze:
${flowsText}`;

  const raw = await callOpenRouter(prompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model response as JSON: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;
  if (!Array.isArray(result.subflows) || !Array.isArray(result.refactors)) {
    throw new Error('Model response missing required fields: subflows, refactors');
  }

  return {
    subflows: result.subflows as { name: string; yaml: string; sourceFlows: string[] }[],
    refactors: result.refactors as { flowPath: string; before: string; after: string; reason: string }[],
  };
}

const APP_ID_RE = /^[a-z][\w.]+$/;

function slugFromPrompt(prompt: string): string {
  return prompt
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractAppIdFromExamples(exampleFlows: string[]): string | null {
  for (const flow of exampleFlows) {
    const match = flow.match(/^appId:\s*(\S+)/m);
    if (match && match[1]) return match[1];
  }
  return null;
}

export async function createFromPrompt(input: {
  prompt: string;
  appId?: string;
  exampleFlows?: string[];
}): Promise<{ relativePath: string; draftPath: string; yaml: string; appIdUsed: string }> {
  const { prompt, appId, exampleFlows = [] } = input;

  if (appId !== undefined && !APP_ID_RE.test(appId)) {
    throw new Error(`Invalid appId format: "${appId}". Must match ^[a-z][\\w.]+$`);
  }

  let resolvedAppId: string | null = appId ?? null;
  if (!resolvedAppId) {
    resolvedAppId = extractAppIdFromExamples(exampleFlows);
  }
  if (!resolvedAppId) {
    throw new Error('appId-required');
  }

  const slug = slugFromPrompt(prompt);
  const relativePath = `flows/${slug}.yaml`;

  const examplesSection = exampleFlows.length > 0
    ? `\n\nExample flows for style reference:\n${exampleFlows.map(f => '---\n' + f).join('\n')}`
    : '';

  const modelPrompt = `You are a Maestro flow author. Generate a Maestro YAML flow body (commands only, no appId header) for the following task:

"${prompt}"

Target app: ${resolvedAppId}${examplesSection}

Return a JSON object with exactly this key:
{
  "yaml": "<YAML commands body, starting with the first command, no appId header>"
}

Use only valid Maestro commands: tapOn, inputText, assertVisible, assertNotVisible, scroll, scrollUntilVisible, swipe, back, launchApp, stopApp, hideKeyboard, pressKey, waitForAnimationToEnd, takeScreenshot, runFlow, runScript, copyTextFrom, repeat, evalScript, clearState.`;

  const raw = await callOpenRouter(modelPrompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse model response as JSON: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;
  if (typeof result.yaml !== 'string') {
    throw new Error('Model response missing required field: yaml');
  }

  const fullYaml = `appId: ${resolvedAppId}\n---\n${result.yaml}`;

  // draftPath is filled in by the route handler which knows the project root
  return { relativePath, draftPath: '', yaml: fullYaml, appIdUsed: resolvedAppId };
}
