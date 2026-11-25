// build-helpers.mjs: small helper functions used by build.mjs (and by the tests in tests/).
// Nothing here reads or writes files; each function only takes values and returns a result.

// The seven days of the week, in order (index 0 = Monday).
// "key" is used in site.json and in the data-day="..." attributes that js/main.js reads.
// "on" is used in sentences like "ανοίγει την Τρίτη στις 09:00".
// "schema" is the English name Google expects in the JSON-LD.
export const DAYS = [
  { key: 'Mon', name: 'Δευτέρα',   short: 'Δευ', on: 'τη Δευτέρα',    schema: 'Monday' },
  { key: 'Tue', name: 'Τρίτη',     short: 'Τρί', on: 'την Τρίτη',     schema: 'Tuesday' },
  { key: 'Wed', name: 'Τετάρτη',   short: 'Τετ', on: 'την Τετάρτη',   schema: 'Wednesday' },
  { key: 'Thu', name: 'Πέμπτη',    short: 'Πέμ', on: 'την Πέμπτη',    schema: 'Thursday' },
  { key: 'Fri', name: 'Παρασκευή', short: 'Παρ', on: 'την Παρασκευή', schema: 'Friday' },
  { key: 'Sat', name: 'Σάββατο',   short: 'Σάβ', on: 'το Σάββατο',    schema: 'Saturday' },
  { key: 'Sun', name: 'Κυριακή',   short: 'Κυρ', on: 'την Κυριακή',   schema: 'Sunday' },
];

// Month names as used after a day number: "24 Δεκεμβρίου".
const MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου',
  'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];

// Makes text safe to put inside HTML (for example inside content="...").
export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Turns "09:00-14:00" into "09:00–14:00" (with a proper en dash).
export function formatInterval(interval) {
  return interval.replace('-', '–');
}

// Checks one time slot like "09:00-14:00". Returns an error message, or null if it is fine.
export function checkInterval(interval) {
  if (!/^\d\d:\d\d-\d\d:\d\d$/.test(interval)) {
    return '"' + interval + '" should look like "09:00-14:00"';
  }
  const [opens, closes] = interval.split('-');
  if (opens >= closes) {   // "09:00" < "14:00" works as text because both have the same format
    return '"' + interval + '": the closing time must be after the opening time';
  }
  return null;
}

// Accepts "2026-12-24" or "24/12/2026" (how a Greek Google Sheet shows dates)
// and returns "2026-12-24". Returns null if the text is not a real date.
export function normalizeDate(text) {
  text = String(text).trim();
  let year, month, day;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  // Rejects dates like 31/02/2026: JavaScript would quietly turn them into 3 March.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// "2026-12-24" plus 3 days = "2026-12-27" (works across months and years).
export function addDays(dateText, days) {
  const [y, m, d] = dateText.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The day of the week of a date, as an index into DAYS (0 = Monday).
export function weekdayIndex(dateText) {
  const [y, m, d] = dateText.split('-').map(Number);
  const sundayIsZero = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sundayIsZero + 6) % 7;
}

// Today's date in Greece, e.g. "2026-12-24" (the build may run on a server in another time zone).
export function athensToday() {
  // The "en-CA" format happens to be YYYY-MM-DD, which is what we want.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date());
}

// Greek text for a date range:
//   one day:          "Πέμπτη 24 Δεκεμβρίου"
//   same month:       "24–26 Δεκεμβρίου"
//   different months: "30 Δεκεμβρίου – 2 Ιανουαρίου"
export function formatDateRange(from, to) {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  if (from === to) return DAYS[weekdayIndex(from)].name + ' ' + fd + ' ' + MONTHS[fm - 1];
  if (fm === tm) return fd + '–' + td + ' ' + MONTHS[fm - 1];
  return fd + ' ' + MONTHS[fm - 1] + ' – ' + td + ' ' + MONTHS[tm - 1];
}

// Reads CSV text (what Google Sheets gives with "Publish to the web" → CSV) into rows of cells.
// Handles "quoted, cells" and "" inside quotes, which a simple split(',') would get wrong.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }   // "" means one "
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// Turns the rows of the holiday sheet into closures like the ones in site.json.
// Columns: Από | Έως | Σημείωση | Ώρες. The first row is the header and is skipped.
// "Ώρες" empty = closed; otherwise e.g. "09:00-14:00" or "09:00-14:00, 17:00-20:00".
export function closuresFromSheetRows(rows) {
  const closures = [];
  for (const row of rows.slice(1)) {
    const [from = '', to = '', note = '', hours = ''] = row.map(cell => cell.trim());
    if (from === '' && to === '' && note === '' && hours === '') continue;   // empty row
    const open = hours === '' ? [] : hours.split(/[,\s]+/).filter(h => h !== '');
    closures.push({ from, to: to === '' ? from : to, note, hours: open });
  }
  return closures;
}
