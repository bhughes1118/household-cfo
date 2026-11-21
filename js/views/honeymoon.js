// Honeymoon Portal: overview, itinerary, bookings, on-trip expenses, trip details.
// All money here also rolls up into the household "Honeymoon" category (see calc.js).

import { getState, upsert, remove, updateTrip } from '../store.js';
import { tripSummary, itinerary, daysUntil, isoLocal, needsInfo, TRIP_TYPES, TRIP_STATUS, EXPENSE_KINDS } from '../calc.js';
import { esc, money, bar, shortDate, time12, openForm, toast, empty } from '../ui.js';
import { icon } from '../icons.js';
import { scanButton, bindScan } from '../scan.js';

function subnav(active) {
  const tabs = [
    ['', 'Overview'],
    ['/itinerary', 'Itinerary'],
    ['/bookings', 'Bookings'],
    ['/expenses', 'Expenses'],
    ['/settings', 'Trip details'],
  ];
  return `<nav class="subnav">${tabs.map(([p, l]) => `<a href="#/honeymoon${p}" class="${active === p ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
}

function tripHeader(s) {
  const t = s.trip;
  const n = daysUntil(t.startDate);
  const when = t.startDate ? `${shortDate(t.startDate, { month: 'short', day: 'numeric' })} – ${shortDate(t.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Dates not set';
  const count = n == null ? '' : n > 0 ? `${n}` : n === 0 ? 'Today' : daysUntil(t.endDate) >= 0 ? 'Now' : 'Done';
  const countLabel = n > 0 ? 'days to go' : n === 0 ? 'trip starts' : daysUntil(t.endDate) >= 0 ? 'on the trip' : 'trip complete';
  return `
    <div class="trip-head">
      <div><div class="where">${esc(t.destination || 'Destination not set')} · ${when}</div><h1>${esc(t.name)}</h1></div>
      ${count ? `<div class="countdown"><strong>${count}</strong><span class="muted small">${countLabel}</span></div>` : ''}
    </div>`;
}

const statusPill = (st) => `<span class="pill ${st}">${TRIP_STATUS[st]?.label || st}</span>`;
const typeIcon = (type) => icon((TRIP_TYPES[type] || TRIP_TYPES.other).icon, 16);

// ---- Forms ---------------------------------------------------------------------

export function editTripItem(item = {}) {
  const s = getState();
  openForm({
    title: item.id ? 'Edit booking' : 'New booking or plan',
    fields: [
      { name: 'type', label: 'Category', type: 'select', value: item.type || 'tour', options: Object.entries(TRIP_TYPES).map(([v, t]) => ({ value: v, label: t.label })) },
      { name: 'title', label: 'Description', value: item.title, required: true, autofocus: !item.id, placeholder: 'e.g. Train Madrid → Toledo' },
      { name: 'status', label: 'Status', type: 'select', value: item.status || 'to-book', options: Object.entries(TRIP_STATUS).map(([v, t]) => ({ value: v, label: t.label })) },
      { name: 'date', label: 'Date', type: 'date', value: item.date || s.trip.startDate },
      { name: 'time', label: 'Time', type: 'time', value: item.time },
      { name: 'endDate', label: 'End / check-out date', type: 'date', value: item.endDate },
      { name: 'location', label: 'Location / station / address', value: item.location },
      { name: 'estCost', label: 'Estimated cost (USD)', type: 'money', value: item.estCost },
      { name: 'paid', label: 'Paid so far (USD)', type: 'money', value: item.paid },
      { name: 'paidDate', label: 'Date paid (counts in that month’s budget)', type: 'date', value: item.paidDate },
      { name: 'confirmation', label: 'Confirmation #', value: item.confirmation },
      { name: 'link', label: 'Link', type: 'url', value: item.link, placeholder: 'https://' },
      { name: 'notes', label: 'Notes', type: 'textarea', value: item.notes },
    ],
    onSubmit: (v) => {
      if (v.paid > 0 && !v.paidDate) v.paidDate = isoLocal();
      upsert('tripItems', { ...item, ...v });
      toast('Saved');
    },
    onDelete: item.id ? () => remove('tripItems', item.id) : null,
  });
}

export function editExpense(e = {}) {
  openForm({
    title: e.id ? 'Edit expense' : 'New trip expense',
    fields: [
      { name: 'amount', label: 'Amount (USD)', type: 'money', value: e.amount, required: true, autofocus: !e.id },
      { name: 'kind', label: 'Category', type: 'select', value: e.kind || 'food', options: EXPENSE_KINDS.map((k) => ({ value: k.id, label: k.label })) },
      { name: 'note', label: 'Description', value: e.note, placeholder: 'e.g. Lunch in Oia' },
      { name: 'date', label: 'Date', type: 'date', value: e.date || isoLocal() },
    ],
    onSubmit: (v) => { upsert('tripExpenses', { ...e, ...v }); toast(e.id ? 'Updated' : 'Added'); },
    onDelete: e.id ? () => remove('tripExpenses', e.id) : null,
  });
}

function itemRow(i, { showDate = true } = {}) {
  const cost = Math.max(i.estCost || 0, i.paid || 0);
  const miss = needsInfo(i);
  const meta = [
    showDate && i.date ? shortDate(i.date) : '',
    i.time ? time12(i.time) : '',
    i.endDate ? `to ${shortDate(i.endDate)}` : '',
    i.location ? esc(i.location) : '',
  ].filter(Boolean).join(' · ');
  return `
    <li class="item tap" data-item="${i.id}">
      <div class="lead-ic">${typeIcon(i.type)}</div>
      <div class="grow">
        <div>${esc(i.title)}</div>
        <div class="muted small">${meta || (TRIP_TYPES[i.type] || TRIP_TYPES.other).label}${i.confirmation ? ` · #${esc(i.confirmation)}` : ''}</div>
        ${miss.length ? `<div class="flag">${icon('alert', 12)}Needs ${miss.join(', ')}</div>` : ''}
        ${i.attachments?.length ? `<a class="attach" href="${esc(i.attachments[0].link)}" target="_blank" rel="noopener" data-stop>${icon('paperclip', 12)}Screenshot</a>` : ''}
      </div>
      <div class="right">${statusPill(i.status)}<div class="small num">${cost ? money(cost) : ''}${i.paid ? `<div class="muted small">${money(i.paid)} paid</div>` : ''}</div></div>
    </li>`;
}

function bindItems(root) {
  const s = getState();
  root.querySelectorAll('[data-stop]').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
  root.querySelectorAll('[data-item]').forEach((el) => (el.onclick = () => editTripItem(s.tripItems.find((i) => i.id === el.dataset.item))));
}

// ---- Quick expense entry (the in-trip "add food" flow) ---------------------------

function quickAdd() {
  return `
    <section class="panel quick">
      <header class="panel-head"><h2>Quick expense</h2><span class="meta">Type the amount, tap the category</span></header>
      <div class="panel-body">
        <div class="money-input big-input"><span>$</span><input id="qa-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" aria-label="Amount"></div>
        <input id="qa-note" type="text" placeholder="Description (optional)" aria-label="Description">
        <div class="kind-grid">${EXPENSE_KINDS.map((k) => `<button class="kind" data-kind="${k.id}">${icon(k.icon, 18)}${k.label}</button>`).join('')}</div>
      </div>
    </section>`;
}

function bindQuickAdd(root) {
  root.querySelectorAll('[data-kind]').forEach((b) => {
    b.onclick = () => {
      const amt = Number(root.querySelector('#qa-amount').value);
      if (!(amt > 0)) { root.querySelector('#qa-amount').focus(); toast('Enter an amount first'); return; }
      const kind = EXPENSE_KINDS.find((k) => k.id === b.dataset.kind);
      upsert('tripExpenses', { date: isoLocal(), amount: amt, kind: kind.id, note: root.querySelector('#qa-note').value.trim() });
      toast(`Added ${money(amt, true)} · ${kind.label}`);
    };
  });
}

// ---- Overview ------------------------------------------------------------------

export function overview(root) {
  const s = getState();
  const t = tripSummary(s);
  const byDate = (a, b) => (a.date || '9').localeCompare(b.date || '9');
  const toBook = [...t.toBook].sort(byDate);
  const missing = [...t.needsInfo].filter((i) => i.status === 'booked').sort(byDate);
  const typeRows = Object.entries(t.byType).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const counts = { booked: t.booked.length, toBook: toBook.length };

  root.innerHTML = `
    ${subnav('')}
    ${tripHeader(s)}

    <section class="stats">
      <div class="stat"><div class="stat-label">Paid to date</div><div class="stat-value">${money(t.spentToDate)}</div><div class="stat-meta">Bookings ${money(t.paidBookings)} · On trip ${money(t.onTrip)}</div></div>
      <div class="stat"><div class="stat-label">Estimated total</div><div class="stat-value">${money(t.estimatedTotal)}</div><div class="stat-meta">${counts.booked} booked · ${counts.toBook} to book</div></div>
      <div class="stat"><div class="stat-label">Budget</div><div class="stat-value">${t.budget ? money(t.budget) : '—'}</div><div class="stat-meta">${t.budget ? '' : '<a href="#/honeymoon/settings">Set a budget</a>'}</div></div>
      <div class="stat"><div class="stat-label">${t.remainingBudget >= 0 ? 'Remaining' : 'Over budget'}</div><div class="stat-value ${t.remainingBudget < 0 ? 'neg' : 'pos'}">${t.budget ? money(Math.abs(t.remainingBudget)) : '—'}</div><div class="stat-meta">Balance owed ${money(t.balanceOwed)}</div></div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <header class="panel-head"><h2>Add to the trip</h2></header>
        <div class="panel-body">
          ${scanButton(`${icon('camera', 16)}Scan a ticket or confirmation screenshot`)}
          <p class="muted small" style="margin:8px 0 0">Reads the dates, times, cities, cost and confirmation number, adds it to the itinerary and the budget. You check it before it saves.</p>
          <button class="btn block" data-act="add-item">${icon('plus', 16)}Add booking manually</button>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Cost breakdown</h2><span class="meta">Estimated</span></header>
        <table class="tbl">
          <tbody>
            ${typeRows.map(([k, v]) => `<tr><td><span class="name">${typeIcon(k)}${TRIP_TYPES[k].label}</span></td><td class="num">${money(v)}</td></tr>`).join('')}
            <tr><td><span class="name">${icon('wallet', 16)}On-trip spending</span></td><td class="num">${money(t.onTrip)}</td></tr>
          </tbody>
          <tfoot><tr><td>Total</td><td class="num">${money(t.estimatedTotal)}</td></tr></tfoot>
        </table>
        ${t.budget ? `<div class="panel-foot">${bar(t.estimatedTotal, t.budget)}<div class="row-line small"><span class="muted">Paid ${money(t.spentToDate)}</span><span class="muted">Budget ${money(t.budget)}</span></div></div>` : ''}
      </section>
    </div>

    <section class="panel">
      <header class="panel-head"><h2>Still to book</h2><span class="meta">${toBook.length} items</span></header>
      ${toBook.length ? `<ul class="list">${toBook.map((i) => itemRow(i)).join('')}</ul>` : empty('Everything is booked.')}
    </section>

    ${missing.length ? `<section class="panel">
      <header class="panel-head"><h2>Booked, missing details</h2><span class="meta">${missing.length} items</span></header>
      <ul class="list">${missing.map((i) => itemRow(i)).join('')}</ul>
    </section>` : ''}

    ${quickAdd()}
  `;
  bindItems(root);
  bindQuickAdd(root);
  bindScan(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem();
}

// ---- Itinerary -----------------------------------------------------------------

export function itineraryView(root) {
  const s = getState();
  const it = itinerary(s);
  // Where you sleep each night (from stays), shown as a heading per leg.
  const stayOn = (d) => s.tripItems.find((i) => i.type === 'lodging' && i.date && i.date <= d && (i.endDate ? d < i.endDate : d === i.date));
  let lastStay = null;

  root.innerHTML = `
    ${subnav('/itinerary')}
    ${tripHeader(s)}
    <div class="toolbar"><span class="muted small">${it.days.length} days</span>${scanButton(`${icon('camera', 14)}Scan ticket`).replace('btn block scan-btn', 'btn sm scan-btn')}</div>
    <section class="panel">
      ${it.days.length ? it.days.map((d) => {
        const stay = stayOn(d.date);
        const legHead = stay && stay.id !== lastStay?.id ? `<div class="leg">${esc(stay.location || stay.title)}</div>` : '';
        lastStay = stay || lastStay;
        const dt = new Date(d.date + 'T00:00:00');
        return `${legHead}<div class="day">
          <div class="day-date"><div class="dow">${dt.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="dnum">${dt.getDate()}</div><div class="dn">${dt.toLocaleDateString('en-US', { month: 'short' })} · Day ${d.dayNumber}</div></div>
          <div>${d.items.length ? `<ul class="list">${d.items.map((i) => itemRow(i, { showDate: false })).join('')}</ul>` : '<div class="free">Open day</div>'}</div>
        </div>`;
      }).join('') : empty('Set your trip dates to build the day-by-day schedule.', '<a class="btn" href="#/honeymoon/settings">Set dates</a>')}
    </section>
    ${it.unscheduled.length ? `
      <section class="panel"><header class="panel-head"><h2>Outside trip dates</h2></header><ul class="list">${it.unscheduled.map((i) => itemRow(i)).join('')}</ul></section>` : ''}
    <button class="fab" data-act="add-item">${icon('plus', 18)}<span>Add</span></button>
  `;
  bindItems(root);
  bindScan(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem();
}

// ---- Bookings ------------------------------------------------------------------

export function bookings(root, ctx) {
  const s = getState();
  const st = ctx.bookingStatus || 'all';
  const ty = ctx.bookingType || 'all';
  const matchStatus = (i) => st === 'all' || (st === 'needs' ? needsInfo(i).length > 0 : st === 'to-book' ? i.status === 'to-book' || i.status === 'idea' : i.status === st);
  const list = s.tripItems
    .filter((i) => matchStatus(i) && (ty === 'all' || i.type === ty))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const count = (f) => s.tripItems.filter(f).length;
  const total = list.reduce((a, i) => a + Math.max(i.estCost || 0, i.paid || 0), 0);
  const paid = list.reduce((a, i) => a + (i.paid || 0), 0);

  root.innerHTML = `
    ${subnav('/bookings')}
    <div class="toolbar">
      <div class="segmented">
        ${[['all', `All ${s.tripItems.length}`], ['to-book', `To book ${count((i) => i.status === 'to-book' || i.status === 'idea')}`], ['booked', `Booked ${count((i) => i.status === 'booked')}`], ['planned', `Plans ${count((i) => i.status === 'planned')}`], ['needs', `Needs info ${count((i) => needsInfo(i).length)}`]]
          .map(([k, l]) => `<button data-status="${k}" class="${st === k ? 'active' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="chips">
      ${[['all', 'All types'], ...Object.entries(TRIP_TYPES).map(([k, t]) => [k, t.label])]
        .map(([k, l]) => `<button class="chip ${ty === k ? 'active' : ''}" data-type="${k}">${k !== 'all' ? typeIcon(k) : ''}${l}</button>`).join('')}
    </div>
    <section class="panel">
      <header class="panel-head"><h2>${list.length} items</h2><span class="meta num">${money(total)} est. · ${money(paid)} paid</span></header>
      ${list.length ? `<ul class="list">${list.map((i) => itemRow(i)).join('')}</ul>` : empty('Nothing here yet.')}
      <div class="panel-foot">${scanButton(`${icon('camera', 16)}Scan a ticket or confirmation`)}</div>
    </section>
    <button class="fab" data-act="add-item">${icon('plus', 18)}<span>Add</span></button>
  `;
  root.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => { ctx.bookingStatus = b.dataset.status; bookings(root, ctx); }));
  root.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { ctx.bookingType = b.dataset.type; bookings(root, ctx); }));
  bindItems(root);
  bindScan(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem({ type: ty !== 'all' ? ty : undefined, status: ['to-book', 'booked', 'planned'].includes(st) ? st : undefined });
}

// ---- On-trip expenses ------------------------------------------------------------

export function expenses(root) {
  const s = getState();
  const t = tripSummary(s);
  const list = [...s.tripExpenses].sort((a, b) => b.date.localeCompare(a.date));
  const days = new Set(list.map((e) => e.date)).size;
  const kinds = EXPENSE_KINDS.filter((k) => t.onTripByKind[k.id] > 0);

  root.innerHTML = `
    ${subnav('/expenses')}
    ${quickAdd()}
    <section class="stats three">
      <div class="stat"><div class="stat-label">On-trip total</div><div class="stat-value">${money(t.onTrip, true)}</div></div>
      <div class="stat"><div class="stat-label">Per day</div><div class="stat-value">${money(days ? t.onTrip / days : 0)}</div></div>
      <div class="stat"><div class="stat-label">Trip paid to date</div><div class="stat-value">${money(t.spentToDate)}</div></div>
    </section>
    <div class="grid-2">
      <section class="panel">
        <header class="panel-head"><h2>By category</h2></header>
        ${kinds.length ? `<table class="tbl"><tbody>${kinds.map((k) => `<tr><td><span class="name">${icon(k.icon, 16)}${k.label}</span></td><td class="num">${money(t.onTripByKind[k.id], true)}</td></tr>`).join('')}</tbody></table>` : empty('No trip expenses yet.')}
      </section>
      <section class="panel">
        <header class="panel-head"><h2>Expense log</h2><span class="meta">${list.length} entries</span></header>
        ${list.length ? `<table class="tbl">
          <thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody>${list.map((e) => {
            const k = EXPENSE_KINDS.find((x) => x.id === e.kind) || EXPENSE_KINDS.at(-1);
            return `<tr class="tap" data-exp="${e.id}"><td>${shortDate(e.date)}</td><td><div class="ellip">${esc(e.note || k.label)}</div><div class="sub">${k.label}</div></td><td class="num">${money(e.amount, true)}</td></tr>`;
          }).join('')}</tbody></table>` : empty('Use quick expense above while you travel.')}
      </section>
    </div>
  `;
  bindQuickAdd(root);
  root.querySelectorAll('[data-exp]').forEach((el) => (el.onclick = () => editExpense(s.tripExpenses.find((e) => e.id === el.dataset.exp))));
}

// ---- Trip details ----------------------------------------------------------------

export function tripSettings(root) {
  const s = getState();
  const t = s.trip;
  const fmt = (d) => (d ? shortDate(d, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : '—');
  root.innerHTML = `
    ${subnav('/settings')}
    <section class="panel">
      <header class="panel-head"><h2>Trip details</h2><button class="btn sm" data-act="edit">Edit</button></header>
      <div class="panel-body">
        <dl class="details">
          <dt>Name</dt><dd>${esc(t.name)}</dd>
          <dt>Destination</dt><dd>${esc(t.destination) || '—'}</dd>
          <dt>Departs</dt><dd>${fmt(t.startDate)}</dd>
          <dt>Returns</dt><dd>${fmt(t.endDate)}</dd>
          <dt>Total budget</dt><dd class="num" style="text-align:left">${t.budget ? money(t.budget) : 'Not set'}</dd>
          <dt>Travelers</dt><dd>${t.travelers || 2}</dd>
        </dl>
      </div>
    </section>`;
  root.querySelector('[data-act="edit"]').onclick = () =>
    openForm({
      title: 'Trip details',
      fields: [
        { name: 'name', label: 'Trip name', value: t.name, required: true },
        { name: 'destination', label: 'Destination', value: t.destination },
        { name: 'startDate', label: 'Start date', type: 'date', value: t.startDate },
        { name: 'endDate', label: 'End date', type: 'date', value: t.endDate },
        { name: 'budget', label: 'Total budget (USD)', type: 'money', value: t.budget },
        { name: 'travelers', label: 'Travelers', type: 'number', value: t.travelers || 2 },
      ],
      onSubmit: (v) => {
        if (v.startDate && v.endDate && v.endDate < v.startDate) [v.startDate, v.endDate] = [v.endDate, v.startDate];
        updateTrip(v);
        toast('Trip updated');
      },
    });
}
