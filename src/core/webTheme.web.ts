/// <reference lib="dom" />
import type { Palette } from '../theme/palettes';

/**
 * The part of a desktop UI that lives in the document, not in the React tree.
 *
 * react-native-web renders a Pressable as a plain div: no cursor, no hover, no focus ring, and
 * `Text` ships `user-select: none` so a conversation cannot be copied. None of that is fixable
 * per component without touching a hundred call sites, and all of it is four CSS rules keyed on
 * the roles the app already sets for accessibility.
 */

const STYLE_ID = 'claw-desktop';

/** The document-level CSS of one palette. Exported for the tests: the rules matter, the DOM does not. */
export function webThemeCss(palette: Palette): string {
  return css(palette);
}

function sheet(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const node = document.createElement('style');
  node.id = STYLE_ID;
  document.head.appendChild(node);
  return node;
}

function css(palette: Palette): string {
  return `
html, body, #root { height: 100%; margin: 0; background: ${palette.bg}; }
body { overscroll-behavior: none; }

/* Pressable renders role="button": one rule gives the whole app a cursor and a hover state. */
[role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"] {
  cursor: pointer;
  transition: opacity 120ms ease, background-color 120ms ease;
}
@media (hover: hover) and (pointer: fine) {
  [role="button"]:hover, [role="link"]:hover, [role="tab"]:hover, [role="menuitem"]:hover { opacity: 0.75; }
}
[role="button"][aria-disabled="true"] { cursor: default; opacity: 1; }

/* Keyboard focus has to be visible, and only for the keyboard: :focus-visible is exactly that. */
:focus-visible { outline: 2px solid ${palette.accent}; outline-offset: 2px; border-radius: 6px; }
input:focus, textarea:focus { outline: none; }
/* In a menu the rows run edge to edge inside a scroller that clips an outline drawn outside them:
   the focused row is tinted instead (docs/keyboard.md). */
[data-claw-keys="menu"] [role="button"]:focus-visible,
[data-claw-keys="menu"] [role="menuitem"]:focus-visible {
  outline: none;
  background-color: ${palette.accentSoft};
}

/* Selected text must stay readable in both themes: accentSoft is dark-on-dark in the dark
   palette, so the browser paints it nearly invisible. accent + accentText flips one way in
   light (blue on dark text) and the other way in dark, always with contrast. */
::selection { background: ${palette.accent}; color: ${palette.accentText}; }

/* ...except on a surface that is already the accent, which is what a user bubble is: there the
   rule above paints the colours that are on screen anyway, and a drag selects nothing visible.
   The pair is flipped on those, so the highlight reads as the page's own inverse. */
[data-claw-on-accent="1"]::selection,
[data-claw-on-accent="1"] ::selection { background: ${palette.accentText}; color: ${palette.accent}; }

/* Text is unselectable by default in react-native-web. Marked regions opt back in. */
[data-claw-select="text"], [data-claw-select="text"] * { user-select: text !important; }


* { scrollbar-width: thin; scrollbar-color: ${palette.border} transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${palette.border}; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: ${palette.textFaint}; background-clip: content-box; }

/* A file dragged over the window: the whole page answers, not a hidden rectangle. */
body[data-claw-drop="1"]::after {
  content: '';
  position: fixed;
  inset: 6px;
  border: 2px dashed ${palette.accent};
  border-radius: 12px;
  pointer-events: none;
  z-index: 9999;
}
`;
}

export function applyWebTheme(palette: Palette, dark: boolean): void {
  sheet().textContent = css(palette);
  // Tells the browser which way its own widgets (scrollbars, form controls) should be painted.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', palette.bg);
}
