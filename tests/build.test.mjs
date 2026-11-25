// Tests for build.mjs: it runs the real build into a temporary folder and checks the result.
// Run all tests with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const ROOT = new URL('..', import.meta.url).pathname;
const realData = JSON.parse(readFileSync(join(ROOT, 'data/site.json'), 'utf8'));
const PAGES = ['index.html', 'prices.html', 'work.html', 'visit.html', 'privacy.html', '404.html'];

// Runs "node build.mjs" with a data file and a pretend "today".
// Returns { ok, output, read(file), files }. The build runs as a separate process, like "npm run build".
function build(data, today = '2026-12-20') {
  const dir = mkdtempSync(join(tmpdir(), 'afras-build-'));
  const dataFile = join(dir, 'site.json');
  writeFileSync(dataFile, JSON.stringify(data));
  const out = join(dir, 'out');
  const result = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT,
    env: { ...process.env, SITE_DATA: dataFile, BUILD_TODAY: today, OUT_DIR: out },
    encoding: 'utf8',
  });
  let files = [];
  try { files = readdirSync(out); } catch { /* nothing was written */ }
  return {
    ok: result.status === 0,
    output: result.stdout + result.stderr,
    files,
    read: file => readFileSync(join(out, file), 'utf8'),
  };
}

// The same data with example holidays (the real site.json has none).
function withHolidays(closures) {
  return { ...realData, closures };
}
const EXAMPLE_HOLIDAYS = [
  { from: '2026-12-01', to: '2026-12-02', note: 'Already over' },
  { from: '2026-12-24', to: '2026-12-26', note: 'Χριστούγεννα' },
  { from: '31/12/2026', to: '31/12/2026', note: 'Παραμονή Πρωτοχρονιάς', hours: ['09:00-14:00'] },
  { from: '2027-03-01', to: '2027-03-01', note: 'Far away' },
];

// Reads the JSON-LD block of index.html as an object.
function jsonLd(html) {
  const text = html.split('<script type="application/ld+json">')[1].split('</script>')[0];
  return JSON.parse(text);
}

test('the real data builds every page, with no placeholders left', () => {
  const result = build(realData);
  assert.ok(result.ok, result.output);
  for (const file of [...PAGES, 'sitemap.xml', 'robots.txt']) {
    assert.ok(result.files.includes(file), file + ' was not built');
    assert.doesNotMatch(result.read(file), /\{\{|\}\}/, file + ' still has a {{placeholder}}');
  }
  assert.doesNotMatch(result.read('index.html'), /data-notice/, 'no holidays, so no notice strip');
  assert.ok(jsonLd(result.read('index.html')).openingHoursSpecification.length > 0);
});

test('meta descriptions show the same hours as the table on visit.html', () => {
  const result = build(realData);
  const visit = result.read('visit.html');
  const tableRanges = new Set();
  for (const m of visit.matchAll(/<th scope="row">.*?<\/th><td>(.*?)<\/td>/g)) {
    for (const range of m[1].split(', ')) if (range !== 'Κλειστά') tableRanges.add(range);
  }
  assert.ok(tableRanges.size > 0);
  for (const file of PAGES) {
    const html = result.read(file);
    for (const m of html.matchAll(/<meta (?:name="description"|property="og:description") content="(.*?)">/g)) {
      for (const range of m[1].match(/\d\d:\d\d–\d\d:\d\d/g) || []) {
        assert.ok(tableRanges.has(range), file + ': "' + range + '" in the meta is not in the hours table');
      }
    }
  }
});

test('sitemap and robots use the website address and leave out the 404 page', () => {
  const result = build(realData);
  const sitemap = result.read('sitemap.xml');
  assert.match(sitemap, new RegExp('<loc>' + realData.website.url + '</loc>'));
  assert.match(sitemap, /prices\.html/);
  assert.doesNotMatch(sitemap, /404/);
  assert.match(result.read('robots.txt'), new RegExp('Sitemap: ' + realData.website.url + 'sitemap.xml'));
});

test('holidays: notice strip, JSON-LD and the data for "Ανοιχτά / Κλειστά"', () => {
  const result = build(withHolidays(EXAMPLE_HOLIDAYS), '2026-12-20');
  assert.ok(result.ok, result.output);
  const index = result.read('index.html');

  // The notice is on every page, with Christmas and New Year's Eve...
  for (const file of ['index.html', 'prices.html', 'work.html', 'visit.html', 'privacy.html']) {
    assert.match(result.read(file), /data-notice/, file + ' has no notice strip');
  }
  assert.match(index, /<strong>Κλειστά<\/strong> 24–26 Δεκεμβρίου \(Χριστούγεννα\)/);
  assert.match(index, /<strong>Πέμπτη 31 Δεκεμβρίου<\/strong> ανοιχτά 09:00–14:00 \(Παραμονή Πρωτοχρονιάς\)/);
  // ...but not the holiday that is over, nor the one that is more than 3 weeks away.
  assert.doesNotMatch(index, /Already over/);
  assert.doesNotMatch(index, /Far away/);

  // Google gets every upcoming holiday (the far one too), but not the one that is over.
  const special = jsonLd(index).specialOpeningHoursSpecification;
  assert.deepEqual(special.map(s => s.validFrom), ['2026-12-24', '2026-12-31', '2027-03-01']);
  assert.equal(special[0].opens, '00:00');   // closed all day
  assert.equal(special[1].closes, '14:00');

  // The browser gets the holidays for the "Ανοιχτά / Κλειστά" line.
  const attr = index.match(/data-open-status="(.*?)"/)[1].replaceAll('&quot;', '"');
  assert.equal(JSON.parse(attr).closures.length, 3);
});

test('a holiday that ends before it starts stops the build, and nothing is written', () => {
  const result = build(withHolidays([{ from: '2026-12-26', to: '2026-12-24', note: 'Backwards' }]));
  assert.equal(result.ok, false);
  assert.match(result.output, /ends \(2026-12-24\) before it starts/);
  assert.deepEqual(result.files, []);
});

test('a broken data file stops the build with a clear message', () => {
  const result = build({ ...realData, hours: { ...realData.hours, Tue: ['9-14'] } });
  assert.equal(result.ok, false);
  assert.match(result.output, /hours\.Tue/);
  assert.deepEqual(result.files, []);
});

test('holidays from a Google Sheet (CSV) are added; a missing sheet stops the build', async () => {
  // A tiny local web server that plays the part of Google Sheets.
  const csv = 'Από,Έως,Σημείωση,Ώρες\n24/12/2026,26/12/2026,"Χριστούγεννα, με την οικογένεια",\n';
  const server = http.createServer((req, res) => {
    if (req.url === '/holidays.csv') { res.end(csv); } else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    // spawnSync would block this process (and the server in it), so run the build asynchronously.
    const runBuild = sheetUrl => new Promise(resolve => {
      const dir = mkdtempSync(join(tmpdir(), 'afras-sheet-'));
      const dataFile = join(dir, 'site.json');
      writeFileSync(dataFile, JSON.stringify({ ...realData, closures: [], closuresSheetCsv: sheetUrl }));
      import('node:child_process').then(({ execFile }) => {
        execFile(process.execPath, ['build.mjs'], {
          cwd: ROOT, env: { ...process.env, SITE_DATA: dataFile, BUILD_TODAY: '2026-12-20', OUT_DIR: join(dir, 'out') },
        }, (error, stdout, stderr) => resolve({ ok: !error, output: stdout + stderr, dir }));
      });
    });

    const good = await runBuild(base + '/holidays.csv');
    assert.ok(good.ok, good.output);
    const index = readFileSync(join(good.dir, 'out', 'index.html'), 'utf8');
    assert.match(index, /<strong>Κλειστά<\/strong> 24–26 Δεκεμβρίου \(Χριστούγεννα, με την οικογένεια\)/);

    const missing = await runBuild(base + '/does-not-exist.csv');
    assert.equal(missing.ok, false);
    assert.match(missing.output, /holidays sheet could not be downloaded/);
  } finally {
    server.close();
  }
});
