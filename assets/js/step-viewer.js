/* ==========================================================================
   Step viewer — turns a run of screenshots into one click-through panel.

   Markup (progressive enhancement — with JS off every figure just renders
   stacked, exactly as a plain screenshot run always did):

     <div class="fn-steps">
       <figure class="fn-step" data-title="Short label">
         <img src="…" alt="…" loading="lazy" decoding="async">
         <figcaption>…</figcaption>
       </figure>
       …
     </div>

   This script moves the figures into a stage, builds the chrome (counter,
   prev / play / next, numbered rail, progress meter) and shows one at a time.
   ========================================================================== */
(function () {
  'use strict';

  var DWELL = 7000; // ms a step holds while auto-advancing
  var ICON = {
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true" class="fn-steps__glyph-play"><path d="M5 3.2v9.6L13 8z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true" class="fn-steps__glyph-pause"><path d="M5 3h2.2v10H5zM8.8 3H11v10H8.8z"/></svg>'
  };

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function build(root) {
    var figures = Array.prototype.slice.call(root.querySelectorAll('.fn-step'));
    if (figures.length < 2) return;

    var total = figures.length;
    var index = 0;
    var timer = null;
    var playing = false;
    var stopped = false; // user took over, or the run finished — never auto-start again
    var visible = false;

    var bar = document.createElement('div');
    bar.className = 'fn-steps__bar';
    bar.innerHTML =
      '<span class="fn-steps__count"><b>1</b><i>/' + total + '</i></span>' +
      '<span class="fn-steps__title" aria-live="polite"></span>' +
      '<span class="fn-steps__nav">' +
      '<button type="button" class="fn-steps__btn" data-act="prev" aria-label="Previous step">' + ICON.prev + '</button>' +
      '<button type="button" class="fn-steps__btn fn-steps__btn--play" data-act="play" aria-label="Play these steps automatically">' + ICON.play + '</button>' +
      '<button type="button" class="fn-steps__btn" data-act="next" aria-label="Next step">' + ICON.next + '</button>' +
      '</span>' +
      '<span class="fn-steps__meter"><i></i></span>';

    var stage = document.createElement('div');
    stage.className = 'fn-steps__stage';
    stage.tabIndex = 0;
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-roledescription', 'step viewer');
    stage.setAttribute('aria-label', 'Setup screenshots, ' + total + ' steps');

    /* The caption moves out of the <figure> and below the stage: the stage is
       click-to-advance, and text you might want to read or select must not be. */
    var caps = document.createElement('div');
    caps.className = 'fn-steps__caps';
    var captions = figures.map(function (fig) {
      var source = fig.querySelector('figcaption');
      var cap = document.createElement('p');
      cap.className = 'fn-steps__cap';
      if (source) {
        cap.innerHTML = source.innerHTML;
        source.remove();
      }
      caps.appendChild(cap);
      stage.appendChild(fig);
      return cap;
    });
    stage.insertAdjacentHTML('beforeend', '<span class="fn-steps__hint" aria-hidden="true">click for the next step</span>');

    var rail = document.createElement('ol');
    rail.className = 'fn-steps__rail';
    figures.forEach(function (fig, i) {
      var li = document.createElement('li');
      var label = fig.getAttribute('data-title') || 'Step ' + (i + 1);
      li.innerHTML = '<button type="button" data-go="' + i + '" title="' + label.replace(/"/g, '&quot;') + '">' + (i + 1) + '</button>';
      rail.appendChild(li);
    });

    root.appendChild(bar);
    root.appendChild(stage);
    root.appendChild(caps);
    root.appendChild(rail);
    root.classList.add('is-ready');

    var counter = bar.querySelector('.fn-steps__count b');
    var title = bar.querySelector('.fn-steps__title');
    var playBtn = bar.querySelector('[data-act="play"]');
    var meter = bar.querySelector('.fn-steps__meter i');
    var dots = Array.prototype.slice.call(rail.querySelectorAll('button'));

    /* Hidden figures are display:none, so their lazy images are never fetched
       until shown. Warming the neighbour keeps the next click instant. */
    function warm(i) {
      var fig = figures[i];
      if (!fig) return;
      var img = fig.querySelector('img');
      if (!img) return;
      var pre = new Image();
      pre.src = img.getAttribute('src');
    }

    function render() {
      figures.forEach(function (fig, i) { fig.hidden = i !== index; });
      captions.forEach(function (cap, i) { cap.hidden = i !== index; });
      dots.forEach(function (dot, i) {
        var on = i === index;
        dot.classList.toggle('is-on', on);
        dot.classList.toggle('is-seen', i < index);
        if (on) { dot.setAttribute('aria-current', 'step'); } else { dot.removeAttribute('aria-current'); }
      });
      counter.textContent = index + 1;
      title.textContent = figures[index].getAttribute('data-title') || '';
      root.classList.toggle('is-last', index === total - 1);
      warm(index + 1);
      warm(index - 1);
    }

    function go(next, byUser) {
      if (next < 0 || next > total - 1) return;
      index = next;
      render();
      if (byUser) { halt(); }
      else { restartMeter(); }
    }

    function restartMeter() {
      meter.style.animation = 'none';
      /* force reflow so the animation restarts from 0 on every step */
      void meter.offsetWidth;
      meter.style.animation = '';
    }

    function tick() {
      if (index >= total - 1) { halt(); return; }
      go(index + 1, false);
      timer = window.setTimeout(tick, DWELL);
    }

    function play(auto) {
      if (playing || stopped) return;
      if (index >= total - 1) { index = 0; render(); }
      playing = true;
      root.classList.add('is-playing');
      playBtn.innerHTML = ICON.pause;
      playBtn.setAttribute('aria-label', 'Pause');
      if (!auto) { stopped = false; }
      restartMeter();
      timer = window.setTimeout(tick, DWELL);
    }

    /* Pause but stay resumable — used for hover and tab-away. */
    function suspend() {
      if (!playing) return;
      window.clearTimeout(timer);
      timer = null;
      root.classList.add('is-suspended');
    }

    function resume() {
      if (!playing || timer) return;
      root.classList.remove('is-suspended');
      restartMeter();
      timer = window.setTimeout(tick, DWELL);
    }

    /* Stop for good: the run finished, or the reader took the controls. */
    function halt() {
      window.clearTimeout(timer);
      timer = null;
      playing = false;
      stopped = true;
      root.classList.remove('is-playing', 'is-suspended');
      playBtn.innerHTML = ICON.play;
      playBtn.setAttribute('aria-label', 'Play these steps automatically');
    }

    bar.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'prev') { go(index - 1, true); }
      if (act === 'next') { go(index + 1, true); }
      if (act === 'play') {
        if (playing) { halt(); }
        else { stopped = false; play(false); }
      }
    });

    rail.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-go]');
      if (btn) { go(Number(btn.getAttribute('data-go')), true); }
    });

    stage.addEventListener('click', function (event) {
      if (event.target.closest('a')) return;
      if (index === total - 1) { go(0, true); } else { go(index + 1, true); }
    });

    stage.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1, true); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1, true); }
      if (event.key === 'Home') { event.preventDefault(); go(0, true); }
      if (event.key === 'End') { event.preventDefault(); go(total - 1, true); }
    });

    root.addEventListener('mouseenter', suspend);
    root.addEventListener('mouseleave', resume);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { suspend(); } else if (visible) { resume(); }
    });

    /* Auto step move: a viewer starts itself once it is properly on screen and
       stops as soon as it scrolls away, so only what you are looking at runs. */
    if (window.IntersectionObserver && !reduceMotion()) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting && entry.intersectionRatio > 0.55;
          if (!visible) { suspend(); }
          else if (playing) { resume(); } /* scrolled back in — pick up where it paused */
          else { play(true); }
        });
      }, { threshold: [0, 0.55, 1] }).observe(root);
    }

    render();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.fn-steps'), build);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
