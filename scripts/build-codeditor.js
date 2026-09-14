#!/usr/bin/env node
/**
 * Builds the editor page the Android WebView loads.
 *
 * Source:  src/components/codeeditor/page.ts (+ page.html as the shell)
 * Output:  assets/codeditor/index.html -- one self-contained file, bundle inlined.
 *
 * The output is committed on purpose: `android/app/build.gradle` only *copies* it into the app's
 * assets at preBuild, so a release build needs no node, no esbuild and no network beyond what it
 * already needs. Re-run this after touching anything under src/components/codeeditor/:
 *
 *   node scripts/build-codeditor.js
 *
 * `--check` builds in memory and fails if the committed file differs, which is what a CI job
 * would want (nothing wires it up yet).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src/components/codeeditor/page.ts');
const template = path.join(root, 'src/components/codeeditor/page.html');
const outFile = path.join(root, 'assets/codeditor/index.html');
const PLACEHOLDER = '/*__CODEEDITOR_BUNDLE__*/';

async function build() {
  const html = fs.readFileSync(template, 'utf8');
  if (!html.includes(PLACEHOLDER)) {
    throw new Error(`${path.relative(root, template)} lost its ${PLACEHOLDER} placeholder`);
  }
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    // One IIFE, no imports left: the page is loaded with a plain <script>.
    format: 'iife',
    platform: 'browser',
    // The WebView on the oldest supported release (Android 8, Chrome 61+) is far newer than
    // this floor; the target is here so esbuild stops down-emitting for pre-2018 engines.
    target: ['chrome100'],
    minify: true,
    write: false,
  });
  // A literal closing-script tag anywhere in the JS (a string, a regex) would close the inline
  // tag and break the page in a way that only shows on a device.
  const escaped = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // The replacer is a FUNCTION on purpose: a string one is a substitution template, and the
  // first dollar-pattern in CodeMirror's own minified code injected the entire page into itself
  // (silently, with valid-looking but broken JS).
  const page = html.replace(PLACEHOLDER, () => escaped);
  if (page.includes(PLACEHOLDER)) {
    throw new Error('the bundle placeholder survived: the page would be stitched twice');
  }
  return page;
}

async function main() {
  const page = await build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
    if (current !== page) {
      console.error(
        `${path.relative(root, outFile)} is stale: run node scripts/build-codeditor.js`,
      );
      process.exit(1);
    }
    console.log(`codeditor: ${path.relative(root, outFile)} is up to date`);
    return;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, page);
  console.log(`codeditor: ${(page.length / 1024).toFixed(0)} KB -> ${path.relative(root, outFile)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
