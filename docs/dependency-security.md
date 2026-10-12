# Dependency security maintenance

The October 11, 2026 qualification keeps React Native 0.86.2, React 19.2.8 and
the existing Expo/native versions. Compatible transitive patches are pinned by
`overrides` and `package-lock.json`; `npm ci` remains the installation command.

Five dependency families lack a compatible published fix for this locked graph.
`postinstall` applies reviewed local changes from `scripts/dependency-patches.json`:

| Dependency | Change | Reference |
| --- | --- | --- |
| braces 3.0.3 | Reject nesting deeper than 128 in parsing and recursive AST consumers | [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| node-forge 1.4.0 | Validate DigestAlgorithm child count before accepting RSA signatures; backport PR 1152 | [Upstream fix](https://github.com/digitalbazaar/forge/pull/1152) |
| uuid 7.0.3 | Validate destination offset/space before writing name-based UUIDs, in all three implementations | [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| image-size 1.2.1 | Reject ICNS entries and ISO-BMFF boxes that cannot advance or exceed the buffer | [ICNS](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [ISO-BMFF](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) |
| sprintf-js 1.0.3 | Bound numeric precision to 100 before allocation | [Advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) |

The installer checks SHA256 before/after and exact replacement counts, verifies all
inputs before writing, is idempotent and refuses unknown bytes. It never rewrites
package versions or suppresses advisories. Do not bypass it with `--ignore-scripts`.

Run `npm run check:dependency-patches` after installation or lock changes. CI runs
the installed-byte checks and seven behavior tests: malformed image timeouts and
valid inputs, recursive braces, signature rejection, UUID buffer integrity, precision
bounds and the published shell-quote newline fix.

The October 11 full graph audit reported 72 affected package entries, 60 high and
12 moderate, zero critical. The fresh October 12 audit reports 71 entries, 59 high
and 12 moderate, zero critical, with the same lockfile. These include propagated
parent entries for locally patched versions.
**`npm audit` is not clean**: record its output separately from patch tests. A local
mitigation is not an upstream release or a general security certification. The initial
full audit had 78 entries including one critical; do not compare with a dev-excluded audit.

When a compatible upstream fix arrives, review the new bytes and behavior, then
remove the patch and update the lockfile together. Never just replace a hash to make
installation pass. Native dependency upgrades remain a separate decision.
