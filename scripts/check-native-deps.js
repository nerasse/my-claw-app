/**
 * Autolinking only looks at the direct dependencies of this package.json. A native module
 * pulled in transitively (react-native-reanimated arrived under the zoom library) therefore
 * ships its JavaScript but not its .so, and the app dies the moment that JS calls
 * TurboModuleRegistry.getEnforcing. The unit tests cannot catch it: they mock the natives.
 *
 * So: every installed package that carries an Android native project must be declared here.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const direct = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

// Shipped as part of the framework: linked by react-native itself, not by autolinking.
// Matched exactly or by scope, never by bare prefix: "react-native" as a prefix would
// swallow every native module in the ecosystem, which is the very thing being looked for.
function isFrameworkPackage(name) {
  return (
    name === 'react-native' ||
    name.startsWith('@react-native/') ||
    name.startsWith('@react-native-community/cli')
  );
}

function isNativeAndroidModule(dir) {
  if (!fs.existsSync(path.join(dir, 'android'))) return false;
  return ['build.gradle', 'build.gradle.kts'].some(f =>
    fs.existsSync(path.join(dir, 'android', f)),
  );
}

function packageDirs(modulesDir) {
  if (!fs.existsSync(modulesDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(modulesDir)) {
    if (entry.startsWith('.')) continue;
    const full = path.join(modulesDir, entry);
    if (entry.startsWith('@')) {
      for (const scoped of fs.readdirSync(full)) {
        out.push([`${entry}/${scoped}`, path.join(full, scoped)]);
      }
      continue;
    }
    out.push([entry, full]);
  }
  return out;
}

const missing = [];
for (const [name, dir] of packageDirs(path.join(root, 'node_modules'))) {
  if (direct.has(name)) continue;
  if (isFrameworkPackage(name)) continue;
  if (!isNativeAndroidModule(dir)) continue;
  missing.push(name);
}

if (missing.length > 0) {
  console.error(
    'These packages ship Android native code but are not direct dependencies, so autolinking\n' +
      'will skip them and the app will crash when their JavaScript reaches for the native module:\n' +
      missing.map(name => `  - ${name}`).join('\n') +
      `\n\nFix: npm install ${missing.join(' ')}`,
  );
  process.exit(1);
}

console.log(`native deps: ${direct.size} direct packages, no unlinked native module`);
