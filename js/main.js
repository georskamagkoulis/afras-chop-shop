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

  /* 3. Promo video. No src in the HTML. Autoplay (muted) only without reduced motion and Save-Data;
        otherwise poster + play button. The toggle is always visible; a user pause is never auto-resumed.
        Skipped while the block is still `hidden` (assets not encoded yet). */
  var wrap = document.querySelector('[data-video-wrap]');
  var box = wrap && !wrap.hidden ? wrap.querySelector('[data-video]') : null;
  if (box) {
    var video = box.querySelector('video');
    var toggle = box.querySelector('.video__toggle');
    var src = video && video.getAttribute('data-src');
    if (video && toggle && src) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var saveData = !!(navigator.connection && navigator.connection.saveData);
      var canAuto = !reduce && !saveData && 'IntersectionObserver' in window;
      var userPaused = false;

      var setState = function (state) {
        box.setAttribute('data-state', state);
        toggle.setAttribute('aria-label', toggle.getAttribute(state === 'playing' ? 'data-label-pause' : 'data-label-play'));
      };
      var load = function () {
        if (!video.getAttribute('src')) video.setAttribute('src', src);
      };
      var play = function () {
        load();
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
        /* Lazy src: only once the frame is within 200px of the viewport. */
        var near = new IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) {
            load();
            near.disconnect();
          }
        }, { rootMargin: '200px' });
        near.observe(box);

        /* Play at 50% visible, pause when it leaves. */
        var seen = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.intersectionRatio >= 0.5) {
              if (canAuto && !userPaused && video.paused) play();
            } else if (!e.isIntersecting && !video.paused) {
              video.pause();
            }
          });
        }, { threshold: [0, 0.5] });
        seen.observe(box);
      }
    }
  }

  /* 4. Let iOS Safari apply :active on tap (stripe flash on the Book buttons). */
  document.addEventListener('touchstart', function () {}, { passive: true });
})();
