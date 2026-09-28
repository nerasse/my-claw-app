#!/usr/bin/env node
/**
 * Builds the PDF page the Android WebView loads -- same shape as `build-codeditor.js`.
 *
 * Source:  src/components/pdfviewer/page.ts (+ page.html as the shell)
 * Output:  assets/pdfviewer/index.html -- one self-contained file, bundle inlined.
 *
 * The output is committed on purpose: `android/app/build.gradle` only *copies* it into the app's
 * assets at preBuild, so a release build needs no node, no esbuild and no network. Re-run this
 * after touching anything under src/components/pdfviewer/:
 *
 *   node scripts/build-pdfviewer.js
 *
 * `--check` builds in memory and fails if the committed file differs, which is what a CI job
 * would want.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'src/components/pdfviewer/page.ts');
const template = path.join(root, 'src/components/pdfviewer/page.html');
const outFile = path.join(root, 'assets/pdfviewer/index.html');
const PLACEHOLDER = '/*__PDFVIEWER_BUNDLE__*/';

/**
 * `?text` in an import means "give me this file's source as a string", which is how the pdf.js
 * worker is inlined: a separate worker file would be a second request over a base URL that may
 * only serve the media route. esbuild has no such loader, so it is a plugin.
 */
const textLoader = {
  name: 'text',
  setup(builder) {
    builder.onResolve({ filter: /\?text$/ }, args => ({
      // `require.resolve` from the project root, not `args.resolveDir`: the import names a package,
      // and resolving it against the importing file's directory looked for node_modules inside
      // src/components/pdfviewer/.
      path: require.resolve(args.path.replace(/\?text$/, ''), { paths: [root] }),
      namespace: 'text',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'text' }, async args => ({
      contents: await fs.promises.readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

async function build() {
  const html = fs.readFileSync(template, 'utf8');
  if (!html.includes(PLACEHOLDER)) {
    throw new Error(`${path.relative(root, template)} lost its ${PLACEHOLDER} placeholder`);
  }
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    // The Android WebView on the oldest supported release is far newer than this floor; the
    // target is here so esbuild stops down-emitting for pre-2018 engines.
    target: ['chrome100'],
    minify: true,
    write: false,
    plugins: [textLoader],
  });
  // A literal closing-script tag anywhere in the JS (a string, a regex) would close the inline
  // tag and break the page in a way that only shows on a device.
  const escaped = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // The replacer is a FUNCTION on purpose: a string one is a substitution template, and a
  // dollar-pattern in pdf.js's own minified code would inject the whole page into itself.
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
      console.error(`${path.relative(root, outFile)} is stale: run node scripts/build-pdfviewer.js`);
      process.exit(1);
    }
    console.log(`pdfviewer: ${path.relative(root, outFile)} is up to date`);
    return;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, page);
  console.log(`pdfviewer: ${(page.length / 1024).toFixed(0)} KB -> ${path.relative(root, outFile)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
