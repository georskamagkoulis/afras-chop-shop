/* Afra's Chop Shop: progressive enhancement only. Without this file the page is complete:
   no "today" highlight, and the sticky booking bar simply stays visible. */
(function () {
  'use strict';

  /* 1. Highlight today's row in the hours table (Europe/Athens time). */
  var table = document.querySelector('[data-hours]');
  if (table && window.Intl && Intl.DateTimeFormat) {
    try {
      var day = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Athens', weekday: 'short' }).format(new Date());
      if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(day)) {
        var row = table.querySelector('tr[data-day="' + day + '"]');
        var cell = row && row.querySelector('th');
        if (cell) {
          row.classList.add('is-today');
          var note = document.createElement('span');
          note.className = 'visually-hidden';
          note.textContent = ' (σήμερα)';
          cell.appendChild(note);
        }
      }
    } catch (e) {
      /* Time zone not supported: leave the table without a highlight. */
    }
  }

  /* 2. Sticky booking bar: hidden while the hero Book button, the red band or the footer is visible. */
  var bar = document.querySelector('[data-bookbar]');
  var targets = document.querySelectorAll('[data-hide-bar]');
  if (bar && targets.length && 'IntersectionObserver' in window) {
    var visible = [];
    bar.classList.add('is-hidden');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var i = visible.indexOf(entry.target);
        if (entry.isIntersecting && i === -1) visible.push(entry.target);
        if (!entry.isIntersecting && i !== -1) visible.splice(i, 1);
      });
      bar.classList.toggle('is-hidden', visible.length > 0);
    });
    Array.prototype.forEach.call(targets, function (t) { io.observe(t); });
  }

  /* 3. Hero video (v4). No src in the HTML; the poster is the LCP image. Autoplay (muted) only without
        reduced motion and Save-Data, with src set after window load. Otherwise poster + play toggle.
        A user pause is never auto-resumed; the video pauses while the hero is off-screen. */
  var box = document.querySelector('[data-video]');
  var video = box && box.querySelector('video');
  var toggle = box && box.querySelector('.video__toggle');
  var src = video && video.getAttribute('data-src');
  if (box && video && toggle && src) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var canAuto = !saveData;
    var userPaused = false;
    var onScreen = true;

    var setState = function (state) {
      box.setAttribute('data-state', state);
      toggle.setAttribute('aria-label', toggle.getAttribute(state === 'playing' ? 'data-label-pause' : 'data-label-play'));
    };
    var play = function () {
      if (!video.getAttribute('src')) video.setAttribute('src', src);
      video.muted = true;
      var p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          canAuto = false;
          if (video.paused) setState('poster');
        });
      }
    };

    video.addEventListener('playing', function () { setState('playing'); });
    video.addEventListener('pause', function () {
      if (box.getAttribute('data-state') === 'playing') setState('paused');
    });

    toggle.hidden = false;
    setState('poster');
    toggle.addEventListener('click', function () {
      if (!video.paused) {
        userPaused = true;
        video.pause();
      } else {
        userPaused = false;
        play();
      }
    });

     if (canAuto) {
      play();
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          onScreen = e.isIntersecting;
          if (!onScreen && !video.paused) video.pause();
          else if (onScreen && canAuto && !userPaused && video.paused && video.getAttribute('src')) play();
        });
      }).observe(box);
    }

    if (canAuto) {
      var start = function () { if (onScreen && !userPaused) play(); };
      if (document.readyState === 'complete') start();
      else window.addEventListener('load', start);
    }
  }
  (() => {
  const clipper = document.getElementById('clipper');
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!clipper || !canHover) return;
 
  document.addEventListener('mousemove', (e) => {
 document.documentElement.classList.add('has-clipper');
  clipper.style.transform =
    `translate(${e.clientX - 9}px, ${e.clientY}px) rotate(20deg)`;
  clipper.classList.add('is-visible');
});

  document.addEventListener('mouseover', (e) => {
    clipper.classList.toggle('is-hidden', !!e.target.closest('a, button'));
  });

  document.addEventListener('mouseleave', () => clipper.classList.remove('is-visible'));
  document.addEventListener('mousedown',  () => clipper.classList.add('is-buzzing'));
  document.addEventListener('mouseup',    () => clipper.classList.remove('is-buzzing'));
})();
  /* 4. "Ανοιχτά · κλείνει στις 14:00" / "Κλειστά · ανοίγει αύριο στις 09:00".
        The hours come from data/site.json (build.mjs puts them in data-open-status="...").
        Uses Greek time (Europe/Athens), whatever the visitor's own time zone is. */
  var statusEls = document.querySelectorAll('[data-open-status]');
  if (statusEls.length && window.Intl && Intl.DateTimeFormat) {
    try {
      var week = JSON.parse(statusEls[0].getAttribute('data-open-status'));
      var athens = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Athens', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });

      // "14:30" -> 870 (minutes since midnight), so times can be compared as numbers.
      var toMinutes = function (time) {
        return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      };

      // Works out the sentence to show right now.
      var statusText = function () {
        var parts = {};
        athens.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
        var now = Number(parts.hour) * 60 + Number(parts.minute);
        var todayIndex = week.map(function (d) { return d.key; }).indexOf(parts.weekday);
        var today = week[todayIndex];

        // Open right now? Then say when we close.
        for (var i = 0; i < today.open.length; i++) {
          if (now >= toMinutes(today.open[i][0]) && now < toMinutes(today.open[i][1])) {
            return { open: true, word: 'Ανοιχτά', rest: 'κλείνει στις ' + today.open[i][1] };
          }
        }
        // Closed: is there a later opening today (e.g. after the lunch break)?
        for (var j = 0; j < today.open.length; j++) {
          if (toMinutes(today.open[j][0]) > now) {
            return { open: false, word: 'Κλειστά', rest: 'ανοίγει σήμερα στις ' + today.open[j][0] };
          }
        }
        // Otherwise look at the next days, one by one.
        for (var k = 1; k <= 7; k++) {
          var day = week[(todayIndex + k) % 7];
          if (day.open.length > 0) {
            var when = (k === 1) ? 'αύριο' : day.on;
            return { open: false, word: 'Κλειστά', rest: 'ανοίγει ' + when + ' στις ' + day.open[0][0] };
          }
        }
        return null;   // closed every day: show nothing
      };

      var showStatus = function () {
        var status = statusText();
        Array.prototype.forEach.call(statusEls, function (el) {
          el.textContent = '';
          if (status) {
            // <span><strong>Ανοιχτά</strong> · κλείνει στις 14:00</span>
            var text = document.createElement('span');
            var strong = document.createElement('strong');
            strong.textContent = status.word;
            text.appendChild(strong);
            text.appendChild(document.createTextNode(' · ' + status.rest));
            el.appendChild(text);
          }
          el.classList.toggle('is-open', !!(status && status.open));
        });
      };
      showStatus();
      setInterval(showStatus, 60 * 1000);   // keep it right if the page stays open
    } catch (e) {
      /* Something unexpected: leave the line empty; the full hours are on the page anyway. */
    }
  }

  /* 5. Visitor statistics (GoatCounter, no cookies). Only runs when the page has
        <meta name="goatcounter" content="...">, which build.mjs adds once
        analytics.goatcounterCode is set in data/site.json. Each count is a tiny image
        request, which the page's Content-Security-Policy allows for that address only. */
  var counter = document.querySelector('meta[name="goatcounter"]');
  if (counter && location.protocol === 'https:') {
    var endpoint = counter.getAttribute('content');
    var count = function (path, title, isEvent) {
      var url = endpoint +
        '?p=' + encodeURIComponent(path) +
        '&t=' + encodeURIComponent(title) +
        (isEvent ? '&e=true' : '&r=' + encodeURIComponent(document.referrer)) +
        '&s=' + encodeURIComponent(screen.width + ',' + screen.height + ',' + (window.devicePixelRatio || 1)) +
        '&rnd=' + Math.random().toString(36).slice(2);
      new Image().src = url;
    };

    // One page view.
    count(location.pathname, document.title, false);

    // Clicks that matter to the shop, counted as named events.
    var clickName = function (href) {
      if (href.indexOf('tel:') === 0) return 'Κλικ: Τηλέφωνο';
      if (href.indexOf('setmore.com/book') !== -1) return 'Κλικ: Κλείσε ώρα';
      if (href.indexOf('setmore.com') !== -1) return 'Κλικ: Κριτικές Setmore';
      if (href.indexOf('google.com/maps') !== -1) return 'Κλικ: Οδηγίες χάρτη';
      if (href.indexOf('instagram.com') !== -1) return 'Κλικ: Instagram';
      if (href.indexOf('tiktok.com') !== -1) return 'Κλικ: TikTok';
      return null;
    };
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href]');
      var name = link && clickName(link.getAttribute('href'));
      if (name) count(name, name, true);
    });
  }
})();
