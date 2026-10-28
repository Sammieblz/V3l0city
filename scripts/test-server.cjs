const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const resetOutput = require('./reset-output.cjs');
const { hasCompleteEvidence } = require('./test-evidence.cjs');

const root = path.resolve(__dirname, '..');
const shared = process.argv.includes('--shared');
const requirePostgres = process.argv.includes('--require-postgres');
if (requirePostgres) {
  let safe = false;
  try {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    safe = !shared && ['postgres:', 'postgresql:'].includes(url.protocol) &&
      /^[a-z0-9_]+_test$/.test(decodeURIComponent(url.pathname.slice(1)));
  } catch { /* A field name is enough to diagnose configuration; do not echo credentials. */ }
  if (!safe) {
    console.error('server:test:ci requires an isolated TEST_DATABASE_URL with a database name ending _test.');
    process.exit(1);
  }
}
const output = shared ? 'dist-test/shared' : 'dist-test/server';
resetOutput(root, output);
const compile = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'server/tsconfig.test.json', '--outDir', output], {
  cwd: root, stdio: 'inherit',
});
if (compile.status !== 0) process.exit(compile.status ?? 1);
const directory = `${output}/${shared ? 'shared' : 'server/src'}`;
const tests = readdirSync(path.join(root, directory), { recursive: true })
  .filter((file) => String(file).endsWith('.test.js'))
  .map((file) => path.join(directory, String(file)));
if (!tests.length) throw new Error(`No tests found in ${directory}.`);
const run = spawnSync(process.execPath, ['--test', ...(requirePostgres ? ['--test-reporter=tap'] : []), ...tests], {
  cwd: root,
  stdio: requirePostgres ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (requirePostgres) {
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  if (run.status === 0 && !hasCompleteEvidence(run.stdout ?? '')) {
    console.error('Server CI requires a complete TAP summary with passing tests and zero skipped/cancelled/todo tests.');
    process.exit(1);
  }
}
if (run.error) console.error('The server test process could not complete.');
process.exit(run.status ?? 1);
