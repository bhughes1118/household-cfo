// Turns the text read from a ticket / booking screenshot into a trip booking.
// Plain rules and patterns, no AI: keyword scoring for the type, regexes for
// dates, times, money, confirmation codes, routes and addresses.
// Everything it finds is shown on a review screen before it is saved.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const TYPE_WORDS = {
  flight: ['flight', 'airline', 'airlines', 'boarding', 'gate', 'airport', 'terminal', 'baggage', 'carry-on', 'pnr', 'departs', 'aircraft', 'airways', 'delta', 'united', 'american airlines', 'jetblue', 'southwest', 'ryanair', 'easyjet', 'lufthansa', 'ita airways', 'air france', 'klm', 'british airways'],
  train: ['train', 'rail', 'railway', 'platform', 'coach', 'carriage', 'trenitalia', 'italo', 'frecciarossa', 'eurostar', 'amtrak', 'sncf', 'renfe', 'deutsche bahn', 'db ', 'tgv', 'brightline', 'trainline', 'station', 'stazione', 'gare', 'bahnhof'],
  bus: ['bus', 'flixbus', 'coach station', 'greyhound', 'shuttle'],
  ferry: ['ferry', 'ferries', 'hydrofoil', 'port ', 'harbour', 'harbor', 'pier', 'seajets', 'blue star', 'hellenic seaways', 'minoan', 'golden star', 'anek', 'fast ferries', 'ferryhopper'],
  lodging: ['hotel', 'check-in', 'check in', 'check-out', 'check out', 'nights', 'night stay', 'room', 'resort', 'airbnb', 'booking.com', 'guests', 'suite', 'villa', 'inn', 'accommodation', 'vrbo', 'expedia', 'marriott', 'hilton', 'hyatt'],
  tour: ['tour', 'excursion', 'guide', 'guided', 'experience', 'viator', 'getyourguide', 'meeting point', 'activity', 'cruise', 'snorkel', 'tasting', 'day trip', 'catamaran', 'boat tour'],
  dining: ['restaurant', 'reservation for', 'table for', 'party of', 'opentable', 'resy', 'dinner', 'lunch', 'brunch', 'tock', 'ristorante', 'trattoria'],
  ticket: ['admission', 'entry', 'museum', 'gallery', 'admit', 'entrance', 'skip the line', 'timed entry', 'concert', 'show'],
};

const PROVIDERS = ['Trenitalia', 'Italo', 'Eurostar', 'Amtrak', 'SNCF', 'Renfe', 'Deutsche Bahn', 'Brightline', 'Trainline', 'FlixBus', 'Delta', 'United', 'American Airlines', 'JetBlue', 'Southwest', 'Ryanair', 'easyJet', 'Lufthansa', 'ITA Airways', 'Air France', 'KLM', 'British Airways', 'Airbnb', 'Booking.com', 'Expedia', 'Marriott', 'Hilton', 'Hyatt', 'Viator', 'GetYourGuide', 'OpenTable', 'Resy'];

const cleanName = (s) => s.replace(/[^\p{L}\p{N} .,'()&-]/gu, ' ').replace(/\s{2,}/g, ' ').trim();

const norm = (s) => s.replace(/[|]/g, 'I').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');

function detectType(lower) {
  const scores = {};
  for (const [t, words] of Object.entries(TYPE_WORDS)) {
    scores[t] = words.reduce((n, w) => n + (lower.includes(w) ? (w.length > 6 ? 2 : 1) : 0), 0);
  }
  if (/\b[A-Z]{2}\s?\d{2,4}\b/.test(lower.toUpperCase()) && /flight|boarding|gate/.test(lower)) scores.flight += 3;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return { type: 'other', mode: null };
  const [t] = best;
  if (t === 'train' || t === 'bus' || t === 'ferry') return { type: 'transport', mode: t };
  return { type: t, mode: null };
}

// ---- Dates -------------------------------------------------------------------

function fmt(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function inferYear(m, d, hintYear) {
  if (hintYear) return hintYear;
  const now = new Date();
  const y = now.getFullYear();
  const candidate = new Date(y, m - 1, d);
  return candidate < new Date(y, now.getMonth(), now.getDate()) ? y + 1 : y;
}

// Returns [{ date, index }] in the order they appear.
export function findDates(text, { european = false, hintYear } = {}) {
  const out = [];
  const add = (date, index) => { if (date && !out.some((o) => o.index === index)) out.push({ date, index }); };
  let m;
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = iso.exec(text))) add(fmt(+m[1], +m[2], +m[3]), m.index);
  const num = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/g;
  while ((m = num.exec(text))) {
    let a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const dm = a > 12 || (european && b <= 12) || m[0].includes('.');
    const [mo, da] = dm && a <= 31 && b <= 12 ? [b, a] : [a, b];
    add(fmt(y, mo, da), m.index);
  }
  const dMonY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?,?\\s*(20\\d{2})?`, 'gi');
  while ((m = dMonY.exec(text))) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    add(fmt(m[3] ? +m[3] : inferYear(mo, +m[1], hintYear), mo, +m[1]), m.index);
  }
  const monDY = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, 'gi');
  while ((m = monDY.exec(text))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    add(fmt(m[3] ? +m[3] : inferYear(mo, +m[2], hintYear), mo, +m[2]), m.index);
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---- Times -------------------------------------------------------------------

export function findTimes(text) {
  const out = [];
  const re = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi;
  let m;
  while ((m = re.exec(text))) {
    // skip things that look like money (12.50) or dates
    const before = text.slice(Math.max(0, m.index - 2), m.index);
    if (/[$€£]/.test(before)) continue;
    if (!m[3] && m[0].includes('.') && !/\b(dep|arr|time|at|ore)\b/i.test(text.slice(Math.max(0, m.index - 12), m.index))) {
      // "12.50" without am/pm and no time word: probably a price
      if (/\.\d{2}$/.test(m[0]) && /(total|price|eur|usd|amount)/i.test(text.slice(Math.max(0, m.index - 20), m.index + 10))) continue;
    }
    let h = +m[1];
    const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    out.push({ time: `${String(h).padStart(2, '0')}:${m[2]}`, index: m.index });
  }
  return out;
}

// ---- Money -------------------------------------------------------------------

const CUR = { $: 'USD', '€': 'EUR', '£': 'GBP', usd: 'USD', eur: 'EUR', gbp: 'GBP', chf: 'CHF', cad: 'CAD', mxn: 'MXN' };

function toNumber(s) {
  s = s.replace(/\s/g, '');
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function findMoney(text) {
  const out = [];
  const re = /(?:(US\$|\$|€|£|USD|EUR|GBP|CHF|CAD|MXN)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?))|(?:(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\s?(€|\$|£|USD|EUR|GBP|CHF|CAD|MXN)(?![A-Za-z]))/gi;
  let m;
  while ((m = re.exec(text))) {
    const sym = (m[1] || m[4] || '').replace('US$', '$');
    const amount = toNumber(m[2] || m[3]);
    if (amount == null || amount <= 0) continue;
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    out.push({ amount, currency: CUR[sym.toLowerCase()] || CUR[sym] || 'USD', line, index: m.index });
  }
  return out;
}

function pickCost(money) {
  if (!money.length) return null;
  const score = (x) => {
    const l = x.line.toLowerCase();
    let s = 0;
    if (/grand total|total paid|amount paid|total charged|you paid|total price|total cost/.test(l)) s += 10;
    else if (/\btotal\b|amount|paid|charged|price|fare/.test(l)) s += 5;
    if (/tax|fee|deposit due|per night|per person|discount|savings|balance due/.test(l)) s -= 3;
    return s;
  };
  return [...money].sort((a, b) => score(b) - score(a) || b.amount - a.amount)[0];
}

// ---- Confirmation, provider, address, route ------------------------------------

export function findConfirmation(text) {
  const re = /\b(?:confirmation|booking|reservation|ticket|order|record locator|reference|localizador|codice|pnr|ref|code)\b\.?[ \t]*(?:no\.?|number|nr\.?|#|code|id|reference|ref\b)?[ \t]*[:#.]?[ \t]*([A-Z0-9][A-Z0-9.-]{3,20}[A-Z0-9])/gi;
  const STOP = /^(NUMBER|REFERENCE|CODE|CONFIRMED|CONFIRMATION|DETAILS|BOOKING|TICKET|RESERVATION)$/;
  let m;
  while ((m = re.exec(text))) {
    const code = m[1].toUpperCase();
    if (STOP.test(code)) continue;
    if (/\d/.test(code) || /^[A-Z]{6}$/.test(code)) return code;
  }
  return '';
}

const findProvider = (text) => PROVIDERS.find((p) => new RegExp(`\\b${p.replace('.', '\\.')}\\b`, 'i').test(text)) || '';

export function findAddress(lines) {
  const street = /\b\d{1,5}[a-z]?\s+[\w'.-]+(?:\s[\w'.-]+)*\s(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|way|plaza|square)\b|\b(?:via|viale|piazza|piazzale|corso|rue|avenue|avenida|calle|carrera|strasse|straße|platz|promenade|boulevard|quai|place|chemin|plaza|paseo|odos|odós)\s+[\w'.-]+/i;
  const postal = /^\d{1,5}[a-z]?\s+\p{L}.*,\s*(?:\d{4,6}|[A-Z]{1,2}\d)/u;
  const notAddress = /meeting point|\b(coche|coach|seat|asiento|carriage|platform|wagon|car)\s*\d|plaza\s*\d/i;
  const line = lines.find((l) => (street.test(l) || postal.test(l)) && !notAddress.test(l))
    || lines.map((l) => (l.match(/meeting point\s*:?\s*(.+)/i) || [])[1]).find(Boolean);
  return line ? line.trim().replace(/\s{2,}/g, ' ') : '';
}

const cleanPlace = (s) =>
  s.replace(/\b([01]?\d|2[0-3])[:.h][0-5]\d\s*(am|pm)?/gi, '')
    .replace(/\b(from|to|departure|arrival|depart(?:s|ing)?|arrive(?:s)?|origin|destination)\b\s*[:.]?\s*/gi, ' ')
    .replace(/\b(dep|arr|da|a|von|nach|de)\s*[:.]\s*/gi, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s+${MON}\\b.*$`, 'i'), '')
    .replace(/[^\p{L}\p{N} .'()&-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

export function findRoute(lines, text) {
  // 1) "From: X" / "To: Y" (or Departure / Arrival) on their own lines
  let from = '', to = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(/^\s*(?:from|departure|depart(?:ing)?|origin|da)\s*[:\-]\s*(.+)$/i);
    const t = l.match(/^\s*(?:to|arrival|arrive|destination|a)\s*[:\-]\s*(.+)$/i);
    if (f && !from) from = cleanPlace(f[1]) || cleanPlace(lines[i + 1] || '');
    if (t && !to) to = cleanPlace(t[1]) || cleanPlace(lines[i + 1] || '');
  }
  if (from && to) return { from, to };
  // 2) Airport codes "TPA → FCO" / "TPA - FCO"
  const iata = text.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|>|to)\s*([A-Z]{3})\b/);
  if (iata && !/USD|EUR|GBP/.test(iata[0])) return { from: iata[1], to: iata[2] };
  // 3) "X → Y" / "X to Y" on one line
  for (const l of lines) {
    const m = l.match(/^(.*?[\p{L}].*?)\s*(?:→|->|➔|➜|›|»|–|—| - | > | to )\s*(.*?[\p{L}].*)$/u);
    if (m) {
      const a = cleanPlace(m[1]), b = cleanPlace(m[2]);
      if (a.length >= 3 && b.length >= 3 && a.split(' ').length <= 5 && b.split(' ').length <= 5) return { from: a, to: b };
    }
  }
  // 4) Two lines that each hold a time and a place (common train layout)
  const timed = lines.filter((l) => /\b([01]?\d|2[0-3])[:.][0-5]\d\b/.test(l)).map(cleanPlace).filter((s) => s.length >= 3 && /\p{L}{3}/u.test(s));
  if (timed.length >= 2) return { from: timed[0], to: timed[1] };
  return { from, to };
}

function findName(lines, type, provider) {
  if (type === 'lodging') {
    const l = lines.find((x) => /\b(hotel|resort|inn|villa|suites?|palazzo|b&b|lodge|cigarral|casa)\b/i.test(x) && x.length < 60 && !/booking|confirm|check/i.test(x));
    if (l) return cleanName(l);
    // The name is usually the line just above the address.
    const addr = findAddress(lines);
    const i = addr ? lines.findIndex((x) => x.includes(addr.slice(0, 12))) : -1;
    if (i > 0 && lines[i - 1].length < 60 && !/booking|confirm/i.test(lines[i - 1])) return cleanName(lines[i - 1]);
  }
  if (type === 'dining') {
    const l = lines.find((x) => /\b(restaurant|ristorante|trattoria|osteria|bistro|grill|cafe|café)\b/i.test(x) && x.length < 60);
    if (l) return cleanName(l);
  }
  if (type === 'tour' || type === 'ticket') {
    const l = lines.find((x) => /\b(tour|excursion|experience|museum|gallery|tickets?|admission|cruise|class|day trip|trip)\b/i.test(x) && x.length < 70 && !/confirmation|booking|order|reference/i.test(x));
    if (l) return cleanName(l);
  }
  return provider;
}

// ---- Main ------------------------------------------------------------------------

export function parseTicket(rawText, { tripYear } = {}) {
  const text = norm(rawText || '');
  const lower = text.toLowerCase();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const { type, mode } = detectType(lower);
  const european = /€|£|\beur\b|\bgbp\b/i.test(text);

  // Prefer dates next to check-in / check-out words for stays.
  const dates = findDates(text, { european, hintYear: tripYear });
  let date = dates[0]?.date || '';
  let endDate = '';
  if (type === 'lodging') {
    const near = (word) => {
      const i = lower.search(word);
      if (i < 0) return null;
      return dates.find((d) => d.index >= i && d.index - i < 80)?.date || null;
    };
    date = near(/check[\s-]?in|arriv/) || date;
    endDate = near(/check[\s-]?out|depart/) || dates.map((d) => d.date).filter((d) => d !== date).pop() || '';
  }

  const times = findTimes(text);
  const time = times[0]?.time || '';
  const endTime = times[1]?.time || '';

  const cost = pickCost(findMoney(text));
  const confirmation = findConfirmation(text);
  const provider = findProvider(text);
  const address = findAddress(lines);
  const route = type === 'transport' || type === 'flight' || type === 'other' ? findRoute(lines, text) : { from: '', to: '' };
  const flightNo = type === 'flight' ? (text.match(/\b(?:flight\s*(?:no\.?|number|#)?\s*:?\s*)?([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/i) || [])[0] : '';

  const modeLabel = { train: 'Train', bus: 'Bus', ferry: 'Ferry' }[mode] || '';
  const name = findName(lines, type, provider);
  let title;
  if (route.from && route.to) {
    const prefix = type === 'flight' ? 'Flight' : modeLabel || 'Travel';
    title = `${prefix} ${route.from} → ${route.to}`;
  } else if (name) {
    title = name;
  } else {
    title = { flight: 'Flight', transport: `${modeLabel || 'Transport'} ticket`, lodging: 'Hotel stay', tour: 'Tour', dining: 'Dinner reservation', ticket: 'Tickets', other: 'Trip booking' }[type];
  }

  const location = type === 'transport' || type === 'flight' ? route.from : type === 'lodging' ? name || address : address || name || '';
  const noteBits = [
    provider && `Booked with: ${provider}`,
    flightNo && type === 'flight' && `Flight ${flightNo.replace(/^flight\s*(no\.?|number|#)?\s*:?\s*/i, '')}`,
    route.to && `Arrive ${route.to}${endTime && type !== 'lodging' ? ` at ${endTime}` : ''}`,
    address && location !== address && `Address: ${address}`,
    cost && cost.currency !== 'USD' && `Price on ticket: ${cost.amount.toFixed(2)} ${cost.currency}`,
  ].filter(Boolean);

  const result = {
    type,
    mode,
    title,
    date,
    time: type === 'lodging' ? '' : time,
    endDate,
    location,
    address,
    from: route.from,
    to: route.to,
    arriveTime: endTime,
    cost: cost ? cost.amount : 0,
    currency: cost ? cost.currency : 'USD',
    confirmation,
    provider,
    notes: noteBits.join('\n'),
  };
  result.missing = missingFields(result);
  return result;
}

export function missingFields(x) {
  const miss = [];
  if (!x.date) miss.push('date');
  if (!x.time && x.type !== 'lodging' && x.type !== 'other') miss.push('time');
  if (!x.location && !x.address) miss.push('location');
  if (!(x.cost > 0) && !(x.estCost > 0) && !(x.paid > 0)) miss.push('cost');
  if (!x.confirmation) miss.push('confirmation #');
  return miss;
}
