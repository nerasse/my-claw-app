/**
 * The markdown renderers never execute HTML -- tokens render as literal text -- but a quoted
 * page dump or an adversarial document should not litter the screen with active-content tags
 * either. Stripped here, at renderer level: fenced code blocks are `code` tokens and never
 * pass through html(), so a sample `<script>` in a listing survives untouched.
 */
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'link',
  'style',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'template',
  'base',
  'noscript',
  'frame',
  'frameset',
];

const DANGEROUS_HTML = new RegExp(`^<\\/?(?:${DANGEROUS_TAGS.join('|')})\\b`, 'i');

export function isDangerousHtml(raw: string): boolean {
  return DANGEROUS_HTML.test(raw);
}
