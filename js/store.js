// Data layer. Everything the app knows lives in one state object, saved to
// localStorage on this device. Views never touch localStorage directly: they
// read with getState() and change data with the actions below, so swapping in
// a cloud backend later only touches this file.

import { sampleState, DEFAULT_CATEGORIES } from './sample-data.js';

const KEY = 'hcfo:state';
export const SCHEMA_VERSION = 1;

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data, starting from sample data', e);
  }
  return migrate(sampleState());
}

// Future schema changes go here, one step per version.
function migrate(s) {
  if (!s || typeof s !== 'object') s = sampleState();
  s.schemaVersion ??= 1;
  s.deleted ??= {};
  s.resetAt ??= 0;
  // New default categories appear for existing users too (unless they deleted them).
  for (const c of DEFAULT_CATEGORIES) {
    const have = s.categories.find((x) => x.id === c.id);
    if (!have && !s.deleted[c.id]) s.categories.push({ ...c, updatedAt: 0 });
    else if (have) { have.kind ??= c.kind; have.match ??= c.match; }
  }
  return s;
}

// meta.fromSync is true when the change came from the shared Drive file,
// so the sync layer doesn't echo it straight back.
function save(meta = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save', e);
  }
  listeners.forEach((fn) => fn(state, meta));
}

const now = () => Date.now();

// Used by the sync layer to apply the merged shared data.
export function replaceState(next) {
  state = migrate(next);
  save({ fromSync: true });
}

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- Generic collection helpers -------------------------------------------
// Collections: income, bills, categories, transactions, tripItems, tripExpenses

export function upsert(collection, item) {
  const list = state[collection];
  if (!item.id) item.id = uid();
  item.updatedAt = now();
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = { ...list[i], ...item };
  else list.push(item);
  save();
  return item;
}

export function remove(collection, id) {
  state[collection] = state[collection].filter((x) => x.id !== id);
  state.deleted[id] = now();
  save();
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch, updatedAt: now() };
  save();
}

export function updateTrip(patch) {
  state.trip = { ...state.trip, ...patch, updatedAt: now() };
  save();
}

// Bills: paid status is tracked per month, e.g. paid: { '2026-11': true }
export function toggleBillPaid(billId, monthKey) {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  bill.paid = bill.paid || {};
  bill.paid[monthKey] = !bill.paid[monthKey];
  bill.updatedAt = now();
  save();
}

// ---- Backup / restore -----------------------------------------------------

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.transactions)) {
    throw new Error('That file does not look like a Household CFO backup.');
  }
  // A restore replaces the shared data too, so stamp it as a reset.
  state = stampAll(migrate(parsed));
  save();
}

// Mark every record as just-edited and set resetAt, so a reset/restore wins
// over older copies on other phones.
function stampAll(s) {
  const t = now();
  for (const k of ['income', 'categories', 'bills', 'transactions', 'tripItems', 'tripExpenses']) {
    for (const item of s[k]) item.updatedAt = t + 1;
  }
  s.settings.updatedAt = t + 1;
  s.trip.updatedAt = t + 1;
  s.settings.isSample = false;
  s.resetAt = t;
  s.deleted = {};
  return s;
}

// Add many transactions at once (CSV import). Returns how many were added.
export function addTransactions(list) {
  const t = now();
  const seen = new Set(state.transactions.map((x) => `${x.date}|${Number(x.amount).toFixed(2)}|${(x.note || '').toLowerCase()}`));
  let added = 0;
  for (const x of list) {
    const key = `${x.date}|${Number(x.amount).toFixed(2)}|${(x.note || '').toLowerCase()}`;
    if (seen.has(key)) continue; // already in the log (re-import); repeats inside one file are kept
    state.transactions.push({ ...x, id: uid(), updatedAt: t, imported: true });
    added++;
  }
  if (added) save();
  return added;
}

export function resetToSample() {
  state = stampAll(sampleState());
  state.settings.isSample = true; // never pushed over real shared data
  save();
}

export function clearAll() {
  const blank = sampleState();
  state = {
    ...blank,
    income: [],
    bills: [],
    transactions: [],
    tripItems: [],
    tripExpenses: [],
    settings: { ...blank.settings, isSample: false },
    trip: { ...blank.trip, name: 'Our Honeymoon', destination: '', budget: 0 },
  };
  stampAll(state);
  save();
}
