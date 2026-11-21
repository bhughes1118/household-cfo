// Import spending from a CSV file: a bank/credit-card export or a spreadsheet
// saved as CSV (columns like Date, Description, Category, Amount).
// Read-only: nothing is sent anywhere, rows are just added to the spending log.

import { matchCategory, isoLocal } from './calc.js';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function parseDate(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const d = new Date(v);
  return isNaN(d) ? null : isoLocal(d);
}

const num = (v) => {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(s);
  const n = parseFloat(s.replace(/[()]/g, ''));
  return isNaN(n) ? null : neg ? -n : n;
};

// Returns { items, skipped } where items are ready for addTransactions().
export function rowsToTransactions(state, rows) {
  const headerIdx = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit/i.test(c)));
  if (headerIdx < 0) throw new Error('Could not find a header row with Date and Amount columns.');
  const h = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const col = (...names) => h.findIndex((c) => names.some((n) => c === n || c.includes(n)));
  const iDate = col('date');
  const iDesc = col('description', 'merchant', 'payee', 'name', 'memo');
  const iCat = col('category');
  const iAmt = col('amount');
  const iDebit = col('debit', 'withdrawal');
  const iCredit = col('credit', 'deposit');

  const raw = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[iDate]);
    let amt = iAmt >= 0 ? num(r[iAmt]) : null;
    if (amt == null && iDebit >= 0) {
      const d = num(r[iDebit]), c = iCredit >= 0 ? num(r[iCredit]) : null;
      amt = d ? -Math.abs(d) : c ? Math.abs(c) : null;
    }
    if (!date || amt == null || amt === 0) continue;
    raw.push({ date, amt, desc: (r[iDesc] || '').trim(), cat: iCat >= 0 ? (r[iCat] || '').trim() : '' });
  }
  // Bank exports show spending as negative and deposits as positive; a
  // spreadsheet log is usually all positive. Keep only the money going out.
  const mixed = raw.some((x) => x.amt < 0) && raw.some((x) => x.amt > 0);
  const allNeg = raw.length && raw.every((x) => x.amt < 0);
  const items = [];
  let skipped = 0;
  for (const x of raw) {
    if (mixed && x.amt > 0) { skipped++; continue; }
    const categoryId = matchCategory(state, x.cat) || matchCategory(state, x.desc) || 'misc';
    items.push({ date: x.date, amount: Math.round(Math.abs(x.amt) * 100) / 100, categoryId, note: x.desc || x.cat });
  }
  return { items, skipped, signConvention: mixed ? 'bank' : allNeg ? 'negative' : 'positive' };
}
