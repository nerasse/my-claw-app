/**
 * Element ids shared between a component and the window-level listeners that have to recognise
 * it. `id` reaches the DOM through react-native-web and is a plain nativeID on Android, so the
 * same constant works on both without a platform branch.
 */

export const COMPOSER_INPUT_ID = 'claw-composer-input';
