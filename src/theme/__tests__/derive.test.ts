import { deriveSet } from '../derive';
import { generatedThemes, paletteSources } from '../themes.generated';
import { themeIds } from '../themes';

/**
 * The port is proved against the generator's output, not trusted.
 *
 * `scripts/generate-palettes.py` derives the ten themes in Python; `theme/derive.ts` derives a
 * custom palette in TypeScript. Two implementations of one algorithm drift, so every generated
 * theme is recomputed here from its source colours and compared byte for byte. A change on
 * either side that is not made on both fails this file.
 */
describe.each(themeIds)('%s, recomputed from its eleven source colours', id => {
  const derived = deriveSet(paletteSources[id]);
  const generated = generatedThemes[id];

  test('light matches the generator', () => {
    expect(derived.light).toEqual(generated.light);
  });

  test('dark matches the generator', () => {
    expect(derived.dark).toEqual(generated.dark);
  });

  test('AMOLED matches the generator', () => {
    expect(derived.amoled).toEqual(generated.amoled);
  });
});
