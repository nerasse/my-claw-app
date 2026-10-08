import { voiceFilename } from '../voice';

test('voice filenames follow the recorded container', () => {
  const date = new Date('2026-10-08T01:02:03.000Z');

  // .weba, not .webm: the server types a file by its name, and .webm reads as a video, which
  // would skip transcription.
  expect(voiceFilename(date, 'audio/webm;codecs=opus')).toBe('voice-2026-10-08T01-02-03.weba');
  expect(voiceFilename(date, 'audio/webm')).toBe('voice-2026-10-08T01-02-03.weba');
  expect(voiceFilename(date, 'audio/ogg;codecs=opus')).toBe('voice-2026-10-08T01-02-03.ogg');
  expect(voiceFilename(date, 'audio/mp4')).toBe('voice-2026-10-08T01-02-03.m4a');
});
