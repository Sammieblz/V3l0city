const { spawnSync } = require('node:child_process');
const { cpSync } = require('node:fs');
const path = require('node:path');
const resetOutput = require('./reset-output.cjs');

const root = path.resolve(__dirname, '..');
resetOutput(root, 'dist');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'server/tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync(path.join(root, 'server/migrations'), path.join(root, 'dist/server/migrations'), { recursive: true });
