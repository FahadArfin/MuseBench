// Build tooling only. The application runtime must use the verified artifact,
// never import this script to compile a helper while accepting a task.
import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const runFile = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRelativePath = 'native/windows-job.cs';
const sha256Pattern = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function buildPaths(root = repositoryRoot) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new TypeError('Windows job build root must be an absolute directory.');
  }
  const sourcePath = path.join(root, 'native', 'windows-job.cs');
  const outputDirectory = path.join(root, 'native', 'bin');
  return {
    sourcePath,
    outputDirectory,
    executablePath: path.join(outputDirectory, 'MuseBenchJob.exe'),
    manifestPath: path.join(outputDirectory, 'MuseBenchJob.build.json'),
  };
}

function failure(code, message, cause) {
  const error = new Error(message, cause ? {cause} : undefined);
  error.code = code;
  return error;
}

async function readBuildFile(file) {
  try {
    return await fs.readFile(file);
  } catch (cause) {
    if (cause.code === 'ENOENT') {
      throw failure('WINDOWS_JOB_BUILD_MISSING',
        `Windows job build file is missing: ${file}. Run node scripts/build-windows-job.mjs on Windows.`, cause);
    }
    throw failure('WINDOWS_JOB_BUILD_READ_FAILED', `Cannot read Windows job build file: ${file}.`, cause);
  }
}

/** Verify the exact source/binary pair without starting a compiler or helper.
 * Compiler identity is recorded provenance; verification does not require the
 * compiler to remain installed on the machine consuming this build. */
export async function verifyWindowsJobBuild({root = repositoryRoot} = {}) {
  const paths = buildPaths(root);
  const [source, binary, metadata] = await Promise.all([
    readBuildFile(paths.sourcePath),
    readBuildFile(paths.executablePath),
    readBuildFile(paths.manifestPath),
  ]);
  let manifest;
  try {
    if (metadata.length > 16384) throw new Error('Manifest exceeds its size limit.');
    manifest = JSON.parse(metadata.toString('utf8'));
  } catch (cause) {
    throw failure('WINDOWS_JOB_BUILD_INVALID', 'Windows job build manifest is invalid JSON.', cause);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.schemaVersion !== 1 || manifest.source !== sourceRelativePath ||
      !sha256Pattern.test(manifest.sourceSha256 ?? '') ||
      !sha256Pattern.test(manifest.exeSha256 ?? '') ||
      !manifest.compiler || typeof manifest.compiler.path !== 'string' ||
      manifest.compiler.path.includes('\0') ||
      !(path.isAbsolute(manifest.compiler.path) || path.win32.isAbsolute(manifest.compiler.path)) ||
      !sha256Pattern.test(manifest.compiler.sha256 ?? '') ||
      typeof manifest.builtAt !== 'string' || !Number.isFinite(Date.parse(manifest.builtAt))) {
    throw failure('WINDOWS_JOB_BUILD_INVALID', 'Windows job build manifest has an unsupported or incomplete schema.');
  }
  if (hash(source) !== manifest.sourceSha256) {
    throw failure('WINDOWS_JOB_BUILD_STALE',
      'Windows job helper source changed after compilation. Rebuild with node scripts/build-windows-job.mjs on Windows.');
  }
  if (hash(binary) !== manifest.exeSha256) {
    throw failure('WINDOWS_JOB_BUILD_MISMATCH',
      'Windows job executable does not match its build hash. Rebuild with node scripts/build-windows-job.mjs on Windows.');
  }
  return {...paths, manifest};
}

/** Compile into staging files, then replace the stable artifact using rename.
 * Existing valid artifacts are reused without touching their bytes or mtimes.
 * A failed/interrupted two-file publication cannot pass hash verification. */
export async function buildWindowsJob({root = repositoryRoot, compilerPath} = {}) {
  if (process.platform !== 'win32') {
    throw failure('WINDOWS_JOB_BUILD_PLATFORM',
      'Building the Windows job helper requires Windows and the .NET Framework x64 C# compiler. Use --check to verify a prebuilt artifact.');
  }
  const paths = buildPaths(root);
  try {
    const existing=await verifyWindowsJobBuild({root});
    if(existing.manifest.platform==='anycpu')return {...existing, reused:true};
  } catch (error) {
    if (!['WINDOWS_JOB_BUILD_MISSING', 'WINDOWS_JOB_BUILD_INVALID',
      'WINDOWS_JOB_BUILD_STALE', 'WINDOWS_JOB_BUILD_MISMATCH'].includes(error.code)) throw error;
  }

  const compiler = compilerPath ?? path.join(process.env.SystemRoot ?? 'C:\\Windows',
    'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (typeof compiler !== 'string' || !path.isAbsolute(compiler) || compiler.includes('\0')) {
    throw new TypeError('C# compiler path must be an absolute executable path.');
  }
  let compilerBytes;
  try {
    compilerBytes = await fs.readFile(compiler);
  } catch (cause) {
    throw failure('WINDOWS_JOB_COMPILER_MISSING',
      `Cannot read the .NET Framework x64 C# compiler at ${compiler}.`, cause);
  }
  const source = await readBuildFile(paths.sourcePath);
  const sourceSha256 = hash(source);
  await fs.mkdir(paths.outputDirectory, {recursive: true});
  const stagingName = `MuseBenchJob.${process.pid}.${randomUUID()}`;
  const stagingSource = path.join(paths.outputDirectory, `${stagingName}.tmp.cs`);
  const stagingExecutable = path.join(paths.outputDirectory, `${stagingName}.tmp.exe`);
  const stagingManifest = path.join(paths.outputDirectory, `${stagingName}.tmp.json`);
  try {
    // The compiler consumes this immutable snapshot, so the manifest hashes the
    // exact source bytes used even if a developer edits the original mid-build.
    await fs.writeFile(stagingSource, source, {flag: 'wx'});
    try {
      await runFile(compiler, ['/nologo', '/target:exe', '/platform:anycpu', '/optimize+',
        '/r:System.Web.Extensions.dll', `/out:${stagingExecutable}`, stagingSource], {
        windowsHide: true,
        shell: false,
        timeout: 30000,
        maxBuffer: 65536,
      });
    } catch (cause) {
      const diagnostic = String(cause.stderr || cause.stdout || cause.message).trim().slice(0, 8192);
      throw failure('WINDOWS_JOB_COMPILE_FAILED', `Windows job helper compilation failed: ${diagnostic}`, cause);
    }
    const binary = await fs.readFile(stagingExecutable);
    if (hash(await readBuildFile(paths.sourcePath)) !== sourceSha256) {
      throw failure('WINDOWS_JOB_BUILD_CHANGED', 'Windows job helper source changed during compilation; the staged build was not published.');
    }
    const manifest = {
      schemaVersion: 1,
      platform: 'anycpu',
      source: sourceRelativePath,
      sourceSha256,
      exeSha256: hash(binary),
      compiler: {path: compiler, sha256: hash(compilerBytes)},
      builtAt: new Date().toISOString(),
    };
    await fs.writeFile(stagingManifest, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'});
    await fs.rename(stagingExecutable, paths.executablePath);
    await fs.rename(stagingManifest, paths.manifestPath);
    return {...await verifyWindowsJobBuild({root}), reused: false};
  } finally {
    // Exact generated filenames only. No recursive deletion or process scans.
    await Promise.all([stagingSource, stagingExecutable, stagingManifest].map(file =>
      fs.rm(file, {force: true}).catch(() => {})));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !['--build', '--check'].includes(args[0]))) {
      throw new Error('Usage: node scripts/build-windows-job.mjs [--build|--check]');
    }
    const checked = args[0] === '--check';
    const result = await (checked ? verifyWindowsJobBuild() : buildWindowsJob());
    console.log(JSON.stringify({
      kind: 'windowsJobBuild', checked, reused: result.reused ?? true,
      executablePath: result.executablePath,
      sourceSha256: result.manifest.sourceSha256,
      exeSha256: result.manifest.exeSha256,
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
