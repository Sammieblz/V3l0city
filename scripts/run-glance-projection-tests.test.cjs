const assert = require('node:assert/strict');
const { existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { run } = require('./run-glance-projection-tests.cjs');

test('a missing real compiler fails instead of skipping native projection evidence', () => {
  const messages = [];
  assert.equal(run({ swiftc: path.join(__dirname, 'missing-glance-compiler') }, { report: (message) => messages.push(message) }), 1);
  assert.match(messages.join(' '), /Swift projection compilation failed.*ENOENT/);
});

test('successful compiles must produce and execute both actual helper artifacts', () => {
  const calls = [];
  let temporary;
  const result = run({ swiftc: 'literal;swiftc', kotlinc: 'literal;kotlinc', java: 'literal;java' }, {
    report: () => {},
    spawnSync: (program, args, options) => {
      calls.push({ program, args }); temporary = options.cwd;
      assert.equal(options.shell, false);
      assert.ok(options.timeout > 0);
      if (args.includes('-o')) writeFileSync(args[args.indexOf('-o') + 1], 'fixture');
      if (args.includes('-d')) writeFileSync(args[args.indexOf('-d') + 1], 'fixture');
      return { status: 0 };
    },
  });
  assert.equal(result, 0);
  assert.equal(calls.length, 4);
  assert.equal(calls[1].program, calls[0].args.at(-1));
  assert.deepEqual(calls[3].args, ['-jar', calls[2].args.at(-1)]);
  assert.equal(existsSync(temporary), false);
});

test('runtime failure and success without an artifact cannot pass', () => {
  for (const produceArtifact of [false, true]) {
    let count = 0;
    const messages = [];
    assert.equal(run({}, { report: (message) => messages.push(message), spawnSync: (_, args) => {
      count++;
      if (produceArtifact && count === 1) writeFileSync(args.at(-1), 'fixture');
      return { status: count === 1 ? 0 : 9 };
    } }), 1);
    assert.match(messages.join(' '), produceArtifact ? /Swift projection tests failed.*9/ : /no executable/);
  }
});
