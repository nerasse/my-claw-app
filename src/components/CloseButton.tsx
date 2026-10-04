import React, { createContext, useContext } from 'react';
import { Pressable } from 'react-native';
import { radius, useTheme, useThemedStyles, type Palette } from '../theme';
import { CloseIcon } from './icons';

/**
 * Leaves the whole stack a page sits in (settings, jobs) for the conversation, in one press,
 * where Back walks it one level at a time. Provided by the shell: null where Back already lands
 * on the conversation, so a page never carries two buttons that do the same thing.
 */
export const PageCloseContext = createContext<{ close: () => void; label: string } | null>(null);

/** The cross at the end of a page header. Renders nothing where there is nothing to close. */
export function CloseButton(): React.JSX.Element | null {
  const target = useContext(PageCloseContext);
  const styles = useThemedStyles(createStyles);
  const { palette } = useTheme();
  if (!target) return null;
  return (
    <Pressable
      onPress={target.close}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={target.label}>
      <CloseIcon size={20} color={palette.textMuted} />
    </Pressable>
  );
}

const createStyles = (palette: Palette) => ({
  // A ghost beside the filled Back square: the lighter of the two ways out. The auto margin puts
  // it at the end of a header whose title does not grow.
  button: {
    width: 40,
    height: 40,
    marginLeft: 'auto' as const,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: { backgroundColor: palette.surfaceAlt },
});
