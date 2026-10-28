const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { parseOptions, compileArguments, run } = require('./run-speed-engine-tests.cjs');

test('compiler paths and JSON prefix arguments remain separate literal argv entries', () => {
  const compiler = path.join('compiler with spaces', 'zig;literal');
  const options = parseOptions(['--compiler', compiler, '--compiler-args', '["c++","-DVALUE=literal;$(not-a-command)"]'], {});
  assert.equal(options.compiler, compiler);
  assert.deepEqual(options.prefix, ['c++', '-DVALUE=literal;$(not-a-command)']);
  const arguments_ = compileArguments(options, ['source with spaces.cpp', 'test.cpp'], 'out with spaces', 'temp');
  assert.deepEqual(arguments_.slice(0, 2), options.prefix);
  assert.ok(arguments_.includes('source with spaces.cpp'));
  assert.ok(arguments_.includes('-UNDEBUG'));
  assert.deepEqual(arguments_.slice(-2), ['-o', 'out with spaces']);
});

test('environment compiler selection is exact and CLI options override it', () => {
  assert.deepEqual(parseOptions([], { CXX: 'zig', CXX_ARGS: '["c++"]' }), { compiler: 'zig', prefix: ['c++'], style: 'gnu' });
  assert.equal(parseOptions(['--compiler', 'clang++', '--compiler-args', '[]', '--compiler-style', 'gnu'], { CXX: 'cl.exe', CXX_ARGS: '["bad"]', CXX_STYLE: 'msvc' }).compiler, 'clang++');
});

test('relative compiler paths resolve before changing to the temporary output directory', () => {
  const compiler = path.join('compiler fixtures', 'literal;zig');
  let invoked;
  const result = run(parseOptions(['--compiler', compiler, '--compiler-args', '["c++"]'], {}), {
    report: () => {},
    spawnSync: (command, arguments_, options) => {
      invoked = command;
      assert.equal(arguments_[0], 'c++');
      assert.equal(options.shell, false);
      return { status: 2 };
    },
  });
  assert.equal(result, 2);
  assert.equal(invoked, path.resolve(compiler));
});

test('MSVC arguments enable assertions and direct every compiler output to temporary storage', () => {
  const options = parseOptions([], { CXX: 'cl.exe', CXX_ARGS: '["/DNDEBUG"]' });
  assert.equal(options.style, 'msvc');
  const arguments_ = compileArguments(options, ['engine.cpp', 'tests.cpp'], 'temporary/program.exe', 'temporary');
  assert.ok(arguments_.includes('/UNDEBUG'));
  assert.ok(arguments_.indexOf('/UNDEBUG') > arguments_.indexOf('/DNDEBUG'));
  assert.ok(arguments_.includes('/Fe:temporary/program.exe'));
  assert.ok(arguments_.includes(`/Fotemporary${path.sep}`));
});

test('malformed or command-string compiler arguments and ambiguous options fail explicitly', () => {
  for (const value of ['c++ -O2', '"c++"', '{}', '[1]', '["bad\\u0000argument"]']) {
    assert.throws(() => parseOptions([], { CXX_ARGS: value }), /JSON/);
  }
  for (const argv of [['--compiler'], ['--compiler', 'g++', '--compiler', 'clang++'], ['--unknown'], ['--compiler-style', 'shell']]) {
    assert.throws(() => parseOptions(argv, {}));
  }
  assert.throws(() => parseOptions([], { CXX: ' ' }), /one executable/);
});

test('compiler absence fails the actual CLI instead of skipping mandatory native tests', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-speed-engine-tests.cjs'), '--compiler', path.join(__dirname, 'compiler-that-does-not-exist')], {
    encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /compiler could not run/);
});

test('failed compilation does not execute a stale binary and cleans its unique output', () => {
  let outputDirectory;
  let calls = 0;
  const messages = [];
  const result = run(parseOptions([], {}), {
    report: (message) => messages.push(message),
    spawnSync: (_command, _arguments, options) => {
      calls += 1;
      outputDirectory = options.cwd;
      assert.equal(options.shell, false);
      return { status: 3 };
    },
  });
  assert.equal(result, 3);
  assert.equal(calls, 1);
  assert.equal(existsSync(outputDirectory), false);
  assert.match(messages[0], /compilation failed/);
});

test('successful compiler exit without an executable is still failure', () => {
  let calls = 0;
  const result = run(parseOptions([], {}), {
    report: () => {}, spawnSync: () => { calls += 1; return { status: 0 }; },
  });
  assert.equal(result, 1);
  assert.equal(calls, 1);
});

test('test execution uses the fresh exact executable and propagates failure with bounded subprocesses', () => {
  for (const testStatus of [0, 7]) {
    let executable;
    let outputDirectory;
    let calls = 0;
    const result = run(parseOptions([], {}), {
      report: () => {},
      spawnSync: (command, arguments_, options) => {
        calls += 1;
        assert.equal(options.shell, false);
        assert.ok(options.timeout > 0);
        assert.equal(options.windowsHide, true);
        if (calls === 1) {
          outputDirectory = options.cwd;
          executable = arguments_[arguments_.indexOf('-o') + 1];
          assert.equal(path.dirname(executable), outputDirectory);
          writeFileSync(executable, 'fresh-fixture');
          return { status: 0 };
        }
        assert.equal(command, executable);
        assert.deepEqual(arguments_, []);
        assert.equal(options.cwd, outputDirectory);
        return { status: testStatus };
      },
    });
    assert.equal(result, testStatus);
    assert.equal(calls, 2);
    assert.equal(existsSync(outputDirectory), false);
  }
});
