// Cloud sync through Google Drive.
//
// The shared data lives in one file, "household-cfo-data.json", inside a
// "Household CFO" folder in Google Drive. Each phone keeps a local copy so the
// app opens instantly and works offline; when online it pulls the Drive file,
// merges (see merge.js), and pushes the result back.
//
// Sign-in uses Google's OAuth redirect flow (works inside an iPhone home
// screen app, where popups are unreliable). Tokens last an hour; when one
// expires the app quietly re-signs in the next time it is opened.

import { getState, subscribe, replaceState } from './store.js';
import { merge, fingerprint } from './merge.js';
import { GOOGLE_CLIENT_ID } from './config.js';

const FILE_NAME = 'household-cfo-data.json';
const FOLDER_NAME = 'Household CFO';
// drive.file = the app can only see files it created itself, nothing else in your Drive.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const LS = {
  token: 'hcfo:sync:token',
  connected: 'hcfo:sync:connected',
  fileId: 'hcfo:sync:fileId',
  email: 'hcfo:sync:email',
  clientId: 'hcfo:sync:clientId',
  lastSync: 'hcfo:sync:last',
  silentTry: 'hcfo:sync:silentTry',
};

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// ---- Status (shown in the top bar and on the Cloud sync screen) --------------

const status = { state: 'off', message: '', lastSync: Number(ls.get(LS.lastSync)) || 0 };
const statusListeners = new Set();
function setStatus(state, message = '') {
  status.state = state;
  status.message = message;
  statusListeners.forEach((fn) => fn(status));
}
export const getStatus = () => ({ ...status, email: ls.get(LS.email), connected: isConnected(), clientId: clientId() });
export const onStatus = (fn) => (statusListeners.add(fn), () => statusListeners.delete(fn));

export const clientId = () => ls.get(LS.clientId) || GOOGLE_CLIENT_ID || '';
export function setClientId(id) { id ? ls.set(LS.clientId, id.trim()) : ls.del(LS.clientId); }
export const isConnected = () => ls.get(LS.connected) === '1';

// ---- Auth ------------------------------------------------------------------------

const redirectUri = () => location.origin + location.pathname;

function readToken() {
  try {
    const t = JSON.parse(ls.get(LS.token) || 'null');
    return t && t.expiresAt - 60000 > Date.now() ? t.accessToken : null;
  } catch { return null; }
}

function startAuth({ silent = false } = {}) {
  const id = clientId();
  if (!id) { setStatus('error', 'Add your Google client ID first.'); return; }
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: JSON.stringify({ route: location.hash || '#/', silent }),
  });
  if (silent) params.set('prompt', 'none');
  const hint = ls.get(LS.email);
  if (hint) params.set('login_hint', hint);
  if (silent) ls.set(LS.silentTry, String(Date.now()));
  location.assign(`${AUTH_URL}?${params}`);
}

export function connect() { startAuth(); }

export function disconnect() {
  [LS.token, LS.connected, LS.fileId, LS.email, LS.lastSync].forEach(ls.del);
  status.lastSync = 0;
  setStatus('off');
}

// Called once at startup, before the router reads the hash.
// Picks up "#access_token=..." (or "#error=...") coming back from Google.
function handleRedirect() {
  const h = location.hash;
  if (!/^#(access_token|error|state)=|&access_token=|&error=/.test(h)) return;
  const p = new URLSearchParams(h.slice(1));
  let st = {};
  try { st = JSON.parse(p.get('state') || '{}'); } catch {}
  const route = st.route && st.route.startsWith('#/') ? st.route : '#/';
  history.replaceState(null, '', location.pathname + location.search + route);

  if (p.get('access_token')) {
    ls.set(LS.token, JSON.stringify({
      accessToken: p.get('access_token'),
      expiresAt: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000,
    }));
    ls.set(LS.connected, '1');
    ls.del(LS.silentTry);
  } else if (p.get('error')) {
    if (st.silent) setStatus('needs-auth', 'Tap to sign in to Google again.');
    else setStatus('error', `Google sign-in didn't finish (${p.get('error')}).`);
  }
}

// When the token has expired: quietly bounce through Google once (only if the
// app was just opened or brought back, never in the middle of typing).
function ensureAuth({ allowRedirect }) {
  const token = readToken();
  if (token) return token;
  const lastTry = Number(ls.get(LS.silentTry)) || 0;
  const editing = document.querySelector('dialog[open]');
  if (allowRedirect && !editing && navigator.onLine && Date.now() - lastTry > 120000) {
    startAuth({ silent: true });
  } else {
    setStatus('needs-auth', 'Tap to sign in to Google again.');
  }
  return null;
}

// ---- Drive calls ---------------------------------------------------------------

class AuthError extends Error {}

async function drive(token, url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 401) { ls.del(LS.token); throw new AuthError('expired'); }
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function whoAmI(token) {
  const r = await drive(token, `${API}/about?fields=user(emailAddress)`);
  const j = await r.json();
  if (j.user?.emailAddress) ls.set(LS.email, j.user.emailAddress);
}

// Finds the shared data file (also files a partner shared with you), or creates it.
async function findOrCreateFile(token, initial) {
  const known = ls.get(LS.fileId);
  if (known) {
    try {
      const r = await drive(token, `${API}/files/${known}?fields=id,trashed`);
      const j = await r.json();
      if (!j.trashed) return { id: known, created: false };
    } catch (e) { if (e instanceof AuthError) throw e; }
  }
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await drive(token, `${API}/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`);
  const { files = [] } = await r.json();
  if (files.length) { ls.set(LS.fileId, files[0].id); return { id: files[0].id, created: false }; }

  // Nothing yet: create the folder and file.
  const fr = await drive(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await fr.json();
  const boundary = 'hcfo' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: FILE_NAME, parents: [folder.id], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(initial) +
    `\r\n--${boundary}--`;
  const cr = await drive(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const file = await cr.json();
  ls.set(LS.fileId, file.id);
  return { id: file.id, created: true };
}

async function download(token, id) {
  const r = await drive(token, `${API}/files/${id}?alt=media`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function upload(token, id, data) {
  await drive(token, `${UPLOAD}/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ---- Sync loop -----------------------------------------------------------------

let running = null;
let again = false;

export async function syncNow({ allowRedirect = false } = {}) {
  if (!isConnected()) return;
  if (running) { again = true; return running; }
  running = (async () => {
    if (!navigator.onLine) { setStatus('offline', 'Offline. Changes are saved here and will sync later.'); return; }
    const token = ensureAuth({ allowRedirect });
    if (!token) return;
    setStatus('syncing');
    try {
      if (!ls.get(LS.email)) await whoAmI(token).catch(() => {});
      const local = getState();
      const file = await findOrCreateFile(token, local);
      if (!file.created) {
        const remote = await download(token, file.id);
        const merged = merge(local, remote);
        const fm = fingerprint(merged);
        if (!remote || fm !== fingerprint(remote)) await upload(token, file.id, merged);
        if (fm !== fingerprint(getState())) {
          // Keep anything typed while we were syncing.
          replaceState(merge(merged, getState()));
        }
      }
      status.lastSync = Date.now();
      ls.set(LS.lastSync, String(status.lastSync));
      setStatus('synced');
    } catch (e) {
      if (e instanceof AuthError) ensureAuth({ allowRedirect });
      else { console.warn(e); setStatus('error', navigator.onLine ? 'Sync hit a problem. Will retry.' : 'Offline.'); }
    }
  })();
  try { await running; } finally {
    running = null;
    if (again) { again = false; syncNow(); }
  }
}

let debounce;
export function initSync() {
  handleRedirect();
  if (!isConnected()) { if (status.state !== 'error') setStatus('off'); return; }

  // Push local edits shortly after they happen.
  subscribe((_s, meta) => {
    if (meta?.fromSync) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => syncNow(), 1500);
  });
  // Pull the partner's changes when the app comes back to the foreground, every minute while open, and when back online.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow({ allowRedirect: true }); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  syncNow({ allowRedirect: true });
}
