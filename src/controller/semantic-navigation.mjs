import path from 'node:path';
import {realpath, lstat} from 'node:fs/promises';
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

const DEFAULTS = Object.freeze({maxFiles: 500, maxFileBytes: 256 * 1024, maxTotalBytes: 8 * 1024 * 1024, maxResults: 100, maxHoverChars: 4096, maxEntries: 10000, maxDepth: 16, timeoutMs: 5000});
const CEILINGS = {maxFiles: 1000, maxFileBytes: 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024, maxResults: 200, maxHoverChars: 16384, maxEntries: 20000, maxDepth: 32, timeoutMs: 15000};
const EXCLUDED = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', 'release']);
const OPERATIONS = new Set(['definition', 'references', 'implementation', 'hover']);
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const errorFor = (code, message) => Object.assign(new Error(message), {code: `SEMANTIC_${code}`});
const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const excluded = name => name.startsWith('.') || EXCLUDED.has(name.toLowerCase());
// Windows lstat can report device 0 while fstat reports the volume serial.
// BigInt inode values avoid losing precision in Windows' 64-bit file identifiers.
const sameFile = (left, right) => left.ino === right.ino && (left.dev === right.dev || process.platform === 'win32' && (left.dev === 0n || right.dev === 0n));
const contained = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
let activeWorkers = 0;

function boundedLimits(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw errorFor('INPUT', 'Invalid navigation limits.');
  const limits = {...DEFAULTS};
  for (const [name, value] of Object.entries(input)) {
    if (!Object.hasOwn(CEILINGS, name) || !Number.isSafeInteger(value) || value < 1 || value > CEILINGS[name]) throw errorFor('INPUT', 'Navigation limits exceed the supported bounds.');
    limits[name] = value;
  }
  return limits;
}

function checkedQuery(input) {
  if (!input || !OPERATIONS.has(input.operation)) throw errorFor('INPUT', 'Choose definition, references, implementation or hover.');
  const name = input.path;
  if (typeof name !== 'string' || !name || name.length > 4096 || /[:\x00-\x1f]/.test(name) || path.isAbsolute(name) || path.win32.isAbsolute(name)) throw errorFor('PATH', 'Choose a relative workspace source path.');
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || parts.slice(0, -1).some(excluded) || !SOURCE.test(name)) throw errorFor('PATH', 'Choose a supported workspace TypeScript or JavaScript source file.');
  if (![input.line, input.column].every(number => Number.isSafeInteger(number) && number >= 1 && number <= 10000000)) throw errorFor('POSITION', 'Line and column must be positive, one-based UTF-16 positions.');
  return {operation: input.operation, path: parts.join('/'), line: input.line, column: input.column};
}

/** One bound project, one request at a time. All discovery and compiler work runs off the caller thread. */
export function createSemanticNavigation(rootInput, {limits: requestedLimits} = {}) {
  if (typeof rootInput !== 'string' || !path.isAbsolute(rootInput)) throw errorFor('PATH', 'Navigation requires an absolute workspace root.');
  const limits = boundedLimits(requestedLimits);
  let disposed = false, active = null;
  // Resolve once to bind this service to the selected directory identity, not a later symlink target.
  const binding = realpath(rootInput).then(async root => {
    const info = await lstat(root, {bigint: true});
    if (!info.isDirectory() || info.isSymbolicLink()) throw errorFor('PATH', 'The workspace root is unavailable.');
    return {root, rootInput, identity: {dev: info.dev, ino: info.ino}};
  });
  binding.catch(() => {});
  return {
    async query(input) {
      if (disposed) throw errorFor('DISPOSED', 'Semantic navigation has been disposed.');
      const query = checkedQuery(input);
      if (active || activeWorkers >= 2) throw errorFor('BUSY', 'Semantic navigation is busy. Try again when the current request completes.');
      activeWorkers++;
      return new Promise((resolve, reject) => {
        let worker, settled = false, timer, finishing;
        const finish = (error, result) => {
          if (finishing) return finishing;
          settled = true;
          clearTimeout(timer);
          finishing = (async () => {
            if (worker) await worker.terminate().catch(() => {});
            activeWorkers--;
            active = null;
            error ? reject(error) : resolve(result);
          })();
          return finishing;
        };
        active = {finish};
        timer = setTimeout(() => void finish(errorFor('TIMEOUT', 'Semantic navigation exceeded its time limit.')), limits.timeoutMs);
        binding.then(bound => {
          if (settled) return;
          worker = new Worker(new URL(import.meta.url), {
            workerData: {kind: 'muse-semantic-navigation', ...bound, limits, query},
            execArgv: [], resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4},
          });
          worker.once('message', message => void finish(message.error ? errorFor(message.error.code, message.error.message) : null, message.result));
          worker.once('error', () => void finish(errorFor('WORKER', 'Semantic navigation could not complete within its worker resource bounds.')));
          worker.once('exit', () => { if (!settled) void finish(errorFor('WORKER', 'Semantic navigation stopped before returning a result.')); });
        }).catch(() => void finish(errorFor('PATH', 'The bound workspace root is unavailable.')));
      });
    },
    async dispose() {
      disposed = true;
      await active?.finish(errorFor('DISPOSED', 'Semantic navigation has been disposed.'));
    },
  };
}

function snapshotWorkspace({root, rootInput, identity, query, limits}) {
  const checkRoot = () => {
    const info = fs.lstatSync(root, {bigint: true});
    if (info.isSymbolicLink() || !info.isDirectory() || !sameFile(info, identity) || key(fs.realpathSync(rootInput)) !== key(root) || key(fs.realpathSync(root)) !== key(root)) throw errorFor('PATH', 'The bound workspace root changed.');
  };
  checkRoot();
  const safe = file => {
    if (!contained(root, file)) throw errorFor('PATH', 'The source path is outside the workspace.');
    let current = root;
    for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) throw errorFor('PATH', 'Symlinked workspace paths are excluded from navigation.');
    }
    if (key(fs.realpathSync(file)) !== key(file)) throw errorFor('PATH', 'The workspace source path changed.');
  };
  const target = path.resolve(root, query.path);
  safe(target);
  const files = new Map(), skipped = {symlinks: 0, directories: 0}, hash = createHash('sha256');
  let bytes = 0, entries = 0;
  function readSource(file) {
    safe(file);
    const before = fs.lstatSync(file, {bigint: true});
    if (!before.isFile()) throw errorFor('PATH', 'Navigation only reads regular source files.');
    if (before.size > BigInt(limits.maxFileBytes) || BigInt(bytes) + before.size > BigInt(limits.maxTotalBytes) || files.size >= limits.maxFiles) throw errorFor('LIMIT', 'Workspace source exceeds the file or byte limit. Use a smaller workspace root.');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(fd, {bigint: true});
      safe(file);
      if (!sameFile(before, opened) || !opened.isFile()) throw errorFor('PATH', 'The workspace source changed while opening it.');
      // A bounded buffer plus one byte catches files that grow after the stat.
      const buffer = Buffer.alloc(Math.min(limits.maxFileBytes, limits.maxTotalBytes - bytes) + 1);
      let length = 0, count;
      while (length < buffer.length && (count = fs.readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += count;
      if (length > limits.maxFileBytes || bytes + length > limits.maxTotalBytes) throw errorFor('LIMIT', 'Workspace source exceeds the byte limit.');
      safe(file);
      const after = fs.fstatSync(fd, {bigint: true}), current = fs.lstatSync(file, {bigint: true});
      if (!sameFile(opened, current) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) throw errorFor('STALE', 'Workspace source changed during snapshot collection. Retry navigation.');
      const text = buffer.subarray(0, length).toString('utf8');
      bytes += length;
      files.set(key(file), {file, text});
      const relative = path.relative(root, file).replace(/\\/g, '/');
      hash.update(`${relative.length}:${relative}:${length}:`).update(buffer.subarray(0, length));
    } finally { fs.closeSync(fd); }
  }
  function walk(directory, depth) {
    safe(directory);
    if (depth > limits.maxDepth) throw errorFor('LIMIT', 'Workspace nesting exceeds the navigation limit.');
    const dir = fs.opendirSync(directory), children = [];
    try {
      let entry;
      while ((entry = dir.readSync())) {
        if (++entries > limits.maxEntries) throw errorFor('LIMIT', 'Workspace entries exceed the navigation limit.');
        children.push(entry);
      }
    } finally { dir.closeSync(); }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of children) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { skipped.symlinks++; continue; }
      if (entry.isDirectory()) {
        if (excluded(entry.name)) { skipped.directories++; continue; }
        walk(file, depth + 1);
      } else if (entry.isFile() && SOURCE.test(entry.name)) readSource(file);
    }
  }
  walk(root, 0);
  checkRoot();
  if (!files.has(key(target))) throw errorFor('PATH', 'The requested source file is not in the bounded workspace snapshot.');
  return {files, target, snapshot: hash.digest('hex'), scope: {files: files.size, bytes, entries, skipped, config: 'fixed-no-project-config', standardLibrary: false, excludedDirectories: ['.*', ...EXCLUDED]}};
}

async function navigate(data) {
  const started = performance.now();
  const {files, target, snapshot, scope} = snapshotWorkspace(data);
  // This bare import resolves relative to this app-owned module, never the selected workspace.
  const {default: ts} = await import('typescript');
  const compilerOptions = {allowJs: true, checkJs: true, noEmit: true, noLib: true, types: [], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, allowImportingTsExtensions: true};
  const directories = new Set([key(data.root)]);
  for (const {file} of files.values()) {
    let directory = path.dirname(file);
    while (contained(data.root, directory)) {
      directories.add(key(directory));
      if (key(directory) === key(data.root)) break;
      directory = path.dirname(directory);
    }
  }
  const host = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...files.values()].map(file => file.file),
    getScriptVersion: () => '1',
    getScriptSnapshot: name => { const file = files.get(key(name)); return file ? ts.ScriptSnapshot.fromString(file.text) : undefined; },
    getCurrentDirectory: () => data.root,
    getDefaultLibFileName: () => '',
    fileExists: name => files.has(key(name)),
    readFile: name => files.get(key(name))?.text,
    directoryExists: name => directories.has(key(name)),
    getDirectories: name => [...directories].filter(directory => key(path.dirname(directory)) === key(name)),
    readDirectory: () => [],
    realpath: name => files.get(key(name))?.file ?? name,
    useCaseSensitiveFileNames: () => process.platform !== 'win32',
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry(host.useCaseSensitiveFileNames(), data.root));
  try {
    const program = service.getProgram();
    const input = program.getSourceFile(target);
    const lines = input.getLineStarts(), lineIndex = data.query.line - 1;
    if (lineIndex >= lines.length) throw errorFor('POSITION', 'The requested line is outside the source file.');
    const start = lines[lineIndex], end = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : input.text.length;
    const lineLength = input.text.slice(start, end).replace(/[\r\n]+$/, '').length;
    if (data.query.column > lineLength + 1) throw errorFor('POSITION', 'The requested column is outside the source line.');
    const position = start + data.query.column - 1;
    let truncated = false, hover = null, items = [];
    const location = value => {
      const entry = files.get(key(value.fileName));
      if (!entry) return null;
      const source = program.getSourceFile(entry.file);
      if (!source) return null;
      const first = source.getLineAndCharacterOfPosition(value.textSpan.start), last = source.getLineAndCharacterOfPosition(value.textSpan.start + value.textSpan.length);
      return {path: path.relative(data.root, entry.file).replace(/\\/g, '/'), line: first.line + 1, column: first.character + 1, endLine: last.line + 1, endColumn: last.character + 1, ...(value.isWriteAccess !== undefined ? {isWriteAccess: value.isWriteAccess} : {})};
    };
    if (data.query.operation === 'hover') {
      const info = service.getQuickInfoAtPosition(target, position);
      if (info) {
        const display = ts.displayPartsToString(info.displayParts), documentation = ts.displayPartsToString(info.documentation);
        truncated = display.length + documentation.length > data.limits.maxHoverChars;
        const displayText = display.slice(0, data.limits.maxHoverChars);
        hover = {...location({fileName: target, textSpan: info.textSpan}), display: displayText, documentation: documentation.slice(0, data.limits.maxHoverChars - displayText.length)};
      }
    } else {
      const methods = {definition: 'getDefinitionAtPosition', references: 'getReferencesAtPosition', implementation: 'getImplementationAtPosition'};
      const results = service[methods[data.query.operation]](target, position) ?? [], seen = new Set();
      for (const result of results) {
        const item = location(result);
        if (!item) continue;
        const id = `${item.path}:${item.line}:${item.column}:${item.endLine}:${item.endColumn}`;
        if (seen.has(id)) continue;
        seen.add(id);
        if (items.length >= data.limits.maxResults) { truncated = true; break; }
        items.push(item);
      }
    }
    return {operation: data.query.operation, path: data.query.path, line: data.query.line, column: data.query.column, items, hover, truncated, snapshot, scope, engine: `typescript-${ts.version}`, elapsedMs: Math.round(performance.now() - started)};
  } finally { service.dispose(); }
}

if (!isMainThread && workerData?.kind === 'muse-semantic-navigation') {
  try { parentPort.postMessage({result: await navigate(workerData)}); }
  catch (error) {
    const controlled = typeof error.code === 'string' && error.code.startsWith('SEMANTIC_');
    parentPort.postMessage({error: {code: controlled ? error.code.slice(9) : 'UNAVAILABLE', message: controlled ? error.message : 'Semantic navigation could not read or analyze this workspace.'}});
  } finally { parentPort.close(); }
}
