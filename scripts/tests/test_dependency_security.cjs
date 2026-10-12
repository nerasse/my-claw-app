const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('shell quoting rejects a line terminator after a comment token', () => {
  const { quote } = require('shell-quote');
  assert.throws(() => quote(['echo', 'safe', { comment: 'test' }, 'value\nid;#']), TypeError);
  assert.equal(quote(['echo', 'safe']), 'echo safe');
});

test('patched files match their reviewed hashes', () => {
  const result = spawnSync(process.execPath, ['scripts/apply-dependency-patches.cjs', '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('malformed image containers terminate and valid dimensions still parse', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const size = require('image-size');
    const icns = Buffer.alloc(24); icns.write('icns'); icns.writeUInt32BE(24, 4); icns.write('icp4', 8);
    assert.throws(() => size(icns), /Invalid ICNS/);
    const utils = require('image-size/dist/types/utils.js');
    const box = Buffer.alloc(20); box.write('jxlp', 4);
    assert.equal(utils.findBox(box, 'jxlp', 0).size, 20);
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000002000000030806000000', 'hex');
    assert.deepEqual(size(png), { width: 2, height: 3, type: 'png' });
  `], { encoding: 'utf8', timeout: 1500 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});

test('brace parsing and AST walks reject excessive nesting without overflowing the stack', () => {
  const braces = require('braces');
  assert.throws(() => braces('{'.repeat(10000) + 'x,y' + '}'.repeat(10000)), SyntaxError);
  assert.deepEqual(braces.expand('a{b,c}'), ['ab', 'ac']);
  const ast = { type: 'root', nodes: [] }; let node = ast;
  for (let i = 0; i < 200; i++) { const child = { type: 'root', nodes: [] }; node.nodes.push(child); node = child; }
  for (const method of ['compile', 'expand', 'stringify']) assert.throws(() => braces[method](ast), SyntaxError);
});

test('name UUIDs reject undersized buffers before writing into them', () => {
  const uuid = require('uuid');
  for (const method of ['v3', 'v5']) {
    const buffer = Buffer.alloc(8, 0xaa);
    assert.throws(() => uuid[method]('MyClaw', uuid[method].DNS, buffer, 4), RangeError);
    assert.deepEqual(buffer, Buffer.alloc(8, 0xaa));
    const valid = Buffer.alloc(16);
    assert.equal(uuid[method]('MyClaw', uuid[method].DNS, valid, 0), valid);
    assert.equal(uuid[method]('MyClaw', uuid[method].DNS).length, 36);
  }
});

test('RSA rejects extra nested digest elements and accepts a valid signature', () => {
  const forge = require('node-forge');
  const { asn1, pki, md } = forge;
  const keys = pki.rsa.generateKeyPair({ bits: 1024, e: 65537 });
  const hash = md.sha256.create().update('MyClaw'); const digest = hash.digest().getBytes();
  assert.equal(keys.publicKey.verify(digest, keys.privateKey.sign(hash)), true);
  const value = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(pki.oids.sha256).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'extra'),
    ]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
  ]);
  const signature = keys.privateKey.sign(asn1.toDer(value).getBytes(), 'NONE');
  assert.throws(() => keys.publicKey.verify(digest, signature), /valid RSASSA/);
});

test('format precision stays bounded for all numerical conversions', () => {
  const { sprintf } = require('sprintf-js');
  assert.equal(sprintf('%.2f', 1.25), '1.25');
  for (const type of ['e', 'f', 'g']) assert.ok(sprintf('%.100000000' + type, 1.25).length < 120);
});
