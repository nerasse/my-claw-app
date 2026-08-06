/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import { deviceBridge } from '../src/core/nativeBridge';
import { chatStore } from '../src/core/chat';
import { voicePlayback } from '../src/core/voice';
import {
  renderApp,
  labelsOf,
  press,
  unmount,
  waitFor,
  type Tree,
} from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-voice';

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function chatSends(): Array<Record<string, unknown>> {
  return sentFrames().filter(frame => frame.type === 'chat.send');
}

/**
 * A finger, as PanResponder sees one.
 *
 * The gestureState handed to the callbacks is computed from the touch history, not from anything
 * a caller passes in, so a test that invents dx/dy measures nothing. This builds the same touch
 * bank the platform would, which means the thresholds under test are the real ones.
 */
const TOUCH_ID = 1;

function finger(tree: Tree) {
  const start = { x: 300, y: 700 };
  let current = { ...start };
  let previous = { ...start };
  let startedAt = 1000;
  let previousAt = startedAt;
  let now = startedAt;

  const event = () => ({
    nativeEvent: {
      changedTouches: [],
      identifier: TOUCH_ID,
      locationX: 0,
      locationY: 0,
      pageX: current.x,
      pageY: current.y,
      target: 1,
      timestamp: now,
      touches: [],
    },
    touchHistory: {
      touchBank: [
        undefined,
        {
          touchActive: true,
          startPageX: start.x,
          startPageY: start.y,
          startTimeStamp: startedAt,
          currentPageX: current.x,
          currentPageY: current.y,
          currentTimeStamp: now,
          previousPageX: previous.x,
          previousPageY: previous.y,
          previousTimeStamp: previousAt,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: TOUCH_ID,
      mostRecentTimeStamp: now,
    },
  });

  const step = (dx: number, dy: number) => {
    previous = { ...current };
    previousAt = now;
    now += 16;
    current = { x: start.x + dx, y: start.y + dy };
  };

  const handlers = (label: string) => {
    const node = tree.root.find(
      candidate =>
        candidate.props.accessibilityLabel === label &&
        typeof candidate.props.onResponderGrant === 'function',
    );
    return node.props as {
      onResponderGrant: (event: unknown) => void;
      onResponderMove: (event: unknown) => void;
      onResponderRelease: (event: unknown) => void;
    };
  };

  return {
    async down(): Promise<void> {
      await ReactTestRenderer.act(async () => {
        handlers('Record voice message').onResponderGrant(event());
      });
      await waitFor(() => labelsOf(tree).includes('Recording, release to send'));
    },
    async move(dx: number, dy: number): Promise<void> {
      step(dx, dy);
      await ReactTestRenderer.act(async () => {
        handlers('Recording, release to send').onResponderMove(event());
      });
    },
    async up(label = 'Recording, release to send'): Promise<void> {
      await ReactTestRenderer.act(async () => {
        handlers(label).onResponderRelease(event());
      });
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Both stores outlive a render tree, so without this a case inherits the bubbles of the last.
  chatStore.clearAll();
  voicePlayback.reset();
  // The preset boots as iOS, where the microphone prompt is the platform's job and the
  // permission branch under test never runs.
  Platform.OS = 'android';
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  bridge.sendMessage.mockResolvedValue(true);
  bridge.startRecording.mockResolvedValue('file:///cache/voice.m4a');
  bridge.stopRecording.mockResolvedValue({
    uri: 'file:///cache/voice.m4a',
    durationMs: 3400,
    sizeBytes: 13600,
  });
  bridge.uploadFile.mockResolvedValue({
    status: 200,
    body: JSON.stringify({ id: 'voice-1' }),
  });
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
});

test('holding the mic records, and releasing sends the note as a voice attachment', async () => {
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  expect(bridge.startRecording).toHaveBeenCalled();

  await touch.up();
  await waitFor(() => chatSends().length > 0);

  const [uri, url, filename, type, threadId] = bridge.uploadFile.mock.calls[0];
  expect(uri).toBe('file:///cache/voice.m4a');
  expect(url).toContain('/media?device=dev-test');
  expect(filename).toMatch(/^voice-.*\.m4a$/);
  expect(type).toBe('audio');
  expect(threadId).toBe(THREAD);

  // audioAsVoice is what makes the server apply the configured language instead of guessing.
  expect(chatSends()[0]).toMatchObject({
    type: 'chat.send',
    text: '',
    attachments: [{ id: 'voice-1', type: 'audio', audioAsVoice: true, durationMs: 3400 }],
  });

  await unmount(tree);
});

test('sliding left discards the take instead of sending it', async () => {
  const tree = await renderApp();


  const touch = finger(tree);
  await touch.down();
  await touch.move(-120, 0);
  await touch.up();

  expect(bridge.cancelRecording).toHaveBeenCalled();
  expect(bridge.stopRecording).not.toHaveBeenCalled();
  expect(bridge.uploadFile).not.toHaveBeenCalled();
  // The composer is back, so the gesture left nothing behind.
  await waitFor(() => labelsOf(tree).includes('Record voice message'));

  await unmount(tree);
});

test('sliding up locks the recording, so it survives the finger leaving', async () => {
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  await touch.move(0, -110);
  await waitFor(() => labelsOf(tree).includes('Send voice message'));

  // Releasing while locked must not end the take: that is the whole point of locking.
  await touch.up('Send voice message');
  expect(bridge.stopRecording).not.toHaveBeenCalled();

  await press(tree, 'Send voice message');
  await waitFor(() => chatSends().length > 0);
  expect(chatSends()[0].attachments).toEqual([
    { id: 'voice-1', type: 'audio', audioAsVoice: true, durationMs: 3400 },
  ]);

  await unmount(tree);
});

test('a tap too short to hold audio is dropped rather than uploaded', async () => {
  bridge.stopRecording.mockResolvedValue({
    uri: 'file:///cache/voice.m4a',
    durationMs: 120,
    sizeBytes: 400,
  });
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  await touch.up();

  await waitFor(() => labelsOf(tree).includes('Record voice message'));
  expect(bridge.uploadFile).not.toHaveBeenCalled();
  expect(chatSends()).toHaveLength(0);

  await unmount(tree);
});

test('a refused microphone permission never starts a recording', async () => {
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  const tree = await renderApp();

  await ReactTestRenderer.act(async () => {
    const node = tree.root.find(
      candidate =>
        candidate.props.accessibilityLabel === 'Record voice message' &&
        typeof candidate.props.onResponderGrant === 'function',
    );
    node.props.onResponderGrant({ nativeEvent: {}, touchHistory: { touchBank: [] } });
  });

  expect(bridge.startRecording).not.toHaveBeenCalled();
  expect(labelsOf(tree)).toContain('Record voice message');

  await unmount(tree);
});

test('the transcript lands inside the voice bubble, not in a message of its own', async () => {
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  await touch.up();
  await waitFor(() => chatSends().length > 0);
  const sent = chatSends()[0];

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'chat.transcript',
        threadId: THREAD,
        replyToId: sent.id,
        text: 'rappelle-moi demain',
      }),
    });
  });

  await waitFor(() =>
    tree.root
      .findAll(node => typeof node.props.children === 'string')
      .some(node => node.props.children === 'rappelle-moi demain'),
  );

  // One bubble carries both the recording and its words.
  expect(labelsOf(tree)).toContain('Play voice message');

  await unmount(tree);
});

test('a voice bubble plays, pauses, and never lets two notes run at once', async () => {
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  await touch.up();
  await waitFor(() => labelsOf(tree).includes('Play voice message'));

  await press(tree, 'Play voice message');
  expect(bridge.playAudio).toHaveBeenCalledWith('file:///cache/voice.m4a');

  await waitFor(() => labelsOf(tree).includes('Pause voice message'));
  await press(tree, 'Pause voice message');
  expect(bridge.pausePlayback).toHaveBeenCalled();

  await unmount(tree);
});

test('the settings expose the transcription engine and say where the audio goes', async () => {
  const tree = await renderApp();
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');

  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'voice.mode.get'),
  );

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'voice.mode.result',
        mode: 'auto',
        resolved: 'cloud',
        cloudAvailable: true,
      }),
    });
  });

  await waitFor(() => labelsOf(tree).includes('Transcription Local'));
  await press(tree, 'Transcription Local');

  expect(sentFrames()).toContainEqual({ type: 'voice.mode.set', mode: 'local' });

  await unmount(tree);
});

/**
 * Describes a voice bubble by what it puts on screen. Two renderings that agree here look the
 * same to the eye, which is the only claim the alignment makes.
 */
function bubbleShape(tree: Tree) {
  const labels = labelsOf(tree);
  const strings = tree.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => String(node.props.children));
  return {
    hasPlayer: labels.includes('Play voice message'),
    // 0:00 would mean the duration never made it across.
    duration: strings.find(text => /^\d+:\d\d$/.test(text)),
    transcript: strings.find(text => text === 'rappelle-moi demain'),
    // The storage marker must never reach a bubble.
    marker: strings.find(text => text.includes('[Audio]')),
  };
}

test('a reopened conversation renders a voice note exactly like the live one', async () => {
  const tree = await renderApp();

  const touch = finger(tree);
  await touch.down();
  await touch.up();
  await waitFor(() => chatSends().length > 0);
  const sent = chatSends()[0];

  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'chat.transcript',
        threadId: THREAD,
        replyToId: sent.id,
        text: 'rappelle-moi demain',
      }),
    });
  });
  await waitFor(() => bubbleShape(tree).transcript !== undefined);
  const live = bubbleShape(tree);

  // What the server sends back for the same turn once the thread is reopened.
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', {
      text: JSON.stringify({
        type: 'chat.history',
        threadId: THREAD,
        messages: [
          {
            id: 'h-1',
            role: 'user',
            text: '',
            ts: '2026-08-06T21:00:00.000Z',
            transcript: 'rappelle-moi demain',
            attachments: [
              {
                id: 'voice-1',
                type: 'audio',
                filename: 'voice-note.m4a',
                mimeType: 'audio/mp4',
                sizeBytes: 13600,
                durationMs: 3400,
              },
            ],
          },
        ],
      }),
    });
  });
  await waitFor(() => bubbleShape(tree).hasPlayer);
  const replayed = bubbleShape(tree);

  expect(replayed).toEqual(live);
  expect(replayed.marker).toBeUndefined();
  expect(replayed.duration).toBe('0:03');

  await unmount(tree);
});
