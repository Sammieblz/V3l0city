const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

for (const value of ['', 'not-a-url', 'postgresql://fixture:never-print-this@127.0.0.1/production', 'https://fixture:never-print-this@example.test/fixture_test']) {
  test('server CI rejects missing or non-isolated PostgreSQL configuration before running fixtures', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'test-server.cjs'), '--require-postgres'], {
      env: { ...process.env, TEST_DATABASE_URL: value }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /isolated TEST_DATABASE_URL/);
    assert.doesNotMatch(result.stdout + result.stderr, /never-print-this|production|example\.test/);
    assert.equal(result.stdout, '');
  });
}
