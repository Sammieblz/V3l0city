const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Compile and execute the actual framework-free helpers used by both managers.
 * Missing compilers and test failures are errors, never skipped evidence. */
function run(compilers = {}, dependencies = {}) {
  const spawn = dependencies.spawnSync ?? spawnSync;
  const report = dependencies.report ?? ((message) => process.stderr.write(`${message}\n`));
  const root = path.resolve(__dirname, '../modules/v3l0city-speed-engine');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const output = fs.mkdtempSync(path.join(tempRoot, 'v3l0city-glance-'));
  const executable = path.join(output, process.platform === 'win32' ? 'swift-tests.exe' : 'swift-tests');
  const jar = path.join(output, 'kotlin-tests.jar');
  const command = (value, fallback) => {
    const name = value ?? fallback;
    if (typeof name !== 'string' || !name.trim() || name.includes('\0')) throw new Error('Compiler must name one executable.');
    return /[\\/]/.test(name) ? path.resolve(name) : name;
  };
  function step(label, program, args, timeout) {
    const result = spawn(program, args, { cwd: output, shell: false, windowsHide: true, stdio: 'inherit', timeout });
    if (result.error || result.status !== 0) throw new Error(`${label} failed (${result.error?.code ?? result.status ?? result.signal ?? 'unknown'}).`);
  }
  try {
    step('Swift projection compilation', command(compilers.swiftc, 'swiftc'), [
      path.join(root, 'ios/LiveDriveProjection.swift'),
      path.join(root, 'native-tests/LiveDriveProjectionTests.swift'), '-o', executable,
    ], 120000);
    if (!fs.existsSync(executable)) throw new Error('Swift compiler produced no executable.');
    step('Swift projection tests', executable, [], 30000);
    step('Kotlin projection compilation', command(compilers.kotlinc, 'kotlinc'), [
      path.join(root, 'android/src/main/java/com/v3l0city/speedengine/LiveDriveProjection.kt'),
      path.join(root, 'native-tests/LiveDriveProjectionTests.kt'), '-include-runtime', '-d', jar,
    ], 120000);
    if (!fs.existsSync(jar)) throw new Error('Kotlin compiler produced no test jar.');
    step('Kotlin projection tests', command(compilers.java, 'java'), ['-jar', jar], 30000);
    return 0;
  } catch (error) {
    report(error.message);
    return 1;
  } finally {
    const resolved = fs.realpathSync(output);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('v3l0city-glance-')) {
      throw new Error('Refusing to clean an unexpected projection output path.');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

module.exports = { run };
if (require.main === module) {
  process.exitCode = run({ swiftc: process.env.GLANCE_SWIFTC, kotlinc: process.env.GLANCE_KOTLINC, java: process.env.GLANCE_JAVA });
}
