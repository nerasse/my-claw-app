/**
 * What a file is, on the reading side -- the server's vocabulary, mirrored (docs/file-preview.md).
 *
 * The server classifies by content and by name and sends the verdict as `kind` on every
 * attachment and every session file. The app still needs a word for the two cases the wire cannot
 * cover: a file picked but not yet sent, and a turn replayed from a log written before `kind`
 * existed. Both have only a name, so this is the name half, kept in step with the server's
 * `utils/file-kind.ts` by its tests.
 */

export type FileKind =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'markdown'
  | 'html'
  | 'svg'
  | 'csv'
  | 'json'
  | 'code'
  | 'text'
  | 'archive'
  | 'office'
  | 'binary';

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', heic: 'image', heif: 'image',
  bmp: 'image', tiff: 'image', tif: 'image', avif: 'image', ico: 'image',
  svg: 'svg',
  mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', aac: 'audio',
  flac: 'audio', amr: 'audio', weba: 'audio', aiff: 'audio', wma: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', m4v: 'video', avi: 'video', mpg: 'video',
  mpeg: 'video', '3gp': 'video',
  pdf: 'pdf',
  md: 'markdown', markdown: 'markdown', mdown: 'markdown', mdx: 'markdown',
  html: 'html', htm: 'html', xhtml: 'html',
  csv: 'csv', tsv: 'csv',
  json: 'json', jsonc: 'json', json5: 'json', geojson: 'json',
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', mjs: 'code', cjs: 'code', mts: 'code', cts: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', kt: 'code', kts: 'code',
  c: 'code', h: 'code', hpp: 'code', hh: 'code', hxx: 'code', cc: 'code', cpp: 'code', cxx: 'code',
  cs: 'code', php: 'code', lua: 'code', swift: 'code', dart: 'code', scala: 'code', r: 'code', pl: 'code',
  ex: 'code', exs: 'code', erl: 'code', hs: 'code', clj: 'code', vue: 'code', svelte: 'code', astro: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code', ksh: 'code', ps1: 'code', bat: 'code', cmd: 'code',
  sql: 'code', plsql: 'code', pks: 'code', pkb: 'code', prc: 'code', fnc: 'code',
  yaml: 'code', yml: 'code', toml: 'code', ini: 'code', cfg: 'code', conf: 'code', properties: 'code',
  env: 'code', editorconfig: 'code', xml: 'code', xsl: 'code', xslt: 'code', xsd: 'code', plist: 'code',
  graphql: 'code', gql: 'code', proto: 'code', tf: 'code', tfvars: 'code', hcl: 'code',
  diff: 'code', patch: 'code', dockerfile: 'code', makefile: 'code', cmake: 'code', gradle: 'code',
  gitignore: 'code', gitattributes: 'code', lock: 'code', sum: 'code', mod: 'code', nft: 'code',
  txt: 'text', text: 'text', log: 'text', nfo: 'text', rst: 'text', adoc: 'text', org: 'text',
  tex: 'text', srt: 'text', vtt: 'text', ics: 'text', vcf: 'text',
  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive', tbz2: 'archive',
  xz: 'archive', txz: 'archive', zst: 'archive', '7z': 'archive', rar: 'archive', jar: 'archive', war: 'archive',
  doc: 'office', docx: 'office', xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office',
  odt: 'office', ods: 'office', odp: 'office', rtf: 'office',
};

/** Names that carry their language instead of an extension. */
const CODE_BY_FILENAME = new Set([
  'dockerfile', 'makefile', 'cmakelists.txt', 'gemfile', 'rakefile', 'procfile', 'justfile', 'vagrantfile',
]);

function basename(filename: string): string {
  const parts = filename.split(/[/\\]/);
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

function extensionOf(filename: string): string {
  const base = basename(filename);
  const dot = base.lastIndexOf('.');
  if (dot > 0 && dot < base.length - 1) return base.slice(dot + 1);
  if (dot < 0) return base;
  return base.slice(dot + 1);
}

/** What the name alone says, or nothing when it settles nothing. */
export function kindForName(filename: string | undefined): FileKind | undefined {
  if (!filename) return undefined;
  if (CODE_BY_FILENAME.has(basename(filename))) return 'code';
  return KIND_BY_EXTENSION[extensionOf(filename)];
}
