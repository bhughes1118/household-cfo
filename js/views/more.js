// "More" tab: links to secondary screens, iPhone install help, and backup tools.

import { getState, exportJSON, importJSON, resetToSample, clearAll } from '../store.js';
import { isoLocal } from '../calc.js';
import { toast } from '../ui.js';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function menu(root) {
  root.innerHTML = `
    <section class="card flush">
      <ul class="list menu">
        <li><a href="#/income">💰 Income <span class="chev">›</span></a></li>
        <li><a href="#/budgets">📊 Budget categories <span class="chev">›</span></a></li>
        <li><a href="#/honeymoon/settings">✈️ Honeymoon trip details <span class="chev">›</span></a></li>
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
        <li>Shared sync between both of your phones</li>
      </ul>
    </section>
    <p class="muted small center">Household CFO · phase 1</p>`;
}

export function data(root) {
  const s = getState();
  root.innerHTML = `
    <section class="card">
      <h3>Where your data lives</h3>
      <p class="muted">Everything you enter is saved on this device only, in this browser. Nothing is sent anywhere. Export a backup now and then, or to move your data to another phone.</p>
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
