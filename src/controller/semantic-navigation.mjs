import path from 'node:path';
import {realpath, lstat} from 'node:fs/promises';
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {validateWorkspaceQuery,validateWorkspaceBatch} from '../shared/workspace-analysis.mjs';

const DEFAULTS = Object.freeze({maxFiles: 500, maxFileBytes: 256 * 1024, maxTotalBytes: 8 * 1024 * 1024, maxResults: 100, maxHoverChars: 4096, maxEntries: 10000, maxDepth: 16, timeoutMs: 5000});
const CEILINGS = {maxFiles: 1000, maxFileBytes: 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024, maxResults: 200, maxHoverChars: 16384, maxEntries: 20000, maxDepth: 32, timeoutMs: 15000};
const EXCLUDED = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', 'release']);
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
  async function execute(payload, {signal}={}) {
      if (disposed) throw errorFor('DISPOSED', 'Semantic navigation has been disposed.');
      if(signal!==undefined&&!(signal instanceof AbortSignal))throw errorFor('INPUT','Invalid cancellation signal.');
      if(signal?.aborted)throw errorFor('CANCELLED','Workspace analysis was cancelled.');
      if (active || activeWorkers >= 2) throw errorFor('BUSY', 'Semantic navigation is busy. Try again when the current request completes.');
      activeWorkers++;
      return new Promise((resolve, reject) => {
        let worker, settled = false, timer, finishing;
        const finish = (error, result) => {
          if (finishing) return finishing;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort',onAbort);
          finishing = (async () => {
            if (worker) await worker.terminate().catch(() => {});
            activeWorkers--;
            active = null;
            error ? reject(error) : resolve(result);
          })();
          return finishing;
        };
        const onAbort=()=>void finish(errorFor('CANCELLED','Workspace analysis was cancelled.'));
        active = {finish};
        signal?.addEventListener('abort',onAbort,{once:true});
        timer = setTimeout(() => void finish(errorFor('TIMEOUT', 'Semantic navigation exceeded its time limit.')), limits.timeoutMs);
        binding.then(bound => {
          if (settled) return;
          worker = new Worker(new URL(import.meta.url), {
            workerData: {kind: 'muse-semantic-navigation', ...bound, limits, ...payload},
            execArgv: [], resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4},
          });
          worker.once('message', message => void finish(message.error ? errorFor(message.error.code, message.error.message) : null, message.result));
          worker.once('error', () => void finish(errorFor('WORKER', 'Semantic navigation could not complete within its worker resource bounds.')));
          worker.once('exit', () => { if (!settled) void finish(errorFor('WORKER', 'Semantic navigation stopped before returning a result.')); });
        }).catch(() => void finish(errorFor('PATH', 'The bound workspace root is unavailable.')));
      });
  }
  return {
    async query(input,options){return execute({query:validateWorkspaceQuery(input)},options);},
    async batch(calls,options){return execute({calls:validateWorkspaceBatch(calls)},options);},
    async dispose() {
      disposed = true;
      await active?.finish(errorFor('DISPOSED', 'Semantic navigation has been disposed.'));
    },
  };
}

function snapshotWorkspace({root, rootInput, identity, limits}) {
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
  return {files, snapshot: hash.digest('hex'), scope: {files: files.size, bytes, entries, skipped, config: 'fixed-no-project-config', standardLibrary: false, excludedDirectories: ['.*', ...EXCLUDED]}};
}

async function navigate(data) {
  const started = performance.now();
  const {files, snapshot, scope} = snapshotWorkspace(data);
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
    function run(query){
    const target=query.path?files.get(key(path.resolve(data.root,query.path)))?.file:null;
    if(query.path&&!target)throw errorFor('PATH','The requested source file is not in the bounded workspace snapshot.');
    let position=0;
    if(query.line!==undefined){
    const input = program.getSourceFile(target);
    const lines = input.getLineStarts(), lineIndex = query.line - 1;
    if (lineIndex >= lines.length) throw errorFor('POSITION', 'The requested line is outside the source file.');
    const start = lines[lineIndex], end = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : input.text.length;
    const lineLength = input.text.slice(start, end).replace(/[\r\n]+$/, '').length;
    if (query.column > lineLength + 1) throw errorFor('POSITION', 'The requested column is outside the source line.');
    position = start + query.column - 1;
    }
    let truncated = false, hover = null, items = [];
    const location = value => {
      const entry = files.get(key(value.fileName));
      if (!entry) return null;
      const source = program.getSourceFile(entry.file);
      if (!source) return null;
      const first = source.getLineAndCharacterOfPosition(value.textSpan.start), last = source.getLineAndCharacterOfPosition(value.textSpan.start + value.textSpan.length);
      return {path: path.relative(data.root, entry.file).replace(/\\/g, '/'), line: first.line + 1, column: first.character + 1, endLine: last.line + 1, endColumn: last.character + 1, ...(value.isWriteAccess !== undefined ? {isWriteAccess: value.isWriteAccess} : {})};
    };
    const push=item=>{if(!item)return;if(items.length>=data.limits.maxResults){truncated=true;return;}items.push(item);};
    if(query.operation==='workspace_symbols'){
      for(const entry of service.getNavigateToItems(query.query,data.limits.maxResults+1)??[]){
        const point=location(entry);if(point)push({...point,name:entry.name.slice(0,160),kind:entry.kind.slice(0,80)});
      }
    }else if(query.operation==='document_symbols'){
      const pending=[...(service.getNavigationTree(target)?.childItems??[])].reverse();let visited=0;
      while(pending.length&&visited++<data.limits.maxEntries){
        const item=pending.pop();const point=item.spans?.[0]&&location({fileName:target,textSpan:item.spans[0]});
        if(point)push({...point,name:item.text.slice(0,160),kind:item.kind.slice(0,80)});
        if(truncated)break;
        for(const child of [...(item.childItems??[])].reverse())pending.push(child);
      }
      if(pending.length)truncated=true;
    }else if(query.operation==='syntax_diagnostics'){
      for(const diagnostic of service.getSyntacticDiagnostics(target)){
        const point=location({fileName:target,textSpan:{start:diagnostic.start??0,length:diagnostic.length??0}});
        const message=ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n');
        if(message.length>1000)truncated=true;
        if(point)push({...point,code:diagnostic.code,category:ts.DiagnosticCategory[diagnostic.category].toLowerCase(),message:message.slice(0,1000)});
        if(items.length>=data.limits.maxResults){truncated=true;break;}
      }
    }else if (query.operation === 'hover') {
      const info = service.getQuickInfoAtPosition(target, position);
      if (info) {
        const display = ts.displayPartsToString(info.displayParts), documentation = ts.displayPartsToString(info.documentation);
        truncated = display.length + documentation.length > data.limits.maxHoverChars;
        const displayText = display.slice(0, data.limits.maxHoverChars);
        hover = {...location({fileName: target, textSpan: info.textSpan}), display: displayText, documentation: documentation.slice(0, data.limits.maxHoverChars - displayText.length)};
      }
    } else {
      const methods = {definition: 'getDefinitionAtPosition', references: 'getReferencesAtPosition', implementation: 'getImplementationAtPosition'};
      const results = service[methods[query.operation]](target, position) ?? [], seen = new Set();
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
    return {...query,items,hover,truncated,snapshot,scope,engine:`typescript-${ts.version}`,elapsedMs:Math.round(performance.now()-started),...(query.operation==='syntax_diagnostics'?{diagnosticKind:'syntax'}:{})};
    }
    if(!data.calls)return run(data.query);
    const calls=data.calls.map(({id,...query})=>{
      try{return{id,operation:query.operation,status:'completed',result:run(query)};}
      catch(error){return{id,operation:query.operation,status:'failed',error:['SEMANTIC_PATH','SEMANTIC_POSITION'].includes(error.code)?error.code:'SEMANTIC_UNAVAILABLE'};}
    });
    return{kind:'workspace-batch',version:1,calls,snapshot,scope,engine:`typescript-${ts.version}`,elapsedMs:Math.round(performance.now()-started)};
  } finally { service.dispose(); }
}

if (!isMainThread && workerData?.kind === 'muse-semantic-navigation') {
  try { parentPort.postMessage({result: await navigate(workerData)}); }
  catch (error) {
    const controlled = typeof error.code === 'string' && error.code.startsWith('SEMANTIC_');
    parentPort.postMessage({error: {code: controlled ? error.code.slice(9) : 'UNAVAILABLE', message: controlled ? error.message : 'Semantic navigation could not read or analyze this workspace.'}});
  } finally { parentPort.close(); }
}
