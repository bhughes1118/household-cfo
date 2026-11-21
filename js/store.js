// Data layer. Everything the app knows lives in one state object, saved to
// localStorage on this device. Views never touch localStorage directly: they
// read with getState() and change data with the actions below, so swapping in
// a cloud backend later only touches this file.

import { sampleState } from './sample-data.js';

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
  return sampleState();
}

// Future schema changes go here, one step per version.
function migrate(s) {
  if (!s || typeof s !== 'object') return sampleState();
  s.schemaVersion ??= 1;
  return s;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save', e);
  }
  listeners.forEach((fn) => fn(state));
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
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = { ...list[i], ...item };
  else list.push(item);
  save();
  return item;
}

export function remove(collection, id) {
  state[collection] = state[collection].filter((x) => x.id !== id);
  save();
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export function updateTrip(patch) {
  state.trip = { ...state.trip, ...patch };
  save();
}

// Bills: paid status is tracked per month, e.g. paid: { '2026-11': true }
export function toggleBillPaid(billId, monthKey) {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  bill.paid = bill.paid || {};
  bill.paid[monthKey] = !bill.paid[monthKey];
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
  state = migrate(parsed);
  save();
}

export function resetToSample() {
  state = sampleState();
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
  save();
}
