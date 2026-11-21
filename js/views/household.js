// Household CFO screens: dashboard, bills, spending, income, budget categories.

import { getState, upsert, remove, toggleBillPaid } from '../store.js';
import {
  monthSummary, groupTotals, upcomingBills, honeymoonSpendInMonth, tripSummary, paycheckPlan,
  daysUntil, monthKey, inMonth, isoLocal, CADENCE_TO_MONTHLY,
} from '../calc.js';
import { esc, money, pct, bar, shortDate, monthLabel, shiftMonth, openForm, toast, empty, ordinal } from '../ui.js';
import { icon, catDot } from '../icons.js';

// ---- Shared bits -------------------------------------------------------------

export function monthPicker(ctx) {
  const isNow = ctx.month === monthKey();
  return `
    <div class="month-picker">
      <button data-month="-1" aria-label="Previous month">${icon('chevronLeft', 16)}</button>
      <strong>${monthLabel(ctx.month)}</strong>
      <button data-month="1" aria-label="Next month">${icon('chevronRight', 16)}</button>
      ${isNow ? '' : '<button class="today" data-month="0">Today</button>'}
    </div>`;
}

export function pageHead(title, sub, actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="actions">${actions}</div></div>`;
}

function bindMonthPicker(root, ctx, rerender) {
  root.querySelectorAll('[data-month]').forEach((b) => {
    b.onclick = () => {
      const d = Number(b.dataset.month);
      ctx.month = d === 0 ? monthKey() : shiftMonth(ctx.month, d);
      rerender();
    };
  });
}

const catById = (s, id) => s.categories.find((c) => c.id === id) || { id: 'misc', name: 'Uncategorized' };

function sampleBanner(s) {
  return s.settings.isSample
    ? `<a class="notice" href="#/data">${icon('alert', 16)}<span>Sample figures are shown. Open <strong>Backup &amp; data</strong> to clear them and enter your own.</span></a>`
    : '';
}

const fab = (label = 'Add spending') => `<button class="fab" data-act="add-txn">${icon('plus', 18)}<span>${label}</span></button>`;

const catOptions = (s) => s.categories.filter((c) => !c.system).map((c) => ({ value: c.id, label: c.name }));

// ---- Spending form (used from several screens) ----------------------------

export function editTransaction(t = {}, ctx) {
  const s = getState();
  const defaultDate = ctx && ctx.month !== monthKey() ? `${ctx.month}-01` : isoLocal();
  openForm({
    title: t.id ? 'Edit transaction' : 'New transaction',
    fields: [
      { name: 'amount', label: 'Amount', type: 'money', value: t.amount, required: true, autofocus: !t.id },
      { name: 'note', label: 'Payee / description', value: t.note, placeholder: 'e.g. Publix' },
      { name: 'categoryId', label: 'Category', type: 'select', value: t.categoryId || 'groceries', options: catOptions(s) },
      { name: 'date', label: 'Date', type: 'date', value: t.date || defaultDate },
    ],
    onSubmit: (v) => { upsert('transactions', { ...t, ...v }); toast(t.id ? 'Transaction updated' : 'Transaction added'); },
    onDelete: t.id ? () => { remove('transactions', t.id); toast('Deleted'); } : null,
  });
}

function txnTable(s, list, { showCat = true } = {}) {
  if (!list.length) return '';
  return `<table class="tbl">
    <thead><tr><th>Date</th><th>Payee</th>${showCat ? '<th class="hide-sm">Category</th>' : ''}<th class="num">Amount</th></tr></thead>
    <tbody>${list.map((t) => {
      const c = catById(s, t.categoryId);
      return `<tr class="tap" data-txn="${t.id}">
        <td class="num" style="text-align:left">${shortDate(t.date)}</td>
        <td><div class="ellip">${esc(t.note || c.name)}</div>${showCat ? `<div class="sub show-sm">${esc(c.name)}</div>` : `<div class="sub">${esc(c.name)}</div>`}</td>
        ${showCat ? `<td class="hide-sm"><span class="name">${catDot(c)}${esc(c.name)}</span></td>` : ''}
        <td class="num">${money(t.amount, true)}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function bindTxnRows(root, ctx) {
  const s = getState();
  root.querySelectorAll('[data-txn]').forEach((el) => {
    el.onclick = () => editTransaction(s.transactions.find((t) => t.id === el.dataset.txn), ctx);
  });
}

// ---- Dashboard ---------------------------------------------------------------

export function dashboard(root, ctx) {
  const s = getState();
  const mk = ctx.month;
  const m = monthSummary(s, mk);
  const g = groupTotals(s, mk);
  const up = upcomingBills(s, mk).slice(0, 5);
  const trip = tripSummary(s);
  const hmThisMonth = honeymoonSpendInMonth(s, mk);
  const countdown = daysUntil(s.trip.startDate);
  const recent = s.transactions.filter((t) => inMonth(t.date, mk)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const cats = s.categories
    .map((c) => ({ ...c, spent: m.byCat[c.id] || 0 }))
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const guide = { needs: 0.5, wants: 0.3, savings: 0.2 };
  const groups = ['needs', 'wants', 'savings', ...(g.debt ? ['debt'] : [])];

  root.innerHTML = `
    ${sampleBanner(s)}
    ${pageHead('Overview', esc(s.settings.householdName || 'Household'), monthPicker(ctx))}

    <section class="stats hero">
      <div class="stat lead">
        <div class="stat-label">Available this month</div>
        <div class="stat-value ${m.leftToSpend < 0 ? 'neg' : ''}">${money(m.leftToSpend)}</div>
        <div class="stat-meta">After spending to date and ${money(m.unpaidBills)} in unpaid bills</div>
        ${bar(m.spent + m.unpaidBills, m.income)}
      </div>
      <div class="stat"><div class="stat-label">Income</div><div class="stat-value">${money(m.income)}</div><div class="stat-meta">${m.gross > m.income ? `${money(m.gross)} gross` : 'Take-home'}</div></div>
      <div class="stat"><div class="stat-label">Spent</div><div class="stat-value">${money(m.spent)}</div><div class="stat-meta">Fixed ${money(m.fixedSpent)} · Flex ${money(m.flexibleSpent)}</div></div>
      <div class="stat"><div class="stat-label">Savings rate</div><div class="stat-value">${pct(m.savingsRate)}</div><div class="stat-meta">After bills ${money(m.afterFixed)}</div></div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <header class="panel-head"><h2>Upcoming bills</h2><a href="#/bills">View all</a></header>
        ${up.length ? `<table class="tbl"><tbody>${up.map((b) => `
          <tr>
            <td><div>${esc(b.name)}</div><div class="sub">${b.overdue ? '<span class="neg">Past due</span> · ' : ''}Due ${ordinal(b.dueDay)}${b.autopay ? ' · Autopay' : ''}</div></td>
            <td class="num">${money(b.amount)}</td>
            <td class="num" style="width:1%"><button class="btn sm" data-paid="${b.id}">Mark paid</button></td>
          </tr>`).join('')}</tbody></table>` : empty('All bills are paid for this month.')}
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Allocation</h2><span class="meta">Guide: 50 / 30 / 20</span></header>
        <table class="tbl">
          <thead><tr><th>Group</th><th class="num">Actual</th><th class="num">Target</th><th class="bar-cell"></th></tr></thead>
          <tbody>${groups.map((k) => `
            <tr><td class="cap">${k}</td><td class="num">${money(g[k])}</td><td class="num">${guide[k] ? money(m.income * guide[k]) : '—'}</td>
            <td class="bar-cell">${guide[k] ? bar(g[k], m.income * guide[k], k === 'savings' ? { tone: 'ok' } : {}) : ''}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>
    </div>

    <section class="panel">
      <header class="panel-head"><h2>Budget vs. actual</h2><a href="#/budgets">Edit budget</a></header>
      <table class="tbl">
        <thead><tr><th>Category</th><th class="num">Actual</th><th class="num hide-sm">Budget</th><th class="num hide-sm">Share</th><th class="bar-cell"></th></tr></thead>
        <tbody>${cats.map((c) => `
          <tr>
            <td><span class="name">${catDot(c)}<span>${esc(c.name)}</span></span></td>
            <td class="num">${money(c.spent)}</td>
            <td class="num hide-sm">${c.budget ? money(c.budget) : '—'}</td>
            <td class="num hide-sm">${c.spent ? pct(m.share[c.id]) : '—'}</td>
            <td class="bar-cell">${c.budget ? bar(c.spent, c.budget, c.group === 'savings' ? { tone: 'ok' } : {}) : ''}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td class="num">${money(m.spent)}</td><td class="num hide-sm">${money(m.budgeted)}</td><td class="hide-sm"></td><td></td></tr></tfoot>
      </table>
    </section>

    <div class="grid-2">
      <a class="panel" href="#/honeymoon" style="color:inherit">
        <header class="panel-head"><h2>Honeymoon</h2><span class="chev">${icon('chevronRight', 16)}</span></header>
        <div class="panel-body">
          <div class="row-line"><span class="muted small">${esc(s.trip.destination || s.trip.name)}</span><span class="small">${countdown != null && countdown >= 0 ? `${countdown} days out` : ''}</span></div>
          <div class="row-line"><span>Paid to date</span><strong class="num">${money(trip.spentToDate)}</strong></div>
          <div class="row-line"><span>Estimated total</span><span class="num">${money(trip.estimatedTotal)}${trip.budget ? ` of ${money(trip.budget)}` : ''}</span></div>
          <div class="row-line"><span>Charged this month</span><span class="num">${money(hmThisMonth)}</span></div>
          ${bar(trip.spentToDate, trip.budget || trip.estimatedTotal)}
        </div>
      </a>

      <section class="panel">
        <header class="panel-head"><h2>Recent transactions</h2><a href="#/spending">View all</a></header>
        ${recent.length ? txnTable(s, recent, { showCat: false }) : empty('No transactions this month yet.')}
      </section>
    </div>

    ${fab()}
  `;

  bindMonthPicker(root, ctx, () => dashboard(root, ctx));
  root.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => { toggleBillPaid(b.dataset.paid, mk); toast('Marked paid'); }));
  root.querySelector('[data-act="add-txn"]').onclick = () => editTransaction({}, ctx);
  bindTxnRows(root, ctx);
}

// ---- Bills -------------------------------------------------------------------

function editBill(b = {}) {
  const s = getState();
  openForm({
    title: b.id ? 'Edit bill' : 'New bill',
    fields: [
      { name: 'name', label: 'Payee', value: b.name, required: true, autofocus: !b.id, placeholder: 'e.g. TECO Electric' },
      { name: 'amount', label: 'Monthly amount', type: 'money', value: b.amount, required: true },
      { name: 'dueDay', label: 'Due day of month (1–31)', type: 'number', value: b.dueDay || 1 },
      { name: 'categoryId', label: 'Category', type: 'select', value: b.categoryId || 'utilities', options: catOptions(s) },
      { name: 'autopay', label: 'On autopay', type: 'checkbox', value: b.autopay },
    ],
    onSubmit: (v) => {
      v.dueDay = Math.min(31, Math.max(1, Math.round(v.dueDay) || 1));
      upsert('bills', { paid: {}, ...b, ...v });
      toast('Saved');
    },
    onDelete: b.id ? () => remove('bills', b.id) : null,
  });
}

export function bills(root, ctx) {
  const s = getState();
  const mk = ctx.month;
  const m = monthSummary(s, mk);
  const list = [...s.bills].sort((a, b) => a.dueDay - b.dueDay);
  const today = new Date();
  const isNow = mk === monthKey();
  const plan = paycheckPlan(s);

  root.innerHTML = `
    ${pageHead('Bills', 'Recurring fixed expenses', `${monthPicker(ctx)}<button class="btn primary" data-act="add-bill">${icon('plus', 16)}Add bill</button>`)}
    <section class="stats three">
      <div class="stat"><div class="stat-label">Monthly total</div><div class="stat-value">${money(m.billsDue)}</div></div>
      <div class="stat"><div class="stat-label">Paid</div><div class="stat-value pos">${money(m.paidBills)}</div></div>
      <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-value ${m.unpaidBills ? 'neg' : ''}">${money(m.unpaidBills)}</div></div>
    </section>
    <section class="panel">
      ${list.length ? `<table class="tbl">
        <thead><tr><th style="width:1%"></th><th>Payee</th><th class="hide-sm">Category</th><th class="num">Due</th><th class="num">Amount</th></tr></thead>
        <tbody>${list.map((b) => {
          const paid = !!b.paid?.[mk];
          const overdue = !paid && isNow && b.dueDay < today.getDate();
          const c = catById(s, b.categoryId);
          return `<tr>
            <td><button class="check-btn ${paid ? 'on' : ''}" data-toggle="${b.id}" aria-label="${paid ? 'Mark unpaid' : 'Mark paid'}">${paid ? icon('check', 13) : ''}</button></td>
            <td class="tap" data-bill="${b.id}"><div class="${paid ? 'done' : ''}">${esc(b.name)}</div><div class="sub">${overdue ? '<span class="neg">Past due</span> · ' : paid ? 'Paid · ' : ''}${b.autopay ? 'Autopay' : 'Manual'}</div></td>
            <td class="hide-sm"><span class="name">${catDot(c)}${esc(c.name)}</span></td>
            <td class="num">${ordinal(b.dueDay)}</td>
            <td class="num">${money(b.amount)}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td></td><td>Total</td><td class="hide-sm"></td><td></td><td class="num">${money(m.billsDue)}</td></tr></tfoot>
      </table>` : empty('No bills yet.')}
    </section>
    ${plan ? `<section class="panel">
      <header class="panel-head"><h2>Bills per paycheck</h2><a href="#/income">Income</a></header>
      <table class="tbl">
        <thead><tr><th>Paycheck</th><th class="num">Net pay</th><th class="num">Bills</th><th class="num">Left</th></tr></thead>
        <tbody>${plan.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${money(p.income)}</td><td class="num">${money(p.bills)}</td><td class="num ${p.left < 0 ? 'neg' : 'pos'}">${money(p.left)}</td></tr>`).join('')}</tbody>
      </table>
    </section>` : ''}
  `;
  bindMonthPicker(root, ctx, () => bills(root, ctx));
  root.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => toggleBillPaid(b.dataset.toggle, mk)));
  root.querySelectorAll('[data-bill]').forEach((el) => (el.onclick = () => editBill(s.bills.find((b) => b.id === el.dataset.bill))));
  root.querySelector('[data-act="add-bill"]').onclick = () => editBill();
}

// ---- Spending ----------------------------------------------------------------

export function spending(root, ctx) {
  const s = getState();
  const mk = ctx.month;
  const filter = ctx.spendFilter || 'all';
  const txns = s.transactions
    .filter((t) => inMonth(t.date, mk) && (filter === 'all' || t.categoryId === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = txns.reduce((t, x) => t + Number(x.amount), 0);
  const hm = honeymoonSpendInMonth(s, mk);

  root.innerHTML = `
    ${pageHead('Transactions', `${txns.length} in ${monthLabel(mk)} · ${money(total, true)}`, monthPicker(ctx))}
    <div class="toolbar">
      <select id="spend-filter" aria-label="Filter by category">
        <option value="all">All categories</option>
        ${s.categories.filter((c) => !c.system).map((c) => `<option value="${c.id}" ${filter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <a class="btn sm" href="#/data">${icon('upload', 14)}Import CSV</a>
    </div>
    ${hm > 0 && filter === 'all' ? `<a class="notice" href="#/honeymoon/expenses" style="border-color:var(--line);background:var(--surface)">${icon('plane', 16)}<span>Plus ${money(hm, true)} in honeymoon charges this month</span></a>` : ''}
    <section class="panel">
      ${txns.length ? txnTable(s, txns) : empty('No transactions for this month.', '<button class="btn" data-act="add-txn2">Add transaction</button>')}
    </section>
    ${fab('Add')}
  `;
  bindMonthPicker(root, ctx, () => spending(root, ctx));
  root.querySelector('#spend-filter').onchange = (e) => { ctx.spendFilter = e.target.value; spending(root, ctx); };
  root.querySelectorAll('[data-act^="add-txn"]').forEach((b) => (b.onclick = () => editTransaction({}, ctx)));
  bindTxnRows(root, ctx);
}

// ---- Income ------------------------------------------------------------------

const CADENCES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
];

function editIncome(i = {}) {
  openForm({
    title: i.id ? 'Edit income' : 'New income source',
    fields: [
      { name: 'name', label: 'Source', value: i.name, required: true, autofocus: !i.id, placeholder: 'e.g. Ellehaus salary' },
      { name: 'amount', label: 'Net pay per paycheck (after tax & 401k)', type: 'money', value: i.amount, required: true },
      { name: 'gross', label: 'Gross pay per paycheck (optional)', type: 'money', value: i.gross },
      { name: 'cadence', label: 'Pay frequency', type: 'select', value: i.cadence || 'monthly', options: CADENCES },
    ],
    onSubmit: (v) => { upsert('income', { ...i, ...v }); toast('Saved'); },
    onDelete: i.id ? () => remove('income', i.id) : null,
  });
}

export function income(root) {
  const s = getState();
  const per = (i, k) => (k === 'gross' ? i.gross || i.amount : i.amount) * (CADENCE_TO_MONTHLY[i.cadence] ?? 1);
  const total = s.income.reduce((t, i) => t + per(i, 'net'), 0);
  const gross = s.income.reduce((t, i) => t + per(i, 'gross'), 0);
  const freq = (i) => CADENCES.find((c) => c.value === i.cadence)?.label || 'Monthly';
  root.innerHTML = `
    ${pageHead('Income', 'Paychecks and other income', `<button class="btn primary" data-act="add">${icon('plus', 16)}Add income</button>`)}
    <section class="stats three">
      <div class="stat"><div class="stat-label">Net / month</div><div class="stat-value">${money(total)}</div><div class="stat-meta">${money(total * 12)} / yr</div></div>
      <div class="stat"><div class="stat-label">Gross / month</div><div class="stat-value">${money(gross)}</div><div class="stat-meta">${money(gross * 12)} / yr</div></div>
      <div class="stat"><div class="stat-label">Tax &amp; deductions</div><div class="stat-value">${money(gross - total)}</div><div class="stat-meta">${gross ? pct((gross - total) / gross) : '—'} of gross</div></div>
    </section>
    <section class="panel">
      ${s.income.length ? `<table class="tbl">
        <thead><tr><th>Source</th><th class="num">Per check</th><th class="num">Monthly</th></tr></thead>
        <tbody>${s.income.map((i) => `
          <tr class="tap" data-inc="${i.id}">
            <td><div>${esc(i.name)}</div><div class="sub">${freq(i)}${i.gross ? ` · ${money(i.gross)} gross` : ''}</div></td>
            <td class="num">${money(i.amount)}</td>
            <td class="num">${money(per(i, 'net'))}</td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${money(total)}</td></tr></tfoot>
      </table>` : empty('Add your paychecks and other income.')}
    </section>`;
  root.querySelectorAll('[data-inc]').forEach((el) => (el.onclick = () => editIncome(s.income.find((i) => i.id === el.dataset.inc))));
  root.querySelector('[data-act="add"]').onclick = () => editIncome();
}

// ---- Budget categories ---------------------------------------------------------

const GROUPS = [
  { value: 'needs', label: 'Needs' },
  { value: 'wants', label: 'Wants' },
  { value: 'savings', label: 'Savings' },
  { value: 'debt', label: 'Debt' },
];

function editCategory(c = {}) {
  openForm({
    title: c.id ? 'Edit category' : 'New category',
    fields: [
      { name: 'name', label: 'Name', value: c.name, required: true, autofocus: !c.id },
      { name: 'budget', label: 'Monthly budget', type: 'money', value: c.budget },
      { name: 'group', label: 'Group', type: 'select', value: c.group || 'wants', options: GROUPS },
      { name: 'kind', label: 'Type', type: 'select', value: c.kind || 'flexible', options: [{ value: 'fixed', label: 'Fixed (same every month)' }, { value: 'flexible', label: 'Flexible (day to day)' }] },
    ],
    onSubmit: (v) => { upsert('categories', { ...c, ...v }); toast('Saved'); },
    onDelete: c.id && !c.system ? () => remove('categories', c.id) : null,
  });
}

export function budgets(root, ctx) {
  const s = getState();
  const m = monthSummary(s, ctx.month);
  root.innerHTML = `
    ${pageHead('Budget', 'Monthly budget by category', `${monthPicker(ctx)}<button class="btn primary" data-act="add">${icon('plus', 16)}Add category</button>`)}
    <section class="stats three">
      <div class="stat"><div class="stat-label">Income</div><div class="stat-value">${money(m.income)}</div></div>
      <div class="stat"><div class="stat-label">Budgeted</div><div class="stat-value">${money(m.budgeted)}</div></div>
      <div class="stat"><div class="stat-label">Unassigned</div><div class="stat-value ${m.income - m.budgeted < 0 ? 'neg' : ''}">${money(m.income - m.budgeted)}</div></div>
    </section>
    <section class="panel">
      <table class="tbl">
        <thead><tr><th>Category</th><th class="num">Actual</th><th class="num">Budget</th><th class="num hide-sm">Remaining</th><th class="bar-cell hide-sm"></th></tr></thead>
        ${GROUPS.map((g) => {
          const rows = s.categories.filter((c) => c.group === g.value);
          if (!rows.length) return '';
          return `<tbody><tr><td colspan="5" class="leg">${g.label}</td></tr>${rows.map((c) => {
            const a = m.byCat[c.id] || 0;
            return `<tr class="tap" data-cat="${c.id}">
              <td><span class="name">${catDot(c)}<div><div>${esc(c.name)}</div><div class="sub">${c.system ? 'From Honeymoon Portal' : c.kind === 'fixed' ? 'Fixed' : 'Flexible'}</div></div></span></td>
              <td class="num">${money(a)}</td>
              <td class="num">${c.budget ? money(c.budget) : '—'}</td>
              <td class="num hide-sm ${c.budget && c.budget - a < 0 ? 'neg' : ''}">${c.budget ? money(c.budget - a) : '—'}</td>
              <td class="bar-cell hide-sm">${c.budget ? bar(a, c.budget, c.group === 'savings' ? { tone: 'ok' } : {}) : ''}</td>
            </tr>`;
          }).join('')}</tbody>`;
        }).join('')}
      </table>
    </section>`;
  bindMonthPicker(root, ctx, () => budgets(root, ctx));
  root.querySelectorAll('[data-cat]').forEach((el) => (el.onclick = () => editCategory(s.categories.find((c) => c.id === el.dataset.cat))));
  root.querySelector('[data-act="add"]').onclick = () => editCategory();
}
