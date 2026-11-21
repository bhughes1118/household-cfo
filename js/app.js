// App shell: a tiny hash router, the shared month picker state, and the
// service worker registration. Each screen lives in js/views/.

import { subscribe } from './store.js';
import { initSync, onStatus, getStatus } from './sync.js';
import { monthKey } from './calc.js';
import * as household from './views/household.js';
import * as honeymoon from './views/honeymoon.js';
import * as more from './views/more.js';

// Shared UI context (not saved): which month the household screens show.
export const ctx = { month: monthKey() };

// path -> { view, tab, title }
const routes = {
  '/': { view: household.dashboard, tab: 'home', title: 'Household CFO' },
  '/bills': { view: household.bills, tab: 'bills', title: 'Bills' },
  '/spending': { view: household.spending, tab: 'spending', title: 'Spending' },
  '/income': { view: household.income, tab: 'more', title: 'Income' },
  '/budgets': { view: household.budgets, tab: 'more', title: 'Budget categories' },
  '/honeymoon': { view: honeymoon.overview, tab: 'honeymoon', title: 'Honeymoon Portal' },
  '/honeymoon/itinerary': { view: honeymoon.itineraryView, tab: 'honeymoon', title: 'Itinerary' },
  '/honeymoon/bookings': { view: honeymoon.bookings, tab: 'honeymoon', title: 'Bookings' },
  '/honeymoon/expenses': { view: honeymoon.expenses, tab: 'honeymoon', title: 'Trip expenses' },
  '/honeymoon/settings': { view: honeymoon.tripSettings, tab: 'honeymoon', title: 'Trip details' },
  '/more': { view: more.menu, tab: 'more', title: 'More' },
  '/data': { view: more.data, tab: 'more', title: 'Backup & data' },
  '/sync': { view: more.sync, tab: 'more', title: 'Cloud sync' },
};

const root = document.getElementById('view');
let lastPath = null;

function currentPath() {
  const p = location.hash.replace(/^#/, '').split('?')[0] || '/';
  return routes[p] ? p : '/';
}

export function render() {
  const path = currentPath();
  const route = routes[path];
  document.getElementById('topbar-title').textContent = route.title;
  document.title = path === '/' ? 'Household CFO' : `${route.title} · Household CFO`;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === route.tab));
  renderSyncBadge();
  const scroll = path === lastPath ? window.scrollY : 0;
  route.view(root, ctx);
  window.scrollTo(0, scroll);
  if (path !== lastPath) root.focus({ preventScroll: true });
  lastPath = path;
}

// Small cloud icon in the top bar showing sync state; tap for details.
const BADGE = {
  off: ['☁︎', 'Cloud sync is off', 'off'],
  syncing: ['⟳', 'Syncing…', 'busy'],
  synced: ['☁︎', 'Synced with Google Drive', 'ok'],
  offline: ['☁︎', 'Offline, will sync later', 'warn'],
  'needs-auth': ['☁︎', 'Sign in to Google again', 'warn'],
  error: ['☁︎', 'Sync problem', 'warn'],
};
function renderSyncBadge() {
  const st = getStatus();
  const [icon, label, tone] = BADGE[st.state] || BADGE.off;
  document.getElementById('topbar-actions').innerHTML =
    `<a href="#/sync" class="sync-badge ${tone}" aria-label="${label}" title="${label}">${icon}${tone === 'warn' || tone === 'off' ? '<i></i>' : ''}</a>`;
}

// Sync must read any Google sign-in result from the URL before the router does.
initSync();
window.addEventListener('hashchange', render);
subscribe(render);
onStatus(() => { renderSyncBadge(); if (currentPath() === '/sync') render(); });
render();

// Offline support + home screen install
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
