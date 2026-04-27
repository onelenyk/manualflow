import { describe, it, expect } from 'vitest';
import { validateMaestroYaml } from './yaml-validate.js';

const VALID_FLOW = `
appId: com.example.app
---
- launchApp:
- tapOn:
    text: "Login"
- inputText: "user@example.com"
`;

const VALID_FLOW_COMMANDS = `
appId: com.example.app
commands:
  - launchApp:
  - tapOn:
      text: "Login"
`;

describe('validateMaestroYaml', () => {
  it('valid flow passes', () => {
    const result = validateMaestroYaml(VALID_FLOW_COMMANDS);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing appId fails with MISSING_APP_ID', () => {
    const text = `
commands:
  - launchApp:
`;
    const result = validateMaestroYaml(text);
    expect(result.ok).toBe(false);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('MISSING_APP_ID');
  });

  it('unknown command fails with UNKNOWN_COMMAND', () => {
    const text = `
appId: com.example.app
commands:
  - launchApp:
  - unknownCommand:
      foo: bar
`;
    const result = validateMaestroYaml(text);
    expect(result.ok).toBe(false);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('UNKNOWN_COMMAND');
  });

  it('garbage YAML fails with INVALID_YAML', () => {
    const text = `{{{not valid yaml::: [[[`;
    const result = validateMaestroYaml(text);
    expect(result.ok).toBe(false);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('INVALID_YAML');
  });

  it('empty command body fails', () => {
    const text = `
appId: com.example.app
commands: []
`;
    const result = validateMaestroYaml(text);
    expect(result.ok).toBe(false);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('INVALID_BODY');
  });
});
