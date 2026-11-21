// "More" tab: links to secondary screens, iPhone install help, and backup tools.

import { getState, exportJSON, importJSON, resetToSample, clearAll } from '../store.js';
import { isoLocal } from '../calc.js';
import { toast, esc } from '../ui.js';
import { getStatus, connect, disconnect, syncNow, setClientId } from '../sync.js';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function menu(root) {
  root.innerHTML = `
    <section class="card flush">
      <ul class="list menu">
        <li><a href="#/income">💰 Income <span class="chev">›</span></a></li>
        <li><a href="#/budgets">📊 Budget categories <span class="chev">›</span></a></li>
        <li><a href="#/honeymoon/settings">✈️ Honeymoon trip details <span class="chev">›</span></a></li>
        <li><a href="#/sync">☁️ Cloud sync (Google Drive) <span class="chev">›</span></a></li>
        <li><a href="#/data">💾 Backup & data <span class="chev">›</span></a></li>
      </ul>
    </section>

    ${isStandalone() ? '' : `
    <section class="card">
      <h3>Add to your iPhone home screen</h3>
      <ol class="steps">
        <li>Open this page in <strong>Safari</strong>.</li>
        <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
      </ol>
      <p class="muted small">It opens full screen like an app and works without signal, handy on the trip.</p>
    </section>`}

    <section class="card">
      <h3>Coming in phase 2</h3>
      <ul class="bullets muted">
        <li>Charts: spending trends, month over month, cash flow</li>
        <li>Reports you can export or share</li>
        <li>Smart suggestions (where you're overspending, what to cut)</li>
      </ul>
    </section>
    <p class="muted small center">Household CFO · phase 1</p>`;
}

export function data(root) {
  const s = getState();
  root.innerHTML = `
    <section class="card">
      <h3>Where your data lives</h3>
      <p class="muted">${getStatus().connected
        ? 'Your data is shared through Google Drive, with a copy on this device so it works offline.'
        : 'Right now your data is only on this device. Turn on <a href="#/sync">Cloud sync</a> to share it between phones.'}
        You can also download a backup file any time.</p>
      <button class="btn block" data-act="export">Download backup</button>
      <label class="btn block ghost">Restore from backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
    </section>

    <section class="card">
      <h3>Start fresh</h3>
      ${s.settings.isSample ? '<p class="muted">The app is showing sample numbers right now.</p>' : ''}
      <button class="btn block danger" data-act="clear">Clear everything and start blank</button>
      <button class="btn block ghost" data-act="sample">Reload the sample data</button>
      <p class="muted small">Clearing keeps your budget categories. Tap a button twice to confirm.</p>
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
    <section class="card">
      <h3>Google Drive sync</h3>
      <p class="muted">Keeps one shared data file, <strong>Household CFO / household-cfo-data.json</strong>, in Google Drive so both of your phones (and any computer) see the same numbers. Each device also keeps a copy so the app works offline.</p>
      ${st.connected ? `
        <dl class="details">
          <dt>Status</dt><dd>${esc(stateText)}</dd>
          <dt>Google account</dt><dd>${esc(st.email || 'Signed in')}</dd>
          <dt>Last synced</dt><dd>${ago(st.lastSync)}</dd>
        </dl>
        ${st.message ? `<p class="muted small">${esc(st.message)}</p>` : ''}
        ${st.state === 'needs-auth' || st.state === 'error' ? '<button class="btn block" data-act="connect">Sign in to Google again</button>' : ''}
        <button class="btn block" data-act="sync">Sync now</button>
        <button class="btn block ghost" data-act="disconnect">Turn off sync on this device</button>
      ` : st.clientId ? `
        ${st.message ? `<p class="neg small">${esc(st.message)}</p>` : ''}
        <button class="btn block" data-act="connect">Connect Google Drive</button>
        <p class="muted small">If your partner already set this up, sign in with the Google account the "Household CFO" folder was shared with and you'll both see the same data. Sample numbers on this phone are replaced by the shared data.</p>
      ` : `
        <p class="muted small">One-time setup: paste the Google client ID (from the setup guide).</p>
        <input id="client-id" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn block" data-act="save-id">Save</button>
      `}
    </section>
    ${st.clientId ? `<details class="card"><summary class="muted small">Advanced</summary>
      <p class="muted small">Google client ID: <code>${esc(st.clientId)}</code></p>
      <button class="btn block ghost" data-act="clear-id">Change client ID</button></details>` : ''}`;

  const on = (act, fn) => { const el = root.querySelector(`[data-act="${act}"]`); if (el) el.onclick = fn; };
  on('connect', connect);
  on('sync', () => syncNow({ allowRedirect: true }));
  on('disconnect', () => { disconnect(); toast('Sync turned off on this device'); });
  on('save-id', () => {
    const v = root.querySelector('#client-id').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) { toast('That does not look like a Google client ID'); return; }
    setClientId(v); sync(root);
  });
  on('clear-id', () => { setClientId(''); disconnect(); sync(root); });
}
