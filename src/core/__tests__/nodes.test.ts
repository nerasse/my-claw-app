import { composeNodeDescription, nodesStore, formatClaimCode, nodeInstallCommand, nodeServerUrl } from '../nodes';

/**
 * The store is the whole client side of the Nodes page: what it holds is what the owner decides
 * on. The frames come from the server, so the tests speak frames rather than internals.
 */
describe('nodesStore', () => {
  beforeEach(() => nodesStore.reset());

  test('the roster is server state: a failed revoke leaves the node on screen', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [
        { nodeId: 'n1', name: 'web01', online: true, createdAt: '2026-10-15T10:00:00.000Z', tools: ['bash'] },
        { nodeId: 'n2', name: 'build', online: false, createdAt: '2026-10-15T11:00:00.000Z', tools: [] },
      ],
    });
    expect(nodesStore.get().status).toBe('ready');
    nodesStore.onRevoked({ type: 'nodes.revoke.result', ok: false, nodeId: 'n2', error: 'unknown node' });
    expect(nodesStore.get().nodes).toHaveLength(2);
    expect(nodesStore.get().error).toBe('unknown node');
  });

  test('a revoked node is named in the notice, not by its id', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [{ nodeId: 'n2', name: 'build', online: false, createdAt: '2026-10-15T11:00:00.000Z', tools: [] }],
    });
    nodesStore.onRevoked({ type: 'nodes.revoke.result', ok: true, nodeId: 'n2' });
    expect(nodesStore.get().notice).toBe('build revoked');
  });

  test('a code becomes the claim on screen; a refusal says why', () => {
    nodesStore.onAdd({ type: 'nodes.add.result', ok: true, code: 'ABCD1234', expiresAt: 1 });
    expect(nodesStore.get().claim).toEqual({ code: 'ABCD1234', expiresAt: 1 });
    expect(nodesStore.get().busy).toBe(false);
    nodesStore.clearClaim();
    expect(nodesStore.get().claim).toBeNull();
    nodesStore.onAdd({ type: 'nodes.add.result', ok: false, error: 'too many attempts' });
    expect(nodesStore.get().claim).toBeNull();
    expect(nodesStore.get().error).toBe('too many attempts');
  });
});

describe('node install lines', () => {
  test('the code is shown the way the installers read it', () => {
    expect(formatClaimCode('ABCD1234')).toBe('ABCD-1234');
    expect(formatClaimCode('SHORT')).toBe('SHORT');
  });

  test('the server line is the address this device reaches the server at', () => {
    expect(nodeServerUrl('https://myclaw.kssimi.fr')).toBe('wss://myclaw.kssimi.fr/node');
    expect(nodeServerUrl('http://10.0.0.5:8080/')).toBe('ws://10.0.0.5:8080/node');
  });

  test('Linux and macOS: sudo for the service, no sudo for the user install', () => {
    const admin = nodeInstallCommand('https://myclaw.kssimi.fr', 'ABCD1234', 'unix', 'admin');
    expect(admin).toBe(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node --mode admin",
    );
    const user = nodeInstallCommand('https://myclaw.kssimi.fr', 'ABCD1234', 'unix', 'user');
    expect(user).toBe(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node --mode user",
    );
  });

  test('Windows: the same two modes, told apart by -Mode', () => {
    const command = nodeInstallCommand('https://myclaw.kssimi.fr', 'ABCD1234', 'windows', 'admin');
    expect(command).toBe(
      "iwr -UseBasicParsing 'https://myclaw.kssimi.fr/node/install.ps1' -OutFile $env:TEMP\\install-node.ps1; & $env:TEMP\\install-node.ps1 -Pair ABCD-1234 -Server wss://myclaw.kssimi.fr/node -Mode admin",
    );
    expect(nodeInstallCommand('https://myclaw.kssimi.fr', 'ABCD1234', 'windows', 'user')).toContain('-Mode user');
  });

  test('a trailing slash does not double up, and http stays http', () => {
    const command = nodeInstallCommand('http://10.0.0.5:8080/', 'ABCD1234', 'unix', 'admin');
    expect(command).toContain("'http://10.0.0.5:8080/node/install.sh'");
    expect(command).toContain('--server ws://10.0.0.5:8080/node');
  });
});

describe('composing a description', () => {
  test('the three answers become one line, empty ones dropped', () => {
    expect(composeNodeDescription({ purpose: 'The build box', reaches: 'the LAN and the staging DB', never: '/etc' })).toBe(
      'The build box. Reaches the LAN and the staging DB. Never touch /etc.',
    );
    expect(composeNodeDescription({ purpose: 'The build box.', reaches: '', never: '' })).toBe('The build box.');
    expect(composeNodeDescription({ purpose: '  two\nlines  ', reaches: '', never: 'the root fs' })).toBe(
      'two lines. Never touch the root fs.',
    );
    expect(composeNodeDescription({ purpose: '', reaches: '', never: '' })).toBe('');
  });
});

describe('presence', () => {
  beforeEach(() => nodesStore.reset());

  test('a node coming or going patches its row in place, without a list round-trip', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [
        { nodeId: 'n1', name: 'web01', online: false, createdAt: '2026-10-15T10:00:00.000Z', tools: [] },
        { nodeId: 'n2', name: 'build', online: true, createdAt: '2026-10-15T11:00:00.000Z', tools: [] },
      ],
    });
    nodesStore.onPresence({ type: 'nodes.presence', nodeId: 'n1', online: true });
    nodesStore.onPresence({ type: 'nodes.presence', nodeId: 'n2', online: false });
    expect(nodesStore.get().nodes.map(node => [node.nodeId, node.online])).toEqual([
      ['n1', true],
      ['n2', false],
    ]);
  });

  test('before the list is known, presence is ignored rather than inventing a row', () => {
    nodesStore.onPresence({ type: 'nodes.presence', nodeId: 'n1', online: true });
    expect(nodesStore.get().nodes).toEqual([]);
  });
});
