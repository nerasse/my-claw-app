/**
 * One node's page: its name, the description its agent carries, and what it may run there. The
 * switches are server state -- every one of them sends a frame, and the store's answer is what
 * the screen draws (owner, 2026-10-17: "Go sur la V2 tout de suite").
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { NodeScreen } from '../NodeScreen';
import { nodesStore } from '../../core/nodes';

const NODE = {
  nodeId: 'n1',
  name: 'web01',
  online: true,
  createdAt: '2026-10-15T10:00:00.000Z',
  os: 'linux',
  arch: 'x64',
  hostname: 'web01.lan',
  user: 'neras',
  mode: 'admin' as const,
  version: '0.2.0',
  tools: ['bash', 'read'],
  exposed: ['read'],
  description: 'The build box.',
  agent: 'node-web01',
};

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
}

function byLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll(node => node.props?.accessibilityLabel === label);
}

function render(nodeId = 'n1'): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<NodeScreen nodeId={nodeId} onBack={() => {}} connected />);
  });
  return tree!;
}

describe('NodeScreen', () => {
  beforeEach(() => nodesStore.reset());

  afterEach(() => jest.restoreAllMocks());

  it('draws the machine, what it exposes and what is left off', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const tree = render();
    const shown = texts(tree);
    expect(shown).toContain('web01');
    expect(byLabel(tree, 'Node description')[0]!.props.value).toBe('The build box.');
    expect(shown).toContain('agent node-web01');
    expect(shown).toContain('bash');
    expect(shown).toContain('read');
    expect(shown).toContain('1 of 2 exposed');
    expect(shown).toContain('host web01.lan');
    expect(shown).toContain('user neras · admin mode');
    expect(shown).toContain('node client 0.2.0');
  });

  it('the name and the description are seeded, and Save sends what changed', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const rename = jest.spyOn(nodesStore, 'rename').mockImplementation(() => {});
    const describe = jest.spyOn(nodesStore, 'describe').mockImplementation(() => {});
    const tree = render();
    const nameField = byLabel(tree, 'Node name')[0]!;
    expect(nameField.props.value).toBe('web01');
    ReactTestRenderer.act(() => {
      nameField.props.onChangeText('prod web');
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Save the name')[0]!.props.onPress();
    });
    expect(rename).toHaveBeenCalledWith('n1', 'prod web');

    const descriptionField = byLabel(tree, 'Node description')[0]!;
    expect(descriptionField.props.value).toBe('The build box.');
    ReactTestRenderer.act(() => {
      descriptionField.props.onChangeText('The build box. Never touch /etc.');
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Save the description')[0]!.props.onPress();
    });
    expect(describe).toHaveBeenCalledWith('n1', 'The build box. Never touch /etc.');
  });

  it('turning a tool off sends the list it leaves, never a local guess', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const setAccess = jest.spyOn(nodesStore, 'setAccess').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Expose read')[0]!.props.onValueChange(false);
    });
    expect(setAccess).toHaveBeenCalledWith('n1', { tools: [] });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Expose bash')[0]!.props.onValueChange(true);
    });
    // Everything on again removes the narrowing, so a tool the machine adds later is exposed too.
    expect(setAccess).toHaveBeenLastCalledWith('n1', { tools: null });
  });

  it('the approval switch rides the same frame', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const setAccess = jest.spyOn(nodesStore, 'setAccess').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Ask before running anything')[0]!.props.onValueChange(true);
    });
    expect(setAccess).toHaveBeenCalledWith('n1', { approval: true });
  });

  it('revoking asks first, and the sheet names what goes with it', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const revoke = jest.spyOn(nodesStore, 'revoke').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Revoke this node')[0]!.props.onPress();
    });
    expect(texts(tree).join('\n')).toContain('Revoke "web01"?');
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Revoke')[0]!.props.onPress();
    });
    expect(revoke).toHaveBeenCalledWith('n1');
  });

  it('a node that is gone says so instead of drawing an empty page', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [] });
    expect(texts(render())).toContain('This node is no longer paired.');
  });
});

describe('NodeScreen, the rest of the page', () => {
  beforeEach(() => nodesStore.reset());
  afterEach(() => jest.restoreAllMocks());

  it('the Enabled switch is on unless the record says off, and turning it off sends the frame', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const setAccess = jest.spyOn(nodesStore, 'setAccess').mockImplementation(() => {});
    const tree = render();
    const toggle = byLabel(tree, 'Enabled')[0]!;
    expect(toggle.props.value).toBe(true);
    ReactTestRenderer.act(() => {
      toggle.props.onValueChange(false);
    });
    expect(setAccess).toHaveBeenCalledWith('n1', { disabled: true });
  });

  it('a disabled node reads off, and the switch says so', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [{ ...NODE, disabled: true }] });
    const tree = render();
    expect(byLabel(tree, 'Enabled')[0]!.props.value).toBe(false);
    expect(texts(tree).join('\n')).toContain('its agent is off');
  });

  it('Update now is offered only for a connected node behind the server', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const behind = render();
    expect(byLabel(behind, 'Update now')).toHaveLength(0);
    ReactTestRenderer.act(() => {
      behind.update(<NodeScreen nodeId="n1" onBack={() => {}} connected serverVersion="0.7.200" />);
    });
    const update = jest.spyOn(nodesStore, 'update').mockImplementation(() => {});
    ReactTestRenderer.act(() => {
      byLabel(behind, 'Update now')[0]!.props.onPress();
    });
    expect(update).toHaveBeenCalledWith('n1');
  });

  it('the guided fields compose into the description, which stays editable', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [NODE] });
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Guided fields')[0]!.props.onPress();
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'What it is for')[0]!.props.onChangeText('The build box');
      byLabel(tree, 'What it reaches')[0]!.props.onChangeText('the staging DB');
      byLabel(tree, 'What must never be touched')[0]!.props.onChangeText('/etc');
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Compose the description')[0]!.props.onPress();
    });
    expect(byLabel(tree, 'Node description')[0]!.props.value).toBe(
      'The build box. Reaches the staging DB. Never touch /etc.',
    );
  });
});

describe('NodeScreen, while the roster is loading', () => {
  beforeEach(() => nodesStore.reset());

  it('says loading, not "no longer paired", before the list arrives', () => {
    expect(texts(render())).toContain('loading');
  });
});

describe('NodeScreen, MCP servers', () => {
  const WITH_MCP = {
    ...NODE,
    mcp: [
      { name: 'godot', transport: 'stdio', target: 'godot-mcp --headless', ok: true, tools: 3, config: { transport: 'stdio' as const, command: 'godot-mcp', args: ['--headless'] } },
      { name: 'blender', transport: 'http', target: 'http://127.0.0.1:8000/mcp', ok: false, tools: 0, error: 'refused', config: { transport: 'http' as const, url: 'http://127.0.0.1:8000/mcp' } },
      { name: 'local', transport: 'stdio', target: '', external: true, ok: true, tools: 1 },
    ],
  };

  beforeEach(() => nodesStore.reset());
  afterEach(() => jest.restoreAllMocks());

  it('lists the servers with what came up, and marks the ones the machine runs alone', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [WITH_MCP] });
    const shown = texts(render());
    expect(shown).toContain('godot');
    expect(shown).toContain('stdio · godot-mcp --headless');
    expect(shown).toContain('3 tools');
    expect(shown).toContain('failed: refused');
    expect(shown).toContain('not managed here');
    // Nothing to edit or remove for a server this server did not configure.
    expect(byLabel(render(), 'Edit local')).toHaveLength(0);
  });

  it('adds a stdio server: the whole list goes back, with the new entry', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [WITH_MCP] });
    const setMcp = jest.spyOn(nodesStore, 'setMcp').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Add an MCP server')[0]!.props.onPress();
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'MCP name')[0]!.props.onChangeText('unity');
      byLabel(tree, 'MCP command')[0]!.props.onChangeText('unity-mcp');
      byLabel(tree, 'MCP arguments')[0]!.props.onChangeText('--port 9000');
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Save the MCP server')[0]!.props.onPress();
    });
    expect(setMcp).toHaveBeenCalledWith('n1', {
      godot: { transport: 'stdio', command: 'godot-mcp', args: ['--headless'] },
      blender: { transport: 'http', url: 'http://127.0.0.1:8000/mcp' },
      unity: { transport: 'stdio', command: 'unity-mcp', args: ['--port', '9000'] },
    });
  });

  it('editing an http server keeps its transport', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [WITH_MCP] });
    const setMcp = jest.spyOn(nodesStore, 'setMcp').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Edit blender')[0]!.props.onPress();
    });
    expect(byLabel(tree, 'MCP URL')[0]!.props.value).toBe('http://127.0.0.1:8000/mcp');
    ReactTestRenderer.act(() => {
      byLabel(tree, 'MCP URL')[0]!.props.onChangeText('http://127.0.0.1:8100/mcp');
    });
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Save the MCP server')[0]!.props.onPress();
    });
    expect(setMcp).toHaveBeenCalledWith('n1', {
      godot: { transport: 'stdio', command: 'godot-mcp', args: ['--headless'] },
      blender: { transport: 'http', url: 'http://127.0.0.1:8100/mcp' },
    });
  });

  it('removing asks first, then sends the list without it', () => {
    nodesStore.onList({ type: 'nodes.list.result', nodes: [WITH_MCP] });
    const setMcp = jest.spyOn(nodesStore, 'setMcp').mockImplementation(() => {});
    const tree = render();
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Remove godot')[0]!.props.onPress();
    });
    expect(texts(tree).join('\n')).toContain('Stop "godot"');
    ReactTestRenderer.act(() => {
      byLabel(tree, 'Remove')[0]!.props.onPress();
    });
    expect(setMcp).toHaveBeenCalledWith('n1', {
      blender: { transport: 'http', url: 'http://127.0.0.1:8000/mcp' },
    });
  });
});
