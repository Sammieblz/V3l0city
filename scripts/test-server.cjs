const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const resetOutput = require('./reset-output.cjs');

const root = path.resolve(__dirname, '..');
const shared = process.argv.includes('--shared');
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
const run = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 1);
