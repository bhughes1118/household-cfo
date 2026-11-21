// Small UI helpers shared by every view: formatting, escaping, the bottom
// sheet form, toasts and simple progress bars. No framework needed.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n, cents = false) => (cents ? fmt2 : fmt0).format(Number(n) || 0);

export const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;

export function shortDate(iso, opts = { month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts);
}

export function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function shiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const t = new Date(y, m - 1 + delta, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export function time12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Progress bar. ratio can exceed 1 (over budget) and the bar turns red.
export function bar(value, total, { tone } = {}) {
  const ratio = total > 0 ? value / total : 0;
  const cls = tone || (ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : 'ok');
  return `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(ratio * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>`;
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export function empty(text, cta = '') {
  return `<div class="empty"><p>${esc(text)}</p>${cta}</div>`;
}

// ---- Bottom sheet form -------------------------------------------------------
// fields: [{ name, label, type: text|number|money|date|time|select|textarea|checkbox|url,
//            options: [{value,label}], value, required, placeholder, step }]

export function openForm({ title, fields, submitLabel = 'Save', onSubmit, onDelete, header = '' }) {
  const sheet = document.getElementById('sheet');
  const fieldHtml = fields.map(renderField).join('');
  sheet.innerHTML = `
    <form method="dialog" class="sheet-body" novalidate>
      <div class="sheet-head">
        <button type="button" class="link" data-act="cancel">Cancel</button>
        <h2>${esc(title)}</h2>
        <button type="submit" class="link strong">${esc(submitLabel)}</button>
      </div>
      ${header}
      <div class="fields">${fieldHtml}</div>
      ${onDelete ? '<button type="button" class="btn danger block" data-act="delete">Delete</button>' : ''}
    </form>`;

  const form = sheet.querySelector('form');
  const close = () => sheet.close();
  form.querySelector('[data-act="cancel"]').onclick = close;
  if (onDelete) {
    form.querySelector('[data-act="delete"]').onclick = () => {
      if (form.dataset.confirm) { onDelete(); close(); }
      else { form.dataset.confirm = '1'; form.querySelector('[data-act="delete"]').textContent = 'Tap again to delete'; }
    };
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      if (!el) continue;
      let v = f.type === 'checkbox' ? el.checked : el.value.trim();
      if (f.type === 'number' || f.type === 'money') v = v === '' ? 0 : Number(v);
      if (f.required && (v === '' || (f.type === 'money' && !(v > 0)))) {
        el.focus();
        el.classList.add('invalid');
        return;
      }
      values[f.name] = v;
    }
    onSubmit(values);
    close();
  };
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  sheet.showModal();
  const first = form.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
  return form;
}

function renderField(f) {
  const id = `f-${f.name}`;
  const common = `id="${id}" name="${f.name}" ${f.required ? 'required' : ''} ${f.autofocus ? 'autofocus' : ''} placeholder="${esc(f.placeholder || '')}"`;
  let input;
  switch (f.type) {
    case 'select':
      input = `<select ${common}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'textarea':
      input = `<textarea ${common} rows="3">${esc(f.value)}</textarea>`;
      break;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'money':
      input = `<div class="money-input"><span>$</span><input ${common} type="number" inputmode="decimal" step="0.01" min="0" value="${f.value ?? ''}"></div>`;
      break;
    case 'number':
      input = `<input ${common} type="number" inputmode="numeric" step="${f.step || 1}" value="${f.value ?? ''}">`;
      break;
    default:
      input = `<input ${common} type="${f.type || 'text'}" value="${esc(f.value)}">`;
  }
  return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${input}</label>`;
}
