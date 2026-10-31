import {discoveryIdentity} from '../shared/tool-discovery.mjs';

// Attribution describes the requested identity only. The gateway owns catalog
// freshness, authorization and schema checks at execution time.
function discoveryDetails(pending, runtime, limit) {
  if (pending?.kind !== 'approval' || pending.toolName !== 'mcp__musebench_discovery__discovery_call' || runtime?.permissionVerified !== true ||
      typeof pending.sessionId !== 'string' || !pending.sessionId || pending.sessionId !== runtime.sessionId ||
      typeof pending.turnId !== 'string' || !pending.turnId || pending.turnId !== runtime.turnId ||
      typeof pending.approvalId !== 'string' || !pending.approvalId || !Number.isSafeInteger(pending.revision) ||
      typeof pending.rawArgs !== 'string' || pending.rawArgs.length > limit) return;
  const requests = runtime.pendingRequests ?? (runtime.pending ? [runtime.pending] : []);
  if (!Array.isArray(requests) || !requests.some(current => current?.kind === 'approval' &&
      ['sessionId','turnId','approvalId','revision','toolName','rawArgs'].every(key => current[key] === pending[key]))) return;
  try {
    if (new TextEncoder().encode(pending.rawArgs).length > limit) return;
    const args = JSON.parse(pending.rawArgs);
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 4 ||
        !['sourceId','catalogRevision','tool','arguments'].every(key => Object.hasOwn(args,key)) ||
        typeof args.catalogRevision !== 'string' || !/^[a-f0-9]{64}$/.test(args.catalogRevision) ||
        typeof args.tool !== 'string' || !args.tool || args.tool.length > 200 ||
        !args.arguments || typeof args.arguments !== 'object' || Array.isArray(args.arguments)) return;
    const reviewed = discoveryIdentity(runtime.toolDiscovery);
    if (!reviewed.sources.some(source => source.id === args.sourceId)) return;
    return {sourceId:args.sourceId, tool:args.tool, catalogRevision:args.catalogRevision};
  } catch { /* Unresolvable enrichment keeps the complete generic request. */ }
}

export function permissionDetails(value, runtime) {
  const pending = value && typeof value === 'object' ? value : null;
  const choices = Array.isArray(pending?.availableChoices) ? pending.availableChoices.filter(item => item && typeof item === 'object' && item.scope === 'once' && ['approved', 'denied', 'abort'].includes(item.decision) && typeof item.choiceId === 'string' && typeof item.decisionToken === 'string') : [];
  const limit = 65536;
  let truncated = false, incomplete = false;
  const describe = item => {
    if (item === undefined || item === null) return '';
    try {
      const text = typeof item === 'string' ? item : JSON.stringify(item, null, 2);
      if (typeof text !== 'string') throw Error('Unrenderable request detail');
      if (text.length > limit) { truncated = true; return text.slice(0, limit); }
      return text;
    }
    catch { incomplete = true; return 'Request details are unavailable.'; }
  };
  const tool=describe(pending?.toolName),subject=describe(pending?.subject),args=describe(pending?.rawArgs);
  const discovery = !truncated && !incomplete ? discoveryDetails(pending,runtime,limit) : undefined;
  return { pending, choices, tool, subject, args, truncated, incomplete, approvalAllowed:!truncated&&!incomplete, limit, ...(discovery ? {discovery} : {}) };
}
