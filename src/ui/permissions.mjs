export function permissionDetails(value) {
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
  return { pending, choices, tool, subject, args, truncated, incomplete, approvalAllowed:!truncated&&!incomplete, limit };
}
