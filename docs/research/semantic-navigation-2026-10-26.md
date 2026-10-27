# Bounded TypeScript / JavaScript semantic navigation

## Research and chosen integration

The app already installs TypeScript 5.9.3. Its official language-service contract separates file access from compiler analysis through a `LanguageServiceHost`, expects the host to provide project files, and leaves threading to the host. The installed `node_modules/typescript/lib/typescript.d.ts` exposes `getDefinitionAtPosition`, `getReferencesAtPosition`, `getImplementationAtPosition`, `getQuickInfoAtPosition`, and `dispose`. We use those APIs directly in an app-owned worker instead of starting a project-selected executable. [Official language-service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API).

The compiler documentation currently covers TypeScript 6.0 and earlier and warns that 7.1 has a different API. This integration is verified against the installed 5.9.3, and a future major upgrade needs compatibility testing. [Official compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).

## Interface for controller and MCP integration

```js
import {createSemanticNavigation} from './semantic-navigation.mjs';

const navigation = createSemanticNavigation(absoluteWorkspaceRoot);
try {
  const result = await navigation.query({
    operation: 'definition', // references | implementation | hover
    path: 'src/example.ts',  // relative to the bound workspace
    line: 10,               // one based
    column: 7,              // one based, UTF-16 code units
  });
} finally {
  await navigation.dispose();
}
```

The service is bound to the canonical root and its directory identity on creation. Queries return `items` with relative `path`, `line`, `column`, `endLine`, `endColumn`, and optional `isWriteAccess`. Hover returns `hover` with the same location and plain `display` / `documentation` strings, or null. Every result contains the query identity, `snapshot` SHA-256 of included paths and bytes, engine version, elapsed worker time, scope counts/exclusions, and output `truncated` status. Treat source-derived strings as untrusted text in the UI and model context.

There is one pending query per service and a process-wide ceiling of two workers. Overlap rejects with `SEMANTIC_BUSY`; callers should not build an unbounded queue. Disposal cancels a pending query and awaits termination. A new worker and new disk snapshot are used for every request, so there are no retained compiler caches or watchers. Each worker disposes its TypeScript language service on completion. No source files are written.

Other controlled errors are `SEMANTIC_INPUT`, `SEMANTIC_PATH`, `SEMANTIC_POSITION`, `SEMANTIC_LIMIT`, `SEMANTIC_STALE`, `SEMANTIC_TIMEOUT`, `SEMANTIC_DISPOSED`, `SEMANTIC_WORKER`, and `SEMANTIC_UNAVAILABLE`. Errors deliberately omit raw filesystem/compiler diagnostics. Invalid roots or limits can throw at service creation; query failures reject its promise.

## Resource and file-access boundaries

All discovery, source reading and compiler work happens in a worker; the caller enforces a wall-time deadline and terminates it. The worker has a 256 MiB old-generation heap ceiling, 32 MiB young-generation ceiling, and 4 MiB stack ceiling. These are V8 limits, not a guarantee of total process RSS or an operating-system security sandbox.

| Limit | Default | Maximum accepted override |
| --- | ---: | ---: |
| Source files | 500 | 1,000 |
| Bytes per source file | 256 KiB | 1 MiB |
| Total source bytes | 8 MiB | 16 MiB |
| Directory entries examined | 10,000 | 20,000 |
| Directory nesting | 16 | 32 |
| Returned locations | 100 | 200 |
| Hover display and documentation characters combined | 4,096 | 16,384 |
| Request deadline | 5 seconds | 15 seconds |

Lower positive overrides are available through `{limits: {...}}`. Source/discovery limits reject the request; they do not quietly discard matching source files. Result and hover limits set `truncated`. The elapsed result field measures worker analysis, while the enforced deadline includes startup/root binding too. Termination may add teardown latency.

The snapshot includes regular `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs` files. Dot directories and `node_modules`, `vendor`, `dist`, `build`, `out`, `coverage`, `release` are excluded. Symlinks/junctions below the selected root are never traversed; direct requests through them are rejected. The selected root may itself be a junction, but retargeting it after binding is rejected. Absolute/traversal/alternate-data-stream paths are rejected. Containment and canonical paths are checked before and after reads; reads use bounded buffers, file identities and change detection. Windows file identifiers use BigInt because numeric inode values can lose precision; Windows `lstat` may report device zero where `fstat` reports a volume serial.

The compiler host serves only the in-memory snapshot. Its file and directory callbacks never fall back to `ts.sys`. Imports and triple-slash references cannot load external files, dependency packages, or standard libraries. No tsconfig, package configuration, project TypeScript installation, language-service plugins, tasks or source modules are executed. The compiler itself is imported relative to the app-owned module.

## Explicit accuracy and integration limits

Fixed compiler options enable JS, JSX and modern ES modules with bundler-style resolution, no emit, no default library and no ambient type packages. This supports bounded local navigation, but does not reproduce arbitrary project settings. Path aliases, project references, dependency/standard-library definitions, framework transformations and custom plugins are outside scope. Type inference can be incomplete without libraries. A successful query is scoped to the reported snapshot, not proof of complete project understanding. Empty results can mean unsupported resolution rather than absence of a symbol. Source snapshots are individually checked while reading, not an atomic filesystem snapshot; results can become stale after collection.

The TypeScript dependency must be available in the packaged app. At initial inspection it was a devDependency; controller/package integration must include it as a production dependency or explicit app bundle. Module tests alone do not prove packaged Electron worker startup, native model tool invocation, reviewed MCP registration, or UI delivery. These are integration acceptance checks owned by the parent task.

## Local validation and measured benefit

The focused command is `node --test test/semantic-navigation.test.mjs`. Fourteen tests passed on the current Windows host, covering definitions, references, implementation, hover, JS edits, aliases, false name matches, path and position checks, outside junctions, root retargeting, ignored config/plugins, blocked existing external references, file/byte/discovery/output limits, timeouts, disposal and concurrency recovery.

The controlled three-file fixture has four lexical `add` matches: the desired definition and import, plus two unrelated matches in another module. Semantic references return four correct locations: the definition, imported name, local alias binding and alias use. Thus this fixture removes two unrelated lexical matches and finds the binding/use of `sum` that an `add` text search misses. The latest isolated run measured 367 ms wall time including worker startup for that request, using TypeScript 5.9.3. This is a small navigation correctness/latency measurement, not a paired model-quality, token-cost or general performance result. The test prints the measurement so it can be repeated on the same fixture.

Initial tests failed because the navigation factory did not exist, then passed against the implementation. The implementation also exposed a real Windows `lstat`/`fstat` device mismatch, which was corrected without removing file-identity checks. A fresh `npm.cmd test` run passed all 803 tests in 26.7 seconds (including the concurrently added gateway tests); existing Node SQLite experimental warnings were emitted. Both new JavaScript files also passed `node --check`. Concurrent parent-agent edits may change the suite count during later integration; this is local evidence, not remote CI or packaged-runtime proof.
