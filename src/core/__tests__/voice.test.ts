import { deviceBridge } from '../nativeBridge';
import { voiceFilename, voicePlayback } from '../voice';

function pendingPlayback(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

afterEach(() => {
  jest.restoreAllMocks();
  voicePlayback.reset();
});

test('a canceled older playback cannot mark the newer note paused', async () => {
  const older = pendingPlayback();
  jest.spyOn(deviceBridge, 'playAudio')
    .mockImplementationOnce(() => older.promise)
    .mockResolvedValueOnce(undefined);
  const first = voicePlayback.toggle('https://fixture.example/old.m4a', 10000);
  await voicePlayback.toggle('https://fixture.example/new.m4a', 10000);
  older.reject(new Error('playback canceled'));
  await first;
  expect(voicePlayback.getSnapshot()).toMatchObject({ uri: 'https://fixture.example/new.m4a', playing: true });
});

test('a superseded seek cannot reposition the newer note when its playback finishes', async () => {
  const older = pendingPlayback();
  jest.spyOn(deviceBridge, 'playAudio')
    .mockImplementationOnce(() => older.promise)
    .mockResolvedValueOnce(undefined);
  const seek = jest.spyOn(deviceBridge, 'seekPlayback').mockResolvedValue(undefined);
  const first = voicePlayback.seek('https://fixture.example/old.m4a', 4000, 10000);
  await voicePlayback.toggle('https://fixture.example/new.m4a', 10000);
  older.resolve();
  await first;
  expect(voicePlayback.getSnapshot()).toMatchObject({ uri: 'https://fixture.example/new.m4a', playing: true, positionMs: 0 });
  expect(seek).not.toHaveBeenCalled();
});

test('a current playback failure still marks its note paused', async () => {
  jest.spyOn(deviceBridge, 'playAudio').mockRejectedValue(new Error('unreadable media'));
  await voicePlayback.toggle('https://fixture.example/current.m4a', 10000);
  expect(voicePlayback.getSnapshot()).toMatchObject({ uri: 'https://fixture.example/current.m4a', playing: false });
});

test('seeking a loading note waits for its player and preserves a startup failure', async () => {
  const loading = pendingPlayback();
  jest.spyOn(deviceBridge, 'playAudio').mockReturnValue(loading.promise);
  const seek = jest.spyOn(deviceBridge, 'seekPlayback').mockResolvedValue(undefined);
  const start = voicePlayback.toggle('https://fixture.example/loading.m4a', 10000);
  const move = voicePlayback.seek('https://fixture.example/loading.m4a', 4000, 10000);
  expect(seek).not.toHaveBeenCalled();
  loading.reject(new Error('download failed'));
  await Promise.all([start, move]);
  expect(voicePlayback.getSnapshot()).toMatchObject({ playing: false });
  expect(seek).not.toHaveBeenCalled();
});

test('seeking a loading note applies its position only once the player is ready', async () => {
  const loading = pendingPlayback();
  jest.spyOn(deviceBridge, 'playAudio').mockReturnValue(loading.promise);
  const seek = jest.spyOn(deviceBridge, 'seekPlayback').mockResolvedValue(undefined);
  const start = voicePlayback.toggle('https://fixture.example/loading.m4a', 10000);
  const move = voicePlayback.seek('https://fixture.example/loading.m4a', 4000, 10000);
  expect(seek).not.toHaveBeenCalled();
  loading.resolve();
  await Promise.all([start, move]);
  expect(seek).toHaveBeenCalledWith(4000);
});

test('voice filenames follow the recorded container', () => {
  const date = new Date('2026-10-08T01:02:03.000Z');

  // .weba, not .webm: the server types a file by its name, and .webm reads as a video, which
  // would skip transcription.
  expect(voiceFilename(date, 'audio/webm;codecs=opus')).toBe('voice-2026-10-08T01-02-03.weba');
  expect(voiceFilename(date, 'audio/webm')).toBe('voice-2026-10-08T01-02-03.weba');
  expect(voiceFilename(date, 'audio/ogg;codecs=opus')).toBe('voice-2026-10-08T01-02-03.ogg');
  expect(voiceFilename(date, 'audio/mp4')).toBe('voice-2026-10-08T01-02-03.m4a');
});
