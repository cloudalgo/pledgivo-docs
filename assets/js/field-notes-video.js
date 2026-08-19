/* Field Notes — the overview film's player.
 *
 * doc: Replaces the browser's native <video> controls on the landing page with
 * a player built out of this theme's own tokens. The native bar is a slab of
 * Chrome-grey with a blue accent dropped into the middle of a page that is
 * paper, ink and one printer's red — and it cannot show chapters, which is the
 * one thing an 89-second overview actually needs.
 *
 * doc: Nothing here is required for the film to play. The markup ships with
 * `controls` and a working chapter list; this file removes the native controls
 * only once it has successfully built its own, so a reader with no JavaScript
 * (or a parse error in this file) keeps a fully usable video rather than a
 * frame with no way to start it.
 *
 * doc: Upgrades every `.fn-vp[data-chapters]` on the page, so a second film on
 * some future page needs markup and nothing else. The chapter list is found by
 * walking up to the enclosing `.fn-film`, which keeps the two associated
 * without an id to keep in sync.
 */
(function () {
  'use strict';

  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
    loud: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4zm11.5 3a4 4 0 0 0-2.2-3.6v7.2A4 4 0 0 0 15.5 12z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9H4zm15.5 3 2.2-2.2-1.3-1.3-2.2 2.2-2.2-2.2-1.3 1.3 2.2 2.2-2.2 2.2 1.3 1.3 2.2-2.2 2.2 2.2 1.3-1.3z"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z"/></svg>'
  };

  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function buildPlayer(root) {
    var video = root.querySelector('video');
    if (!video) return null;

    var chapters;
    try {
      chapters = JSON.parse(root.getAttribute('data-chapters') || '[]');
    } catch (e) {
      chapters = [];
    }

    // doc: The disc's label names the film it starts, because a page can hold
    // more than one player and "Play" alone tells a screen-reader listener
    // nothing about which. `data-play-label` on the frame supplies it; the
    // landing film's markup omits the attribute and keeps the original wording.
    var playLabel = root.getAttribute('data-play-label') || 'Play the overview film';

    root.insertAdjacentHTML('beforeend',
      '<button class="fn-vp__big" type="button" aria-label="' + playLabel + '">' + ICON.play + '</button>' +
      '<div class="fn-vp__bar">' +
        '<div class="fn-vp__track" tabindex="0" role="slider" aria-label="Seek" ' +
             'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="fn-vp__buffered"></div><div class="fn-vp__played"></div>' +
          '<div class="fn-vp__knob"></div><div class="fn-vp__tip"></div>' +
        '</div>' +
        '<div class="fn-vp__row">' +
          '<button class="fn-vp__btn" type="button" data-act="play" aria-label="Play">' + ICON.play + '</button>' +
          '<span class="fn-vp__time"><b>0:00</b> / 0:00</span>' +
          '<span class="fn-vp__now"></span>' +
          '<span class="fn-vp__sp"></span>' +
          '<button class="fn-vp__btn fn-vp__btn--cc" type="button" data-act="cc" aria-pressed="false" aria-label="Captions">CC</button>' +
          '<button class="fn-vp__btn" type="button" data-act="mute" aria-label="Mute">' + ICON.loud + '</button>' +
          '<button class="fn-vp__btn" type="button" data-act="full" aria-label="Fullscreen">' + ICON.full + '</button>' +
        '</div>' +
      '</div>');

    var big = root.querySelector('.fn-vp__big');
    var track = root.querySelector('.fn-vp__track');
    var played = root.querySelector('.fn-vp__played');
    var buffered = root.querySelector('.fn-vp__buffered');
    var knob = root.querySelector('.fn-vp__knob');
    var tip = root.querySelector('.fn-vp__tip');
    var timeEl = root.querySelector('.fn-vp__time');
    var nowEl = root.querySelector('.fn-vp__now');
    var playBtn = root.querySelector('[data-act="play"]');
    var ccBtn = root.querySelector('[data-act="cc"]');
    var muteBtn = root.querySelector('[data-act="mute"]');
    var fullBtn = root.querySelector('[data-act="full"]');

    // doc: Only now that the replacement exists does the native bar go away.
    video.removeAttribute('controls');

    var api = { video: video, chapters: chapters, onchapter: null };
    root.player = api;

    function textTrack() { return video.textTracks && video.textTracks[0]; }

    // doc: Captions start hidden rather than off. The film's own motion-graphic
    // titles already print most of these words on screen, so showing the track
    // by default double-prints them — but `hidden` (not `disabled`) keeps the
    // cues loaded, so the CC button is instant and search still sees the track.
    function onMeta() {
      var t = textTrack();
      if (t) t.mode = 'hidden';
      timeEl.innerHTML = '<b>0:00</b> / ' + fmt(video.duration);
      if (!video.duration || track.querySelector('.fn-vp__tick')) return;
      chapters.forEach(function (c) {
        var el = document.createElement('div');
        el.className = 'fn-vp__tick';
        el.style.left = (c[0] / video.duration * 100) + '%';
        track.appendChild(el);
      });
    }
    video.addEventListener('loadedmetadata', onMeta);
    // doc: `preload="metadata"` often has the duration before this script runs,
    // in which case loadedmetadata has already fired and will not fire again.
    if (video.readyState >= 1) onMeta();

    function setPlayIcon() {
      var icon = video.ended ? ICON.replay : (video.paused ? ICON.play : ICON.pause);
      playBtn.innerHTML = icon;
      big.innerHTML = icon;
      playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
      root.classList.toggle('is-playing', !video.paused && !video.ended);
      root.classList.toggle('is-paused', video.paused);
    }
    function toggle() { video.paused ? video.play() : video.pause(); }

    big.addEventListener('click', toggle);
    playBtn.addEventListener('click', toggle);
    video.addEventListener('click', toggle);
    // doc: `is-fresh` marks a player that has never been played. Until then the
    // control bar stays out of the poster frame (see field-notes.css) — the
    // poster is a designed still, and a paused player is otherwise
    // indistinguishable from a never-started one, so without this flag the bar
    // sits at full opacity over every frame the reader has not asked to see.
    root.classList.add('is-fresh');
    video.addEventListener('play', function () { root.classList.remove('is-fresh'); });
    video.addEventListener('play', setPlayIcon);
    video.addEventListener('pause', setPlayIcon);
    video.addEventListener('ended', setPlayIcon);
    // doc: A cold start on a 3.7 MB file is long enough to read as a dead
    // button, so the disc grows a spinner ring for exactly that window.
    video.addEventListener('waiting', function () { root.classList.add('is-loading'); });
    video.addEventListener('playing', function () { root.classList.remove('is-loading'); });

    var lastChapter = -1;
    video.addEventListener('timeupdate', function () {
      var d = video.duration || 1;
      var p = video.currentTime / d * 100;
      played.style.width = p + '%';
      knob.style.left = p + '%';
      track.setAttribute('aria-valuenow', Math.round(p));
      timeEl.innerHTML = '<b>' + fmt(video.currentTime) + '</b> / ' + fmt(d);
      var i = 0;
      for (var k = 0; k < chapters.length; k++) {
        if (video.currentTime >= chapters[k][0]) i = k;
      }
      if (i !== lastChapter) {
        lastChapter = i;
        nowEl.textContent = chapters[i] ? chapters[i][1] : '';
        if (api.onchapter) api.onchapter(i);
      }
    });
    video.addEventListener('progress', function () {
      if (!video.buffered.length || !video.duration) return;
      buffered.style.width =
        (video.buffered.end(video.buffered.length - 1) / video.duration * 100) + '%';
    });

    function ratio(e) {
      var r = track.getBoundingClientRect();
      return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    }
    track.addEventListener('click', function (e) {
      if (video.duration) video.currentTime = ratio(e) * video.duration;
    });
    track.addEventListener('mousemove', function (e) {
      var x = ratio(e);
      tip.style.left = (x * 100) + '%';
      tip.textContent = fmt(x * (video.duration || 0));
    });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { video.currentTime += 5; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { video.currentTime -= 5; e.preventDefault(); }
    });

    ccBtn.addEventListener('click', function () {
      var t = textTrack();
      if (!t) return;
      var on = t.mode !== 'showing';
      t.mode = on ? 'showing' : 'hidden';
      ccBtn.setAttribute('aria-pressed', String(on));
    });
    muteBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      muteBtn.innerHTML = video.muted ? ICON.mute : ICON.loud;
      muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    });
    fullBtn.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen();
    });

    // doc: The bar retreats during quiet playback and returns on any sign of
    // intent — pointer, focus, or a keypress.
    var idle;
    function wake() {
      root.classList.remove('is-idle');
      clearTimeout(idle);
      if (!video.paused) {
        idle = setTimeout(function () { root.classList.add('is-idle'); }, 2600);
      }
    }
    root.addEventListener('mousemove', wake);
    root.addEventListener('focusin', wake);
    video.addEventListener('play', wake);

    // doc: The frame itself takes focus so the shortcuts below have somewhere
    // to land. Space is left alone while a button holds focus, or it would both
    // press the button and toggle playback.
    root.tabIndex = 0;
    root.addEventListener('keydown', function (e) {
      if (e.target.closest('button') && e.key === ' ') return;
      if (e.key === ' ' || e.key === 'k') { toggle(); e.preventDefault(); }
      else if (e.key === 'f') fullBtn.click();
      else if (e.key === 'm') muteBtn.click();
      else if (e.key === 'c') ccBtn.click();
      else if (e.key === 'ArrowRight') { video.currentTime += 5; e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { video.currentTime -= 5; e.preventDefault(); }
    });

    setPlayIcon();
    return api;
  }

  /* doc: The chapter list is plain markup so it works without this file — each
   * button carries the second it seeks to. Here it gains the seek behaviour and
   * a highlight that follows playback, which is the part that makes the list
   * read as a position rather than as five links. */
  function wireChapters(film, api) {
    var list = film.querySelector('.fn-chapters');
    if (!list) return;
    var buttons = Array.prototype.slice.call(list.querySelectorAll('button[data-t]'));
    list.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-t]');
      if (!button) return;
      api.video.currentTime = Number(button.dataset.t);
      api.video.play();
    });
    api.onchapter = function (i) {
      buttons.forEach(function (b, n) { b.setAttribute('aria-current', String(n === i)); });
    };
  }

  /* doc: The hero's third call to action. It ships as an anchor at the film's
   * id, so with no JavaScript it still does the honest thing and jumps there;
   * this upgrades it to centre the film, flash its frame so the eye lands on
   * the thing that just moved, and start playback. Deliberately not a lightbox
   * — a modal here would own a focus trap and an Escape handler for no gain
   * over a page that is already one column of paper. */
  function wireWatchButton(film, api) {
    var button = document.querySelector('[data-fn-watch]');
    if (!button || !film.id || button.getAttribute('href') !== '#' + film.id) return;
    var frame = api.video.closest('.fn-vp');
    button.addEventListener('click', function (event) {
      event.preventDefault();
      film.scrollIntoView({ block: 'center', behavior: 'smooth' });
      frame.classList.remove('is-arriving');
      void frame.offsetWidth;   // doc: restart the flash when it is clicked twice
      frame.classList.add('is-arriving');
      frame.focus({ preventScroll: true });
      api.video.play();
    });
  }

  function init() {
    document.querySelectorAll('.fn-vp[data-chapters]').forEach(function (root) {
      var api = buildPlayer(root);
      if (!api) return;
      var film = root.closest('.fn-film');
      if (!film) return;
      wireChapters(film, api);
      wireWatchButton(film, api);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* doc: `init()` only sweeps the players present when the page loads, which is
   * every player written in markup. A player built later — the social films'
   * modal creates its frame on click — has no way in, so the builder is the one
   * thing this file publishes. It is deliberately the builder alone: chapter
   * lists and the hero's Watch button are page furniture that a modal has no
   * equivalent of, and exporting them would invite a caller to reach for them.
   *
   * doc: The caller passes an `.fn-vp` element containing a <video>; it gets
   * back the same `api` the page players use, or null if there is no video. A
   * caller must treat a missing `window.fieldNotesVideo` as "leave the native
   * controls on" — this file is an enhancement, and so is every consumer. */
  window.fieldNotesVideo = { buildPlayer: buildPlayer };
})();
