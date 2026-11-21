// Placeholder data so every screen has something to show on first open.
import { isoLocal } from './calc.js';

// It is clearly flagged (settings.isSample) and can be cleared in More > Data.

const d = (offsetDays) => {
  const t = new Date();
  t.setDate(t.getDate() + offsetDays);
  return isoLocal(t);
};

// Default budget categories. group drives Needs / Wants / Savings / Debt;
// kind 'fixed' = same every month (bills), 'flexible' = day to day.
// `match` lists words used to map imported bank/spreadsheet categories.
export const DEFAULT_CATEGORIES = [
  { id: 'housing', name: 'Housing', group: 'needs', kind: 'fixed', budget: 2600, icon: '🏠', match: ['rent', 'mortgage', 'hoa'] },
  { id: 'utilities', name: 'Utilities', group: 'needs', kind: 'fixed', budget: 450, icon: '💡', match: ['power', 'electric', 'water', 'internet', 'phone', 'utility'] },
  { id: 'insurance', name: 'Insurance', group: 'needs', kind: 'fixed', budget: 400, icon: '🛡️', match: ['insurance'] },
  { id: 'debt', name: 'Loans', group: 'debt', kind: 'fixed', budget: 0, icon: '🎓', match: ['student loan', 'loan'] },
  { id: 'cc', name: 'Credit card payment', group: 'debt', kind: 'fixed', budget: 0, icon: '💳', match: ['cc', 'credit card', 'discover', 'amex', 'visa'] },
  { id: 'groceries', name: 'Groceries', group: 'needs', kind: 'flexible', budget: 900, icon: '🛒', match: ['grocer', 'publix', 'costco', 'food'] },
  { id: 'transport', name: 'Gas & car', group: 'needs', kind: 'flexible', budget: 700, icon: '🚗', match: ['gas', 'fuel', 'car', 'auto', 'parking', 'toll'] },
  { id: 'rideshare', name: 'Uber & rideshare', group: 'wants', kind: 'flexible', budget: 60, icon: '🚕', match: ['uber', 'lyft', 'rideshare', 'taxi'] },
  { id: 'health', name: 'Health', group: 'needs', kind: 'flexible', budget: 250, icon: '🩺', match: ['health', 'doctor', 'pharmacy', 'gym', 'medical'] },
  { id: 'dining', name: 'Bars & restaurants', group: 'wants', kind: 'flexible', budget: 500, icon: '🍽️', match: ['restaurant', 'bar', 'dining', 'coffee', 'ent'] },
  { id: 'shopping', name: 'Shopping', group: 'wants', kind: 'flexible', budget: 400, icon: '🛍️', match: ['shopping', 'amazon', 'clothes'] },
  { id: 'subscriptions', name: 'Subscriptions', group: 'wants', kind: 'fixed', budget: 120, icon: '📺', match: ['subscription', 'streaming', 'netflix', 'prime', 'xbox', 'spotify'] },
  { id: 'fun', name: 'Entertainment', group: 'wants', kind: 'flexible', budget: 300, icon: '🎟️', match: ['entertainment', 'fun', 'tickets', 'movie'] },
  { id: 'cash', name: 'Cash / ATM', group: 'wants', kind: 'flexible', budget: 0, icon: '💵', match: ['atm', 'cash'] },
  { id: 'misc', name: 'Misc', group: 'wants', kind: 'flexible', budget: 100, icon: '📦', match: ['misc', 'other', 'home depot'] },
  { id: 'wedding', name: 'Wedding', group: 'wants', kind: 'flexible', budget: 1500, icon: '💍', match: ['wedding'] },
  { id: 'savings', name: 'Savings & 401k', group: 'savings', kind: 'fixed', budget: 1500, icon: '🏦', match: ['saving', '401k', 'invest', 'ira'] },
  // Honeymoon spending rolls up here automatically from the portal.
  { id: 'honeymoon', name: 'Honeymoon', group: 'wants', kind: 'flexible', budget: 0, icon: '✈️', system: true, match: ['honeymoon'] },
];

export function sampleState() {
  const state = {
    schemaVersion: 1,
    settings: {
      householdName: 'Hughes Household',
      currency: 'USD',
      isSample: true,
    },

    // Monthly take-home income sources
    income: [
      { id: 'inc1', name: 'Paycheck (Bryce)', amount: 3250, gross: 4800, cadence: 'semimonthly' },
      { id: 'inc2', name: 'Paycheck (Partner)', amount: 2100, gross: 2900, cadence: 'semimonthly' },
      { id: 'inc3', name: 'Side income', amount: 600, cadence: 'monthly' },
    ],

    // Budget categories. group drives the Needs / Wants / Savings split.
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),

    // Recurring bills. paid is tracked per month: { '2026-11': true }
    bills: [
      { id: 'b1', name: 'Mortgage / Rent', amount: 2400, dueDay: 1, categoryId: 'housing', autopay: true, paid: {} },
      { id: 'b2', name: 'Electric (TECO)', amount: 210, dueDay: 12, categoryId: 'utilities', autopay: true, paid: {} },
      { id: 'b3', name: 'Water', amount: 70, dueDay: 15, categoryId: 'utilities', autopay: false, paid: {} },
      { id: 'b4', name: 'Internet', amount: 85, dueDay: 18, categoryId: 'utilities', autopay: true, paid: {} },
      { id: 'b5', name: 'Phones', amount: 140, dueDay: 22, categoryId: 'utilities', autopay: true, paid: {} },
      { id: 'b6', name: 'Car payment', amount: 520, dueDay: 5, categoryId: 'transport', autopay: true, paid: {} },
      { id: 'b7', name: 'Auto + home insurance', amount: 380, dueDay: 25, categoryId: 'insurance', autopay: false, paid: {} },
      { id: 'b8', name: 'Streaming bundle', amount: 45, dueDay: 9, categoryId: 'subscriptions', autopay: true, paid: {} },
      { id: 'b9', name: 'Gym', amount: 60, dueDay: 3, categoryId: 'health', autopay: true, paid: {} },
    ],

    // Day-to-day spending (not bills)
    transactions: [
      { id: 't1', date: d(-1), amount: 142.18, categoryId: 'groceries', note: 'Publix' },
      { id: 't2', date: d(-2), amount: 64.5, categoryId: 'dining', note: 'Dinner out' },
      { id: 't3', date: d(-3), amount: 48.0, categoryId: 'transport', note: 'Gas' },
      { id: 't4', date: d(-5), amount: 89.99, categoryId: 'shopping', note: 'Amazon' },
      { id: 't5', date: d(-6), amount: 118.4, categoryId: 'groceries', note: 'Costco' },
      { id: 't6', date: d(-8), amount: 650.0, categoryId: 'wedding', note: 'Florist deposit' },
      { id: 't7', date: d(-9), amount: 1500.0, categoryId: 'savings', note: 'Transfer to savings' },
      { id: 't8', date: d(-11), amount: 37.25, categoryId: 'dining', note: 'Lunch' },
      { id: 't9', date: d(-12), amount: 55.0, categoryId: 'fun', note: 'Lightning game' },
      { id: 't10', date: d(-14), amount: 52.1, categoryId: 'transport', note: 'Gas' },
    ],

    // ---- Honeymoon Portal ---------------------------------------------------
    trip: {
      name: 'Our Honeymoon',
      destination: 'Destination TBD (sample data)',
      startDate: '2027-05-16',
      endDate: '2027-05-25',
      budget: 12000,
      travelers: 2,
    },

    // Every booking or plan: flights, stays, tours, tickets, dinners, transfers.
    // status: idea -> to-book -> booked. Money: estCost (planned) and paid (actual paid so far).
    tripItems: [
      { id: 'h1', type: 'flight', title: 'Outbound flight TPA → ???', date: '2027-05-16', time: '08:15', location: 'Tampa International', status: 'to-book', estCost: 1800, paid: 0, paidDate: '', confirmation: '', notes: 'Look for nonstop or 1 stop', link: '' },
      { id: 'h2', type: 'lodging', title: 'Resort, nights 1–5', date: '2027-05-16', endDate: '2027-05-21', location: '', status: 'booked', estCost: 3600, paid: 900, paidDate: d(-4), confirmation: 'SAMPLE-1234', notes: 'Deposit paid, balance due 30 days before', link: '' },
      { id: 'h3', type: 'lodging', title: 'Boutique hotel, nights 6–9', date: '2027-05-21', endDate: '2027-05-25', location: '', status: 'to-book', estCost: 2400, paid: 0, paidDate: '', confirmation: '', notes: '', link: '' },
      { id: 'h4', type: 'tour', title: 'Private boat day', date: '2027-05-18', time: '10:00', location: '', status: 'idea', estCost: 650, paid: 0, paidDate: '', confirmation: '', notes: '', link: '' },
      { id: 'h5', type: 'dining', title: 'Anniversary-style tasting dinner', date: '2027-05-19', time: '19:30', location: '', status: 'to-book', estCost: 400, paid: 0, paidDate: '', confirmation: '', notes: 'Reservations open 60 days out', link: '' },
      { id: 'h6', type: 'ticket', title: 'Museum / site tickets', date: '2027-05-22', time: '09:00', location: '', status: 'idea', estCost: 120, paid: 0, paidDate: '', confirmation: '', notes: '', link: '' },
      { id: 'h7', type: 'transport', title: 'Airport transfer', date: '2027-05-16', time: '16:00', location: '', status: 'to-book', estCost: 150, paid: 0, paidDate: '', confirmation: '', notes: '', link: '' },
      { id: 'h8', type: 'flight', title: 'Return flight ??? → TPA', date: '2027-05-25', time: '13:40', location: '', status: 'to-book', estCost: 0, paid: 0, paidDate: '', confirmation: '', notes: 'Priced with outbound as round trip', link: '' },
    ],

    // Money spent during the trip (food, drinks, tips...). Quick entry from the portal.
    tripExpenses: [],
  };

  // Bills due earlier this month start out marked paid, so the sample looks realistic.
  const now = new Date();
  const mk = isoLocal(now).slice(0, 7);
  for (const b of state.bills) if (b.dueDay < now.getDate()) b.paid[mk] = true;
  return state;
}
