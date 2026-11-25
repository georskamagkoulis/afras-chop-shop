// Tests for build-helpers.mjs. Run all tests with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate, addDays, weekdayIndex, formatDateRange, parseCsv, closuresFromSheetRows, checkInterval,
} from '../build-helpers.mjs';

test('normalizeDate accepts both date styles and rejects impossible dates', () => {
  assert.equal(normalizeDate('2026-12-24'), '2026-12-24');
  assert.equal(normalizeDate('24/12/2026'), '2026-12-24');
  assert.equal(normalizeDate('1/1/2027'), '2027-01-01');
  assert.equal(normalizeDate(' 2026-2-3 '), '2026-02-03');
  assert.equal(normalizeDate('31/02/2026'), null);   // there is no 31 February
  assert.equal(normalizeDate('αύριο'), null);
  assert.equal(normalizeDate(''), null);
});

test('addDays and weekdayIndex work across months and years', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');   // leap year
  assert.equal(weekdayIndex('2026-11-24'), 1);             // Tuesday (0 = Monday)
  assert.equal(weekdayIndex('2026-11-29'), 6);             // Sunday
});

test('formatDateRange writes Greek dates', () => {
  assert.equal(formatDateRange('2026-12-24', '2026-12-24'), 'Πέμπτη 24 Δεκεμβρίου');
  assert.equal(formatDateRange('2026-12-24', '2026-12-26'), '24–26 Δεκεμβρίου');
  assert.equal(formatDateRange('2026-12-30', '2027-01-02'), '30 Δεκεμβρίου – 2 Ιανουαρίου');
});

test('checkInterval finds bad time slots', () => {
  assert.equal(checkInterval('09:00-14:00'), null);
  assert.match(checkInterval('9-14'), /should look like/);
  assert.match(checkInterval('14:00-09:00'), /after the opening time/);
});

test('parseCsv handles quotes, commas inside quotes and Windows line endings', () => {
  const csv = 'Από,Έως,Σημείωση,Ώρες\r\n24/12/2026,26/12/2026,"Χριστούγεννα, οικογένεια",\r\n"31/12/2026",,"Λέμε ""Χρόνια πολλά""",09:00-14:00\r\n';
  assert.deepEqual(parseCsv(csv), [
    ['Από', 'Έως', 'Σημείωση', 'Ώρες'],
    ['24/12/2026', '26/12/2026', 'Χριστούγεννα, οικογένεια', ''],
    ['31/12/2026', '', 'Λέμε "Χρόνια πολλά"', '09:00-14:00'],
  ]);
});

test('closuresFromSheetRows skips the header and empty rows, and reads the hours', () => {
  const rows = [
    ['Από', 'Έως', 'Σημείωση', 'Ώρες'],
    ['24/12/2026', '26/12/2026', 'Χριστούγεννα', ''],
    ['', '', '', ''],
    ['31/12/2026', '', 'Παραμονή', '09:00-14:00, 17:00-19:00'],
  ];
  assert.deepEqual(closuresFromSheetRows(rows), [
    { from: '24/12/2026', to: '26/12/2026', note: 'Χριστούγεννα', hours: [] },
    { from: '31/12/2026', to: '31/12/2026', note: 'Παραμονή', hours: ['09:00-14:00', '17:00-19:00'] },
  ]);
});
