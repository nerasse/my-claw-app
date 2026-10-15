/**
 * The languages both hosts can highlight, and the id -> CodeMirror extension table.
 *
 * One table, two consumers: the WebView page (`page.ts`, bundled by `scripts/build-codeditor.js`)
 * and the web host (`CodeEditor.web.tsx`, bundled by Metro). Keeping a single table is what makes
 * `languageForFile` in `CodeEditor.tsx` safe to trust: the ids it maps extensions to are exactly
 * the ids this module can load, and no host can drift from the other without this file changing.
 *
 * Ids are the names the mission's file-navigation page passes as `language` — deliberately the
 * same words `@actualwave/react-native-codeditor` uses, so the vocabulary survives if this host
 * is ever swapped back.
 *
 * Language packages are ~100 KB to 1 MB of Lezer parser each, and both bundles get the whole
 * table: dropping one id does not shrink a bundle, removing its row and its mapping does.
 */
import { StreamLanguage } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sass } from '@codemirror/lang-sass';
import { PLSQL, sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { csharp, kotlin, scala } from '@codemirror/legacy-modes/mode/clike';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import type { Extension } from '@codemirror/state';

/** A Lezer parser where one exists; a stream parser (legacy mode) otherwise. */
function legacy(mode: Parameters<typeof StreamLanguage.define>[0]): Extension {
  return StreamLanguage.define(mode);
}

const LOADERS: Readonly<Record<string, () => Extension>> = {
  c: () => cpp(),
  cpp: () => cpp(),
  csharp: () => legacy(csharp),
  css: () => css(),
  diff: () => legacy(diff),
  dockerfile: () => legacy(dockerFile),
  go: () => go(),
  html: () => html(),
  ini: () => legacy(properties),
  java: () => java(),
  javascript: () => javascript(),
  json: () => json(),
  jsx: () => javascript({ jsx: true }),
  kotlin: () => legacy(kotlin),
  lua: () => legacy(lua),
  markdown: () => markdown(),
  php: () => php(),
  plsql: () => sql({ dialect: PLSQL }),
  powershell: () => legacy(powerShell),
  python: () => python(),
  ruby: () => legacy(ruby),
  rust: () => rust(),
  sass: () => sass({ indented: true }),
  scala: () => legacy(scala),
  scss: () => sass(),
  shell: () => legacy(shell),
  sql: () => sql(),
  toml: () => legacy(toml),
  tsx: () => javascript({ jsx: true, typescript: true }),
  typescript: () => javascript({ typescript: true }),
  vb: () => legacy(vb),
  xml: () => xml(),
  yaml: () => yaml(),
};

/** The ids this table can load. The tests hold `languageForFile` against this list. */
export const LANGUAGE_IDS: readonly string[] = Object.keys(LOADERS);

/**
 * The CodeMirror extension for a language id, or `[]` for null/unknown.
 *
 * Never throws: a file whose extension mapped to an id this table lost highlights as plain text
 * rather than taking the editor down with it.
 */
export function languageExtension(
  language: string | null | undefined,
): Extension {
  if (language === null || language === undefined) return [];
  const load = LOADERS[language];
  return load ? load() : [];
}

/**
 * Fence info strings, mapped to the ids this table holds: what ```bash and ```ts mean.
 *
 * A fence nobody here can parse (```text```, ```output```) maps to null, and plain monospace is
 * the honest answer there -- colour invented from a guess is worse than none. Ids that are
 * already loadable need no alias; only the shorthand and the file-name spelling do.
 */
const FENCE_ALIASES: Readonly<Record<string, string>> = {
  bash: 'shell',
  cjs: 'javascript',
  console: 'shell',
  docker: 'dockerfile',
  htm: 'html',
  js: 'javascript',
  jsonc: 'json',
  md: 'markdown',
  mjs: 'javascript',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'shell',
};

function owned(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOADERS, id);
}

/**
 * The id a fence names, or null. The info string reads like '```ts title="a.ts"': the first word
 * is the language, the rest is metadata for renderers that decorate the block.
 */
export function languageForFence(info: string | null | undefined): string | null {
  const first = info?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first) return null;
  if (owned(first)) return first;
  const alias = FENCE_ALIASES[first];
  return alias && owned(alias) ? alias : null;
}

