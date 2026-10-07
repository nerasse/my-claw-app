import { voiceFilename } from '../voice';

test('voice filenames follow the recorded container', () => {
  const date = new Date('2026-10-08T01:02:03.000Z');

  expect(voiceFilename(date, 'audio/webm;codecs=opus')).toBe('voice-2026-10-08T01-02-03.webm');
  expect(voiceFilename(date, 'audio/ogg;codecs=opus')).toBe('voice-2026-10-08T01-02-03.ogg');
  expect(voiceFilename(date, 'audio/mp4')).toBe('voice-2026-10-08T01-02-03.m4a');
});
