# The UI refonte: what changes, and what it breaks

The design is settled (the `ui-poc` v3 POC, approved 2026-11-02). This is how it lands in the app, in
which order, and what it costs. It is not a description of the POC: the POC is a demonstration, and
several of its tokens exist only because a stylesheet is free and a `Palette` is not.

Everything below was checked against `v0.6.183` (`4c03f94`). Line numbers will drift; the symbols are
the contract.

The reference implementation was the POC at `~/dev/ui-poc/v3/`, served at `ui-poc.claw.kssimi.fr`. Its
sources live in `docs/reference/ui-poc/` now that every lot is integrated: `index.html` the chat,
`cards.html` the tool cards, `menus.html` the menus, `settings.html` Appearance, `themes.html` the
palette gallery, `sel.html` the selection variants, and `tools/themes.py`, the palette generator this
plan ports. The screenshots and the live service are gone; the CSS is the half worth keeping.

## 0. What the POC decides, and what it only suggests

Three things in the POC are load-bearing and must be implemented:

1. **The user bubble is a surface, not an accent fill.** `Bubble.tsx:313` fills it with `accent`,
   which is what put 1.42 % of the screen in colour. Everything else in the refonte is secondary to
   this.
2. **The palette is a choice, not a constant.** Two hard-coded palettes become a registry, and the
   choice lives in Appearance, not in the title bar.
3. **One metric per rank.** Tool cards, menu rows and thread rows each get a single height and a
   single gutter, and the states get one vocabulary.

Everything else in the POC (the exact 1160 px column, the eleven `--surface-*` levels, the four
selection-bar variants) is a suggestion.

## 1. The token contract

### 1.1 Today

`src/theme/palettes.ts` exports `Palette` (24 fields), `lightPalette` and `darkPalette`.
`ThemeMode` is `'system' | 'light' | 'dark'` (`core/prefs.ts:5`). `useResolvedTheme(mode)`
(`theme/index.ts:46`) picks one of two objects by boolean `dark`.

125 files read `palette.*`, 1 917 references in total. That number is the reason the *field
names* must not change: a refonte changes values and adds fields, it does not rename the ones every
screen already uses.

### 1.2 The registry

```ts
export type ThemeId = 'sable' | 'lin' | 'charbon' | 'catppuccin' | 'gruvbox'
                    | 'rose-pine' | 'everforest' | 'kanagawa' | 'tokyo-night' | 'flexoki';

/** 'system' is a rule, not a palette; 'amoled' is a compromise, not a darker dark. */
export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';

export interface PaletteSet {
  label: string;
  /** Where the values came from, shown in Appearance. Never invented. */
  source: string;
  light: Palette;
  dark: Palette;
  /** Derived from `dark` over pure black; see §1.5. */
  amoled: Palette;
}

export const themes: Record<ThemeId, PaletteSet> = { ... };
```

`useResolvedTheme(themeId, mode)` returns `{ palette, dark, mode, themeId }`. `dark` stays a boolean so
the ~40 places that branch on it keep working; it is `true` for both `dark` and `amoled`.

**The objects must be module constants, not computed per render.** `useThemedStyles`
(`theme/index.ts:56`) caches one `StyleSheet` per `(factory, palette, scale)` in a `WeakMap` keyed on
palette identity. A palette rebuilt on every render turns that cache into a leak and a full
`StyleSheet.create` per frame. This is why AMOLED is generated at build a time (§1.5) and not derived
in a getter.

### 1.3 Fields to add

| field | why it cannot be derived in the component |
|---|---|
| `surfaceRaised` | the POC's third elevation. With two (`surface`, `surfaceAlt`) a selected row and a card look alike. Deriving it with `color-mix` is not available in RN's style system. |
| `codeText` | code blocks currently draw in `text`. On a themed `codeBg` that is fine until a theme whose `codeBg` is darker than `bg` (Flexoki, AMOLED), where `text` has no relationship left with its own background. |
| `bubbleUserBg` | the whole point. Neutral step, not the accent. |
| `bubbleUserText` | text on `bubbleUserBg`, pinned at ≥ 9:1 by the generator. |
| `focus` | the focus ring today borrows `accent`; on a theme whose accent is also its `warn` (Gruvbox light) the ring reads as an alert. |
| `selection` | `::selection` is painted `accent`/`accentText` today **because** the bubble is. Once the bubble is neutral, the web selection is the only place an accent fill legitimately appears, and it needs its own field to stop being a coincidence (`core/__tests__/webThemeSelection.test.ts` encodes the coincidence). |

### 1.4 Fields that lose their reason to exist

`onAccentMuted` and `onAccentTrack` exist for one purpose, stated in their own doc comment: text drawn
*on* an accent fill, because `textMuted` and `border` are tuned for the page background. Once the user
bubble stops being accent-filled, the accent surfaces left in the app are the primary button, the send
button and the selection — none of which carry secondary text.

The two fields are read by four components, all of which render *inside* the user bubble:

- `components/LocationView.tsx:48,52,62`
- `components/VoicePlayer.tsx:223,248,260,269`
- `components/VoiceNote.tsx:56`
- `components/AttachmentView.tsx:200,214`

Those get `textMuted` / `surfaceRaised` on the neutral bubble. Then the two fields are deleted from
`Palette` — the compiler finds every remaining reader.

Not urgent, but do it in the same pass: leaving them means two fields that mean "on a fill that no
longer exists", and the next person will use them.

### 1.5 Where the values come from

The POC's `tools/themes.py` already derives everything: the elevation steps, `faint` pushed to 4.5:1,
the bubble, the code background, the diff backgrounds, and AMOLED. Port it as
`scripts/generate-palettes.py`, checked in, writing `src/theme/themes.generated.ts`.

Why a generator and not eleven hand-written tables (ten themes × three modes, 22 palettes × 30
fields = 660 values):

- the AMOLED derivation is arithmetic (cap the ink at ~14:1, remix the tinted backgrounds over
  `#000`), and doing it by hand three hundred times is where the muddy browns came from in the POC;
- the invariants of §1.6 are cheaper to enforce once, in the generator, than to re-check per palette;
- a new palette is a twelve-line dict, not a 90-line table.

`themes.generated.ts` is committed, so the build never runs Python and the diff of a palette change is
reviewable.

### 1.6 Invariants, enforced by a test

`src/theme/__tests__/palettes.test.ts` recomputes, for all 30 palettes:

- `ink`, `muted`, `faint`, `accent`, `ok`, `warn`, `danger`, `bubbleUserText`, `accentText` on `accent`,
  `codeText` on `codeBg`: **≥ 4.5:1** (`faint` included — in this app it is a timestamp, so text);
- `ΔE(accent, danger) ≥ 25` (CIELAB). This is the invariant that rejected the POC's oxblood dark
  (`ΔE 10.7`) and Gruvbox light's own orange-vs-red (`15.9`);
- `bubbleUserBg` distinguishable from `bg` (≥ 1.08:1) but under 1.5:1 — a bubble is not a card;
- three elevation steps, each ≥ 1.05:1 from the previous.

The test reads the generated table, so a hand edit that breaks an invariant fails CI rather than
shipping a theme whose error state looks like its accent.

### 1.7 POC token → `Palette` field

The POC's CSS variables are a superset of the app's contract, and three of them have no counterpart.
This table is the translation the implementation actually applies; anything not listed is a token the
POC added that the app should not gain.

| POC variable | `Palette` field | action |
|---|---|---|
| `--bg` | `bg` | exists |
| `--surface` | `surface` | exists |
| `--surface-2` | `surfaceAlt` | exists, same role (inputs, agent bubbles) |
| `--surface-3` | `surfaceRaised` | **add** — the POC's third step has no field |
| `--line` | `border` | exists |
| `--ink` | `text` | exists |
| `--muted` | `textMuted` | exists |
| `--faint` | `textFaint` | exists, **value must rise** — see §1.8 |
| `--accent` | `accent` | exists |
| `--accent-ink` | `accentText` | exists |
| `--accent-soft` | `accentSoft` | exists |
| `--msg-user-bg` | `bubbleUserBg` | **add** |
| `--msg-user-ink` | `bubbleUserText` | **add** |
| `--code-bg` | `codeBg` | exists |
| `--code-ink` | `codeText` | **add** |
| `--ok` `--warn` `--danger` | `ok` `warn` `danger` | exist |
| `--focus` | `focus` | **add** |
| `--diff-*` | `diffAdd` `diffDel` `diffAddBg` `diffDelBg` `diffHunkBg` | exist |
| `--overlay` | `overlay` | exists |
| `--live` | — | **do not add**: a live run draws in `accent`, and a second accent is a second accent |
| — | `selection` | **add** — the web `::selection`, see §2.3 |
| — | `onAccentMuted`, `onAccentTrack` | **delete**, see §1.4 |

Net: 24 fields become 30. Six added, two removed.

As built (2026-11-02): 29 fields, not 30 -- the count above never added up. Six added
(`surfaceRaised`, `codeText`, `bubbleUserBg`, `bubbleUserText`, `focus`, `selection`), two removed,
plus `textMeta` from §1.8 option 2, which this table was written before.

`diffAdd`/`diffDel` are no longer `ok`/`danger`: a light green on a green wash lands at 3:1 whatever
the wash does, so the diff fields are the *readable* pair drawn inside a tinted line, while `ok` and
`danger` stay the marks on the page.

### 1.8 The faint grey is below the rule the POC enforces

Measured on today's palettes:

| | `textFaint` | on `bg` | rule |
|---|---|---|---|
| light | `#9aa0ab` | **2.63:1** | ≥ 4.5 |
| dark | `#6b7481` | **4.00:1** | ≥ 4.5 |

`textMuted` passes both (6.14 and 7.43), and so does everything else. So the only casualty is the
weakest grey — which is what draws every timestamp, every "41 msg", every meta line in the app.

This is the one place where adopting the POC's rule changes the app's look rather than its colours:
those lines become visibly darker. Two honest options:

1. **Adopt it.** The POC's argument holds — in this app `textFaint` is a timestamp, therefore text,
   and 2.63:1 is not readable in daylight. The look gets slightly denser and slightly less airy.
2. **Split the role.** Keep a `textFaint` at ~3:1 for genuinely decorative text, and add a
   `textMeta` at 4.5:1 for timestamps and counts. This preserves the current look and admits that the
   two uses were always different. It costs one more field, and a sweep to classify its 323 call
   sites across 92 files — that sweep is the real work, which is why this is its own decision.

Recommendation: **option 2.** The POC conflated the two because a mock has no cost for a field; the app
does. And a decorative hairline label at 3:1 is fine — the rule is about text you must read.

As built: the sweep is targeted, not exhaustive. 21 styles moved to `textMeta` -- the thread, the
tool cards, the run foot, the wait and reasoning lines, the sub-agent card, the conversation rows,
the drawer's section labels and counts, the chat header. The remaining ~300 uses are glyphs,
chevrons, placeholders, separators and disabled marks: shapes, not text, and they stay near 3:1 by
design. Sweeping all 323 would have made every icon heavier for no reader.

Either way the invariant test of §1.6 must be written against the field each call site actually uses,
which means the sweep happens in P1 and the rule is enforced in P2.

## 2. The user bubble — the change with the widest blast radius

### 2.1 The one line

`components/Bubble.tsx:313`

```ts
bubbleUser: { backgroundColor: palette.accent, borderBottomRightRadius: radius.sm },
textUser:   { color: palette.accentText },              // :327
timeUser:   { color: palette.accentText, opacity: 0.7 }, // :336
```

becomes

```ts
bubbleUser: { backgroundColor: palette.bubbleUserBg, borderBottomRightRadius: radius.sm },
textUser:   { color: palette.bubbleUserText },
timeUser:   { color: palette.bubbleUserText, opacity: 0.62 },
```

plus a hairline, because a neutral bubble on a neutral thread has no edge otherwise:

```ts
borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth
```

The POC used `color-mix(in srgb, ink 8%, transparent)`; RN has no `color-mix`, so either a dedicated
`bubbleUserBorder` field or `border`. Use `border`: it is one hairline on one shape, and a field for it
would be a fifth bubble token.

### 2.2 The four components inside it

Every child of a user bubble currently assumes "I am on an accent fill": muted text is
`onAccentMuted`, tracks are `onAccentTrack`, buttons are outlined in `onAccentMuted`. On a neutral
bubble all four must read like normal secondary UI:

| component | today | after |
|---|---|---|
| `LocationView` | `onAccentTrack` card, `onAccentMuted` meta, `onAccentMuted` button border | `surfaceRaised` card, `textMuted` meta, `border` outline |
| `VoicePlayer` | `onAccentTrack` wave, `onAccentMuted` time and rate text | `surfaceRaised` wave, `textMuted` |
| `VoiceNote` | `onAccentMuted` transcript | `textMuted` |
| `AttachmentView` | `onAccentMuted` caption, `onAccentTrack` chip | `textMuted` caption, `surfaceRaised` chip |

The `*OnAccent` style keys can keep their names at first (a style called `captionOnAccent` that is now
drawn on a surface is a comment lying about its code, but it is also a one-line diff). Recommend
renaming them in the same commit: the names are what made the coupling invisible.

### 2.3 The web

`core/webTheme.web.ts:60` paints `::selection` as `accent`/`accentText`, and `:66` has a
`[data-claw-on-accent="1"]` variant that flips the two, applied at `core/webProps.web.ts:34` so text
selected inside a user bubble stays readable. That flag exists *because* the bubble is accent.

After the change: `data-claw-on-accent` has no consumer and the override should go, or the bubble keeps
the attribute and the override keeps working with `bubbleUserBg`/`bubbleUserText`. Keeping the
attribute is the safer, smaller change and it stays correct for the primary button.

`core/__tests__/webThemeSelection.test.ts` asserts both rules verbatim. It will fail, which is the
point: it is the test that records the old coupling. Rewrite it against `selection`/`bubbleUserText`.

### 2.4 What visually changes and that nobody listed

- A queued user message used `accentText` at 70 % (`Bubble.tsx:333`). On a neutral bubble it needs the
  same treatment as `timeUser`.
- `markdownInk.ts` derives inline-code and link colours from the palette; check that a neutral bubble
  does not leave link blue-on-grey unreadable in one theme. The generator's `bubbleUserText` contrast
  does not cover links drawn in `accent`.
- `StagedVoiceList` and the composer echo the user bubble styling for a pending attachment. Grep for
  `bubbleUser` before assuming one call site.

## 3. Prefs, the provider, and the Appearance screen

### 3.1 `core/prefs.ts`

```ts
themeId: ThemeId;   // new, default 'sable'
themeMode: ThemeMode; // widened to include 'amoled'
```

`loadPrefs` (`:143`) validates both against their unions and falls back. The migration is trivial and
must be explicit: an install that stored `'system'` keeps `'system'`, an install that stored `'dark'`
keeps `'dark'`, and both take `themeId: 'sable'`. No install stored a theme id before, so there is no
ambiguity — but the fallback path must not silently turn a stored `'dark'` into `'system'`.

`core/__tests__/prefs.test.ts:23` asserts the exact default object; it will fail until the two fields
are added to `DEFAULTS`. That is the cheap kind of failure.

### 3.2 `theme/ThemeProvider.tsx`

`useResolvedTheme(mode)` becomes `useResolvedTheme(themeId, mode)`. The provider subscribes to both
prefs. `useThemeControl` gains `themeId` / `setThemeId`.

One rule to write down in the provider, because it is the sort of thing that gets re-decided
badly later: **`amoled` is never chosen by `system`.** A phone reporting dark-mode does not tell you
the panel is OLED, and an LCD forced to `#000` is a harder view with no battery saved.

### 3.3 `app/AppearanceScreen.tsx`

Today: a three-item segmented control (`System / Light / Dark`) and a hint. After:

- **Mode**: four options. The existing `styles.segment` will not hold four labels on a 360 pt screen
  (`'System'`, `'Light'`, `'Dark'`, `'AMOLED'`); it becomes a 2×2 grid of the POC's mode cards, each
  one painted in its own mode. A segment whose preview is the current mode cannot show you AMOLED
  without applying it.
- **Palette**: a list of ten rows, each with a four-stop swatch strip drawn from constants, the label,
  and the source. A swatch must not be `<View style={{backgroundColor: palette.bg}}>` under a
  `data-theme`-like mechanism — in RN there is no such mechanism, so this is a POC-only trap, but the
  *values* still must come from the palette set, not from the active palette.
- The `text` and `folding` sections already on the page stay, below.

`app/AppShell.tsx:4413` passes `themeMode={themeControl.mode}`; it grows a `themeId` prop.

### 3.4 The title bar

Nothing to remove in the real app: the real app has no theme control in the title bar today. The POC
had one and it was removed. This section exists so nobody "re-adds it for convenience" during the
implementation: the choice lives in Appearance, and the Appearance row shows the current value
(`Sable · AMOLED`) the way every other settings row does.

## 4. The selection indicator

`components/ThreadRow.tsx:94`

```ts
rowActive: { backgroundColor: palette.accentSoft },
```

That is the whole indicator, and it is wrong in two ways: `accentSoft` is a *tinted* background, so a
selection reads as a mood rather than a position, and ten palettes later `accentSoft` is a completely
different hue in each one.

After (POC variant B, the one the owner picked):

```ts
rowActive: { backgroundColor: palette.surfaceRaised, overflow: 'hidden' },
// plus an absolutely positioned 3 px accent bar, full height, no radius of its own,
// clipped by the row's radius through overflow: 'hidden'
```

The POC's first attempt gave the bar `borderRadius: 9 0 0 9`, which overflowed the row's own curve and
read as a tab glued to the side. The rule: **the bar carries no radius; the row's `overflow: hidden`
shapes it.**

`Drawer.tsx` draws a second "new thread" row with `accentSoft` (`:930`) and a section dot in `accent`
(`:963`); those are not selections and stay.

## 5. Tool cards

`components/ToolCard.tsx` is one component for every tool; `toolSummary.ts:17-21` records that a
per-family glyph was tried and removed. The refonte does not reverse that. What changes:

1. **One head height.** The card's collapsed state is currently driven by its content. Fix it at one
   value (the POC used 29) so a thread of twenty calls reads as a list and not as a staircase.
2. **State vocabulary.** Today: `failed` on a tool, `error` on a sub-agent, `interrupted` lowercase in
   one place and `· Interrupted` capitalised in another. One set: running / done / failed / stopped /
   truncated, rendered from one helper.
3. **The missing information**, cheapest first:
   - a `+N −M` count in a diff head (nothing else in the app reports how many lines moved);
   - line numbers in a `read` block;
   - a two-column table for list-shaped output (`ls`, `search`, `web_search`) instead of a mono block.
4. **`codeText`** instead of `text` inside `codeBg` (see §1.3).

Item 3 is the only part that is new behaviour rather than restyling, and it is also the part with the
most value per line: it is what makes an unfolded card readable without a second glance.

`components/QuestionCard.tsx` and `components/SubAgentCard.tsx` already have their own shapes; align
their head height and state words, nothing more.

## 6. Menus

The inventory found four mechanisms and no shared metric: `ActionSheet` (60+ sites), `PromptSheet`,
`OverlayHost`/`AnchoredMenu`, `Drawer` in three shapes. `ActionSheet.tsx:224` sets `minHeight: 40` with
`paddingVertical: 8` — which, with a 14 pt body and `lineHeightFor`, lands at 46–52 depending on the
label. The POC's proposal:

| | web/dialog | phone sheet |
|---|---|---|
| row | 34 | 46 |
| sheet width | 320 (400 for the model picker) | full width |
| anchored menu | 236 | n/a |
| icon | 15, stroke 1.8 | 17 |

Two behavioural fixes, both from the inventory, both small and both real:

- **A status line is not an option.** `ModelSheet.tsx:422` (`no model matches`), `:493`
  (`loading routes...`), `:497`, `AppShell.tsx:5352` are rendered as rows with `onPress: () => {}`,
  so they are focusable, announce as buttons and do nothing.
- **A destructive action goes last, alone.** The session menu has 13 entries and two separators; the
  delete sits among them.

`ActionSheet` has no loading or error state at all — errors live in the host screen. That is a
reasonable choice and the plan keeps it; it is listed here so it is a decision rather than an oversight.

## 7. Widths

`core/layout.ts:33` `READING_WIDTH = 860`. The POC uses 1160 and fills 98 % of the chat area at 1920,
against 73 % today.

This is the one item that is *not* a restyle: it changes how long a line of prose is, which is a
reading decision and not a visual one. Three options, and the plan does not pick:

1. Keep 860 (the app is right, the POC was a demonstration).
2. Raise to ~1100, which is still inside a comfortable measure at 15 pt and stops the empty right
   half at 1920.
3. Make it a setting (`Chat width: comfortable / wide`).

Recommendation: **option 2 for the thread, and only for the thread.** `PAGE_WIDTH`/`TOOL_WIDTH` at 980
are already wider than the prose and the cards are data; the 73 % figure measures prose against the
window, not cards against prose, and mixing the two arguments is how the POC ended up at 1160.

Whatever is chosen, the composer and the thread must share one `--gutter` equivalent. Today
`ChatScreen.tsx:227` caps each row at 88 % of the reading column, and the composer caps separately;
that is two numbers that must agree and nothing enforces it. Add a layout test that measures both at
seven widths, the way the POC does.

As built (2026-11-02): 1100, and **`TOOL_WIDTH` follows it**. The paragraph above was measuring the
wrong pair: rows were already drawn in the tool column, so prose at 860 and cards at 980 put a
bubble's edge 60 pt inside a card's and a thread read as misaligned. One row width, one function
(`conversationColumn`), and a test at eight widths. `PAGE_WIDTH` (settings, files) stays 980: a page
of controls is a label and a value at opposite ends, not a sentence.

## 8. Order

Each lot is independently shippable and independently reviewable.

**P0 — the bubble (1 commit).** §2 in full: bubble fields, the four child components, the web
selection, the tests. This is the change the owner actually asked for and it does not need the theme
registry: with two palettes it is already right.

**P1 — the registry, without the picker.** §1 (minus the ten palettes: ship `sable`, `lin`, `charbon`)
plus §3.1–3.2 and the invariants test. `themeId` exists in prefs and the provider, Appearance shows
mode only. Proves the plumbing with three palettes before ten.

**P2 — Appearance.** §3.3. Mode grid, palette list, and the ten palettes from the generator.

**P3 — selection and cards.** §4 and §5, items 1–2. Restyling only.

**P4 — the new card information.** §5 item 3. New behaviour: diff counts, line numbers, list tables.

**P5 — menus.** §6. The largest diff and the smallest risk; it can also be split per mechanism.

**P6 — widths.** §7, once the owner picks an option.

**P7 — the custom theme (§12).** Last, and only once the registry of §1 has proven itself with ten
palettes: a hand-edited palette is the case that breaks every assumption the ten constants let you
get away with.

### 8.1 P0 — a file list, because this one ships alone

- `src/theme/palettes.ts` — add `bubbleUserBg`, `bubbleUserText`, `surfaceRaised`, `codeText`.
  Values from the POC's Sable set, plus the current blue pair kept intact so P1 has something to
  migrate.
- `src/components/Bubble.tsx` — `bubbleUser`, `textUser`, `timeUser`, `queuedUser`; add the hairline.
- `src/components/VoicePlayer.tsx` — 4 style keys (`barOnAccent`, `timeOnAccent`, `rateOnAccent`,
  `rateTextOnAccent`).
- `src/components/VoiceNote.tsx` — 1 (`transcriptOnAccent`).
- `src/components/AttachmentView.tsx` — 2 (`captionOnAccent`, `chipOnAccent`).
- `src/components/LocationView.tsx` — 3 (`cardOnAccent`, `metaOnAccent`, `buttonOnAccent`).
- `src/core/webProps.web.ts` — the `data-claw-on-accent` attribute stays (the primary button still
  needs it), and the bubble keeps setting it; §2.3 explains why this is the smaller change.
- `src/core/__tests__/webThemeSelection.test.ts` — rewrite against `bubbleUserText`.
- `src/components/__tests__/bubbleFoot.test.tsx` — reads bubble colours.

Ten files. Nothing outside `Bubble.tsx` and its four children, which is the whole argument for
shipping it first: it is the only lot that is both the most visible and the most contained.

As built (2026-11-02): `webThemeCss` did not change and `webThemeSelection.test.ts` still passes.
The flip rule keeps its meaning because the bubble keeps its `data-claw-on-accent` marker and the
primary button inside it is still accent-filled; only the bubble's own fill moved. `bubbleFoot.test.tsx`
never read a colour either. A fifth child turned up, `CommandElapsed` (`elapsedAccent`), which the
inventory of §2.2 had missed.

Two of the twelve `*OnAccent` style keys were also wrong for a neutral bubble in a way the table above
does not show: `barPlayedOnAccent` and `thumbOnAccent` were `accentText`, which is white in the light
theme and therefore invisible on `#e4e8ef`. They are `accent` now. `surfaceRaised` in the two existing
palettes was picked so that it also reads *above* `bubbleUserBg` (1.10:1 light, 1.16:1 dark) -- the
generator's `--surface-3` sits below the bubble in the dark set, which P2 must not reintroduce.

And the first values shipped wrong: Sable's bubble colours were pasted into the app's own blue
palette, where a warm `#322f2c` on a blue-black `#0f1115` reads as dirt, not as an elevation --
exactly the mud the POC's generator refuses to produce ("le sable #14120f + l'oxblood donnaient un
brun #35251f"). The bubble and the raised step are cool steps of the *host* palette until P2 replaces
the palette itself; a bubble is warmer only when the theme is.

### 8.2 Where a lot touches more than it looks

| lot | files touched | the surprise |
|---|---|---|
| P1 registry | `theme/palettes.ts`, `theme/index.ts`, `theme/ThemeProvider.tsx`, `core/prefs.ts`, `app/AppShell.tsx`, 2 tests | `useResolvedTheme` is called in `theme.test.tsx` with a bare mode; the signature change is a compile error everywhere, which is the cheap way to find the call sites |
| P2 Appearance | `app/AppearanceScreen.tsx`, `app/settingsParts.tsx`, `scripts/generate-palettes.py` | the segment control cannot hold four labels at 360 pt; it becomes the POC's 2×2 grid, which means a new shared component and a new style block in `settingsParts` |
| P3 selection | `components/ThreadRow.tsx`, `app/Drawer.tsx` | `Drawer.tsx:930` uses `accentSoft` for the "new thread" row — a selection and a creation are two different states and must not look alike |
| P4 cards | `components/ToolCard.tsx`, `core/toolSummary.ts`, `components/SubAgentCard.tsx`, `components/QuestionCard.tsx` | the diff count needs data the card does not receive today; check `tool-preview.md` and the frame shape before promising it |
| P5 menus | `components/ActionSheet.tsx`, `components/PromptSheet.tsx`, `components/OverlayHost.tsx`, `components/ModelSheet.tsx`, `app/Drawer.tsx` | 60+ `ActionSheet` call sites share one component, so the metric change is one file; the per-call-site work is only the labels |
| P6 widths | `core/layout.ts`, `app/ChatScreen.tsx`, `app/Composer.tsx` | the row cap at 88 % (`ChatScreen.tsx:227`) and the composer cap are two numbers that must agree and nothing today compares them |

## 9. Tests

Existing tests that will fail, and why that is correct:

| test | why |
|---|---|
| `core/__tests__/prefs.test.ts:23` | the default object gains `themeId` |
| `core/__tests__/webThemeSelection.test.ts` | asserts the accent/bubble coincidence |
| `components/__tests__/bubbleFoot.test.tsx` | reads bubble colours |
| `theme/__tests__/theme.test.tsx` | `useResolvedTheme` signature changes; `palette` is no longer one of two module constants |
| `components/__tests__/toolCard.test.tsx` | state labels |

New tests:

- `theme/__tests__/palettes.test.ts` — §1.6 invariants over all generated palettes.
- `theme/__tests__/themeProvider.test.tsx` — `amoled` is never resolved from `system`; a stored
  `'dark'` survives the prefs migration; `useThemedStyles` returns the *same* sheet instance across
  re-renders for an unchanged `(palette, scale)` (this is the regression that would silently cost a
  `StyleSheet.create` per frame).
- `app/__tests__/appearanceScreen.test.tsx` — four modes render, the palette list highlights the
  current one, the choice persists.
- a layout test for §7's shared gutter, if option 2 or 3 is chosen.

## 10. Risks

**`useThemedStyles` cache thrash.** The cache is keyed on palette identity. Everything above assumes
palettes are module constants. A convenience helper that returns `{ ...palette, bg: something }` for
one screen creates a new object every render and defeats the cache for that screen. If a derived value
is needed, add a field to `Palette`, do not spread.

**Ten palettes expose every place that assumed a colour.** 125 files read the palette, and 23 hex
literals live outside it. Most of those 23 are legitimate (`ImageViewer`'s caption over a photo,
`DevicesScreen`'s QR quiet zone, `HtmlViewer`'s iframe). The rest deserve a look before P2 ships: a
theme is the cheapest possible audit of hard-coded colour.

**The bubble is visible everywhere.** It is the highest-traffic shape in the app. P0 touches four
child components plus the web selection; it should ship alone, and be looked at on a phone, not only in
a test.

**AMOLED and LCD.** Nothing detects the panel type. Either hide the AMOLED option on iOS (where no
current device is OLED) or ship it everywhere and accept that it is a preference, not a detection. The
plan assumes the latter, since it is a display choice like any other.

## 11. Out of scope

- The `ui-poc` 1160 px column as a number (§7 keeps the decision open).
- Moving `expandTools` / `expandReasoning` between device and server ownership; they stay server-owned
  `uiPrefs`, and theming stays device-local, as today.
- Per-conversation themes. The owner's own argument against the title-bar button applies twice here.
- The `docs/settings.md` and `docs/tool-preview.md` descriptions of the old layout: update them in
  the lot that changes them, not in this plan.

## 12. The custom theme — P7, last

A theme nobody wrote: the owner picks the colours himself and the app treats the result exactly like
the ten constants. It is last because it is the lot that turns every convenience in §1 into a
requirement. With ten module constants, "the palette is a constant" is a fact; with a palette built
from prefs, it is a discipline, and disciplines need a cache and a test.

### 12.1 The registry cannot hold it

`themes: Record<ThemeId, PaletteSet>` stays a table of module constants, and `ThemeId` gains
`'custom'` with `PaletteSet | undefined` semantics: the registry's `custom` entry would have to be
rebuilt when prefs change, which is exactly the identity churn §10 warns about.

So `ThemeId` is `'sable' | … | 'custom'` and resolution goes through one function:

```ts
// theme/resolve.ts
resolvePaletteSet(themeId: ThemeId, custom: CustomTheme | undefined): PaletteSet | undefined;
```

`resolvePaletteSet('custom', …)` returns the memoised set of §12.7; every other id is a table lookup.
`useResolvedTheme` calls it, and falls back to the `defaultThemeId` when `'custom'` has no overrides
left (a wipe, a failed migration) rather than resolving to a half-built palette.

### 12.2 Prefs shape

```ts
export interface CustomTheme {
  /** Sparse: only what the owner typed. Everything else is derived. */
  light: CustomOverrides;
  dark: CustomOverrides;
  amoled: CustomOverrides;
}
/** Hex strings. `Palette` minus the fields a user has no business picking (see 12.3). */
export type CustomOverrides = Partial<Palette>;
```

Device-local, in `core/prefs.ts` beside `themeId` and `mode`, for the same reason: theming never
leaves the device. It survives the migration of §3.1 like any other pref. A `custom` theme with three
empty override sets is not an error state, it is "Duplicate a theme to start" (12.6).

### 12.3 Two tiers of fields, and why not thirty

As built (2026-11-02): **one tier, ten fields, per mode.** The two-tier form above was replaced by
the observation that the derived half is not a preference -- it is contrast arithmetic. Locking a
derived value behind an unlock is the same promise as not offering it at all, minus a lock to
forget. So the editor takes `bg`, `surface`, `line`, `ink`, `muted`, `faint`, `accent`, `ok`,
`warn`, `danger` and derives the other nineteen, exactly as the ten shipped themes do. `bubbleUserBg`
and `codeBg` left the editable list for the same reason.

That also removed the "warn, never rewrite" problem below: there is nothing to warn about, because
everything the owner does not type is computed to pass the invariants.

Thirty `ColorField`s is a form nobody fills in, and twenty of those values are not independent: the
elevation steps, `faint`, `bubbleUserBg`, `codeBg` and the diff backgrounds are all arithmetic on the
eleven the owner actually has an opinion about.

**Tier 1 — the source, editable:** `bg`, `surface`, `border`, `text`, `textMuted`, `accent`, `ok`,
`warn`, `danger`, `bubbleUserBg`, `codeBg`.

**Tier 2 — derived, shown read-only behind a lock:** `surfaceAlt`, `surfaceRaised`, `textFaint`,
`accentText`, `accentSoft`, `bubbleUserText`, `codeText`, `focus`, `selection`, the three `diff*Bg`,
`diffAdd`, `diffDel`, `overlay`.

Unlocking a tier-2 field turns it into an override and it stops being recomputed; a "reset" glyph
puts it back under derivation. That is one boolean per field, and it is what makes the form honest:
the owner sees which values are his and which are arithmetic.

`selection` stays in tier 2 by default (`accent`/`accentText`, §2.3) — it is a mechanical inverse, not
a taste.

### 12.4 Derivation is a port, and a test proves it

`scripts/generate-palettes.py` (P2) owns the algorithm. The app cannot run Python, so `theme/derive.ts`
ports `build()`: mix, push, pull, the AMOLED remix, the bubble ink at 9:1. Two implementations of one
algorithm drift, so the port is not trusted, it is measured:

`theme/__tests__/derive.test.ts` recomputes the ten generated themes from their eleven source colours
and asserts **byte equality** with `themes.generated.ts`. A drift in either direction fails CI. This is
the only reason the generator can stay in Python: the port is checked against its output, not against
its source.

### 12.5 Validation: warn, never rewrite

A hand-picked hex can break every invariant of §1.6, and the app must not "fix" it: a silent rewrite
is reported as "it changed my colour", and it is right. So:

- the ratio of each text pair is displayed live next to its field (`4.7:1`); under 4.5 it is painted
  `danger` and the Appearance card carries "unreadable" — the value stays as typed;
- `ΔE(accent, danger) < 25` is the same warning, not a block;
- the only hard refusals are structural: not a hex, or not 3/6/8 digits. `#abc` expands to `#aabbcc`,
  everything is stored lowercase.

Consequence, stated so it is a decision and not a surprise: a custom theme may fail the invariant test
that the ten constants pass. The test runs on the generated table, not on user prefs — otherwise the
owner could not save a theme the app calls invalid and still shows correctly.

### 12.6 Where it lives, and the one affordance that makes it usable

The palette list in Appearance ends with a **Custom** row. Its primary action is **Duplicate the
current theme**: copy the eleven tier-1 values of whatever is selected into `custom[light|dark|amoled]`
and switch to it. Nobody starts from eleven empty fields; they start from a theme they already like and
change one colour, which is the only thing anyone ever actually wants.

A second action **Reset to derived** clears the overrides of the current mode only.

Selected-mode editing: the editor edits the overrides of the mode currently resolved, and says which
one (`light`/`dark`/`amoled`), because the same hex pair that reads well on white reads as mud on
black. `system` resolves to light or dark and edits that one.

### 12.7 The cache, or the one way this ships broken

`useThemedStyles` keys its `StyleSheet` cache on palette identity (§1.2, §10). A custom palette is
built from prefs, so a naive `buildCustomPalette(overrides)` in the provider body creates a new object
per render and turns every style sheet in the app into a per-frame allocation.

So: a module-level memo keyed by `JSON.stringify(overrides)` per mode, bounded to the last 4 sets
(an edit session touches light and dark, and one undo). Editing commits on blur or on a 300 ms
debounce, never per keystroke, and the memo makes the debounce a nicety rather than the guarantee.

`theme/__tests__/themeProvider.test.tsx` extends the §9 case: two renders with unchanged prefs return
the **same** palette object; one changed hex returns a different one.

### 12.8 Cost

| file | change |
|---|---|
| `core/prefs.ts` | `customTheme` in prefs, default empty, migration test |
| `theme/themes.ts` (P1) | `ThemeId` gains `'custom'`, `resolvePaletteSet` |
| `theme/derive.ts` | **new** — the port of `themes.py`'s `build()`/`amoled()` |
| `theme/customPalette.ts` | **new** — memoised assembly, sparse overrides over derived |
| `app/AppearanceScreen.tsx` | the Custom row, Duplicate, Reset |
| `app/settingsParts.tsx` | `ColorField` (hex input, swatch, live ratio), `FieldGroup` |
| 3 tests | `derive`, `customPalette`, extend `themeProvider` |

~600 lines, of which 200 are the derivation port. It is the most expensive lot and the only optional
one, which is why it is last: if it is cut, §1 through §6 still stand untouched.

## 13. As delivered — 2026-11-03

Every lot in §8 is on `main`, and the parts that were only proposed are marked as built where they
landed. This section records what the plan did not anticipate, so the next reader does not
re-derive it.

**Glyphs.** The plan treated the ~300 text-glyph uses as out of scope. They were not restyling:
`‹` and `›` carry the metrics of whatever font the platform falls back to, so their optical centre
sits off the box, and the same character is a different shape on Android, iOS and the web. 186 uses
that drew chrome became vectors from `components/icons.tsx`; 26 remain and none is drawn (accessibility
labels, help prose, one comment). Two additions to the icon module made it possible without touching
40 call sites: `tone`, a palette role resolved inside the icon, and `color` kept for the one literal
case (an icon over a photograph). The first pass hardcoded `palette.x` per call site and lightened
every back arrow while darkening every row chevron; a role per glyph style is what fixed it.

**What the compiler could not see.** Four defects in that sweep were found only by looking at the
rendered page in a browser: a plus invisible (accent ink on the accent fill), a stat card whose title
carried its own fold mark as text, an empty badge pill, and a 16 pt tap target inside a 34 pt footer.
`scripts/chrome-sheet/` renders the heaviest screens with made-up data so this check needs no login;
it earned its place four times over.

**The voice recorder.** Three separate faults, each a rule the component did not have: react-native-web's
PanResponder is a *touch* responder, so on a phone it never saw `touchmove` once the browser claimed
the pan (`touch-action: none` must be set before the gesture; the web build uses pointer events with
`setPointerCapture`); the composer unmounted the text field for the length of a take, moving the 30 pt
target under the held finger; and a left drag only cancelled on release, so a thumb that stopped past
the threshold decided nothing. `scripts/voice-recorder-e2e/` drives the real Composer against a
stubbed `getUserMedia`, which is how these were settled rather than argued.

**Server side, already fixed.** `llm/resolver.ts` used to do `model.limit ?? global.limit`, replacing
the whole block: a model declaring only `context` lost `output` and no `max_tokens` went out. Commit
`6298ef1` in the server repo resolves each field on its own (`mergedLimit`), so the two `mimo` entries
now inherit an `output` without any config change. Verified against the deployed 0.7.154 by calling
the resolver, not by reading the source.
