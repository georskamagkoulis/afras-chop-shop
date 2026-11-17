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
    var canAuto = !reduce && !saveData;
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

  /* 4. Let iOS Safari apply :active on tap (stripe flash on the Book buttons). */
  document.addEventListener('touchstart', function () {}, { passive: true });
})();
