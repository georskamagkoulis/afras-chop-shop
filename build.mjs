// build.mjs: builds the finished website pages.
//
// It reads data/site.json, fills every {{placeholder}} in src/*.html (and src/robots.txt)
// with a value, and writes the finished files to the repo root. The GitHub Action
// (.github/workflows/deploy.yml) runs this and publishes the result on GitHub Pages.
//
// Run it with:  npm run build   (from the repo folder)
// It only uses Node's built-in modules, so there is nothing to install.
//
// Three optional settings, used by the tests (you normally don't need them):
//   SITE_DATA=other.json   read this data file instead of data/site.json
//   BUILD_TODAY=2026-12-20 pretend today is this date (decides which holidays are shown)
//   OUT_DIR=some/folder    write the finished files there instead of the repo root

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DAYS, escapeHtml, formatInterval, checkInterval, normalizeDate, addDays, athensToday,
  formatDateRange, parseCsv, closuresFromSheetRows,
} from './build-helpers.mjs';

const DATA_FILE = process.env.SITE_DATA || 'data/site.json';
const TODAY = process.env.BUILD_TODAY || athensToday();
const OUT_DIR = (process.env.OUT_DIR || '.') + '/';
const NOTICE_DAYS_BEFORE = 21;   // a holiday notice appears this many days before it starts

// Stops the build with an error message. "npm run build" then fails visibly,
// and in the GitHub Action nothing is published, so the live site stays as it was.
function fail(message) {
  console.error('BUILD FAILED: ' + message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: read and check the data file.
// ---------------------------------------------------------------------------
let site;
try {
  site = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
} catch (error) {
  fail(DATA_FILE + ' could not be read: ' + error.message + ' (a missing comma or quote?)');
}

// Every day must exist in "hours", and every time slot must look like "09:00-14:00".
for (const day of DAYS) {
  const intervals = site.hours[day.key];
  if (!Array.isArray(intervals)) {
    fail(DATA_FILE + ': hours.' + day.key + ' is missing (use [] for a closed day)');
  }
  for (const interval of intervals) {
    const problem = checkInterval(interval);
    if (problem) fail(DATA_FILE + ': hours.' + day.key + ': ' + problem);
  }
}

// Holidays and special hours ("closures"): from site.json, plus the Google Sheet if one is set.
let closures = (site.closures || []).map(c => ({ ...c, source: DATA_FILE }));
const sheetUrl = site.closuresSheetCsv || '';
if (sheetUrl !== '') {
  let csv;
  try {
    const response = await fetch(sheetUrl);
    if (!response.ok) throw new Error('the server answered ' + response.status);
    csv = await response.text();
  } catch (error) {
    fail('the holidays sheet could not be downloaded (' + error.message + '): ' + sheetUrl);
  }
  const fromSheet = closuresFromSheetRows(parseCsv(csv)).map(c => ({ ...c, source: 'the holidays sheet' }));
  closures = closures.concat(fromSheet);
}

// Check every closure and bring it to one shape: { from, to, note, open: [["09:00","14:00"], ...] }
closures = closures.map((c, i) => {
  const where = c.source + ', holiday ' + (i + 1) + ' ("' + (c.note || '') + '")';
  const from = normalizeDate(c.from);
  const to = normalizeDate(c.to || c.from);
  if (!from) fail(where + ': "' + c.from + '" is not a date like 2026-12-24 or 24/12/2026');
  if (!to) fail(where + ': "' + c.to + '" is not a date like 2026-12-24 or 24/12/2026');
  if (from > to) fail(where + ': it ends (' + to + ') before it starts (' + from + ')');
  const hours = c.hours || [];
  for (const interval of hours) {
    const problem = checkInterval(interval);
    if (problem) fail(where + ': ' + problem);
  }
  return { from, to, note: c.note || '', open: hours.map(h => h.split('-')) };
});

// Only holidays that have not ended yet matter. Sorted by start date.
closures = closures.filter(c => c.to >= TODAY).sort((a, b) => (a.from < b.from ? -1 : 1));

// ---------------------------------------------------------------------------
// Step 2: build the "values" table: placeholder name -> text to put in the page.
// ---------------------------------------------------------------------------
const values = {};

// 2a. Every simple value in site.json becomes a placeholder automatically.
//     For example site.rating.count becomes {{rating.count}}, and
//     site.prices.haircut.price becomes {{prices.haircut.price}}.
//     Lists (like the hours) are skipped here; they are handled further down.
function addSimpleValues(prefix, object) {
  for (const key of Object.keys(object)) {
    const name = prefix === '' ? key : prefix + '.' + key;
    const value = object[key];
    if (Array.isArray(value)) {
      continue;
    } else if (typeof value === 'object') {
      addSimpleValues(name, value); // go one level deeper
    } else {
      values[name] = escapeHtml(value);
    }
  }
}
addSimpleValues('', site);

// 2b. Phone and address values derived from the data.
const phoneDigits = site.phone.replaceAll(' ', '');
values['phone.tel'] = site.phoneCountryCode + phoneDigits;                 // +302231602268 (for tel: links)
values['phone.international'] = site.phoneCountryCode + ' ' + site.phone;  // +30 2231 602268
const a = site.address;
values['address.mapsQuery'] = encodeURIComponent(a.street + ', ' + a.postalCode + ' ' + a.city);

// Website address. It must end with "/" so we can stick page names after it.
if (!site.website.url.endsWith('/')) fail(DATA_FILE + ': website.url must end with "/"');
values['website.path'] = new URL(site.website.url).pathname;          // "/afras-chop-shop/"
values['shareImage.url'] = site.website.url + site.shareImage.path;   // full URL of the share image

// Cache busting: add a short "fingerprint" of the file's contents to the CSS/JS links,
// e.g. css/main.css?v=3f9a1c2b. When the file changes, the fingerprint changes too,
// so browsers download the new version instead of using an old cached copy.
function fingerprint(path) {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  return path + '?v=' + hash.slice(0, 8);
}
values['asset.css'] = fingerprint('css/main.css');
values['asset.js'] = fingerprint('js/main.js');
values['asset.hoursJs'] = fingerprint('js/hours.js');

// Visitor statistics with GoatCounter (no cookies). Switched off while analytics.goatcounterCode is "".
const gcCode = site.analytics.goatcounterCode;
if (gcCode === '') {
  values['analytics.meta'] = '';
  values['csp.imgSrc'] = "'self' data:";
  values['privacy.analytics'] = 'Αυτή τη στιγμή δεν μετράμε την επισκεψιμότητα του site.';
} else {
  if (!/^[a-z0-9-]+$/.test(gcCode)) {
    fail(DATA_FILE + ': analytics.goatcounterCode "' + gcCode + '" should only have small latin letters, numbers and -');
  }
  const gcHost = 'https://' + gcCode + '.goatcounter.com';
  // js/main.js finds this tag and sends the counts to the address in it.
  values['analytics.meta'] = '\n  <meta name="goatcounter" content="' + gcHost + '/count">';
  // The Content-Security-Policy must allow the counting requests (they are sent as tiny images).
  values['csp.imgSrc'] = "'self' data: " + gcHost;
  values['privacy.analytics'] =
    'Μετράμε πόσοι επισκέπτονται το site και πόσοι πατούν «Κλείσε ώρα», το τηλέφωνο ή τους χάρτες, ' +
    'με την υπηρεσία GoatCounter. Δεν χρησιμοποιεί cookies, δεν αποθηκεύει τίποτα στη συσκευή σου ' +
    'και δεν κρατά τη διεύθυνση IP σου. Βλέπουμε μόνο συνολικούς αριθμούς (π.χ. ποια σελίδα, ' +
    'από ποια χώρα, με ποιον browser), ποτέ ποιος είσαι.';
}

// 2c. Opening hours.
//     First group the days that have exactly the same hours, e.g.
//     Τρίτη, Πέμπτη, Παρασκευή all share "09:00-14:00, 17:00-21:00".
const openGroups = [];   // list of { days: [...], intervals: [...] }
const closedDays = [];
for (const day of DAYS) {
  const intervals = site.hours[day.key];
  if (intervals.length === 0) {
    closedDays.push(day);
    continue;
  }
  const sameHours = openGroups.find(g => g.intervals.join() === intervals.join());
  if (sameHours) {
    sameHours.days.push(day);
  } else {
    openGroups.push({ days: [day], intervals: intervals });
  }
}
if (openGroups.length === 0) fail(DATA_FILE + ': the shop is closed every day');

// The table on visit.html: one <tr> per day.
let tableRows = [];
for (const day of DAYS) {
  const intervals = site.hours[day.key];
  if (intervals.length === 0) {
    tableRows.push('<tr class="is-closed" data-day="' + day.key + '"><th scope="row">' + day.name + '</th><td>Κλειστά</td></tr>');
  } else {
    const text = intervals.map(formatInterval).join(', ');
    tableRows.push('<tr data-day="' + day.key + '"><th scope="row">' + day.name + '</th><td>' + text + '</td></tr>');
  }
}
values['hours.table'] = tableRows.join('\n                ');

// The footer: one line per group, closed days last.
let footerLines = [];
for (const group of openGroups) {
  const dayNames = group.days.map(d => d.name).join(', ');
  footerLines.push(dayNames + ' ' + group.intervals.map(formatInterval).join(', '));
}
if (closedDays.length > 0) {
  footerLines.push(closedDays.map(d => d.name).join(', ') + ' κλειστά');
}
values['hours.footer'] = footerLines.join('<br>');

// The short summary used in <meta> descriptions, e.g.
// "Τρί, Πέμ, Παρ 09:00–14:00 & 17:00–21:00 · Τετ 09:00–14:30 · Σάβ 09:00–16:00"
let summaryParts = [];
for (const group of openGroups) {
  const dayNames = group.days.map(d => d.short).join(', ');
  summaryParts.push(dayNames + ' ' + group.intervals.map(formatInterval).join(' & '));
}
values['hours.summary'] = escapeHtml(summaryParts.join(' · '));   // & becomes &amp;

// "Τρίτη με Σάββατο": from the first open day of the week to the last one.
const openDays = DAYS.filter(d => site.hours[d.key].length > 0);
const firstDay = openDays[0];
const lastDay = openDays[openDays.length - 1];
values['hours.openDays'] = firstDay === lastDay ? firstDay.name : firstDay.name + ' με ' + lastDay.name;

// The hours for the "Ανοιχτά / Κλειστά" line. js/hours.js reads this from the
// data-open-status="..." attribute and works out the current status in the visitor's browser.
// Example: { "week": [{ "key": "Tue", "on": "την Τρίτη", "open": [["09:00", "14:00"]] }, ...],
//            "closures": [{ "from": "2026-12-24", "to": "2026-12-26", "open": [] }] }
const statusData = {
  week: DAYS.map(day => ({
    key: day.key,
    on: day.on,
    open: site.hours[day.key].map(interval => interval.split('-')),
  })),
  closures: closures.map(c => ({ from: c.from, to: c.to, open: c.open })),
};
values['hours.statusData'] = escapeHtml(JSON.stringify(statusData));

// The hours in JSON-LD (structured data for Google): one entry per group and time slot.
let hoursJson = [];
for (const group of openGroups) {
  const dayList = group.days.map(d => JSON.stringify(d.schema)).join(', ');
  for (const interval of group.intervals) {
    const [opens, closes] = interval.split('-');
    hoursJson.push('      { "@type": "OpeningHoursSpecification", "dayOfWeek": [' + dayList + '], '
      + '"opens": "' + opens + '", "closes": "' + closes + '" }');
  }
}
values['hours.jsonld'] = hoursJson.join(',\n');

// 2d. Holidays and special hours.
// The notice strip at the top of every page. Shows holidays that are on now, or start within
// NOTICE_DAYS_BEFORE days. Each line has data-until="...", so js/main.js can hide it the
// moment it has passed, even before the next build.
const noticeLimit = addDays(TODAY, NOTICE_DAYS_BEFORE);
const noticeItems = [];
for (const c of closures.filter(c => c.from <= noticeLimit)) {
  const dates = formatDateRange(c.from, c.to);
  const note = c.note === '' ? '' : ' (' + escapeHtml(c.note) + ')';
  let text;
  if (c.open.length === 0) {
    text = '<strong>Κλειστά</strong> ' + dates + note;
  } else {
    const hours = c.open.map(pair => pair.join('–')).join(', ');
    text = '<strong>' + dates + '</strong> ανοιχτά ' + hours + note;
  }
  noticeItems.push('<li data-until="' + c.to + '">' + text + '</li>');
}
// The value starts with a line break because the placeholder sits at the end of a line
// in src/partials/header.html; with no holidays it is empty and leaves no trace.
values['notice.html'] = noticeItems.length === 0 ? '' :
  '\n\n  <div class="notice theme-red" role="region" aria-label="Έκτακτες αλλαγές ωραρίου" data-notice>\n' +
  '    <ul role="list" class="wrap notice__list">\n' +
  noticeItems.map(item => '      ' + item).join('\n') + '\n' +
  '    </ul>\n' +
  '  </div>';

// Holidays in JSON-LD, so Google can show "Closed" on those days.
// A day that is closed all day is written as opens "00:00", closes "00:00".
let specialJson = [];
for (const c of closures) {
  const slots = c.open.length === 0 ? [['00:00', '00:00']] : c.open;
  for (const [opens, closes] of slots) {
    specialJson.push('      { "@type": "OpeningHoursSpecification", "validFrom": "' + c.from + '", '
      + '"validThrough": "' + c.to + '", "opens": "' + opens + '", "closes": "' + closes + '" }');
  }
}
values['hours.specialJsonld'] = specialJson.length === 0 ? '' :
  '    "specialOpeningHoursSpecification": [\n' + specialJson.join(',\n') + '\n    ],\n';

// 2e. Prices.
let lowest = Infinity;
let highest = -Infinity;
let boardRows = [];
let offersJson = [];
for (const id of Object.keys(site.prices)) {
  const item = site.prices[id];
  if (typeof item.price !== 'number' || typeof item.minutes !== 'number') {
    fail(DATA_FILE + ': prices.' + id + ' needs a numeric "price" and "minutes"');
  }
  lowest = Math.min(lowest, item.price);
  highest = Math.max(highest, item.price);

  // One row of the price board on prices.html.
  // The duration is shown as 30' and read out to screen readers as "30 λεπτά".
  boardRows.push(
    '            <li class="board__row">\n' +
    '              <span class="board__name">' + escapeHtml(item.name) + '</span>\n' +
    '              <span class="label board__dur"><span aria-hidden="true">' + item.minutes + '\'</span>' +
                     '<span class="visually-hidden">' + item.minutes + ' λεπτά</span></span>\n' +
    '              <span class="board__lead" aria-hidden="true"></span>\n' +
    '              <span class="display board__price">' + item.price + '&nbsp;€</span>\n' +
    '            </li>');

  // One offer in the JSON-LD.
  offersJson.push('        { "@type": "Offer", "price": "' + item.price + '", "priceCurrency": "EUR", '
    + '"itemOffered": { "@type": "Service", "name": ' + JSON.stringify(item.name) + ' } }');
}
values['prices.min'] = String(lowest);
values['prices.max'] = String(highest);
values['prices.board'] = boardRows.join('\n');
values['prices.jsonld'] = offersJson.join(',\n');

// ---------------------------------------------------------------------------
// Step 3: fill every page in src/ and keep the results in memory.
// ---------------------------------------------------------------------------
const pages = readdirSync('src').filter(file => file.endsWith('.html') || file.endsWith('.txt'));
const MENU = ['index', 'prices', 'work', 'visit'];   // the pages in the menu
const finished = {};   // file name -> finished text
let missing = [];      // placeholders that had no value

for (const file of pages) {
  let template = readFileSync('src/' + file, 'utf8');

  // 3a. Paste in the shared pieces: {{> footer}} is replaced by src/partials/footer.html.
  template = template.replace(/\{\{>\s*([\w-]+)\s*\}\}\n?/g, (match, name) => {
    const partialFile = 'src/partials/' + name + '.html';
    if (!existsSync(partialFile)) {
      missing.push('src/' + file + ': ' + match.trim() + ' (no file ' + partialFile + ')');
      return '';   // already reported, so don't leave it for step 3c to report again
    }
    return readFileSync(partialFile, 'utf8');
  });

  // 3b. Values that are different on every page.
  const pageValues = { ...values };   // a copy of the shared values
  const pageName = file.replace('.html', '');
  pageValues['page.url'] = site.website.url + (pageName === 'index' ? '' : file);
  for (const name of MENU) {
    // Marks the current page in the menu, e.g. <a href="prices.html" aria-current="page">
    pageValues['nav.' + name] = (name === pageName) ? ' aria-current="page"' : '';
  }

  // 3c. Replace each {{name}} with its value. Unknown names are collected as errors.
  let html = template.replace(/\{\{(.*?)\}\}/g, (match, name) => {
    name = name.trim();
    if (!(name in pageValues)) {
      missing.push('src/' + file + ': ' + match);
      return match;
    }
    return pageValues[name];
  });

  // A note at the top so nobody edits the generated file by mistake.
  html = html.replace('<!doctype html>',
    '<!doctype html>\n<!-- GENERATED FILE: edit src/' + file + ' and data/site.json, then run "npm run build". -->');

  finished[file] = html;
}

// 3d. sitemap.xml: the list of pages for Google (Search Console). The 404 page is left out.
const sitemapPages = pages.filter(file => file.endsWith('.html') && file !== '404.html');
finished['sitemap.xml'] =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapPages.map(file => '  <url><loc>' + site.website.url + (file === 'index.html' ? '' : file) + '</loc></url>').join('\n') +
  '\n</urlset>\n';

// ---------------------------------------------------------------------------
// Step 4: write everything, but only if there were no errors,
// so a broken build never overwrites the finished pages.
// ---------------------------------------------------------------------------
if (missing.length > 0) {
  fail('these placeholders have no value:\n  ' + missing.join('\n  '));
}
mkdirSync(OUT_DIR, { recursive: true });
for (const file of Object.keys(finished)) {
  writeFileSync(OUT_DIR + file, finished[file]);
}
console.log('Built ' + Object.keys(finished).join(', ') +
  (closures.length ? ' (' + closures.length + ' upcoming holiday(s), ' + noticeItems.length + ' in the notice)' : ''));
