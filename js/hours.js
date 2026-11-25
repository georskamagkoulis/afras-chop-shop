/* Afra's Chop Shop: opening-hours calculations.
   Used by js/main.js in the browser and by tests/hours.test.mjs in Node.
   No page elements here, only plain calculations, so the tests can check them easily.

   "data" comes from build.mjs (data-open-status="..."):
     { week: [ { key: "Mon", on: "τη Δευτέρα", open: [["09:00", "14:00"], ...] }, ... 7 days, Monday first ],
       closures: [ { from: "2026-12-24", to: "2026-12-26", open: [] }, ... ] }
   "now" is the current time in Greece:
     { date: "2026-11-24", dayIndex: 1, minutes: 600 }   (dayIndex 0 = Monday; 600 = 10:00) */

/* "14:30" -> 870 (minutes since midnight), so times can be compared as numbers. */
function hoursToMinutes(time) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/* "2026-12-30" plus 3 days -> "2027-01-02" (works across months and years). */
function hoursAddDays(dateText, days) {
  var p = dateText.split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + days)).toISOString().slice(0, 10);
}

/* The opening hours of one date. A holiday or special-hours entry wins over the normal week. */
function hoursForDate(data, dateText, dayIndex) {
  for (var i = 0; i < data.closures.length; i++) {
    var c = data.closures[i];
    if (dateText >= c.from && dateText <= c.to) return c.open;   // [] means closed that day
  }
  return data.week[dayIndex].open;
}

/* Works out what to show right now. Returns null if the shop never opens in the next 60 days.
   { open: true,  word: "Ανοιχτά", rest: "κλείνει στις 14:00" }
   { open: false, word: "Κλειστά", rest: "ανοίγει αύριο στις 09:00" } */
function openStatus(data, now) {
  var today = hoursForDate(data, now.date, now.dayIndex);

  // Open right now? Then say when we close.
  for (var i = 0; i < today.length; i++) {
    if (now.minutes >= hoursToMinutes(today[i][0]) && now.minutes < hoursToMinutes(today[i][1])) {
      return { open: true, word: 'Ανοιχτά', rest: 'κλείνει στις ' + today[i][1] };
    }
  }
  // Closed: is there a later opening today (e.g. after the lunch break)?
  for (var j = 0; j < today.length; j++) {
    if (hoursToMinutes(today[j][0]) > now.minutes) {
      return { open: false, word: 'Κλειστά', rest: 'ανοίγει σήμερα στις ' + today[j][0] };
    }
  }
  // Otherwise look at the next days, one by one (holidays can make the gap long).
  for (var k = 1; k <= 60; k++) {
    var date = hoursAddDays(now.date, k);
    var dayIndex = (now.dayIndex + k) % 7;
    var hours = hoursForDate(data, date, dayIndex);
    if (hours.length > 0) {
      var when;
      if (k === 1) {
        when = 'αύριο';
      } else if (k < 7) {
        when = data.week[dayIndex].on;                      // "την Τρίτη"
      } else {
        var p = date.split('-');                            // more than a week away: add the date
        when = data.week[dayIndex].on + ' ' + Number(p[2]) + '/' + Number(p[1]);   // "την Τρίτη 6/1"
      }
      return { open: false, word: 'Κλειστά', rest: 'ανοίγει ' + when + ' στις ' + hours[0][0] };
    }
  }
  return null;
}

/* In the browser, openStatus above is already available to js/main.js. Other places that load this
   file as a module (the chatbot in chatbot/, the tests) find it here, on the shared global object. */
globalThis.openStatus = openStatus;
