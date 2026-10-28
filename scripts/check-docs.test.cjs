const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkDocumentation } = require('./check-docs.cjs');

test('documentation gate detects broken local targets while accepting code examples, external URLs, spaces and grouped routes', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'v3l0city-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs/(group)'), { recursive: true });
  writeFileSync(path.join(root, 'docs/(group)/a b.md'), '# Target');
  writeFileSync(path.join(root, 'docs/(group)/page.md'), '# Target');
  writeFileSync(path.join(root, 'README.md'), [
    '[space](<docs/(group)/a b.md#heading>)', '[group](docs/(group)/page.md?raw=true)',
    '[web](https://example.test/not-a-repository-file)', '[heading](#inside)',
    '`[inline](fake.ts)`', '```md', '[sample](fake.ts)', '```',
    '[reference]: docs/(group)/page.md', '[broken](docs/missing.md)',
  ].join('\n'));
  assert.deepEqual(checkDocumentation(root).failures, ['README.md: missing repository target docs/missing.md']);
});

test('documentation gate rejects path escape and malformed URL encoding without following outside files', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'v3l0city-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'README.md'), '[escape](../README.md)\n[malformed](docs/%ZZ.md)');
  const failures = checkDocumentation(root).failures;
  assert.equal(failures.length, 2);
  assert.match(failures[0], /missing repository target/);
  assert.match(failures[1], /malformed link/);
});
