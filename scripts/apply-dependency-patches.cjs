const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const patches = require('./dependency-patches.json');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const writes = [];
for (const patch of patches) {
  const segments = patch.file.split('/');
  const packageName = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  if (patch.optional && !fs.existsSync(path.join(root, 'node_modules', packageName, 'package.json'))) continue;
  const filename = path.resolve(root, 'node_modules', patch.file);
  if (!filename.startsWith(path.join(root, 'node_modules') + path.sep)) throw new Error('Invalid patch path');
  const source = fs.readFileSync(filename, 'utf8');
  if (digest(source) === patch.after) continue;
  if (digest(source) !== patch.before) throw new Error('Dependency patch needs review: ' + patch.file);
  let updated = source;
  for (const replacement of patch.replacements) {
    if (updated.split(replacement.from).length - 1 !== replacement.count) {
      throw new Error('Dependency patch does not match: ' + patch.file);
    }
    updated = updated.split(replacement.from).join(replacement.to);
  }
  if (digest(updated) !== patch.after) throw new Error('Invalid dependency patch output: ' + patch.file);
  writes.push([filename, updated]);
}
if (process.argv.includes('--check')) {
  if (writes.length) throw new Error('Dependency patches have not been applied');
} else {
  for (const [filename, updated] of writes) fs.writeFileSync(filename, updated);
}
console.log('Dependency patches verified:', patches.length);
