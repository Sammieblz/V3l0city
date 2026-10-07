const { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } = require('node:fs');
const path = require('node:path');

module.exports = (root, name) => {
  if (!['dist', 'dist-test/server', 'dist-test/shared'].includes(name)) throw new Error('Unsupported build output.');
  const output = path.resolve(root, name);
  const parent = path.dirname(output);
  mkdirSync(parent, { recursive: true });
  const inside = (directory) => directory === root || directory.startsWith(`${root}${path.sep}`);
  if (!inside(realpathSync(parent))) throw new Error('Build output parent escapes the repository.');
  if (existsSync(output) && (lstatSync(output).isSymbolicLink() || !inside(realpathSync(output)))) {
    throw new Error('Build output must be a repository-owned directory.');
  }
  if (output === root || !inside(output)) throw new Error('Invalid build output path.');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  return output;
};
