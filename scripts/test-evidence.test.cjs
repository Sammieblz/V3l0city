const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { hasCompleteEvidence } = require('./test-evidence.cjs');

test('real skipped/todo Node tests exit successfully but cannot pass the mandatory CI evidence gate', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'v3l0city-test-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  for (const disposition of ['pass', 'skip', 'todo']) {
    const file = path.join(directory, `${disposition}.test.cjs`);
    writeFileSync(file, `const test = require('node:test'); test('synthetic evidence', { ${disposition === 'pass' ? '' : `${disposition}: true`} }, () => {});`);
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
      env: childEnvironment, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.equal(hasCompleteEvidence(result.stdout), disposition === 'pass');
    assert.equal(hasCompleteEvidence(result.stdout + result.stdout), false);
    assert.equal(hasCompleteEvidence(result.stdout.replace(/^# skipped .*$/m, '')), false);
  }
  assert.equal(hasCompleteEvidence(''), false);
});
