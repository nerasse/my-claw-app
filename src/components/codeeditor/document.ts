/**
 * What both hosts must implement identically, in a module neither of them shadows.
 *
 * This file is deliberately named after nothing a host is named after: Metro resolves
 * `./CodeEditor` *from inside* `CodeEditor.native.tsx` to `CodeEditor.native.tsx` itself, so a
 * runtime helper imported from there would be an undefined self-import. Types survive that
 * (type-only imports are erased, and tsc does resolve `CodeEditor.tsx`), which is why the frozen
 * props stay in `CodeEditor.tsx` and the executable parts live here.
 */

/**
 * Step 2 of the anti-loop rule, in one place so both hosts share it rather than each spelling it
 * out (read the header of `CodeEditor.tsx` for the rule itself).
 *
 * `documentValue` is what the host last put into the document -- the value it raised through
 * `onChange`, or wrote itself. It is null only before a host holds a document: the initial value
 * travels in the code that builds the editor, so there is nothing to replace yet.
 */
export function shouldReplaceDocument(
  value: string,
  documentValue: string | null,
): boolean {
  if (documentValue === null) return false;
  return value !== documentValue;
}

/**
 * Extension -> language id, the vocabulary the file-navigation page passes as `language`.
 *
 * Unknown extensions (and files with none) map to null, which every host renders as plain text:
 * a `.bin`, a `LICENSE`, a `Makefile` -- they still open, they just do not pretend to parse.
 *
 * Exported because the tests hold this table, `LANGUAGE_BY_FILENAME` and the hosts' own
 * `LANGUAGE_IDS` against each other: an id here that no host can load highlights nothing.
 */
export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  c: 'c',
  cc: 'cpp',
  cfg: 'ini',
  'c++': 'cpp',
  cjs: 'javascript',
  conf: 'ini',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  cxx: 'cpp',
  diff: 'diff',
  dockerfile: 'dockerfile',
  env: 'ini',
  go: 'go',
  h: 'c',
  hh: 'cpp',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  hxx: 'cpp',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  lua: 'lua',
  md: 'markdown',
  mdown: 'markdown',
  mjs: 'javascript',
  markdown: 'markdown',
  mts: 'typescript',
  patch: 'diff',
  phtml: 'php',
  php: 'php',
  pkb: 'plsql',
  pks: 'plsql',
  plist: 'xml',
  pls: 'plsql',
  plsql: 'plsql',
  properties: 'ini',
  ps1: 'powershell',
  psd1: 'powershell',
  psm1: 'powershell',
  py: 'python',
  pyi: 'python',
  pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  sass: 'sass',
  sc: 'scala',
  scala: 'scala',
  scss: 'scss',
  sh: 'shell',
  bash: 'shell',
  ksh: 'shell',
  sql: 'sql',
  svg: 'xml',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  vb: 'vb',
  vbs: 'vb',
  webmanifest: 'json',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shell',
};

/** Files whose name, not extension, is the language. Keys are lowercased, dot stripped. */
export const LANGUAGE_BY_FILENAME: Readonly<Record<string, string>> = {
  bash_profile: 'shell',
  bashrc: 'shell',
  containerfile: 'dockerfile',
  dockerfile: 'dockerfile',
  env: 'ini',
  gemfile: 'ruby',
  profile: 'shell',
  rakefile: 'ruby',
  zshrc: 'shell',
};

/**
 * The language id for a file name or path, or null when nothing should be highlighted.
 *
 * The page maps the file it opens through this and passes the result as `language`; it is here
 * rather than in the page because both hosts render the same ids (`LANGUAGE_IDS` in
 * `languages.ts`) and the tests hold the two tables against each other.
 */
export function languageForFile(fileName: string): string | null {
  const base = (fileName.split(/[/\\]/).pop() ?? '').toLowerCase();
  const bare = base.startsWith('.') ? base.slice(1) : base;
  const byName = LANGUAGE_BY_FILENAME[bare];
  if (byName !== undefined) return byName;
  const dot = bare.lastIndexOf('.');
  if (dot < 0) return null;
  return LANGUAGE_BY_EXTENSION[bare.slice(dot + 1)] ?? null;
}
