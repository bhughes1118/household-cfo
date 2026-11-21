// Household CFO screens: dashboard, bills, spending, income, budget categories.

import { getState, upsert, remove, toggleBillPaid } from '../store.js';
import {
  monthSummary, groupTotals, upcomingBills, honeymoonSpendInMonth, tripSummary,
  daysUntil, monthKey, inMonth, isoLocal, CADENCE_TO_MONTHLY,
} from '../calc.js';
import { esc, money, pct, bar, shortDate, monthLabel, shiftMonth, openForm, toast, empty, ordinal } from '../ui.js';

// ---- Shared bits -------------------------------------------------------------

function monthPicker(ctx) {
  const isNow = ctx.month === monthKey();
  return `
    <div class="month-picker">
      <button class="icon-btn" data-month="-1" aria-label="Previous month">‹</button>
      <strong>${monthLabel(ctx.month)}</strong>
      <button class="icon-btn" data-month="1" aria-label="Next month">›</button>
      ${isNow ? '' : '<button class="chip" data-month="0">Today</button>'}
    </div>`;
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

const catById = (s, id) => s.categories.find((c) => c.id === id) || { name: 'Uncategorized', icon: '•' };

function sampleBanner(s) {
  return s.settings.isSample
    ? `<a class="banner" href="#/data">You're looking at sample numbers. Tap to clear them and enter your own.</a>`
    : '';
}

function fab(label = 'Add spending') {
  return `<button class="fab" data-act="add-txn" aria-label="${label}">＋</button>`;
}

// ---- Spending form (used from several screens) ----------------------------

export function editTransaction(t = {}, ctx) {
  const s = getState();
  const defaultDate = ctx && ctx.month !== monthKey() ? `${ctx.month}-01` : isoLocal();
  openForm({
    title: t.id ? 'Edit spending' : 'Add spending',
    fields: [
      { name: 'amount', label: 'Amount', type: 'money', value: t.amount, required: true, autofocus: !t.id },
      {
        name: 'categoryId', label: 'Category', type: 'select', value: t.categoryId || 'groceries',
        options: s.categories.filter((c) => !c.system).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
      },
      { name: 'note', label: 'Note', value: t.note, placeholder: 'Where / what' },
      { name: 'date', label: 'Date', type: 'date', value: t.date || defaultDate },
    ],
    onSubmit: (v) => { upsert('transactions', { ...t, ...v }); toast(t.id ? 'Updated' : 'Added'); },
    onDelete: t.id ? () => { remove('transactions', t.id); toast('Deleted'); } : null,
  });
}

// ---- Dashboard ---------------------------------------------------------------

export function dashboard(root, ctx) {
  const s = getState();
  const mk = ctx.month;
  const m = monthSummary(s, mk);
  const g = groupTotals(s, mk);
  const up = upcomingBills(s, mk).slice(0, 4);
  const trip = tripSummary(s);
  const hmThisMonth = honeymoonSpendInMonth(s, mk);
  const countdown = daysUntil(s.trip.startDate);
  const recent = s.transactions.filter((t) => inMonth(t.date, mk)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const cats = s.categories
    .map((c) => ({ ...c, spent: m.byCat[c.id] || 0 }))
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const guide = { needs: 0.5, wants: 0.3, savings: 0.2 };

  root.innerHTML = `
    ${sampleBanner(s)}
    ${monthPicker(ctx)}

    <section class="hero card">
      <div class="label">Left this month</div>
      <div class="big ${m.leftToSpend < 0 ? 'neg' : ''}">${money(m.leftToSpend)}</div>
      <div class="muted">after spending so far and ${money(m.unpaidBills)} in bills still due</div>
      ${bar(m.spent + m.unpaidBills, m.income)}
    </section>

    <section class="kpis">
      <div class="kpi"><span>Income</span><strong>${money(m.income)}</strong></div>
      <div class="kpi"><span>Spent</span><strong>${money(m.spent)}</strong></div>
      <div class="kpi"><span>Bills left</span><strong>${money(m.unpaidBills)}</strong></div>
      <div class="kpi"><span>Saved</span><strong>${pct(m.savingsRate)}</strong></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Needs · Wants · Savings</h3><span class="muted small">50 / 30 / 20 guide</span></div>
      ${['needs', 'wants', 'savings'].map((k) => `
        <div class="row-line">
          <span class="cap">${k}</span>
          <span>${money(g[k])} <span class="muted small">of ${money(m.income * guide[k])}</span></span>
        </div>
        ${bar(g[k], m.income * guide[k], k === 'savings' ? { tone: 'ok' } : {})}`).join('')}
    </section>

    <a class="card trip-card" href="#/honeymoon">
      <div class="card-head"><h3>✈️ ${esc(s.trip.name)}</h3><span class="chev">›</span></div>
      <div class="row-line"><span>${countdown != null && countdown >= 0 ? `${countdown} days to go` : esc(s.trip.destination || '')}</span><span class="muted small">${money(hmThisMonth)} this month</span></div>
      <div class="row-line"><span class="muted small">Paid so far ${money(trip.spentToDate)}</span><span class="muted small">Est. ${money(trip.estimatedTotal)} of ${money(trip.budget)}</span></div>
      ${bar(trip.spentToDate, trip.budget || trip.estimatedTotal)}
    </a>

    <section class="card">
      <div class="card-head"><h3>Upcoming bills</h3><a href="#/bills" class="small">All bills ›</a></div>
      ${up.length ? `<ul class="list">${up.map((b) => `
        <li class="item">
          <div><div>${esc(b.name)}</div><div class="muted small">${b.overdue ? '<span class="neg">Past due</span> · ' : ''}Due the ${ordinal(b.dueDay)}${b.autopay ? ' · Autopay' : ''}</div></div>
          <div class="right"><strong>${money(b.amount)}</strong><button class="chip" data-paid="${b.id}">Mark paid</button></div>
        </li>`).join('')}</ul>` : empty('All bills paid for this month. Nice.')}
    </section>

    <section class="card">
      <div class="card-head"><h3>Budget by category</h3><a href="#/budgets" class="small">Edit ›</a></div>
      <ul class="list">${cats.map((c) => `
        <li class="cat">
          <div class="row-line"><span>${c.icon} ${esc(c.name)}</span><span>${money(c.spent)}${c.budget ? ` <span class="muted small">/ ${money(c.budget)}</span>` : ''}</span></div>
          ${c.budget ? bar(c.spent, c.budget, c.group === 'savings' ? { tone: 'ok' } : {}) : ''}
        </li>`).join('')}</ul>
    </section>

    <section class="card">
      <div class="card-head"><h3>Recent spending</h3><a href="#/spending" class="small">All ›</a></div>
      ${recent.length ? `<ul class="list">${recent.map((t) => txnRow(s, t)).join('')}</ul>` : empty('No spending logged this month yet.')}
    </section>

    ${fab()}
  `;

  bindMonthPicker(root, ctx, () => dashboard(root, ctx));
  root.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => { toggleBillPaid(b.dataset.paid, mk); toast('Marked paid'); }));
  root.querySelector('[data-act="add-txn"]').onclick = () => editTransaction({}, ctx);
  bindTxnRows(root, ctx);
}

function txnRow(s, t) {
  const c = catById(s, t.categoryId);
  return `
    <li class="item tap" data-txn="${t.id}">
      <div class="lead">${c.icon}</div>
      <div class="grow"><div>${esc(t.note || c.name)}</div><div class="muted small">${esc(c.name)} · ${shortDate(t.date)}</div></div>
      <strong>${money(t.amount, true)}</strong>
    </li>`;
}

function bindTxnRows(root, ctx) {
  const s = getState();
  root.querySelectorAll('[data-txn]').forEach((el) => {
    el.onclick = () => editTransaction(s.transactions.find((t) => t.id === el.dataset.txn), ctx);
  });
}

// ---- Bills -------------------------------------------------------------------

function editBill(b = {}) {
  const s = getState();
  openForm({
    title: b.id ? 'Edit bill' : 'Add bill',
    fields: [
      { name: 'name', label: 'Name', value: b.name, required: true, autofocus: !b.id, placeholder: 'e.g. Electric' },
      { name: 'amount', label: 'Amount each month', type: 'money', value: b.amount, required: true },
      { name: 'dueDay', label: 'Due day of month (1–31)', type: 'number', value: b.dueDay || 1 },
      {
        name: 'categoryId', label: 'Category', type: 'select', value: b.categoryId || 'utilities',
        options: s.categories.filter((c) => !c.system).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
      },
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

  root.innerHTML = `
    ${monthPicker(ctx)}
    <section class="kpis three">
      <div class="kpi"><span>Monthly bills</span><strong>${money(m.billsDue)}</strong></div>
      <div class="kpi"><span>Paid</span><strong>${money(m.paidBills)}</strong></div>
      <div class="kpi"><span>Still due</span><strong>${money(m.unpaidBills)}</strong></div>
    </section>
    <section class="card">
      ${bar(m.paidBills, m.billsDue, { tone: 'ok' })}
      ${list.length ? `<ul class="list">${list.map((b) => {
        const paid = !!b.paid?.[mk];
        const overdue = !paid && isNow && b.dueDay < today.getDate();
        return `
        <li class="item">
          <button class="check-btn ${paid ? 'on' : ''}" data-toggle="${b.id}" aria-label="${paid ? 'Mark unpaid' : 'Mark paid'}">${paid ? '✓' : ''}</button>
          <div class="grow tap" data-bill="${b.id}">
            <div class="${paid ? 'done' : ''}">${esc(b.name)}</div>
            <div class="muted small">${overdue ? '<span class="neg">Past due</span> · ' : ''}Due the ${ordinal(b.dueDay)}${b.autopay ? ' · Autopay' : ''} · ${esc(catById(s, b.categoryId).name)}</div>
          </div>
          <strong>${money(b.amount)}</strong>
        </li>`;
      }).join('')}</ul>` : empty('No bills yet.')}
      <button class="btn block" data-act="add-bill">＋ Add a bill</button>
    </section>
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

  const byDay = {};
  for (const t of txns) (byDay[t.date] ||= []).push(t);

  root.innerHTML = `
    ${monthPicker(ctx)}
    <div class="toolbar">
      <select id="spend-filter" aria-label="Filter by category">
        <option value="all">All categories</option>
        ${s.categories.filter((c) => !c.system).map((c) => `<option value="${c.id}" ${filter === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
      </select>
      <strong>${money(total, true)}</strong>
    </div>
    ${hm > 0 && filter === 'all' ? `<a class="card trip-mini" href="#/honeymoon/expenses">✈️ Plus ${money(hm, true)} honeymoon spending this month ›</a>` : ''}
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, list]) => `
      <h4 class="day-head">${shortDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
      <section class="card flush"><ul class="list">${list.map((t) => txnRow(s, t)).join('')}</ul></section>
    `).join('') : empty('Nothing logged for this month yet.', '<button class="btn" data-act="add-txn2">Add spending</button>')}
    ${fab()}
  `;
  bindMonthPicker(root, ctx, () => spending(root, ctx));
  root.querySelector('#spend-filter').onchange = (e) => { ctx.spendFilter = e.target.value; spending(root, ctx); };
  root.querySelectorAll('[data-act^="add-txn"]').forEach((b) => (b.onclick = () => editTransaction({}, ctx)));
  bindTxnRows(root, ctx);
}

// ---- Income ------------------------------------------------------------------

const CADENCES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
];

function editIncome(i = {}) {
  openForm({
    title: i.id ? 'Edit income' : 'Add income',
    fields: [
      { name: 'name', label: 'Source', value: i.name, required: true, autofocus: !i.id, placeholder: 'e.g. Paycheck' },
      { name: 'amount', label: 'Take-home amount', type: 'money', value: i.amount, required: true },
      { name: 'cadence', label: 'How often', type: 'select', value: i.cadence || 'monthly', options: CADENCES },
    ],
    onSubmit: (v) => { upsert('income', { ...i, ...v }); toast('Saved'); },
    onDelete: i.id ? () => remove('income', i.id) : null,
  });
}

export function income(root) {
  const s = getState();
  const total = s.income.reduce((t, i) => t + i.amount * (CADENCE_TO_MONTHLY[i.cadence] ?? 1), 0);
  root.innerHTML = `
    <section class="hero card">
      <div class="label">Monthly take-home</div>
      <div class="big">${money(total)}</div>
      <div class="muted">${money(total * 12)} a year</div>
    </section>
    <section class="card">
      ${s.income.length ? `<ul class="list">${s.income.map((i) => `
        <li class="item tap" data-inc="${i.id}">
          <div class="grow"><div>${esc(i.name)}</div><div class="muted small">${CADENCES.find((c) => c.value === i.cadence)?.label || 'Monthly'}</div></div>
          <div class="right"><strong>${money(i.amount)}</strong>${i.cadence !== 'monthly' ? `<div class="muted small">${money(i.amount * (CADENCE_TO_MONTHLY[i.cadence] ?? 1))}/mo</div>` : ''}</div>
        </li>`).join('')}</ul>` : empty('Add your paychecks and other income.')}
      <button class="btn block" data-act="add">＋ Add income</button>
    </section>`;
  root.querySelectorAll('[data-inc]').forEach((el) => (el.onclick = () => editIncome(s.income.find((i) => i.id === el.dataset.inc))));
  root.querySelector('[data-act="add"]').onclick = () => editIncome();
}

// ---- Budget categories ---------------------------------------------------------

const GROUPS = [
  { value: 'needs', label: 'Needs' },
  { value: 'wants', label: 'Wants' },
  { value: 'savings', label: 'Savings' },
];

function editCategory(c = {}) {
  openForm({
    title: c.id ? 'Edit category' : 'Add category',
    fields: [
      { name: 'icon', label: 'Emoji', value: c.icon || '📦' },
      { name: 'name', label: 'Name', value: c.name, required: true, autofocus: !c.id },
      { name: 'budget', label: 'Monthly budget', type: 'money', value: c.budget },
      { name: 'group', label: 'Group', type: 'select', value: c.group || 'wants', options: GROUPS },
    ],
    onSubmit: (v) => { upsert('categories', { ...c, ...v }); toast('Saved'); },
    onDelete: c.id && !c.system ? () => remove('categories', c.id) : null,
  });
}

export function budgets(root, ctx) {
  const s = getState();
  const m = monthSummary(s, ctx.month);
  root.innerHTML = `
    ${monthPicker(ctx)}
    <section class="kpis three">
      <div class="kpi"><span>Income</span><strong>${money(m.income)}</strong></div>
      <div class="kpi"><span>Budgeted</span><strong>${money(m.budgeted)}</strong></div>
      <div class="kpi"><span>Unassigned</span><strong class="${m.income - m.budgeted < 0 ? 'neg' : ''}">${money(m.income - m.budgeted)}</strong></div>
    </section>
    ${GROUPS.map((g) => `
      <h4 class="day-head">${g.label}</h4>
      <section class="card flush"><ul class="list">${s.categories.filter((c) => c.group === g.value).map((c) => `
        <li class="cat tap" data-cat="${c.id}">
          <div class="row-line"><span>${c.icon} ${esc(c.name)}${c.system ? ' <span class="muted small">(from Honeymoon Portal)</span>' : ''}</span><span>${money(m.byCat[c.id] || 0)} <span class="muted small">/ ${money(c.budget)}</span></span></div>
          ${c.budget ? bar(m.byCat[c.id] || 0, c.budget, c.group === 'savings' ? { tone: 'ok' } : {}) : ''}
        </li>`).join('')}</ul></section>`).join('')}
    <button class="btn block" data-act="add">＋ Add category</button>`;
  bindMonthPicker(root, ctx, () => budgets(root, ctx));
  root.querySelectorAll('[data-cat]').forEach((el) => (el.onclick = () => editCategory(s.categories.find((c) => c.id === el.dataset.cat))));
  root.querySelector('[data-act="add"]').onclick = () => editCategory();
}
