import type { ValidationResult, ValidationError } from '../../shared/src/types.js';

const VALID_COMMAND_TYPES = [
  'launchApp',
  'tapOn',
  'doubleTapOn',
  'longPressOn',
  'inputText',
  'eraseText',
  'swipe',
  'scroll',
  'scrollUntilVisible',
  'assertVisible',
  'assertNotVisible',
  'back',
  'pressKey',
  'openLink',
  'hideKeyboard',
  'waitForAnimationToEnd',
  'takeScreenshot',
];

const SELECTOR_REQUIRED_COMMANDS = new Set(['tapOn', 'doubleTapOn', 'longPressOn', 'assertVisible', 'assertNotVisible', 'scrollUntilVisible']);

export function validateCommands(commands: any[]): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if commands is empty
  if (!Array.isArray(commands) || commands.length === 0) {
    return {
      valid: false,
      errors: [
        {
          index: -1,
          command: 'root',
          field: 'commands',
          message: 'Command list cannot be empty',
        },
      ],
    };
  }

  // Check if first command is launchApp (warning not error)
  if (commands[0]?.type !== 'launchApp') {
    // Note: This is a warning, not an error, so we don't add to errors array
    console.warn('Flow should typically start with launchApp command');
  }

  // Validate each command
  commands.forEach((cmd, index) => {
    if (!cmd || typeof cmd !== 'object') {
      errors.push({
        index,
        command: 'unknown',
        field: 'command',
        message: 'Command must be an object',
      });
      return;
    }

    const commandType = cmd.type;

    // Validate command type
    if (!commandType || !VALID_COMMAND_TYPES.includes(commandType)) {
      errors.push({
        index,
        command: commandType || 'unknown',
        field: 'type',
        message: `Invalid command type: ${commandType}. Must be one of: ${VALID_COMMAND_TYPES.join(', ')}`,
      });
      return;
    }

    // Type-specific validation
    switch (commandType) {
      case 'tapOn':
      case 'doubleTapOn':
      case 'longPressOn':
      case 'assertVisible':
      case 'assertNotVisible':
        validateSelector(cmd, index, commandType, errors);
        break;

      case 'inputText':
        if (typeof cmd.text !== 'string' || cmd.text.length === 0) {
          errors.push({
            index,
            command: commandType,
            field: 'text',
            message: 'inputText requires non-empty "text" field',
          });
        }
        break;

      case 'swipe':
        if (!validateSwipe(cmd)) {
          errors.push({
            index,
            command: commandType,
            field: 'swipe',
            message: 'swipe requires either "start"+"end" or "direction" field',
          });
        }
        break;

      case 'pressKey':
        if (!cmd.key || typeof cmd.key !== 'string') {
          errors.push({
            index,
            command: commandType,
            field: 'key',
            message: 'pressKey requires "key" field',
          });
        }
        break;

      case 'openLink':
        if (!cmd.url || typeof cmd.url !== 'string') {
          errors.push({
            index,
            command: commandType,
            field: 'url',
            message: 'openLink requires "url" field',
          });
        }
        break;

      case 'scrollUntilVisible':
        validateSelector(cmd, index, commandType, errors);
        break;

      case 'eraseText':
      case 'scroll':
      case 'back':
      case 'hideKeyboard':
      case 'waitForAnimationToEnd':
      case 'takeScreenshot':
      case 'launchApp':
        // These commands don't require additional validation
        break;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateSelector(
  cmd: any,
  index: number,
  commandType: string,
  errors: ValidationError[]
): void {
  const selector = cmd.selector;

  if (!selector || typeof selector !== 'object') {
    errors.push({
      index,
      command: commandType,
      field: 'selector',
      message: 'Selector must be an object',
    });
    return;
  }

  // Check if at least one of the required fields exists
  const hasText = selector.text && typeof selector.text === 'string';
  const hasId = selector.id && typeof selector.id === 'string';
  const hasContentDescription = selector.contentDescription && typeof selector.contentDescription === 'string';
  const hasPoint = selector.point && typeof selector.point === 'object' &&
                   typeof selector.point.x === 'number' && typeof selector.point.y === 'number';

  if (!hasText && !hasId && !hasContentDescription && !hasPoint) {
    errors.push({
      index,
      command: commandType,
      field: 'selector',
      message: 'Selector must have at least one of: text, id, contentDescription, or point',
    });
  }
}

function validateSwipe(cmd: any): boolean {
  // Check for start + end format
  if (cmd.start && cmd.end) {
    return true;
  }

  // Check for direction format
  if (cmd.direction && ['up', 'down', 'left', 'right'].includes(cmd.direction)) {
    return true;
  }

  return false;
}
