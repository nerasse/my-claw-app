/**
 * One bad row is one bad row.
 *
 * The screen has an ErrorBoundary, and it is the wrong granularity: a bubble that throws took the
 * whole conversation with it and left the owner on a crash page, unable to read the forty messages
 * that render perfectly well. And since the item lives in the store, reopening the thread hit the
 * same one again.
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RowBoundary } from '../RowBoundary';
import { recordDiag, resetDiagnosticsForTest } from '../../core/diagnostics';

jest.mock('../../core/diagnostics', () => ({
  recordDiag: jest.fn(),
  resetDiagnosticsForTest: jest.fn(),
}));

function Explodes(): React.ReactElement {
  throw new Error('no args on this card');
}

function textOf(tree: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

describe('RowBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDiagnosticsForTest();
    // React logs the caught error; the test is about what the tree does, not about the noise.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
  });

  it('replaces the row that threw and leaves the rest of the list alone', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <>
          <RowBoundary itemId="a"><Text>first message</Text></RowBoundary>
          <RowBoundary itemId="b"><Explodes /></RowBoundary>
          <RowBoundary itemId="c"><Text>third message</Text></RowBoundary>
        </>,
      );
    });

    const rendered = textOf(tree);
    expect(rendered).toContain('first message');
    expect(rendered).toContain('third message');
    expect(rendered).toContain('This message could not be displayed.');
  });

  it('names the row in the report, so it can be found without symbolicating a stack', () => {
    act(() => {
      TestRenderer.create(
        <RowBoundary itemId="t-42"><Explodes /></RowBoundary>,
      );
    });

    expect(recordDiag).toHaveBeenCalledTimes(1);
    const report = (recordDiag as jest.Mock).mock.calls[0][0];
    expect(report.kind).toBe('render');
    expect(report.message).toContain('t-42');
    expect(report.message).toContain('no args on this card');
  });
});
