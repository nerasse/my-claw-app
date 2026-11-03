import { Blob as NodeBlob } from 'node:buffer';
import { deviceBridge as nativeBridge } from '../nativeBridge';
import { deviceBridge } from '../nativeBridge.web';
import { finishRecording } from '../voice';

let failure: string | null = null;
let supportedMimeType = 'audio/webm;codecs=opus';
let capturedData = 'voice bytes';
const tracks = [{ stop: jest.fn() }, { stop: jest.fn() }];
const stream = { getTracks: () => tracks };
const getUserMedia = jest.fn(() => Promise.resolve(stream));
const contexts: FakeAudioContext[] = [];
const recorders: FakeMediaRecorder[] = [];
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

class FakeAudioContext {
  close = jest.fn(() => Promise.resolve());

  constructor() {
    if (failure === 'context') throw new Error('context failed');
    contexts.push(this);
  }

  createAnalyser() {
    if (failure === 'analyser') throw new Error('analyser failed');
    return {
      fftSize: 1024,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128),
    };
  }

  createMediaStreamSource() {
    if (failure === 'source') throw new Error('source failed');
    return { connect: jest.fn() };
  }
}

class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    if (failure === 'mime') throw new Error('mime failed');
    return type === supportedMimeType;
  }

  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    if (failure === 'recorder') throw new Error('recorder failed');
    this.mimeType = options?.mimeType ?? 'audio/webm';
    recorders.push(this);
  }

  start = jest.fn(() => {
    if (failure === 'start') throw new Error('start failed');
    this.state = 'recording';
  });

  stop = jest.fn(() => {
    if (failure === 'stop') throw new Error('stop failed');
    if (this.state === 'inactive') throw new Error('InvalidStateError');
    this.state = 'inactive';
    setTimeout(() => this.finish(), 20);
  });

  emitData(data = capturedData): void {
    this.ondataavailable?.({ data: new Blob([data], { type: this.mimeType }) });
  }

  finish(): void {
    this.state = 'inactive';
    this.emitData();
    this.onstop?.();
  }

  fail(): void {
    this.state = 'inactive';
    this.onerror?.();
    setTimeout(() => this.finish(), 20);
  }
}

function replaceGlobal(name: string, value: unknown): void {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function expectReleased(): void {
  for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  for (const context of contexts) expect(context.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
}

async function settle<T>(result: Promise<T>): Promise<T> {
  let settled = false;
  result.then(() => { settled = true; }, () => { settled = true; });
  await jest.advanceTimersByTimeAsync(25);
  expect(settled).toBe(true);
  return result;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 1000 });
  failure = null;
  supportedMimeType = 'audio/webm;codecs=opus';
  capturedData = 'voice bytes';
  contexts.length = 0;
  recorders.length = 0;
  tracks.forEach(track => track.stop.mockClear());
  getUserMedia.mockReset().mockResolvedValue(stream);
  replaceGlobal('navigator', { mediaDevices: { getUserMedia } });
  replaceGlobal('AudioContext', FakeAudioContext);
  replaceGlobal('MediaRecorder', FakeMediaRecorder);
  replaceGlobal('Blob', NodeBlob);
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice');
});

afterEach(async () => {
  failure = null;
  await deviceBridge.cancelRecording();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  savedGlobals.clear();
});

describe('web recording initialization', () => {
  it('reports unavailable microphone APIs as a permission failure', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    await expect(deviceBridge.startRecording()).rejects.toThrow('NO_MIC_PERMISSION');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reports getUserMedia rejection without creating audio resources', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('denied'));
    await expect(deviceBridge.startRecording()).rejects.toThrow('NO_MIC_PERMISSION');
    expect(contexts).toHaveLength(0);
    expect(recorders).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['context', 'analyser', 'source', 'mime', 'recorder', 'start'])(
    'releases resources when %s initialization fails and allows a retry',
    async stage => {
      failure = stage;
      await expect(deviceBridge.startRecording()).rejects.toThrow(`${stage} failed`);
      expectReleased();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      await expect(deviceBridge.stopRecording()).resolves.toBeNull();

      failure = null;
      await expect(deviceBridge.startRecording()).resolves.toBe('recording');
      await deviceBridge.cancelRecording();
    },
  );

  it('rejects overlapping starts without opening a second microphone', async () => {
    await deviceBridge.startRecording();
    await expect(deviceBridge.startRecording()).rejects.toThrow();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('releases a microphone granted after cancellation without creating a recorder', async () => {
    let grant = (_stream: typeof stream): void => {};
    getUserMedia.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const starting = deviceBridge.startRecording();
    await deviceBridge.cancelRecording();
    grant(stream);

    await expect(starting).rejects.toThrow('Recording cancelled');
    expect(contexts).toHaveLength(0);
    expect(recorders).toHaveLength(0);
    expectReleased();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('cancels pending microphone acquisition when stopped before initialization', async () => {
    let grant = (_stream: typeof stream): void => {};
    getUserMedia.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const starting = deviceBridge.startRecording();
    await expect(deviceBridge.stopRecording()).resolves.toBeNull();
    grant(stream);

    await expect(starting).rejects.toThrow('Recording cancelled');
    expect(recorders).toHaveLength(0);
    expectReleased();
  });

  it('does not let a cancelled permission request replace a newer recording', async () => {
    let grant = (_stream: typeof stream): void => {};
    getUserMedia.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const starting = deviceBridge.startRecording();
    await deviceBridge.cancelRecording();
    const newTrack = { stop: jest.fn() };
    getUserMedia.mockResolvedValueOnce({ getTracks: () => [newTrack] });
    await deviceBridge.startRecording();
    grant(stream);

    await expect(starting).rejects.toThrow('Recording cancelled');
    expect(newTrack.stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    await expect(settle(deviceBridge.stopRecording())).resolves.toMatchObject({ durationMs: 1000 });
    expect(newTrack.stop).toHaveBeenCalledTimes(1);
    expectReleased();
  });
});

describe('web recording finalization', () => {
  it('shares a stop result and uses capture time rather than asynchronous stop latency', async () => {
    supportedMimeType = 'audio/ogg;codecs=opus';
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(1200);
    const first = deviceBridge.stopRecording();
    const second = deviceBridge.stopRecording();
    const result = await settle(first);

    expect(await second).toBe(result);
    expect(result).toEqual({
      uri: 'blob:voice',
      durationMs: 1200,
      sizeBytes: capturedData.length,
      mimeType: supportedMimeType,
    });
    expect(recorders[0]?.stop).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expectReleased();
    await expect(deviceBridge.stopRecording()).resolves.toBeNull();
  });

  it.each([0, 250, 399, 699])('returns bytes and actual duration for a %i ms capture', async durationMs => {
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(durationMs);
    await expect(settle(deviceBridge.stopRecording())).resolves.toMatchObject({
      durationMs,
      sizeBytes: capturedData.length,
    });
    expectReleased();
  });

  it.each([250, 699])('lets finishRecording classify a %i ms capture as too short', async durationMs => {
    jest.spyOn(nativeBridge, 'stopRecording').mockImplementation(deviceBridge.stopRecording);
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(durationMs);

    await expect(settle(finishRecording())).resolves.toEqual({ ok: false, reason: 'too-short' });
    expectReleased();
  });

  it('does not stage an empty recording', async () => {
    capturedData = '';
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(1000);
    await expect(settle(deviceBridge.stopRecording())).resolves.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expectReleased();
  });

  it('does not stop or wait for an already inactive recorder', async () => {
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(1000);
    const recorder = recorders[0];
    recorder?.emitData();
    if (recorder) recorder.state = 'inactive';

    await expect(settle(deviceBridge.stopRecording())).resolves.toMatchObject({ durationMs: 1000 });
    expect(recorder?.stop).not.toHaveBeenCalled();
    expectReleased();
  });

  it('releases resources on an unsolicited stop and preserves its capture duration', async () => {
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(800);
    recorders[0]?.finish();
    expectReleased();
    jest.advanceTimersByTime(500);

    await expect(deviceBridge.stopRecording()).resolves.toMatchObject({ durationMs: 800 });
    expectReleased();
  });

  it('releases resources if stop throws synchronously', async () => {
    await deviceBridge.startRecording();
    failure = 'stop';
    await expect(deviceBridge.stopRecording()).rejects.toThrow('stop failed');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expectReleased();
    await expect(deviceBridge.stopRecording()).resolves.toBeNull();
  });

  it('releases resources and rejects a pending stop on a recorder error', async () => {
    await deviceBridge.startRecording();
    const stopping = deviceBridge.stopRecording();
    recorders[0]?.fail();
    await expect(settle(stopping)).rejects.toThrow('Recording failed');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expectReleased();
  });

  it('releases resources on an error before the user requests a stop', async () => {
    await deviceBridge.startRecording();
    recorders[0]?.fail();
    await jest.advanceTimersByTimeAsync(25);
    expectReleased();
    await expect(deviceBridge.stopRecording()).rejects.toThrow('Recording failed');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does not stage a blob when creating its URL fails', async () => {
    await deviceBridge.startRecording();
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('URL failed'); });
    await expect(settle(deviceBridge.stopRecording())).rejects.toThrow('URL failed');
    expectReleased();
  });

  it('handles a rejected AudioContext close without losing the recording', async () => {
    await deviceBridge.startRecording();
    contexts[0]?.close.mockRejectedValueOnce(new Error('already closed'));
    await expect(settle(deviceBridge.stopRecording())).resolves.toMatchObject({ sizeBytes: capturedData.length });
    expectReleased();
  });
});

describe('web recording cancellation', () => {
  it('is idempotent and ignores queued recorder data', async () => {
    await deviceBridge.startRecording();
    await deviceBridge.cancelRecording();
    await deviceBridge.cancelRecording();
    await jest.advanceTimersByTimeAsync(25);

    await expect(deviceBridge.stopRecording()).resolves.toBeNull();
    expect(recorders[0]?.stop).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expectReleased();
  });

  it('does not throw or leak resources when recorder.stop throws', async () => {
    await deviceBridge.startRecording();
    failure = 'stop';
    await expect(deviceBridge.cancelRecording()).resolves.toBeUndefined();
    await expect(deviceBridge.cancelRecording()).resolves.toBeUndefined();
    expectReleased();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does not call stop on an inactive recorder', async () => {
    await deviceBridge.startRecording();
    const recorder = recorders[0];
    if (recorder) recorder.state = 'inactive';
    await expect(deviceBridge.cancelRecording()).resolves.toBeUndefined();
    expect(recorder?.stop).not.toHaveBeenCalled();
    expectReleased();
  });

  it('cancels a stop in flight without staging its blob', async () => {
    await deviceBridge.startRecording();
    jest.advanceTimersByTime(1200);
    const stopping = deviceBridge.stopRecording();
    await deviceBridge.cancelRecording();
    await deviceBridge.cancelRecording();

    await expect(settle(stopping)).resolves.toBeNull();
    expect(recorders[0]?.stop).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expectReleased();
  });

  it('does not let a cancelled stop clear a newer recording', async () => {
    await deviceBridge.startRecording();
    const stopping = deviceBridge.stopRecording();
    await deviceBridge.cancelRecording();
    await deviceBridge.startRecording();
    await expect(settle(stopping)).resolves.toBeNull();
    jest.advanceTimersByTime(1000);

    await expect(settle(deviceBridge.stopRecording())).resolves.toMatchObject({ durationMs: 1025 });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    for (const context of contexts) expect(context.close).toHaveBeenCalledTimes(1);
  });
});
