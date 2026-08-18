import { deviceBridge } from '../nativeBridge';
import { uploadMedia, type PendingAttachment } from '../upload';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

const device = { deviceId: 'dev-test', token: 'token-test' };
const attachment: PendingAttachment = {
  id: 'a1',
  uri: 'file:///cache/photo.jpg',
  filename: 'photo.jpg',
  type: 'image',
  mimeType: 'image/jpeg',
};

const ok = { status: 200, body: JSON.stringify({ id: 'media-1' }) };

function upload(): ReturnType<typeof uploadMedia> {
  return uploadMedia('http://server:8080', device, 't-1', attachment);
}

beforeEach(() => {
  bridge.uploadFile.mockReset();
});

/**
 * A POST is the one request a browser never replays on a connection the other end had closed, so
 * the first upload after an idle tab fails with no response while everything else looks fine.
 */
test('a transport failure is retried once, and the upload goes through', async () => {
  bridge.uploadFile.mockRejectedValueOnce(new Error('upload failed')).mockResolvedValueOnce(ok);

  await expect(upload()).resolves.toEqual({ id: 'media-1', type: 'image' });
  expect(bridge.uploadFile).toHaveBeenCalledTimes(2);
});

test('two transport failures in a row are reported, not retried forever', async () => {
  bridge.uploadFile.mockRejectedValue(new Error('upload failed'));

  await expect(upload()).rejects.toThrow('upload failed');
  expect(bridge.uploadFile).toHaveBeenCalledTimes(2);
});

test('a refusal that came with a status is the server answering: sent once', async () => {
  bridge.uploadFile.mockResolvedValue({ status: 413, body: 'Payload Too Large' });

  await expect(upload()).rejects.toThrow('upload failed: Payload Too Large');
  expect(bridge.uploadFile).toHaveBeenCalledTimes(1);
});

test('an abort is not retried: something cancelled it on purpose', async () => {
  bridge.uploadFile.mockRejectedValue(new Error('upload aborted'));

  await expect(upload()).rejects.toThrow('upload aborted');
  expect(bridge.uploadFile).toHaveBeenCalledTimes(1);
});
