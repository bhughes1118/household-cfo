// Scan a ticket / booking screenshot: read the text on the phone (Tesseract,
// open-source text recognition, runs entirely in the browser), turn it into a
// booking with ticket-parser.js, let you check it, then save it to the
// itinerary + honeymoon budget and keep the screenshot in Google Drive.

import { getState, upsert } from './store.js';
import { parseTicket } from './ticket-parser.js';
import { TRIP_TYPES, TRIP_STATUS, isoLocal } from './calc.js';
import { openForm, toast, esc, money } from './ui.js';
import { uploadAttachment } from './sync.js';

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the text reader. Check your connection.'));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE + 'core',
        langPath: BASE + 'lang',
        logger: (m) => onProgress?.(m),
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Scale big photos down (faster OCR, smaller Drive upload).
async function shrink(file, max = 2000, type = 'image/jpeg', quality = 0.85) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, type, quality));
}

async function toUSD(amount, currency) {
  if (!amount || currency === 'USD') return { usd: amount, rate: 1 };
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=USD`);
    const j = await r.json();
    const rate = j.rates?.USD;
    if (rate) return { usd: Math.round(amount * rate * 100) / 100, rate };
  } catch {}
  return { usd: amount, rate: null };
}

// Find a planned booking this ticket probably belongs to (e.g. "Madrid → Toledo train").
function findMatch(s, p) {
  const words = (x) => (x || '').toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 3);
  const want = new Set([...words(p.from), ...words(p.to), ...words(p.title)]);
  let best = null, bestScore = 0;
  for (const i of s.tripItems) {
    let score = 0;
    if (i.type === p.type) score += 2;
    if (p.date && i.date === p.date) score += 3;
    const iw = words(i.title + ' ' + (i.location || ''));
    score += iw.filter((w) => want.has(w)).length * 2;
    if (i.status === 'booked' && i.confirmation && i.confirmation !== p.confirmation) score -= 3;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 5 ? best : null;
}

function progressSheet() {
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = `<div class="sheet-body scan-progress"><h2>Reading your screenshot…</h2><div class="bar"><span id="scan-bar" style="width:5%"></span></div><p class="muted small" id="scan-msg">Getting the text reader ready (first time takes a few seconds)</p></div>`;
  if (!sheet.open) sheet.showModal();
  return (m) => {
    const bar = document.getElementById('scan-bar');
    const msg = document.getElementById('scan-msg');
    if (!bar) return;
    if (m.status === 'recognizing text') { bar.style.width = `${10 + m.progress * 90}%`; msg.textContent = 'Reading text…'; }
    else if (m.progress != null) bar.style.width = `${5 + m.progress * 5}%`;
  };
}

export async function scanFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Please choose a screenshot or photo (PDFs: take a screenshot first)'); return; }
  const progress = progressSheet();
  let text = '';
  try {
    const worker = await getWorker(progress);
    const img = await shrink(file, 2400, 'image/png', 1);
    ({ data: { text } } = await worker.recognize(img));
  } catch (e) {
    document.getElementById('sheet').close();
    toast(e.message || 'Could not read that image');
    return;
  }
  const s = getState();
  const tripYear = Number((s.trip.startDate || '').slice(0, 4)) || undefined;
  const p = parseTicket(text, { tripYear });
  const { usd, rate } = await toUSD(p.cost, p.currency);
  const match = findMatch(s, p);
  const thumbUrl = URL.createObjectURL(file);
  review({ file, text, p, usd, rate, match, thumbUrl });
}

function review({ file, text, p, usd, rate, match, thumbUrl }) {
  const s = getState();
  const priceNote = p.cost && p.currency !== 'USD'
    ? `Ticket shows ${p.cost.toFixed(2)} ${p.currency}${rate ? ` ≈ ${money(usd, true)} at today's rate` : ' (convert to USD)'}`
    : '';
  const header = `
    <div class="scan-head">
      <img src="${thumbUrl}" alt="Your screenshot">
      <div>
        <p class="small"><strong>Found:</strong> ${esc(TRIP_TYPES[p.type]?.label || 'Booking')}${p.mode ? ` (${p.mode})` : ''}</p>
        ${p.missing.length ? `<p class="small warn-text">Couldn't find: ${p.missing.join(', ')}. Fill in what you know.</p>` : '<p class="small pos">Everything found. Check it over.</p>'}
        ${priceNote ? `<p class="small muted">${esc(priceNote)}</p>` : ''}
      </div>
    </div>
    <details class="small muted"><summary>Text read from the screenshot</summary><pre class="ocr">${esc(text)}</pre></details>`;

  const linkOptions = [{ value: '', label: '＋ Add as a new booking' }].concat(
    s.tripItems.map((i) => ({ value: i.id, label: `Update: ${i.title}${i.date ? ` (${i.date.slice(5)})` : ''}` })),
  );

  openForm({
    title: 'Check the booking',
    submitLabel: 'Save',
    header,
    fields: [
      { name: 'linkTo', label: match ? 'Looks like one you already planned' : 'Save as', type: 'select', value: match?.id || '', options: linkOptions },
      { name: 'type', label: 'Category', type: 'select', value: p.type, options: Object.entries(TRIP_TYPES).map(([v, t]) => ({ value: v, label: t.label })) },
      { name: 'title', label: 'What', value: p.title, required: true },
      { name: 'status', label: 'Status', type: 'select', value: 'booked', options: Object.entries(TRIP_STATUS).map(([v, t]) => ({ value: v, label: t.label })) },
      { name: 'date', label: p.type === 'lodging' ? 'Check-in date' : 'Date', type: 'date', value: p.date },
      { name: 'time', label: p.type === 'lodging' ? 'Check-in time' : 'Departs / starts at', type: 'time', value: p.time },
      { name: 'endDate', label: p.type === 'lodging' ? 'Check-out date' : 'End date (optional)', type: 'date', value: p.endDate },
      { name: 'location', label: p.type === 'flight' || p.type === 'transport' ? 'Departs from (station / airport)' : 'Place', value: p.location },
      { name: 'paid', label: 'Cost in USD (goes into the honeymoon budget)', type: 'money', value: usd || '' },
      { name: 'confirmation', label: 'Confirmation #', value: p.confirmation },
      { name: 'notes', label: 'Notes', type: 'textarea', value: p.notes },
    ],
    onSubmit: async (v) => {
      const existing = v.linkTo ? s.tripItems.find((i) => i.id === v.linkTo) : null;
      delete v.linkTo;
      const item = {
        ...(existing || {}),
        ...v,
        estCost: Math.max(existing?.estCost || 0, v.paid || 0),
        paidDate: v.paid > 0 ? existing?.paidDate || isoLocal() : existing?.paidDate || '',
        notes: [existing?.notes, v.notes].filter(Boolean).join('\n'),
        source: 'scan',
      };
      const saved = upsert('tripItems', item);
      toast(existing ? 'Booking updated' : 'Booking added');
      // Keep the screenshot with the booking (in the Household CFO Drive folder).
      try {
        const small = await shrink(file, 1600);
        const name = `Honeymoon - ${v.title} - ${v.date || isoLocal()}.jpg`.replace(/[\\/:*?"<>|]/g, '-');
        const att = await uploadAttachment(small, name);
        if (att) {
          const cur = getState().tripItems.find((i) => i.id === saved.id);
          upsert('tripItems', { ...cur, attachments: [...(cur.attachments || []), { ...att, name }] });
        }
      } catch (e) {
        console.warn('Screenshot upload failed', e);
        toast('Saved, but the screenshot could not be stored in Drive');
      }
    },
  });
}

// A file input button that starts a scan. Used on the portal screens.
export function scanButton(label = 'Scan a ticket or screenshot') {
  return `<label class="btn block scan-btn">${label}<input type="file" accept="image/*" data-act="scan" hidden></label>`;
}

export function bindScan(root) {
  root.querySelectorAll('[data-act="scan"]').forEach((input) => {
    input.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; scanFile(f); };
  });
}
