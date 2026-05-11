import { describe, it, expect } from 'vitest';
import { parseCommandLines } from './command-parser.js';

describe('parseCommandLines', () => {
  it('parses tapOn with text selector (children form)', () => {
    const yaml = `- tapOn:\n    text: "Submit"`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'tapOn', selector: { kind: 'text', text: 'Submit' } },
    ]);
  });

  it('parses tapOn with id selector', () => {
    const yaml = `- tapOn:\n    id: "com.example:id/btn"`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'tapOn', selector: { kind: 'id', id: 'com.example:id/btn' } },
    ]);
  });

  it('parses swipe with direction', () => {
    const yaml = `- swipe:\n    direction: up`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'swipe', direction: 'up' },
    ]);
  });

  it('parses swipe with start/end coords', () => {
    const yaml = `- swipe:\n    start: 10%, 90%\n    end: 10%, 10%`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'swipe', start: '10%, 90%', end: '10%, 10%' },
    ]);
  });

  it('parses inputText', () => {
    const yaml = `- inputText: "hello world"`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'inputText', text: 'hello world' },
    ]);
  });

  it('parses eraseText with char count', () => {
    const yaml = `- eraseText: 5`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'eraseText', chars: 5 },
    ]);
  });

  it('parses assertVisible with text selector', () => {
    const yaml = `- assertVisible:\n    text: "Welcome"`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'assertVisible', selector: { kind: 'text', text: 'Welcome' } },
    ]);
  });

  it('parses longPressOn with id selector', () => {
    const yaml = `- longPressOn:\n    id: "com.example:id/menu"`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'longPressOn', selector: { kind: 'id', id: 'com.example:id/menu' } },
    ]);
  });

  it('parses back with no args', () => {
    const yaml = `- back`;
    expect(parseCommandLines(yaml)).toEqual([
      { type: 'back' },
    ]);
  });

  it('parses a multi-command block', () => {
    const yaml = [
      '- tapOn:',
      '    text: "Login"',
      '- inputText: "user@example.com"',
      '- assertVisible:',
      '    text: "Welcome"',
    ].join('\n');
    const result = parseCommandLines(yaml);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'tapOn', selector: { kind: 'text', text: 'Login' } });
    expect(result[1]).toEqual({ type: 'inputText', text: 'user@example.com' });
    expect(result[2]).toEqual({ type: 'assertVisible', selector: { kind: 'text', text: 'Welcome' } });
  });

  it('ignores comment lines and blank lines', () => {
    const yaml = [
      '# This is a comment',
      '',
      '- back',
      '',
      '# Another comment',
      '- hideKeyboard',
    ].join('\n');
    const result = parseCommandLines(yaml);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'back' });
    expect(result[1]).toEqual({ type: 'hideKeyboard' });
  });

  it('skips unknown verbs silently', () => {
    const yaml = [
      '- unknownVerb: someValue',
      '- back',
    ].join('\n');
    const result = parseCommandLines(yaml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'back' });
  });
});
