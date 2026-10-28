/** Flush Chromium's own persistent stores; never inspect or copy credentials. */
export function createSessionDurability({ app, debounceMs = 1000, timeoutMs = 5000, setTimeout: later = globalThis.setTimeout, clearTimeout: clear = globalThis.clearTimeout }) {
  const sessions = new Map();
  let closed = false, completion;
  const write = async record => {
    record.session.flushStorageData();
    await record.session.cookies.flushStore();
  };
  function track(session) {
    if (closed || sessions.has(session) || !session.isPersistent()) return;
    const record = { session, timer: null, pending: null };
    // Deliberately ignore every event argument: cookie contents stay inside
    // Chromium. Coalesce writes without changing expiry or session semantics.
    record.changed = () => {
      if (closed || record.timer) return;
      record.timer = later(() => {
        record.timer = null;
        if (closed || record.pending) return;
        record.pending = write(record).catch(() => {}).finally(() => { record.pending = null; });
      }, debounceMs);
      record.timer.unref?.();
    };
    sessions.set(session, record);
    session.cookies.on('changed', record.changed);
  }
  app.on('session-created', track);
  return {
    track,
    close() {
      if (completion) return completion;
      closed = true;
      app.removeListener('session-created', track);
      for (const record of sessions.values()) {
        if (record.timer) clear(record.timer);
        record.timer = null;
        record.session.cookies.removeListener('changed', record.changed);
      }
      let deadline;
      const writes = Promise.all([...sessions.values()].map(async record => {
        // A final write follows any in-flight early write, so a last login,
        // logout or refresh cannot fall between the two persistence barriers.
        await record.pending;
        await write(record);
      })).catch(() => { throw Error('Browser session storage could not be saved.'); });
      completion = Promise.race([
        writes,
        new Promise((_, reject) => { deadline = later(() => reject(Error('Browser session storage save timed out.')), timeoutMs); }),
      ]).then(() => undefined).finally(() => clear(deadline));
      return completion;
    },
  };
}
