import { readableCall } from '../approvalGrants';

describe('readableCall', () => {
  it('shows a single string argument as itself, a command as the command', () => {
    expect(readableCall('{"command":"df -h"}')).toBe('df -h');
    expect(readableCall('{"path":"/etc/hosts"}')).toBe('/etc/hosts');
  });

  it('names the arguments when there are several, and never falls over on bad JSON', () => {
    expect(readableCall('{"mode":"r","path":"/a"}')).toBe('mode: r · path: /a');
    expect(readableCall('not json')).toBe('not json');
  });
});
