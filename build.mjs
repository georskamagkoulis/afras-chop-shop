// build.mjs: builds the finished website pages.
//
// It reads data/site.json, fills every {{placeholder}} in src/*.html with a value,
// and writes the finished pages to the repo root, where GitHub Pages serves them.
//
// Run it with:  npm run build   (from the repo folder)
// It uses only Node's built-in "fs" module, so there is nothing to install.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// The seven days of the week, in order. The keys (Mon, Tue, ...) are the ones
// used in site.json and in the data-day="..." attributes that js/main.js reads.
// "schema" is the English name Google expects in the JSON-LD.
// ---------------------------------------------------------------------------
const DAYS = [
  { key: 'Mon', name: 'Δευτέρα',   short: 'Δευ', schema: 'Monday' },
  { key: 'Tue', name: 'Τρίτη',     short: 'Τρί', schema: 'Tuesday' },
  { key: 'Wed', name: 'Τετάρτη',   short: 'Τετ', schema: 'Wednesday' },
  { key: 'Thu', name: 'Πέμπτη',    short: 'Πέμ', schema: 'Thursday' },
  { key: 'Fri', name: 'Παρασκευή', short: 'Παρ', schema: 'Friday' },
  { key: 'Sat', name: 'Σάββατο',   short: 'Σάβ', schema: 'Saturday' },
  { key: 'Sun', name: 'Κυριακή',   short: 'Κυρ', schema: 'Sunday' },
];

// Stops the build with an error message. "npm run build" then fails visibly.
function fail(message) {
  console.error('BUILD FAILED: ' + message);
  process.exit(1);
}

// Makes text safe to put inside HTML (for example inside content="...").
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Turns "09:00-14:00" into "09:00–14:00" (with a proper en dash).
function formatInterval(interval) {
  return interval.replace('-', '–');
}

// ---------------------------------------------------------------------------
// Step 1: read and check the data file.
// ---------------------------------------------------------------------------
const site = JSON.parse(readFileSync('data/site.json', 'utf8'));

// Every day must exist in "hours", and every interval must look like "09:00-14:00".
for (const day of DAYS) {
  const intervals = site.hours[day.key];
  if (!Array.isArray(intervals)) {
    fail('data/site.json: hours.' + day.key + ' is missing (use [] for a closed day)');
  }
  for (const interval of intervals) {
    if (!/^\d\d:\d\d-\d\d:\d\d$/.test(interval)) {
      fail('data/site.json: hours.' + day.key + ' has "' + interval + '", expected a format like "09:00-14:00"');
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: build the "values" table: placeholder name -> text to put in the page.
// ---------------------------------------------------------------------------
const values = {};

// 2a. Every simple value in site.json becomes a placeholder automatically.
//     For example site.rating.count becomes {{rating.count}}, and
//     site.prices.haircut.price becomes {{prices.haircut.price}}.
//     Lists (like the hours) are skipped here; they are handled in 2c.
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
if (!site.website.url.endsWith('/')) fail('data/site.json: website.url must end with "/"');
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
if (openGroups.length === 0) fail('data/site.json: the shop is closed every day');

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

// 2d. Prices.
let lowest = Infinity;
let highest = -Infinity;
let boardRows = [];
let offersJson = [];
for (const id of Object.keys(site.prices)) {
  const item = site.prices[id];
  if (typeof item.price !== 'number' || typeof item.minutes !== 'number') {
    fail('data/site.json: prices.' + id + ' needs a numeric "price" and "minutes"');
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
// Step 3: fill every page in src/ and write it to the repo root.
// ---------------------------------------------------------------------------
const pages = readdirSync('src').filter(file => file.endsWith('.html'));
const MENU = ['index', 'prices', 'work', 'visit'];   // the pages in the menu
const finished = {};   // file name -> finished HTML
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

// Stop BEFORE writing anything, so a broken build never overwrites the live pages.
if (missing.length > 0) {
  fail('these placeholders have no value:\n  ' + missing.join('\n  '));
}
for (const file of pages) {
  writeFileSync(file, finished[file]);
}
console.log('Built ' + pages.length + ' pages: ' + pages.join(', '));
