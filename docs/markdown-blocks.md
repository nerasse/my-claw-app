# Tables and code blocks

Two markdown blocks are rendered by us rather than by `react-native-marked`, in both sheets
(`AgentMarkdown` for the chat, `DocumentMarkdown` for the full-screen readers). Both overrides
exist for a measured reason, not for taste.

## Tables: the library sizes them by the screen, not by the content

`utils/table.ts` in the library:

```ts
return Array(totalCols).fill(0).map(() => Math.floor(windowWidth * (1.3 / 3)));
```

Every column, of every table, gets 43% of the **window** width, and `MDTable` puts the result in a
horizontal `ScrollView`. Two consequences on a phone:

- a two-column table (`| oui | non |`) is 86% of the screen holding a dozen characters, which is
  the "beaucoup d'espace vide pour rien";
- a table of three columns or more overflows, so reading it means dragging it sideways inside a
  list that is already vertically scrollable and inverted. That gesture fights the thread.

`MarkdownTable` replaces it with a flex layout. Column weight is the longest cell in that column
in characters, clamped to `[4, 24]`: the floor keeps a `#` column from collapsing onto one glyph
per line, the ceiling keeps one long prose cell from starving its neighbours. Cells wrap, so a
wide table grows **down** instead of sideways, which is the axis the list already scrolls on.

The frame is drawn once: the container carries the outer border and the radius, the row carries a
bottom border, the cell a right border, and `MarkdownTable` drops both on the last row and the
last column. The header is told apart by a heavier rule rather than a tint, because the same
component renders inside an agent bubble (`surfaceAlt`) and on a document page (`bg`), and a tint
would have to know which.

## Code blocks: a strip, because the block cannot be selected

A fenced block is the one thing in a message meant to leave the app verbatim, and it is also the
one thing a selection cannot lift out of the chat list: React Native ends a selection at the Text
node it began in, and a selectable view inside the inverted list throws the thread to the other
end when it takes focus (docs/text-selection.md).

So `CodeBlockBar` sits above the code, inside the block: the language on the left, `copy` on the
right. It is a strip rather than a button floating over the first line, which on a long first line
would cover the code it offers to copy. It carries the **source**, not the rendered text.

Inline code spans get nothing: a strip per span would be noise, and a span is short enough that
the message-level copy covers it.

## Colouring

A fenced block is parsed with the code editor's own language table (`codeeditor/languages.ts`):
the block in a message is coloured by the same grammar the editor highlights the same file with,
so the two surfaces cannot disagree about what a keyword is. The parse runs outside any editor --
a throwaway `EditorState` whose only job is the syntax tree, which is also what makes a
stream-mode language (shell, diff...) attach its tags at all -- and the tags map to five classes,
each one an existing palette ink (keyword = accent, string = ok, number = warn, comment =
faint italic, invalid = danger). Both bundles carry the parsers, Android included (owner,
2026-10-15): a block coloured in a browser and grey on the phone is the kind of difference that
reads as a bug.

The runs never rewrite the text. `codeTokens` holds its output to the source it was given and
falls back to plain monospace on a mismatch, an unknown fence (```output```, ```text```), or a
parser failure -- colour is the one thing allowed to disappear. The monospace face and size stay
the caller's; the tokens only add their ink.

`CodeBlockBar` carries the copy on every platform now. Its strip used to keep the language alone
in a browser, on the argument that the browser selects and copies on its own; the owner asked for
the button back (2026-10-15), and `docs/text-selection.md` keeps the why.

## Testing

`react-native-marked` is mocked for the whole suite (`jest.setup.js` replaces `useMarkdown` with a
plain Text), so a fenced block never reaches a renderer through the normal path. The overrides are
exported and called directly in `markdownBlocks.test.tsx`; unmocking the library instead would
mean transforming its ESM dependency chain (`github-slugger`) for every suite in the repo.
