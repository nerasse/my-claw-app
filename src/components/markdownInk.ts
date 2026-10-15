import type { ViewStyle } from 'react-native';
import type { TokenColors } from './codeeditor/highlight';

/**
 * What the two markdown sheets take from the palette besides their styles.
 *
 * `markedStyles` and `documentMarkdownStyles` read the palette directly for everything that is
 * a markdown element's style. These three are not element styles:
 *
 * - `tokens` is the ink a fenced block's parse paints with, and only a parser produces it;
 * - `marker` is the list bullets' colour, a choice shared by every list;
 * - `tableHeader` is the header row's tint, which a shared sheet cannot state because the sheet
 *   draws on two surfaces -- a chat bubble *is* `surfaceAlt`.
 */
export interface MarkdownInk {
  tokens?: TokenColors;
  marker?: string;
  tableHeader?: ViewStyle;
}

export const EMPTY_INK: MarkdownInk = {};
