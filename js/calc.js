// Pure selectors: state in, numbers out. No DOM, no saving.
// Every number on screen comes from here, so future charts, reports and
// suggestions can reuse the same functions.

// Local calendar date as YYYY-MM-DD (not UTC, so evenings don't jump a day).
export const isoLocal = (t = new Date()) =>
  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

export const monthKey = (date = new Date()) =>
  (typeof date === 'string' ? date : isoLocal(date)).slice(0, 7);

export const inMonth = (isoDate, mk) => !!isoDate && isoDate.slice(0, 7) === mk;

const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);

// ---- Household -------------------------------------------------------------

export const CADENCE_TO_MONTHLY = { monthly: 1, semimonthly: 2, biweekly: 26 / 12, weekly: 52 / 12, yearly: 1 / 12 };
export const CHECKS_PER_MONTH = { semimonthly: 2, biweekly: 26 / 12, weekly: 52 / 12 };

export const monthlyIncome = (s) =>
  sum(s.income, (i) => i.amount * (CADENCE_TO_MONTHLY[i.cadence] ?? 1));

export const monthlyGross = (s) =>
  sum(s.income, (i) => (i.gross || i.amount) * (CADENCE_TO_MONTHLY[i.cadence] ?? 1));

export const billsTotal = (s) => sum(s.bills, (b) => b.amount);

// Paycheck plan (like "bills per check"): bills due 1st–15th come out of the
// first check, 16th–end out of the second. Only for twice-a-month or biweekly pay.
export function paycheckPlan(s) {
  const paid = s.income.filter((i) => CHECKS_PER_MONTH[i.cadence]);
  if (!paid.length) return null;
  const perCheck = sum(paid, (i) => i.amount * CHECKS_PER_MONTH[i.cadence]) / 2;
  const first = s.bills.filter((b) => b.dueDay <= 15);
  const second = s.bills.filter((b) => b.dueDay > 15);
  const mk = (label, bills) => {
    const total = sum(bills, (b) => b.amount);
    return { label, income: perCheck, bills: total, left: perCheck - total, items: bills };
  };
  return [mk('1st check (bills due 1st–15th)', first), mk('2nd check (bills due 16th–end)', second)];
}

export const billsPaid = (s, mk) => s.bills.filter((b) => b.paid?.[mk]);

// Honeymoon money that left the bank in a given month:
// deposits/payments on bookings (by paidDate) + on-trip expenses (by date).
export function honeymoonSpendInMonth(s, mk) {
  const bookings = sum(s.tripItems.filter((i) => inMonth(i.paidDate, mk)), (i) => i.paid);
  const onTrip = sum(s.tripExpenses.filter((e) => inMonth(e.date, mk)), (e) => e.amount);
  return bookings + onTrip;
}

// Actual spending per category for a month.
// Bills count toward their category once marked paid; honeymoon rolls up into "honeymoon".
export function spendByCategory(s, mk) {
  const out = Object.fromEntries(s.categories.map((c) => [c.id, 0]));
  for (const t of s.transactions) if (inMonth(t.date, mk)) out[t.categoryId] = (out[t.categoryId] || 0) + Number(t.amount);
  for (const b of billsPaid(s, mk)) out[b.categoryId] = (out[b.categoryId] || 0) + Number(b.amount);
  out.honeymoon = (out.honeymoon || 0) + honeymoonSpendInMonth(s, mk);
  return out;
}

export function monthSummary(s, mk) {
  const income = monthlyIncome(s);
  const byCat = spendByCategory(s, mk);
  const spent = sum(Object.values(byCat));
  const billsDue = billsTotal(s);
  const paidBills = sum(billsPaid(s, mk), (b) => b.amount);
  const unpaidBills = billsDue - paidBills;
  const budgeted = sum(s.categories, (c) => c.budget);
  const kindOf = Object.fromEntries(s.categories.map((c) => [c.id, c.kind || 'flexible']));
  const fixedSpent = sum(Object.entries(byCat).filter(([id]) => kindOf[id] === 'fixed'), ([, v]) => v);
  return {
    gross: monthlyGross(s),
    afterFixed: income - billsDue,
    fixedSpent,
    flexibleSpent: spent - fixedSpent,
    share: Object.fromEntries(Object.entries(byCat).map(([id, v]) => [id, spent ? v / spent : 0])),
    income,
    spent,
    billsDue,
    paidBills,
    unpaidBills,
    budgeted,
    byCat,
    // What is left after everything spent so far and the bills still to come.
    leftToSpend: income - spent - unpaidBills,
    savingsRate: income ? (byCat.savings || 0) / income : 0,
  };
}

export function groupTotals(s, mk) {
  const byCat = spendByCategory(s, mk);
  const g = { needs: 0, wants: 0, savings: 0, debt: 0 };
  for (const c of s.categories) g[c.group] = (g[c.group] || 0) + (byCat[c.id] || 0);
  return g;
}

export function upcomingBills(s, mk, today = new Date()) {
  const isThisMonth = mk === monthKey(today);
  const day = today.getDate();
  return s.bills
    .filter((b) => !b.paid?.[mk])
    .map((b) => ({ ...b, overdue: isThisMonth && b.dueDay < day }))
    .sort((a, b) => a.dueDay - b.dueDay);
}

// Map an imported category / description to one of ours (spreadsheet or bank CSV).
export function matchCategory(s, text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  const direct = s.categories.find((c) => c.id === t || c.name.toLowerCase() === t);
  if (direct) return direct.id;
  for (const c of s.categories) for (const m of c.match || []) if (t.includes(m)) return c.id;
  return null;
}

// ---- Honeymoon -------------------------------------------------------------

export const TRIP_TYPES = {
  flight: { label: 'Flight', icon: '✈️' },
  lodging: { label: 'Stay', icon: '🏨' },
  tour: { label: 'Tour', icon: '🧭' },
  ticket: { label: 'Ticket', icon: '🎟️' },
  dining: { label: 'Dining', icon: '🍽️' },
  transport: { label: 'Transport', icon: '🚕' },
  other: { label: 'Other', icon: '📌' },
};

export const TRIP_STATUS = {
  idea: { label: 'Idea' },
  'to-book': { label: 'To book' },
  booked: { label: 'Booked' },
};

export const EXPENSE_KINDS = [
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'drinks', label: 'Drinks', icon: '🍹' },
  { id: 'activity', label: 'Activity', icon: '🏝️' },
  { id: 'transport', label: 'Transport', icon: '🚕' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'tips', label: 'Tips', icon: '💵' },
  { id: 'other', label: 'Other', icon: '📌' },
];

export function tripSummary(s) {
  const items = s.tripItems;
  const onTrip = sum(s.tripExpenses, (e) => e.amount);
  const paidBookings = sum(items, (i) => i.paid);
  const plannedBookings = sum(items, (i) => Math.max(i.estCost || 0, i.paid || 0));
  const committed = sum(items.filter((i) => i.status === 'booked'), (i) => Math.max(i.estCost || 0, i.paid || 0));
  const spentToDate = paidBookings + onTrip;
  const estimatedTotal = plannedBookings + onTrip;
  const balanceOwed = sum(items.filter((i) => i.status === 'booked'), (i) => Math.max(0, (i.estCost || 0) - (i.paid || 0)));
  const budget = Number(s.trip.budget) || 0;
  return {
    budget,
    spentToDate,
    paidBookings,
    onTrip,
    estimatedTotal,
    committed,
    balanceOwed,
    remainingBudget: budget - estimatedTotal,
    toBook: items.filter((i) => i.status !== 'booked'),
    booked: items.filter((i) => i.status === 'booked'),
    byType: Object.fromEntries(
      Object.keys(TRIP_TYPES).map((t) => [t, sum(items.filter((i) => i.type === t), (i) => Math.max(i.estCost || 0, i.paid || 0))]),
    ),
    onTripByKind: Object.fromEntries(EXPENSE_KINDS.map((k) => [k.id, sum(s.tripExpenses.filter((e) => e.kind === k.id), (e) => e.amount)])),
  };
}

export function daysUntil(isoDate, today = new Date()) {
  if (!isoDate) return null;
  const a = new Date(isoDate + 'T00:00:00');
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
}

export function tripDays(s) {
  const { startDate, endDate } = s.trip;
  if (!startDate || !endDate) return [];
  const days = [];
  for (let t = new Date(startDate + 'T00:00:00'); t <= new Date(endDate + 'T00:00:00'); t.setDate(t.getDate() + 1)) {
    days.push(isoLocal(t));
  }
  return days;
}

// Itinerary: each day of the trip with the items happening that day.
// Multi-night stays show on their check-in day; undated items are listed separately.
export function itinerary(s) {
  const days = tripDays(s);
  const sortKey = (i) => `${i.date || ''} ${i.time || '99:99'}`;
  const items = [...s.tripItems].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const map = Object.fromEntries(days.map((d) => [d, []]));
  const outside = [];
  for (const i of items) (map[i.date] ? map[i.date] : outside).push(i);
  return { days: days.map((d, n) => ({ date: d, dayNumber: n + 1, items: map[d] })), unscheduled: outside };
}
