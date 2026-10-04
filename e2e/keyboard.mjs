/**
 * The app driven with the keyboard alone, in a real Chromium: no click after the pairing link.
 * Exits non-zero at the first step that does not land where it should -- docs/keyboard.md.
 *
 * Run against the server's compose test instance (my-claw repo, packaging/compose), from inside
 * its browser container, which has Chromium and playwright-core:
 *
 *   docker cp e2e/keyboard.mjs <project>-browser-1:/tmp/keyboard.mjs
 *   code=$(docker compose ... exec -T my-claw myclaw device add --name kb --kind web | sed -n 's/^Web.*#//p')
 *   docker compose ... exec -T browser node /tmp/keyboard.mjs "$code" [http://my-claw:8080]
 *
 * A fresh server (no model) opens on the first-run setup: the script leaves it with the keyboard
 * too, which is the first thing it checks.
 */
import { chromium } from '/app/node_modules/playwright-core/index.mjs';

const [code, origin = 'http://my-claw:8080'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a && a !== document.body ? a.getAttribute('aria-label') || a.tagName : 'none';
  });
const has = async label => (await page.getByLabel(label, { exact: true }).count()) > 0;
const press = async key => {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
};
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
/** Arrows down until the focus is on that label: what a person does in a list. */
const arrowTo = async label => {
  for (let i = 0; i < 40 && (await focused()) !== label; i++) await press('ArrowDown');
  return (await focused()) === label;
};

await page.goto(`${origin}/pair#${code}`);
await page.waitForURL(u => !u.pathname.startsWith('/pair'), { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);

if (await has('Skip setup for now')) {
  check(await arrowTo('Skip setup for now'), 'the setup is walked with the arrows down to Skip');
  await press('Enter');
  check(!(await has('Skip setup for now')), 'Enter presses the focused button');
}

await press('Shift+S');
check((await focused()) === 'Search conversations', 'Shift+S puts the caret in the conversation search');
await press('Shift+B');
check(!(await has('Live view')), 'a Shift letter types in a field instead of opening a page');
await press('Escape');
check((await focused()) === 'none', 'Escape leaves the field first');

await press('Control+Comma');
check(await has('Open providers'), 'Ctrl+, opens the settings');
check(!(await has('Close settings')), 'the settings index has no cross: its Back is that already');
check(await arrowTo('Open providers'), 'the arrows walk the settings list');
await press('Enter');
await page.waitForTimeout(500);
check(await has('Close settings'), 'a settings page carries the cross');
check(await arrowTo('Open provider tags'), 'the arrows walk the next page, from no focus');
await press('Enter');
await page.waitForTimeout(500);
await press('Home');
check((await focused()) === 'Back to providers', 'Home is the first control of the page: its Back');
for (let i = 0; i < 6 && (await focused()) !== 'Close settings'; i++) await press('ArrowRight');
check((await focused()) === 'Close settings', 'the arrows go sideways along the header to the cross');
await press('Enter');
await page.waitForTimeout(500);
check(!(await has('Back to providers')) && !(await has('Open providers')), 'the cross leaves the whole settings stack');

await press('Shift+B');
await page.waitForTimeout(800);
check(await has('Live view'), 'Shift+B opens the browser');
await press('Shift+J');
await page.waitForTimeout(600);
check(await has('Add job'), 'Shift+J opens the jobs');
await press('Shift+Escape');
await page.waitForTimeout(600);
check(!(await has('Live view')) && !(await has('Add job')), 'Shift+Escape closes everything');

await press('Shift+Slash');
await page.waitForTimeout(500);
check((await focused()) === 'New conversation', 'the shortcuts sheet opens focused on its first row');
await press('ArrowUp');
check((await focused()) === 'Keyboard shortcuts', 'a menu goes round its ends');
await press('b');
check((await focused()) === 'Browser', 'a letter jumps to the row it starts');
await press('End');
await press('Tab');
check((await focused()) === 'New conversation', 'Tab from the last row goes round to the first: it stays in the menu');
await press('Escape');
check(!(await has('Keyboard shortcuts')) || !(await page.evaluate(() => !!document.querySelector('[data-claw-keys="menu"]'))), 'Escape closes the menu');

for (let i = 0; i < 60 && (await focused()) !== 'More'; i++) await press('Tab');
await press('Enter');
await page.waitForTimeout(500);
check((await focused()) === 'Archived', 'a menu opened from the keyboard takes the focus');
await press('Escape');
check((await focused()) === 'More', 'and gives it back to what opened it when it closes');

check(errors.length === 0, `no page error${errors.length ? `: ${errors[0]}` : ''}`);
await browser.close();
console.log(failed ? `${failed} step(s) failed` : 'PASS keyboard');
process.exit(failed ? 1 : 0);
