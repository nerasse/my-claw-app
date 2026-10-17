import { nodesStore, formatClaimCode, nodeInstallCommands } from '../nodes';

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

  test('both commands name the address this device reaches the server at', () => {
    const commands = nodeInstallCommands('https://myclaw.kssimi.fr', 'ABCD1234');
    expect(commands.server).toBe('wss://myclaw.kssimi.fr/node');
    expect(commands.unix).toBe(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node",
    );
    expect(commands.windows).toContain("iwr -UseBasicParsing 'https://myclaw.kssimi.fr/node/install.ps1'");
    expect(commands.windows).toContain('-Pair ABCD-1234 -Server wss://myclaw.kssimi.fr/node');
  });

  test('a trailing slash does not double up, and http stays http', () => {
    const commands = nodeInstallCommands('http://10.0.0.5:8080/', 'ABCD1234');
    expect(commands.server).toBe('ws://10.0.0.5:8080/node');
    expect(commands.unix).toContain("'http://10.0.0.5:8080/node/install.sh'");
  });
});
