// "More" tab: links to secondary screens, iPhone install help, and backup tools.

import { getState, exportJSON, importJSON, resetToSample, clearAll, addTransactions } from '../store.js';
import { parseCSV, rowsToTransactions } from '../importer.js';
import { isoLocal } from '../calc.js';
import { toast, esc } from '../ui.js';
import { getStatus, connect, disconnect, syncNow, setClientId } from '../sync.js';
import { icon } from '../icons.js';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const row = (href, ic, label, sub) => `
  <li><a href="${href}"><span class="lead-ic">${icon(ic, 16)}</span>
    <span class="grow"><div>${label}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</span>
    <span class="chev">${icon('chevronRight', 16)}</span></a></li>`;

export function menu(root) {
  root.innerHTML = `
    <div class="page-head"><div><h1>More</h1><div class="sub">Settings, income, categories and data</div></div></div>
    <section class="panel">
      <div class="panel-head"><h2>Planning</h2></div>
      <ul class="list menu">
        ${row('#/income', 'cash', 'Income', 'Paychecks and other income')}
        ${row('#/budgets', 'chart', 'Budget categories', 'Monthly limits by category')}
        ${row('#/honeymoon/settings', 'plane', 'Honeymoon trip details', 'Dates, budget, travelers')}
      </ul>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Data</h2></div>
      <ul class="list menu">
        ${row('#/sync', 'cloud', 'Cloud sync', 'Google Drive')}
        ${row('#/data', 'download', 'Backup and import', 'Download a backup, import bank CSV')}
      </ul>
    </section>

    ${isStandalone() ? '' : `
    <section class="panel">
      <div class="panel-head"><h2>Add to iPhone home screen</h2></div>
      <div class="panel-body">
        <ol class="steps">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap <strong>Share</strong> (the square with an arrow).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
        <p class="muted small">It opens full screen like an app and works without signal.</p>
      </div>
    </section>`}

    <section class="panel">
      <div class="panel-head"><h2>Roadmap</h2><span class="meta">Phase 2</span></div>
      <div class="panel-body">
        <ul class="bullets muted small">
          <li>Charts: spending trends, month over month, cash flow</li>
          <li>Reports to export or share</li>
          <li>Read-only bank connections for automatic imports</li>
          <li>Suggestions on where spending runs over budget</li>
        </ul>
      </div>
    </section>
    <p class="muted small center">Household CFO · version 1</p>`;
}

export function data(root) {
  const s = getState();
  root.innerHTML = `
    <div class="page-head"><div><h1>Backup and import</h1></div></div>
    <section class="panel">
      <div class="panel-head"><h2>Backup</h2></div>
      <div class="panel-body">
      <p class="muted small">${getStatus().connected
        ? 'Your data is shared through Google Drive, with a copy on this device so it works offline.'
        : 'Right now your data is only on this device. Turn on <a href="#/sync">Cloud sync</a> to share it between phones.'}
        You can also download a backup file any time.</p>
      <div class="btn-row">
        <button class="btn" data-act="export">${icon('download', 16)} Download backup</button>
        <label class="btn ghost">${icon('upload', 16)} Restore from backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Import transactions (CSV)</h2></div>
      <div class="panel-body">
      <p class="muted small">Download a CSV from your bank or credit card website, or save a spreadsheet as CSV with Date, Description, Category and Amount columns. Spending is added to the log and sorted into categories. Deposits and duplicates are skipped.</p>
      <label class="btn primary">${icon('upload', 16)} Choose CSV file<input type="file" accept=".csv,text/csv" data-act="csv" hidden></label>
      <p class="muted small" id="csv-result"></p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Reset</h2></div>
      <div class="panel-body">
      ${s.settings.isSample ? '<p class="muted small">The app is showing sample numbers right now. Clearing them keeps the honeymoon plan you entered.</p>' : ''}
      <div class="btn-row">
        <button class="btn danger" data-act="clear">Clear all data</button>
        <button class="btn ghost" data-act="sample">Load sample data</button>
      </div>
      <p class="muted small">Clearing keeps your budget categories. Tap a button twice to confirm.</p>
      </div>
    </section>`;

  root.querySelector('[data-act="export"]').onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `household-cfo-backup-${isoLocal()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  root.querySelector('[data-act="import"]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      toast('Backup restored');
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  };
  root.querySelector('[data-act="csv"]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const out = root.querySelector('#csv-result');
    try {
      const { items, skipped } = rowsToTransactions(getState(), parseCSV(await file.text()));
      const added = addTransactions(items);
      const dupes = items.length - added;
      const msg = `Added ${added} transaction${added === 1 ? '' : 's'}` + (dupes ? `, ${dupes} already in the log` : '') + (skipped ? `, ${skipped} deposits skipped` : '') + '.';
      toast(msg);
      setTimeout(() => { const o = document.querySelector('#csv-result'); if (o) o.textContent = msg; }, 0);
    } catch (err) {
      out.textContent = err.message || 'Could not read that file.';
    }
    e.target.value = '';
  };
  const confirmTwice = (btn, fn, done) => {
    btn.onclick = () => {
      if (btn.dataset.armed) { fn(); toast(done); location.hash = '#/'; }
      else { btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm'; }
    };
  };
  confirmTwice(root.querySelector('[data-act="clear"]'), clearAll, 'Cleared. Start by adding your income.');
  confirmTwice(root.querySelector('[data-act="sample"]'), resetToSample, 'Sample data loaded');
}

// ---- Cloud sync screen ---------------------------------------------------------

const ago = (t) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export function sync(root) {
  const st = getStatus();
  const stateText = {
    off: 'Off',
    syncing: 'Syncing…',
    synced: 'Up to date',
    offline: 'Offline',
    'needs-auth': 'Google sign-in expired',
    error: 'Problem syncing',
  }[st.state] || st.state;

  root.innerHTML = `
    <div class="page-head"><div><h1>Cloud sync</h1></div></div>
    <section class="panel">
      <div class="panel-head"><h2>Google Drive</h2><span class="sync-badge ${st.state === 'synced' ? 'ok' : st.state === 'syncing' ? 'busy' : 'warn'}"><span class="sdot"></span>${esc(stateText)}</span></div>
      <div class="panel-body">
      <p class="muted small">Keeps one shared data file, <strong>Household CFO / household-cfo-data.json</strong>, in Google Drive so both of your phones (and any computer) see the same numbers. Each device also keeps a copy so the app works offline.</p>
      ${st.connected ? `
        <dl class="details">
          <dt>Status</dt><dd>${esc(stateText)}</dd>
          <dt>Google account</dt><dd>${esc(st.email || 'Signed in')}</dd>
          <dt>Last synced</dt><dd>${ago(st.lastSync)}</dd>
        </dl>
        ${st.message ? `<p class="muted small">${esc(st.message)}</p>` : ''}
        ${st.state === 'needs-auth' || st.state === 'error' ? '<button class="btn block" data-act="connect">Sign in to Google again</button>' : ''}
        <div class="btn-row">
          <button class="btn primary" data-act="sync">Sync now</button>
          <button class="btn ghost" data-act="disconnect">Sign out of this device</button>
        </div>
        <p class="muted small">Signing out removes the copy on this device. Your data stays in Google Drive.</p>
      ` : st.clientId ? `
        ${st.message ? `<p class="neg small">${esc(st.message)}</p>` : ''}
        <button class="btn primary block" data-act="connect">Connect Google Drive</button>
        <p class="muted small">If your partner already set this up, sign in with the Google account the "Household CFO" folder was shared with and you'll both see the same data. Sample numbers on this phone are replaced by the shared data.</p>
      ` : `
        <p class="muted small">One-time setup: paste the Google client ID (from the setup guide).</p>
        <input id="client-id" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn block" data-act="save-id">Save</button>
      `}
      </div>
    </section>
    ${st.clientId ? `<details class="panel panel-body"><summary class="muted small">Advanced</summary>
      <p class="muted small">Google client ID: <code>${esc(st.clientId)}</code></p>
      <button class="btn block ghost" data-act="clear-id">Change client ID</button></details>` : ''}`;

  const on = (act, fn) => { const el = root.querySelector(`[data-act="${act}"]`); if (el) el.onclick = fn; };
  on('connect', connect);
  on('sync', () => syncNow({ allowRedirect: true }));
  on('disconnect', (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed) disconnect();
    else { b.dataset.armed = '1'; b.textContent = 'Tap again to sign out'; }
  });
  on('save-id', () => {
    const v = root.querySelector('#client-id').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) { toast('That does not look like a Google client ID'); return; }
    setClientId(v); sync(root);
  });
  on('clear-id', () => { setClientId(''); disconnect(); sync(root); });
}
