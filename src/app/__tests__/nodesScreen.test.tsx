/**
 * The Nodes page: the roster with what each machine offers, the claim code with both install
 * lines, and the revocation (owner, 2026-10-16: "y a toujours pas de menu et de page dans les
 * settings pour les remote la .... fait le je veux tout depuis stp").
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { NodesScreen } from '../NodesScreen';
import { nodesStore } from '../../core/nodes';
import Clipboard from '@react-native-clipboard/clipboard';

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: { setString: jest.fn() },
}));

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

function byLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(
    node => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

function render(): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <NodesScreen onBack={() => {}} connected serverOrigin="https://myclaw.kssimi.fr" />,
    );
  });
  return tree!;
}

describe('NodesScreen', () => {
  beforeEach(() => nodesStore.reset());

  it('lists a node with the facts and tools it announced', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [
        {
          nodeId: 'n1',
          name: 'web01',
          online: true,
          createdAt: '2026-10-15T10:00:00.000Z',
          os: 'linux',
          arch: 'x64',
          user: 'neras',
          mode: 'admin',
          version: '0.2.0',
          tools: ['bash', 'read'],
          agent: 'node-web01',
        },
      ],
    });
    const tree = render();
    const shown = texts(tree);
    expect(shown).toContain('web01');
    expect(shown).toContain('linux x64 · admin mode · neras');
    expect(shown).toContain('online now · 2 tools: bash, read');
    expect(shown).toContain('agent node-web01');
    expect(byLabel(tree, 'Revoke web01')).toHaveLength(1);
  });

  it('says so when there is no node yet', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [] });
    expect(texts(render())).toContain('no node');
  });

  it('the claim code comes with both install lines, and Copy hands them over', () => {
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Add a node')[0]!.props.onPress();
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Get a pairing code')[0]!.props.onPress();
    });
    ReactTestRenderer.act(() => {
      nodesStore.onAdd({ type: 'nodes.add.result', ok: true, code: 'ABCD1234', expiresAt: Date.now() + 600_000 });
    });
    const shown = texts(tree);
    expect(shown).toContain('ABCD-1234');
    expect(shown).toContain(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node",
    );
    expect(shown.join('\n')).toContain("iwr -UseBasicParsing 'https://myclaw.kssimi.fr/node/install.ps1'");
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Copy the Linux and macOS command')[0]!.props.onPress();
    });
    expect(Clipboard.setString).toHaveBeenCalledWith(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node",
    );
  });

  it('revoking asks first, and the sheet names what goes with it', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [{ nodeId: 'n1', name: 'web01', online: false, createdAt: '2026-10-15T10:00:00.000Z', tools: [] }],
    });
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Revoke web01')[0]!.props.onPress();
    });
    expect(texts(tree).join('\n')).toContain('Revoke "web01"?');
    // The sheet's own confirm is what sends the frame; the store test covers the answer.
    expect(byLabel(tree, 'Revoke')).toHaveLength(1);
  });
});
