import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { prefs, type ThemeMode } from '../core/prefs';
import { DEFAULT_THEME_ID, type ThemeId } from './themes';
import { applyWebTheme } from '../core/webTheme';
import { ChatFontScaleContext, ThemeContext, useResolvedTheme } from './index';

export interface ThemeControl {
  themeId: ThemeId;
  setThemeId: (themeId: ThemeId) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeControlContext = createContext<ThemeControl>({
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
  mode: 'system',
  setMode: () => {},
});

export function useThemeControl(): ThemeControl {
  return useContext(ThemeControlContext);
}

const DEFAULT_CHAT_SCALE = 1;

/**
 * Owns the theme choice: the stored mode resolved against the phone setting. Sits above every
 * screen so a switch repaints the whole app, including the drawer and the sheets.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [themeId, setThemeId] = useState<ThemeId>(prefs.get().themeId);
  const [mode, setMode] = useState<ThemeMode>(prefs.get().themeMode);
  const [chatScale, setChatScale] = useState<number>(prefs.get().chatFontScale ?? DEFAULT_CHAT_SCALE);

  useEffect(() =>
    prefs.subscribe(next => {
      setThemeId(next.themeId);
      setMode(next.themeMode);
      setChatScale(next.chatFontScale ?? DEFAULT_CHAT_SCALE);
    }),
  []);

  const theme = useResolvedTheme(themeId, mode);
  // The cursor, the hover states, the focus ring, the scrollbars and the selection colour live
  // in the document, not in the tree. No-op on Android.
  useEffect(() => {
    applyWebTheme(theme.palette, theme.dark);
  }, [theme]);

  const control = useMemo<ThemeControl>(
    () => ({
      themeId,
      setThemeId: next => prefs.set('themeId', next),
      mode,
      setMode: next => prefs.set('themeMode', next),
    }),
    [themeId, mode],
  );

  return (
    <ThemeControlContext.Provider value={control}>
      <ThemeContext.Provider value={theme}>
        <ChatFontScaleContext.Provider value={chatScale}>{children}</ChatFontScaleContext.Provider>
      </ThemeContext.Provider>
    </ThemeControlContext.Provider>
  );
}
