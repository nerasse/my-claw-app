/**
 * The recorder inside the composer it lives in.
 *
 * The unit suite pins the component's own rule. This one pins the rule against its surroundings,
 * because the composer's row changes shape when a take starts: the text field and the spacer are
 * dropped so the take can fill the row. If that reshuffle remounted the recorder, the gesture would
 * die under the thumb on both platforms, which is exactly the failure the unit suite covers for the
 * component alone. A component can be right and still be broken by its parent.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Composer } from '../Composer';
import { deviceBridge } from '../../core/nativeBridge';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const TAKE = { uri: 'file:///cache/voice.m4a', durationMs: 3400, sizeBytes: 13600, mimeType: 'audio/mp4' };

function touch(x: number, y: number): unknown {
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
          previousPageX: x,
          previousPageY: y,
          previousTimeStamp: 0,
        },
      ],
    },
  };
}

/**
 * The microphone's host node, by the hint it alone offers: `Pressable` sets responder props of its
 * own, so the presence of those props says nothing about which node holds the take.
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

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
let recorded: jest.Mock;
let failed: jest.Mock;

function mount(): ReactTestRenderer.ReactTestRenderer {
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        onRecorded={recorded}
        onRecordingError={failed}
      />,
    );
  });
  return tree!;
}

beforeEach(() => {
  jest.useFakeTimers();
  recorded = jest.fn();
  failed = jest.fn();
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

describe('a take inside the composer', () => {
  it('survives the row losing its text field', async () => {
    const mounted = mount();
    const mic = responderNode(mounted);
    const pan = mic.props;

    await ReactTestRenderer.act(async () => {
      pan.onResponderGrant(touch(300, 700));
    });

    // The field and the spacer are gone, the microphone stayed: same host instance, same gesture.
    expect(responderNode(mounted) === mic).toBe(true);
    jest.advanceTimersByTime(800);

    await ReactTestRenderer.act(async () => {
      pan.onResponderRelease(touch(300, 700));
    });

    expect(bridge.stopRecording).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveBeenCalledWith(TAKE);
    expect(failed).not.toHaveBeenCalled();
  });

  it('is not mounted at all once there is text to send instead', () => {
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Composer value="hello" onChange={() => {}} onSend={() => {}} onRecorded={recorded} />,
      );
    });
    // A written message and a microphone compete for the same corner: the text wins it.
    expect(
      tree!.root.findAll(
        n => typeof n.props.accessibilityHint === 'string' && n.props.accessibilityHint.includes('slide left to delete'),
      ),
    ).toHaveLength(0);
  });
});
