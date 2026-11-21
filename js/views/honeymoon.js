// Honeymoon Portal: overview, itinerary, bookings, on-trip expenses, trip details.
// All money here also rolls up into the household "Honeymoon" category (see calc.js).

import { getState, upsert, remove, updateTrip } from '../store.js';
import { tripSummary, itinerary, daysUntil, isoLocal, TRIP_TYPES, TRIP_STATUS, EXPENSE_KINDS } from '../calc.js';
import { esc, money, bar, shortDate, time12, openForm, toast, empty } from '../ui.js';

function subnav(active) {
  const tabs = [
    ['', 'Overview'],
    ['/itinerary', 'Itinerary'],
    ['/bookings', 'Bookings'],
    ['/expenses', 'Expenses'],
  ];
  return `<nav class="subnav">${tabs.map(([p, l]) => `<a href="#/honeymoon${p}" class="${active === p ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
}

function tripHeader(s) {
  const t = s.trip;
  const n = daysUntil(t.startDate);
  const when = t.startDate ? `${shortDate(t.startDate)} – ${shortDate(t.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Dates not set';
  const count = n == null ? '' : n > 0 ? `${n} days to go` : n === 0 ? 'Starts today!' : daysUntil(t.endDate) >= 0 ? 'On the trip now' : 'Trip complete';
  return `
    <a class="trip-hero" href="#/honeymoon/settings">
      <div class="small upper">${esc(t.destination || 'Add a destination')}</div>
      <h2>${esc(t.name)}</h2>
      <div class="row-line"><span>${when}</span><span class="pill light">${count}</span></div>
    </a>`;
}

const statusPill = (st) => `<span class="pill ${st}">${TRIP_STATUS[st]?.label || st}</span>`;

// ---- Forms ---------------------------------------------------------------------

export function editTripItem(item = {}) {
  const s = getState();
  openForm({
    title: item.id ? 'Edit booking' : 'Add booking or plan',
    fields: [
      { name: 'type', label: 'Type', type: 'select', value: item.type || 'tour', options: Object.entries(TRIP_TYPES).map(([v, t]) => ({ value: v, label: `${t.icon} ${t.label}` })) },
      { name: 'title', label: 'What', value: item.title, required: true, autofocus: !item.id, placeholder: 'e.g. Sunset catamaran' },
      { name: 'status', label: 'Status', type: 'select', value: item.status || 'to-book', options: Object.entries(TRIP_STATUS).map(([v, t]) => ({ value: v, label: t.label })) },
      { name: 'date', label: 'Date', type: 'date', value: item.date || s.trip.startDate },
      { name: 'time', label: 'Time', type: 'time', value: item.time },
      { name: 'endDate', label: 'End / check-out date (optional)', type: 'date', value: item.endDate },
      { name: 'location', label: 'Location', value: item.location },
      { name: 'estCost', label: 'Estimated total cost', type: 'money', value: item.estCost },
      { name: 'paid', label: 'Paid so far', type: 'money', value: item.paid },
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
    title: e.id ? 'Edit expense' : 'Add trip expense',
    fields: [
      { name: 'amount', label: 'Amount', type: 'money', value: e.amount, required: true, autofocus: !e.id },
      { name: 'kind', label: 'Type', type: 'select', value: e.kind || 'food', options: EXPENSE_KINDS.map((k) => ({ value: k.id, label: `${k.icon} ${k.label}` })) },
      { name: 'note', label: 'Note', value: e.note, placeholder: 'e.g. Beach lunch' },
      { name: 'date', label: 'Date', type: 'date', value: e.date || isoLocal() },
    ],
    onSubmit: (v) => { upsert('tripExpenses', { ...e, ...v }); toast(e.id ? 'Updated' : 'Added'); },
    onDelete: e.id ? () => remove('tripExpenses', e.id) : null,
  });
}

function itemRow(i, { showDate = true } = {}) {
  const t = TRIP_TYPES[i.type] || TRIP_TYPES.other;
  const cost = Math.max(i.estCost || 0, i.paid || 0);
  const meta = [
    showDate && i.date ? shortDate(i.date) : '',
    i.time ? time12(i.time) : '',
    i.endDate ? `to ${shortDate(i.endDate)}` : '',
    i.confirmation ? `Conf ${esc(i.confirmation)}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <li class="item tap" data-item="${i.id}">
      <div class="lead">${t.icon}</div>
      <div class="grow"><div>${esc(i.title)}</div><div class="muted small">${meta || t.label}</div></div>
      <div class="right">${statusPill(i.status)}<div class="small">${cost ? money(cost) : ''}${i.paid ? ` <span class="muted">(${money(i.paid)} paid)</span>` : ''}</div></div>
    </li>`;
}

function bindItems(root) {
  const s = getState();
  root.querySelectorAll('[data-item]').forEach((el) => (el.onclick = () => editTripItem(s.tripItems.find((i) => i.id === el.dataset.item))));
}

// ---- Quick expense entry (the in-trip "add food" flow) ---------------------------

function quickAdd() {
  return `
    <section class="card quick">
      <h3>Quick add a trip expense</h3>
      <div class="money-input big-input"><span>$</span><input id="qa-amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" aria-label="Amount"></div>
      <input id="qa-note" type="text" placeholder="Note (optional)" aria-label="Note">
      <div class="kind-grid">${EXPENSE_KINDS.map((k) => `<button class="kind" data-kind="${k.id}"><span>${k.icon}</span>${k.label}</button>`).join('')}</div>
      <p class="muted small">Type the amount, then tap what it was for.</p>
    </section>`;
}

function bindQuickAdd(root) {
  root.querySelectorAll('[data-kind]').forEach((b) => {
    b.onclick = () => {
      const amt = Number(root.querySelector('#qa-amount').value);
      if (!(amt > 0)) { root.querySelector('#qa-amount').focus(); toast('Enter an amount first'); return; }
      const kind = EXPENSE_KINDS.find((k) => k.id === b.dataset.kind);
      upsert('tripExpenses', { date: isoLocal(), amount: amt, kind: kind.id, note: root.querySelector('#qa-note').value.trim() });
      toast(`Added ${money(amt, true)} ${kind.label.toLowerCase()}`);
    };
  });
}

// ---- Overview ------------------------------------------------------------------

export function overview(root) {
  const s = getState();
  const t = tripSummary(s);
  const next = s.tripItems
    .filter((i) => i.status !== 'booked')
    .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const typeRows = Object.entries(t.byType).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  root.innerHTML = `
    ${subnav('')}
    ${tripHeader(s)}

    <section class="kpis">
      <div class="kpi"><span>Paid to date</span><strong>${money(t.spentToDate)}</strong></div>
      <div class="kpi"><span>Estimated total</span><strong>${money(t.estimatedTotal)}</strong></div>
      <div class="kpi"><span>Budget</span><strong>${money(t.budget)}</strong></div>
      <div class="kpi"><span>${t.remainingBudget >= 0 ? 'Room left' : 'Over budget'}</span><strong class="${t.remainingBudget < 0 ? 'neg' : 'pos'}">${money(Math.abs(t.remainingBudget))}</strong></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Where the money goes</h3></div>
      <div class="row-line small"><span>Paid ${money(t.spentToDate)}</span><span class="muted">Estimated ${money(t.estimatedTotal)} · Budget ${money(t.budget)}</span></div>
      ${bar(t.estimatedTotal, t.budget)}
      <ul class="list compact">
        ${typeRows.map(([k, v]) => `<li class="row-line"><span>${TRIP_TYPES[k].icon} ${TRIP_TYPES[k].label}</span><span>${money(v)}</span></li>`).join('')}
        <li class="row-line"><span>🧾 On-trip spending</span><span>${money(t.onTrip)}</span></li>
        ${t.balanceOwed ? `<li class="row-line"><span class="muted">Balance still owed on bookings</span><span>${money(t.balanceOwed)}</span></li>` : ''}
      </ul>
    </section>

    ${quickAdd()}

    <section class="card">
      <div class="card-head"><h3>Still to book (${next.length})</h3><a href="#/honeymoon/bookings" class="small">All bookings ›</a></div>
      ${next.length ? `<ul class="list">${next.slice(0, 6).map((i) => itemRow(i)).join('')}</ul>` : empty('Everything is booked!')}
      <button class="btn block" data-act="add-item">＋ Add booking or plan</button>
    </section>
  `;
  bindItems(root);
  bindQuickAdd(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem();
}

// ---- Itinerary -----------------------------------------------------------------

export function itineraryView(root) {
  const s = getState();
  const it = itinerary(s);
  root.innerHTML = `
    ${subnav('/itinerary')}
    ${tripHeader(s)}
    ${it.days.length ? it.days.map((d) => `
      <h4 class="day-head">Day ${d.dayNumber} · ${shortDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
      <section class="card flush">
        ${d.items.length ? `<ul class="list timeline">${d.items.map((i) => itemRow(i, { showDate: false })).join('')}</ul>` : '<p class="muted small pad">Free day. Nothing planned yet.</p>'}
      </section>`).join('') : empty('Set your trip dates to build the day-by-day schedule.', '<a class="btn" href="#/honeymoon/settings">Set dates</a>')}
    ${it.unscheduled.length ? `
      <h4 class="day-head">Not on a trip day</h4>
      <section class="card flush"><ul class="list">${it.unscheduled.map((i) => itemRow(i)).join('')}</ul></section>` : ''}
    <button class="fab" data-act="add-item" aria-label="Add to itinerary">＋</button>
  `;
  bindItems(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem();
}

// ---- Bookings ------------------------------------------------------------------

export function bookings(root, ctx) {
  const s = getState();
  const st = ctx.bookingStatus || 'all';
  const ty = ctx.bookingType || 'all';
  const list = s.tripItems
    .filter((i) => (st === 'all' || i.status === st) && (ty === 'all' || i.type === ty))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const count = (k) => s.tripItems.filter((i) => i.status === k).length;

  root.innerHTML = `
    ${subnav('/bookings')}
    <div class="segmented">
      ${[['all', `All (${s.tripItems.length})`], ['to-book', `To book (${count('to-book')})`], ['booked', `Booked (${count('booked')})`], ['idea', `Ideas (${count('idea')})`]]
        .map(([k, l]) => `<button data-status="${k}" class="${st === k ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div class="chips">
      ${[['all', 'All types'], ...Object.entries(TRIP_TYPES).map(([k, t]) => [k, `${t.icon} ${t.label}`])]
        .map(([k, l]) => `<button class="chip ${ty === k ? 'active' : ''}" data-type="${k}">${l}</button>`).join('')}
    </div>
    <section class="card flush">
      ${list.length ? `<ul class="list">${list.map((i) => itemRow(i)).join('')}</ul>` : empty('Nothing here yet.')}
    </section>
    <button class="fab" data-act="add-item" aria-label="Add booking">＋</button>
  `;
  root.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => { ctx.bookingStatus = b.dataset.status; bookings(root, ctx); }));
  root.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { ctx.bookingType = b.dataset.type; bookings(root, ctx); }));
  bindItems(root);
  root.querySelector('[data-act="add-item"]').onclick = () => editTripItem({ type: ty !== 'all' ? ty : undefined, status: st !== 'all' ? st : undefined });
}

// ---- On-trip expenses ------------------------------------------------------------

export function expenses(root) {
  const s = getState();
  const t = tripSummary(s);
  const list = [...s.tripExpenses].sort((a, b) => b.date.localeCompare(a.date));
  const byDay = {};
  for (const e of list) (byDay[e.date] ||= []).push(e);
  const kinds = EXPENSE_KINDS.filter((k) => t.onTripByKind[k.id] > 0);

  root.innerHTML = `
    ${subnav('/expenses')}
    ${quickAdd()}
    <section class="kpis three">
      <div class="kpi"><span>On-trip total</span><strong>${money(t.onTrip, true)}</strong></div>
      <div class="kpi"><span>Per day</span><strong>${money(Object.keys(byDay).length ? t.onTrip / Object.keys(byDay).length : 0)}</strong></div>
      <div class="kpi"><span>Trip paid to date</span><strong>${money(t.spentToDate)}</strong></div>
    </section>
    ${kinds.length ? `<section class="card"><ul class="list compact">${kinds.map((k) => `<li class="row-line"><span>${k.icon} ${k.label}</span><span>${money(t.onTripByKind[k.id], true)}</span></li>`).join('')}</ul></section>` : ''}
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, items]) => `
      <h4 class="day-head">${shortDate(day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${money(items.reduce((a, e) => a + Number(e.amount), 0), true)}</h4>
      <section class="card flush"><ul class="list">${items.map((e) => {
        const k = EXPENSE_KINDS.find((x) => x.id === e.kind) || EXPENSE_KINDS.at(-1);
        return `<li class="item tap" data-exp="${e.id}"><div class="lead">${k.icon}</div><div class="grow"><div>${esc(e.note || k.label)}</div><div class="muted small">${k.label}</div></div><strong>${money(e.amount, true)}</strong></li>`;
      }).join('')}</ul></section>`).join('') : empty('No trip expenses yet. Use quick add above while you travel.')}
  `;
  bindQuickAdd(root);
  root.querySelectorAll('[data-exp]').forEach((el) => (el.onclick = () => editExpense(s.tripExpenses.find((e) => e.id === el.dataset.exp))));
}

// ---- Trip details ----------------------------------------------------------------

export function tripSettings(root) {
  const s = getState();
  const t = s.trip;
  root.innerHTML = `
    ${subnav('')}
    <section class="card">
      <h3>Trip details</h3>
      <dl class="details">
        <dt>Name</dt><dd>${esc(t.name)}</dd>
        <dt>Destination</dt><dd>${esc(t.destination) || '—'}</dd>
        <dt>Dates</dt><dd>${t.startDate ? `${shortDate(t.startDate, { month: 'long', day: 'numeric', year: 'numeric' })} to ${shortDate(t.endDate, { month: 'long', day: 'numeric', year: 'numeric' })}` : '—'}</dd>
        <dt>Total budget</dt><dd>${money(t.budget)}</dd>
        <dt>Travelers</dt><dd>${t.travelers || 2}</dd>
      </dl>
      <button class="btn block" data-act="edit">Edit trip details</button>
    </section>`;
  root.querySelector('[data-act="edit"]').onclick = () =>
    openForm({
      title: 'Trip details',
      fields: [
        { name: 'name', label: 'Trip name', value: t.name, required: true },
        { name: 'destination', label: 'Destination', value: t.destination },
        { name: 'startDate', label: 'Start date', type: 'date', value: t.startDate },
        { name: 'endDate', label: 'End date', type: 'date', value: t.endDate },
        { name: 'budget', label: 'Total budget', type: 'money', value: t.budget },
        { name: 'travelers', label: 'Travelers', type: 'number', value: t.travelers || 2 },
      ],
      onSubmit: (v) => {
        if (v.startDate && v.endDate && v.endDate < v.startDate) [v.startDate, v.endDate] = [v.endDate, v.startDate];
        updateTrip(v);
        toast('Trip updated');
      },
    });
}
