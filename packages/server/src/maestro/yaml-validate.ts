import { parse, parseDocument } from 'yaml';

export interface YamlValidationError {
  line?: number;
  col?: number;
  message: string;
  code: string;
}

export interface YamlValidationResult {
  ok: boolean;
  errors: YamlValidationError[];
  warnings: string[];
}

const ALLOWED_COMMANDS = new Set([
  'tapOn',
  'assertVisible',
  'assertNotVisible',
  'inputText',
  'scroll',
  'scrollUntilVisible',
  'swipe',
  'runFlow',
  'runScript',
  'takeScreenshot',
  'launchApp',
  'stopApp',
  'clearState',
  'back',
  'hideKeyboard',
  'pressKey',
  'waitForAnimationToEnd',
  'evalScript',
  'copyTextFrom',
  'repeat',
]);

export function validateMaestroYaml(text: string): YamlValidationResult {
  const errors: YamlValidationError[] = [];
  const warnings: string[] = [];

  let doc: ReturnType<typeof parseDocument>;
  let parsed: unknown;
  try {
    doc = parseDocument(text);
    if (doc.errors && doc.errors.length > 0) {
      for (const e of doc.errors) {
        errors.push({
          line: e.linePos?.[0]?.line,
          col: e.linePos?.[0]?.col,
          message: e.message,
          code: 'INVALID_YAML',
        });
      }
      return { ok: false, errors, warnings };
    }
    parsed = doc.toJS();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ message: msg, code: 'INVALID_YAML' });
    return { ok: false, errors, warnings };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({ message: 'top-level must be a mapping', code: 'INVALID_YAML' });
    return { ok: false, errors, warnings };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj['appId'] !== 'string') {
    errors.push({ message: 'missing or non-string appId', code: 'MISSING_APP_ID' });
  }

  const body = obj['commands'] ?? obj['flows'];
  const bodyKey = 'commands' in obj ? 'commands' : ('flows' in obj ? 'flows' : null);

  let commandList: unknown[] | null = null;

  if (Array.isArray(body)) {
    commandList = body;
  } else if (bodyKey === null) {
    const values = Object.values(obj).filter(v => Array.isArray(v));
    if (values.length === 0) {
      errors.push({ message: 'no command body found', code: 'INVALID_BODY' });
      return { ok: false, errors, warnings };
    }
    commandList = values[0] as unknown[];
  } else {
    errors.push({ message: 'command body is not an array', code: 'INVALID_BODY' });
    return { ok: false, errors, warnings };
  }

  if (!commandList || commandList.length === 0) {
    errors.push({ message: 'command list is empty', code: 'INVALID_BODY' });
    return { ok: false, errors, warnings };
  }

  for (let i = 0; i < commandList.length; i++) {
    const cmd = commandList[i];
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) {
      errors.push({ message: `command at index ${i} is not a mapping`, code: 'INVALID_BODY' });
      continue;
    }
    const keys = Object.keys(cmd as object);
    if (keys.length !== 1) {
      errors.push({ message: `command at index ${i} must be a single-key mapping`, code: 'INVALID_BODY' });
      continue;
    }
    const key = keys[0];
    if (!ALLOWED_COMMANDS.has(key)) {
      errors.push({ message: `unknown command '${key}'`, code: 'UNKNOWN_COMMAND' });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
