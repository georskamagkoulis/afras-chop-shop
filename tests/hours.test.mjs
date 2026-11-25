// Tests for js/hours.js: the "Ανοιχτά / Κλειστά" line. Run all tests with:  npm test
//
// js/hours.js is a plain browser script (not a Node module), so we run it inside a small
// separate "sandbox" with Node's vm module and then call the openStatus function it defines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DAYS, weekdayIndex } from '../build-helpers.mjs';

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../js/hours.js', import.meta.url), 'utf8'), sandbox);
const openStatus = sandbox.openStatus;

// The weekly hours from the real data file, in the same shape build.mjs produces.
const site = JSON.parse(readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const week = DAYS.map(day => ({ key: day.key, on: day.on, open: site.hours[day.key].map(i => i.split('-')) }));

// "2026-11-24", "10:00" -> the "now" object openStatus expects
function at(date, time) {
  return { date, dayIndex: weekdayIndex(date), minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) };
}
// The sentence the visitor sees, e.g. "Ανοιχτά · κλείνει στις 14:00"
function sentence(data, date, time) {
  const s = openStatus(data, at(date, time));
  return s.word + ' · ' + s.rest;
}

test('normal week (no holidays)', () => {
  const data = { week, closures: [] };
  const cases = [
    ['2026-11-24', '10:00', 'Ανοιχτά · κλείνει στις 14:00'],              // Tuesday morning
    ['2026-11-24', '13:59', 'Ανοιχτά · κλείνει στις 14:00'],
    ['2026-11-24', '14:00', 'Κλειστά · ανοίγει σήμερα στις 17:00'],       // lunch break
    ['2026-11-24', '08:30', 'Κλειστά · ανοίγει σήμερα στις 09:00'],       // before opening
    ['2026-11-24', '20:59', 'Ανοιχτά · κλείνει στις 21:00'],
    ['2026-11-24', '21:00', 'Κλειστά · ανοίγει αύριο στις 09:00'],        // Tuesday night -> Wednesday
    ['2026-11-25', '14:15', 'Ανοιχτά · κλείνει στις 14:30'],              // Wednesday (short day)
    ['2026-11-25', '14:30', 'Κλειστά · ανοίγει αύριο στις 09:00'],
    ['2026-11-28', '15:00', 'Ανοιχτά · κλείνει στις 16:00'],              // Saturday
    ['2026-11-28', '16:00', 'Κλειστά · ανοίγει την Τρίτη στις 09:00'],    // Saturday -> skips Sunday, Monday
    ['2026-11-29', '12:00', 'Κλειστά · ανοίγει την Τρίτη στις 09:00'],    // Sunday
    ['2026-11-30', '23:59', 'Κλειστά · ανοίγει αύριο στις 09:00'],        // Monday -> Tuesday
    ['2026-12-01', '00:00', 'Κλειστά · ανοίγει σήμερα στις 09:00'],       // just after midnight
  ];
  for (const [date, time, expected] of cases) {
    assert.equal(sentence(data, date, time), expected, date + ' ' + time);
  }
  assert.equal(openStatus(data, at('2026-11-24', '10:00')).open, true);
  assert.equal(openStatus(data, at('2026-11-24', '14:00')).open, false);
});

test('holidays and special hours win over the normal week', () => {
  const data = {
    week,
    closures: [
      { from: '2026-12-24', to: '2026-12-26', open: [] },                    // Christmas, closed
      { from: '2026-12-31', to: '2026-12-31', open: [['09:00', '14:00']] },  // New Year's Eve, mornings only
      { from: '2027-01-05', to: '2027-01-20', open: [] },                    // long break
    ],
  };
  const cases = [
    ['2026-12-23', '15:00', 'Κλειστά · ανοίγει την Τρίτη στις 09:00'],      // Wed after closing; Thu-Sat are holidays
    ['2026-12-24', '10:00', 'Κλειστά · ανοίγει την Τρίτη στις 09:00'],      // a Thursday that is a holiday
    ['2026-12-31', '13:00', 'Ανοιχτά · κλείνει στις 14:00'],                 // special hours
    ['2026-12-31', '18:00', 'Κλειστά · ανοίγει αύριο στις 09:00'],           // normally open at 18:00, not today
    ['2027-01-02', '17:00', 'Κλειστά · ανοίγει την Πέμπτη 21/1 στις 09:00'], // over a week away: shows the date
  ];
  for (const [date, time, expected] of cases) {
    assert.equal(sentence(data, date, time), expected, date + ' ' + time);
  }
});

test('nothing to show when the shop never opens', () => {
  const closedWeek = week.map(day => ({ ...day, open: [] }));
  assert.equal(openStatus({ week: closedWeek, closures: [] }, at('2026-11-24', '10:00')), null);
});
