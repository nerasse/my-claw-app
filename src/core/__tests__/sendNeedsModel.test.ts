import { sendNeedsModel } from '../setup';

describe('sendNeedsModel', () => {
  // A catalogue that has not answered carries an empty default, the same as a server with no
  // model. Reading it as the latter closed every send behind the setup assistant for as long as
  // the catalogue was never asked for (2026-10-06).
  test('a catalogue not received yet holds nothing back', () => {
    expect(sendNeedsModel(false, '', undefined)).toBe(false);
  });

  test('a tag as the default is a model that runs', () => {
    expect(sendNeedsModel(true, 'tag:Cheap', [])).toBe(false);
  });

  test('the server answered and has no default: the assistant opens', () => {
    expect(sendNeedsModel(true, '', [])).toBe(true);
  });

  test('the server answered and the default cannot run: the assistant opens', () => {
    expect(sendNeedsModel(true, 'acme/model', [{ id: 'acme/model' }])).toBe(true);
  });
});
