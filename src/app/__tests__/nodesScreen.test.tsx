/**
 * The Nodes page: the roster with what each machine offers, the claim code with both install
 * lines, and the way into a node (owner, 2026-10-16: "y a toujours pas de menu et de page dans
 * les settings pour les remote la .... fait le je veux tout depuis stp").
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

function render(onOpenNode: (nodeId: string) => void = () => {}): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <NodesScreen onBack={() => {}} onOpenNode={onOpenNode} connected serverOrigin="https://myclaw.kssimi.fr" />,
    );
  });
  return tree!;
}

describe('NodesScreen', () => {
  beforeEach(() => nodesStore.reset());

  it('lists a node with the facts, what it exposes and its description', () => {
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
          exposed: ['read'],
          approval: true,
          description: 'The build box.',
          agent: 'node-web01',
        },
      ],
    });
    const shown = texts(render());
    expect(shown).toContain('web01');
    expect(shown).toContain('linux x64 · admin mode · neras');
    expect(shown).toContain('online now · 1 of 2 tools: read');
    expect(shown).toContain('The build box.');
    expect(shown).toContain('agent node-web01');
    expect(shown).toContain('ask');
  });

  it('a row opens the node', () => {
    nodesStore.onList({
      type: 'nodes.list.result',
      nodes: [{ nodeId: 'n1', name: 'web01', online: false, createdAt: '2026-10-15T10:00:00.000Z', tools: [] }],
    });
    const opened: string[] = [];
    const tree = render(nodeId => opened.push(nodeId));
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Open web01')[0]!.props.onPress();
    });
    expect(opened).toEqual(['n1']);
  });

  it('says so when there is no node yet', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [] });
    expect(texts(render())).toContain('no node');
  });

  it('the claim code generates the command for the chosen platform and mode', () => {
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
    expect(texts(tree)).toContain('ABCD-1234');
    // Linux/macOS as a service is the opening case: the common one on a server.
    expect(texts(tree)).toContain(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node --mode admin",
    );
    expect(texts(tree)).toContain('wss://myclaw.kssimi.fr/node');

    // The user install drops sudo, the same way the installer's --mode does.
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Install as this user')[0]!.props.onPress();
    });
    expect(texts(tree).join('\n')).toContain('| sh -s -- --pair ABCD-1234');

    // Windows swaps the whole line, mode included.
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Windows')[0]!.props.onPress();
    });
    expect(texts(tree).join('\n')).toContain("iwr -UseBasicParsing 'https://myclaw.kssimi.fr/node/install.ps1'");
    expect(texts(tree).join('\n')).toContain('-Mode user');
  });

  it('Copy hands over exactly the line on screen', () => {
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
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Copy the install command')[0]!.props.onPress();
    });
    expect(Clipboard.setString).toHaveBeenCalledWith(
      "curl -fsSL 'https://myclaw.kssimi.fr/node/install.sh' | sudo sh -s -- --pair ABCD-1234 --server wss://myclaw.kssimi.fr/node --mode admin",
    );
    expect(texts(tree)).toContain('Copied');
  });
});
