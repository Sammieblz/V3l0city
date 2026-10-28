const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const usage = `Usage: node scripts/run-speed-engine-tests.cjs [--compiler <executable>] [--compiler-args '<JSON string array>'] [--compiler-style gnu|msvc]
Environment: CXX is one exact executable/path, CXX_ARGS is a JSON prefix-argument array, CXX_STYLE is gnu or msvc.
Examples: CXX=clang++; CXX=/path/to/zig CXX_ARGS='["c++"]'. Never put a shell command in CXX.
The runner compiles and executes the existing C++ regression suite with assertions enabled; compiler absence or failure is an error.`;

function parseOptions(argv, env = process.env) {
  const cli = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!['--compiler', '--compiler-args', '--compiler-style'].includes(name)) throw new Error(`Unsupported option: ${name}`);
    if (Object.hasOwn(cli, name)) throw new Error(`Repeated option: ${name}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    cli[name] = value;
  }
  const compiler = cli['--compiler'] ?? env.CXX ?? 'c++';
  if (typeof compiler !== 'string' || !compiler.trim() || compiler.includes('\0')) throw new Error('CXX/--compiler must name one executable.');
  let prefix;
  try {
    prefix = JSON.parse(cli['--compiler-args'] ?? env.CXX_ARGS ?? '[]');
  } catch {
    throw new Error('CXX_ARGS/--compiler-args must be a JSON string array.');
  }
  if (!Array.isArray(prefix) || prefix.length > 256 || prefix.some((value) => typeof value !== 'string' || value.includes('\0') || value.length > 4096)) {
    throw new Error('CXX_ARGS/--compiler-args must be a bounded JSON string array.');
  }
  const style = cli['--compiler-style'] ?? env.CXX_STYLE ?? (/^cl(?:\.exe)?$/i.test(path.basename(compiler)) ? 'msvc' : 'gnu');
  if (!['gnu', 'msvc'].includes(style)) throw new Error('CXX_STYLE/--compiler-style must be gnu or msvc.');
  return { compiler, prefix, style };
}

function compileArguments(options, sources, executable, outputDirectory) {
  if (options.style === 'msvc') {
    return [...options.prefix, '/nologo', '/std:c++20', '/EHsc', '/W4', '/WX', '/UNDEBUG',
      `/Fe:${executable}`, `/Fo${outputDirectory}${path.sep}`, ...sources];
  }
  return [...options.prefix, '-std=c++20', '-Wall', '-Wextra', '-Werror', '-UNDEBUG', ...sources, '-o', executable];
}

function run(options, dependencies = {}) {
  const spawn = dependencies.spawnSync ?? childProcess.spawnSync;
  const report = dependencies.report ?? ((message) => process.stderr.write(`${message}\n`));
  const root = path.resolve(__dirname, '..');
  // Relative executable paths refer to the caller's working directory, even
  // though compilation itself runs in temporary storage. Bare names use PATH.
  const compiler = /[\\/]/.test(options.compiler) ? path.resolve(options.compiler) : options.compiler;
  const sources = ['SpeedEngine.cpp', 'tests/SpeedEngineTests.cpp'].map((name) => path.join(root, 'modules/v3l0city-speed-engine/common/cpp', name));
  const tempRoot = fs.realpathSync(os.tmpdir());
  const outputDirectory = fs.mkdtempSync(path.join(tempRoot, 'v3l0city-speed-engine-'));
  const executable = path.join(outputDirectory, process.platform === 'win32' ? 'speed-engine-tests.exe' : 'speed-engine-tests');
  let status = 1;
  try {
    const build = spawn(compiler, compileArguments(options, sources, executable, outputDirectory), {
      cwd: outputDirectory, stdio: 'inherit', shell: false, windowsHide: true, timeout: 300000,
    });
    if (build.error) {
      report(`C++ compiler could not run (${build.error.code ?? 'error'}). Set CXX to an installed compiler and CXX_ARGS to a JSON prefix array when needed.`);
    } else if (build.status !== 0) {
      report(`C++ regression compilation failed (exit ${build.status ?? build.signal ?? 'unknown'}).`);
      status = build.status ?? 1;
    } else if (!fs.existsSync(executable)) {
      report('Compiler reported success without producing the C++ regression executable.');
    } else {
      const tests = spawn(executable, [], {
        cwd: outputDirectory, stdio: 'inherit', shell: false, windowsHide: true, timeout: 30000,
      });
      if (tests.error) report(`C++ regression executable could not run (${tests.error.code ?? 'error'}).`);
      else {
        status = tests.status ?? 1;
        if (status !== 0) report(`C++ regression executable failed (exit ${tests.status ?? tests.signal ?? 'unknown'}).`);
      }
    }
  } catch (error) {
    report(`C++ regression runner failed: ${error.message}`);
  } finally {
    // Verify the absolute generated path before recursive removal. This is the
    // unique directory returned above, never an environment-supplied target.
    const resolved = fs.realpathSync(outputDirectory);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('v3l0city-speed-engine-')) {
      throw new Error('Refusing to clean an unexpected compiler output path.');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  return status;
}

module.exports = { parseOptions, compileArguments, run };

if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write(`${usage}\n`);
  } else {
    try {
      process.exitCode = run(parseOptions(process.argv.slice(2)));
    } catch (error) {
      process.stderr.write(`${error.message}\n${usage}\n`);
      process.exitCode = 1;
    }
  }
}
