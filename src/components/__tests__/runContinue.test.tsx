/**
 * Continue, on the signature of a run that stopped -- docs/continue.md on the server.
 *
 * Offered on the thread's last run only, only when that run stopped, failed or was lost, and only
 * while the thread is at rest: anywhere else it would restart something that is not there to
 * restart.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { RunFoot } from '../RunFoot';
import { RunContinueContext, type RunContinueOffer } from '../runContinue';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import type { RunInfo } from '../../core/chat';
import { encodeChatContinue } from '../../core/protocol';

function mount(run: RunInfo, offer: RunContinueOffer): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <RunContinueContext.Provider value={offer}>
          <RunFoot run={run} />
        </RunContinueContext.Provider>
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer.ReactTestRenderer): string =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join('')).join('');

describe('Continue on a run signature', () => {
  test('a stopped last run offers it, and a tap asks for it once', () => {
    const onContinue = jest.fn();
    const tree = mount({ id: 'r2', status: 'aborted', startTs: 0, endTs: 5_000 }, { lastRunId: 'r2', onContinue });
    expect(texts(tree)).toContain('Continue');
    ReactTestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'Continue this run where it stopped' }).props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test('a failed run and a lost one offer it too', () => {
    expect(texts(mount({ id: 'r', status: 'error', startTs: 0, endTs: 1 }, { lastRunId: 'r', onContinue: jest.fn() }))).toContain('Continue');
    expect(texts(mount({ id: 'r', status: 'running', startTs: 0 }, { lastRunId: 'r', onContinue: jest.fn() }))).toContain('Continue');
  });

  test('not on a finished run, not on an older run, not while the thread is busy', () => {
    expect(texts(mount({ id: 'r', status: 'done', startTs: 0, endTs: 1 }, { lastRunId: 'r', onContinue: jest.fn() }))).not.toContain('Continue');
    expect(texts(mount({ id: 'old', status: 'aborted', startTs: 0, endTs: 1 }, { lastRunId: 'r', onContinue: jest.fn() }))).not.toContain('Continue');
    expect(texts(mount({ id: 'r', status: 'aborted', startTs: 0, endTs: 1 }, { lastRunId: 'r' }))).not.toContain('Continue');
  });

  test('the frame names the thread, and the parent only for a sub-agent chat', () => {
    expect(JSON.parse(encodeChatContinue('t1'))).toEqual({ type: 'chat.continue', threadId: 't1' });
    expect(JSON.parse(encodeChatContinue('sub', 'main'))).toEqual({ type: 'chat.continue', threadId: 'sub', parentThreadId: 'main' });
  });
});
