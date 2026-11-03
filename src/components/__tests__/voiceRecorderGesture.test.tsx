/**
 * The recorder's gesture, and the one rule that governs it.
 *
 * The node that carries `panHandlers` must be the same node in every phase. Giving the handlers to
 * a different element when a take starts unregisters the old responder node: react-native-web
 * terminates the responder still under the finger, and the previous revision answered a
 * termination with `keep()`. Every press then ended the take 0 ms after it began.
 *
 * These tests drive the handlers the rendered tree actually carries, which is what makes them able
 * to catch a handler that moved to another node or a termination that commits: a test that called
 * the callbacks directly would pass on the broken revision.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Animated, View } from 'react-native';
import { VoiceRecorder } from '../VoiceRecorder';
import { deviceBridge } from '../../core/nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

/** A reply long enough to be a take: the component only rejects 'too-short'. */
const TAKE = { uri: 'file:///cache/voice.m4a', durationMs: 3400, sizeBytes: 13600, mimeType: 'audio/mp4' };

interface Handlers {
  onResponderGrant: (event: unknown) => void;
  onResponderMove: (event: unknown) => void;
  onResponderRelease: (event: unknown) => void;
  onResponderTerminate: (event: unknown) => void;
  onResponderTerminationRequest: (event: unknown) => boolean;
}

/**
 * The responder event PanResponder reads. Coordinates are absolute, and the gesture state it keeps
 * diffs consecutive positions: one touch, moved by `dx`/`dy` since the grant.
 */
function touch(x: number, y: number, previous?: { x: number; y: number }): unknown {
  return {
    nativeEvent: { touches: [{ pageX: x, pageY: y }] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: x + y + 1,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: x + y + 1,
          previousPageX: previous?.x ?? x,
          previousPageY: previous?.y ?? y,
          previousTimeStamp: 0,
        },
      ],
    },
  };
}

/**
 * The host node carrying the recorder's responder config, found by the hint the recorder owns.
 *
 * Composite wrappers above it repeat the props, and `Pressable` sets a responder config of its own,
 * so neither the props nor the count identifies it. The hint does: the recorder is the only node
 * that offers this gesture.
 */
function responderNode(tree: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const hosts = tree.root.findAll(
    node =>
      typeof node.type === 'string' &&
      typeof node.props.onStartShouldSetResponder === 'function' &&
      typeof node.props.accessibilityHint === 'string' &&
      node.props.accessibilityHint.includes('slide left to delete'),
  );
  expect(hosts).toHaveLength(1);
  return hosts[0]!;
}

/**
 * Whether the node under the gesture survived a re-render, compared as a boolean on purpose: jest
 * renders a diff of the two fiber trees when an identity assertion fails, and serialising a live
 * renderer that way exhausts the heap instead of reporting the failure.
 */
function sameNode(
  before: ReactTestRenderer.ReactTestInstance,
  tree: ReactTestRenderer.ReactTestRenderer,
): boolean {
  return before === responderNode(tree);
}

function handlers(tree: ReactTestRenderer.ReactTestRenderer): Handlers {
  const { props } = responderNode(tree);
  return {
    onResponderGrant: props.onResponderGrant,
    onResponderMove: props.onResponderMove,
    onResponderRelease: props.onResponderRelease,
    onResponderTerminate: props.onResponderTerminate,
    onResponderTerminationRequest: props.onResponderTerminationRequest,
  };
}

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
let recorded: jest.Mock;
let failed: jest.Mock;
let active: jest.Mock;

function mount(): ReactTestRenderer.ReactTestRenderer {
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <VoiceRecorder onRecorded={recorded} onError={failed} onActiveChange={active} />,
    );
  });
  return tree!;
}

/** A hold: grant, a frame of movement, and the take is up. */
async function hold(): Promise<Handlers> {
  const mounted = mount();
  const pan = handlers(mounted);
  await ReactTestRenderer.act(async () => {
    pan.onResponderGrant(touch(300, 700));
  });
  return pan;
}

beforeEach(() => {
  jest.useFakeTimers();
  recorded = jest.fn();
  failed = jest.fn();
  active = jest.fn();
  bridge.startRecording.mockResolvedValue('recording');
  bridge.stopRecording.mockResolvedValue(TAKE);
  bridge.cancelRecording.mockResolvedValue(undefined);
});

afterEach(() => {
  if (tree) ReactTestRenderer.act(() => tree?.unmount());
  tree = null;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('the responder node', () => {
  it('is the same host instance before and during a take', async () => {
    const mounted = mount();
    const idle = responderNode(mounted);
    const pan = handlers(mounted);
    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
    });

    // Instance identity, not callback identity: the callbacks are memoised either way, while the
    // registered node is what react-native-web unregisters when the props move elsewhere.
    expect(sameNode(idle, mounted)).toBe(true);
    expect(active).toHaveBeenLastCalledWith(true);
    expect(bridge.startRecording).toHaveBeenCalledTimes(1);
  });

  it('keeps a take alive when a re-render lands mid-gesture', async () => {
    const mounted = mount();
    const idle = responderNode(mounted);
    const pan = handlers(mounted);
    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
    });
    // The composer re-renders on every keystroke, layout change and punctuation of the agent's
    // reply: a take must survive all of them.
    await ReactTestRenderer.act(async () => {
      mounted.update(
        <VoiceRecorder onRecorded={recorded} onError={failed} onActiveChange={active} hero />,
      );
    });

    expect(sameNode(idle, mounted)).toBe(true);
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    expect(bridge.stopRecording).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveBeenCalledWith(TAKE);
  });
});

describe('termination', () => {
  it('refuses to hand the gesture over while a take is running', async () => {
    const pan = await hold();
    expect(pan.onResponderTerminationRequest(touch(300, 700))).toBe(false);
  });

  it('does not spend the take on a termination: it throws it away', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderTerminate(touch(300, 700));
    });

    expect(bridge.stopRecording).not.toHaveBeenCalled();
    expect(bridge.cancelRecording).toHaveBeenCalledTimes(1);
    expect(recorded).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(active).toHaveBeenLastCalledWith(false);
  });

  it('reports nothing when the gesture is taken before the microphone is up', async () => {
    const mounted = mount();
    const pan = handlers(mounted);
    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
      pan.onResponderTerminate(touch(300, 700));
    });

    // The tap is dropped in silence: no take, no error line.
    expect(bridge.stopRecording).not.toHaveBeenCalled();
    expect(recorded).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it('leaves a hands-free take running', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      // Up past the lock distance, clearly more up than sideways.
      pan.onResponderMove(touch(302, 600, { x: 300, y: 700 }));
    });
    await ReactTestRenderer.act(async () => {
      pan.onResponderTerminate(touch(302, 600));
    });

    expect(bridge.cancelRecording).not.toHaveBeenCalled();
    expect(bridge.stopRecording).not.toHaveBeenCalled();
    expect(active).toHaveBeenLastCalledWith(true);
  });
});

describe('release', () => {
  it('keeps the take on a hold', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    expect(bridge.stopRecording).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveBeenCalledWith(TAKE);
    expect(failed).not.toHaveBeenCalled();
  });

  it('refuses a second take while the first is still stopping', async () => {
    const pan = await hold();
    let finish = (_value: typeof TAKE): void => {};
    bridge.stopRecording.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    // A quick second press: the recorder is still stopping and would refuse the start anyway.
    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
    });
    expect(bridge.startRecording).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      finish(TAKE);
    });
    // And the press that arrived during the stop left nothing armed behind it.
    expect(bridge.startRecording).toHaveBeenCalledTimes(1);
  });

  it('drops a take too short to be one, without an error', async () => {
    bridge.stopRecording.mockResolvedValueOnce({ ...TAKE, durationMs: 200 });
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    expect(recorded).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(active).toHaveBeenLastCalledWith(false);
  });

  it('reports a genuine failure', async () => {
    bridge.stopRecording.mockRejectedValueOnce(new Error('gone'));
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    expect(failed).toHaveBeenCalledWith('Recording failed.');
    expect(recorded).not.toHaveBeenCalled();
  });
});

describe('sliding left', () => {
  it('throws the take away when released past the threshold', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderMove(touch(180, 700, { x: 300, y: 700 }));
    });
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(180, 700));
    });

    expect(bridge.cancelRecording).toHaveBeenCalledTimes(1);
    expect(bridge.stopRecording).not.toHaveBeenCalled();
    expect(recorded).not.toHaveBeenCalled();
  });

  it('keeps the take when released short of the threshold', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      pan.onResponderMove(touch(260, 700, { x: 300, y: 700 }));
    });
    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(260, 700));
    });

    expect(bridge.cancelRecording).not.toHaveBeenCalled();
    expect(recorded).toHaveBeenCalledWith(TAKE);
  });

  it('does not lock on a long left drag', async () => {
    const pan = await hold();
    await ReactTestRenderer.act(async () => {
      // 60 pt up, 150 pt left: a left drag that drifts is not a request for hands-free.
      pan.onResponderMove(touch(150, 640, { x: 300, y: 700 }));
    });
    await ReactTestRenderer.act(async () => {
      pan.onResponderTerminate(touch(150, 640));
    });

    // Still holding: the take is discarded by the termination rather than kept by a false lock.
    expect(bridge.stopRecording).not.toHaveBeenCalled();
    expect(recorded).not.toHaveBeenCalled();
  });
});

describe('what a take shows', () => {
  it('replaces the idle microphone with the take, on the same node', async () => {
    const mounted = mount();
    const idle = responderNode(mounted);
    const pan = handlers(mounted);
    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
    });

    // The very same host instance still owns the gesture, and it now hosts the take.
    expect(sameNode(idle, mounted)).toBe(true);
    expect(mounted.root.findAllByType(Animated.View).length).toBeGreaterThan(1);
    expect(mounted.root.findAllByType(View).length).toBeGreaterThan(1);
  });
});
