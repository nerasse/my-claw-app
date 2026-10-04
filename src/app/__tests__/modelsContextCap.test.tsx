/**
 * The global context ceiling, on the Models page beside the other defaults every agent falls back
 * to. It had no place in the app: the config held it, and a value written there looked ignored
 * because every tag candidate pinned its own (owner, 2026-10-04). The row says what is in force and
 * that an agent or tag cap outranks it.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ModelsScreen, contextCapText } from '../ModelsScreen';
import type { AgentsConfigResultFrame } from '../../core/protocol';

jest.mock('../../core/connection', () => ({
  connection: { send: jest.fn(() => Promise.resolve()) },
}));

function config(contextCap: AgentsConfigResultFrame['contextCap']): AgentsConfigResultFrame {
  return {
    type: 'agents.config.result',
    defaultModel: 'tag:Cheap',
    defaultEffort: '',
    effortLevels: [],
    fallback: '',
    ...(contextCap ? { contextCap } : {}),
    providers: [],
    agents: [],
  };
}

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;
function render(frame: AgentsConfigResultFrame, onOpenContextCap = jest.fn()): ReactTestRenderer.ReactTestRenderer {
  ReactTestRenderer.act(() => {
    mounted = ReactTestRenderer.create(
      <ModelsScreen
        config={frame}
        providers={[]}
        error={null}
        onBack={() => {}}
        onNewProvider={() => {}}
        onOpenProvider={() => {}}
        onOpenAccount={() => {}}
        onOpenDefaultModel={() => {}}
        onOpenFallback={() => {}}
        onSetRetry={() => {}}
        onOpenContextCap={onOpenContextCap}
        onOpenTags={() => {}}
      />,
    );
  });
  return mounted!;
}

afterEach(() => {
  if (mounted) ReactTestRenderer.act(() => mounted?.unmount());
  mounted = null;
});

describe('contextCapText', () => {
  test('a value the config holds is shown as it is', () => {
    expect(contextCapText({ value: 256_000, default: 512_000 })).toBe('256k tokens · an agent or tag cap outranks it');
  });

  test('nothing in the config shows the server default, and says it is one', () => {
    expect(contextCapText({ default: 512_000 })).toBe('512k tokens · server default · an agent or tag cap outranks it');
  });

  test('0 reads as no ceiling, not as a ceiling of zero', () => {
    expect(contextCapText({ value: 0, default: 512_000 })).toBe('no ceiling: every model gets its full window · an agent or tag cap outranks it');
  });
});

describe('the Context cap row', () => {
  test('sits with the defaults and opens its editor', () => {
    const open = jest.fn();
    const tree = render(config({ value: 200_000, default: 512_000 }), open);
    const texts = tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
    expect(texts).toContain('Context cap');
    expect(texts).toContain('200k tokens · an agent or tag cap outranks it');

    ReactTestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'Context cap' }).props.onPress());
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('is not drawn for a server that does not send the cap', () => {
    const tree = render(config(undefined));
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Context cap' })).toHaveLength(0);
  });
});
