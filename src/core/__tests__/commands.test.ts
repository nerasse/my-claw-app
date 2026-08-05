import { commandQuery, commandStore, filterCommands } from '../commands';

const COMMANDS = [
  { name: 'status', description: 'Session diagnostics' },
  { name: 'model', description: 'Show or change current model' },
  { name: 'models', description: 'List available models' },
  { name: 'help', description: 'List available commands' },
  { name: 'verbose', description: 'Toggle verbose tool output' },
  { name: 'clear', description: 'Clear session history' },
  { name: 'archive', description: 'Delete archives created by /new' },
];

describe('commandQuery', () => {
  test('matches a pure command token', () => {
    expect(commandQuery('/')).toBe('');
    expect(commandQuery('/st')).toBe('st');
    expect(commandQuery('/status')).toBe('status');
    expect(commandQuery('  /model')).toBe('model');
  });

  test('closes the menu as soon as the token is not a command anymore', () => {
    expect(commandQuery('/status foo')).toBeNull();
    expect(commandQuery('hello /status')).toBeNull();
    expect(commandQuery('/status/')).toBeNull();
    expect(commandQuery('/status ')).toBeNull();
    expect(commandQuery('')).toBeNull();
  });
});

describe('filterCommands', () => {
  test('prefix match, case-insensitive, capped', () => {
    expect(filterCommands('', COMMANDS, 6)).toHaveLength(6);
    expect(filterCommands('m', COMMANDS, 6).map(c => c.name)).toEqual(['model', 'models']);
    expect(filterCommands('MOD', COMMANDS).map(c => c.name)).toEqual(['model', 'models']);
    expect(filterCommands('x', COMMANDS)).toEqual([]);
  });
});

describe('commandStore', () => {
  test('replaces the whole catalog on refresh and notifies once', () => {
    const listener = jest.fn();
    const off = commandStore.subscribe(listener);
    const before = commandStore.getSnapshot();
    expect(before.length).toBeGreaterThan(0);

    commandStore.replace([{ name: 'fresh', description: 'from the server' }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(commandStore.getSnapshot()).toEqual([{ name: 'fresh', description: 'from the server' }]);
    off();
  });

  test('ignores an empty response so the menu never blanks out', () => {
    commandStore.replace([]);
    expect(commandStore.getSnapshot().length).toBeGreaterThan(0);
  });
});
