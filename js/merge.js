// Merges two copies of the app state (this phone and the shared Drive file)
// so edits made on both phones are kept. Rules:
//  - Every record carries updatedAt; the newer copy of a record wins.
//  - Deletes are remembered in state.deleted { id: time } so they don't come back.
//  - "Clear everything" / restore sets resetAt; records older than the newest
//    reset are dropped from the other side.
//  - A fresh install that only has sample data never mixes into real data.

export const COLLECTIONS = ['income', 'categories', 'bills', 'transactions', 'tripItems', 'tripExpenses'];
const OBJECTS = ['settings', 'trip'];
const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 120; // forget deletes after ~4 months

const ts = (x) => Number(x?.updatedAt) || 0;

export function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  // Sample data on a new phone should never blend into the real shared data.
  if (a.settings?.isSample && !b.settings?.isSample) return b;
  if (b.settings?.isSample && !a.settings?.isSample) return a;

  const resetA = Number(a.resetAt) || 0;
  const resetB = Number(b.resetAt) || 0;
  const resetAt = Math.max(resetA, resetB);
  // Records from the side that has NOT seen the latest reset must be newer than it.
  const survives = (item, sideReset) => sideReset >= resetAt || ts(item) > resetAt;

  const deleted = {};
  const now = Date.now();
  for (const src of [a.deleted || {}, b.deleted || {}]) {
    for (const [id, t] of Object.entries(src)) {
      if (now - t < TOMBSTONE_TTL && t > resetAt) deleted[id] = Math.max(deleted[id] || 0, t);
    }
  }

  const out = { ...b, ...a, resetAt, deleted };
  out.schemaVersion = Math.max(a.schemaVersion || 1, b.schemaVersion || 1);

  for (const key of COLLECTIONS) {
    const map = new Map();
    for (const [side, reset] of [[a, resetA], [b, resetB]]) {
      for (const item of side[key] || []) {
        if (!survives(item, reset)) continue;
        if (deleted[item.id] && deleted[item.id] >= ts(item)) continue;
        const cur = map.get(item.id);
        if (!cur || ts(item) > ts(cur)) map.set(item.id, item);
      }
    }
    out[key] = [...map.values()].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  }

  for (const key of OBJECTS) {
    const ia = survives(a[key], resetA) ? a[key] : null;
    const ib = survives(b[key], resetB) ? b[key] : null;
    out[key] = !ia ? ib || a[key] : !ib ? ia : ts(ib) > ts(ia) ? ib : ia;
  }
  return out;
}

// Stable fingerprint to tell whether two states hold the same data.
export function fingerprint(s) {
  const copy = { ...s };
  for (const k of COLLECTIONS) copy[k] = [...(s[k] || [])].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  copy.deleted = Object.fromEntries(Object.entries(s.deleted || {}).sort());
  return JSON.stringify(copy, Object.keys(flatKeys(copy)).sort());
}

function flatKeys(obj, acc = {}) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) { acc[k] = 1; flatKeys(v, acc); }
  }
  return acc;
}
