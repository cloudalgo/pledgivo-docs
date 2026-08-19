/* doc: Opens the two social cuts in a modal player instead of embedding them
 * in the page.
 *
 * field-notes-video.js deliberately refuses a lightbox for the overview film,
 * and that reasoning still holds for it: the overview film IS part of the
 * page's argument, so it belongs in the column with the prose. These two are
 * not. They are the marketing cuts — a long feature tour and a vertical
 * teaser — and a reader who wants one is choosing to leave the page's thread
 * for three minutes. A 9:16 film in particular cannot sit in a one-column
 * paper layout without either shrinking to a stamp or throwing the column's
 * rhythm away, which is the case a modal actually earns.
 *
 * Progressive enhancement, same contract as the rest of this theme: each
 * trigger ships as a plain <a> to the .mp4, so with no JavaScript the link
 * still plays the film in the browser's own viewer. This upgrades it to a
 * <dialog>, which brings the focus trap, the Escape handler and the inert
 * background with it — the three things that made a hand-rolled lightbox not
 * worth it in the other file are all native here.
 *
 * doc: The film inside the dialog plays in this theme's own player, not the
 * browser's. field-notes-video.js builds it: this file writes the `.fn-vp`
 * frame the builder expects and hands it over, so the modal gets the same
 * paper-and-ink scrub bar, CC toggle and keyboard shortcuts as the landing
 * film rather than a slab of Chrome grey dropped into the middle of the
 * design. If that file is absent the <video> keeps its native controls —
 * the player is an enhancement here exactly as it is on the page.
 */
(function () {
  'use strict';

  var dialog = null;

  /* doc: One dialog is built on first use and reused. The <video> inside it is
   * rebuilt per open and torn down on close: leaving a paused element in the
   * DOM keeps the buffered film in memory, and a fresh element is also how the
   * next open starts at zero rather than where the last one was abandoned. */
  function ensureDialog(host) {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'fn-film-modal';
    /* doc: No title bar over the film — the design mock puts the player alone
     * on the scrim wearing its own accent ring, with one small mono CLOSE
     * label above it, and a caption strip would only re-print what the card
     * the reader just clicked already said. The film's title still names the
     * dialog for a screen reader, written per open into aria-label: without a
     * name both cards announce as the same unnamed "dialog", and which of the
     * two films opened is the one thing a listener needs. */
    dialog.innerHTML =
      '<div class="fn-film-modal__frame">' +
      '<button type="button" class="fn-film-modal__x">' +
      'Close <span aria-hidden="true">&#10005;</span></button>' +
      '<div class="fn-film-modal__stage" data-fn-modal-stage></div>' +
      '</div>';
    dialog.querySelector('.fn-film-modal__x').addEventListener('click', function () {
      dialog.close();
    });
    /* doc: A click on the backdrop lands on the dialog itself, never on the
     * frame inside it, so identity is the whole test — no coordinate maths. */
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function () {
      dialog.querySelector('[data-fn-modal-stage]').textContent = '';
    });
    /* doc: Inside the page's own .md-typeset container, not on <body>. Every
     * one of this theme's ~60 player rules is scoped `.md-typeset .fn-vp*`,
     * which is Material's convention and not worth unpicking for one dialog —
     * a dialog outside that scope would render the player unstyled. showModal()
     * promotes to the top layer whatever the element's position in the DOM, so
     * nesting costs nothing in stacking terms. */
    host.appendChild(dialog);
    return dialog;
  }

  function open(link) {
    var d = ensureDialog(link.closest('.md-typeset'));
    var stage = d.querySelector('[data-fn-modal-stage]');
    var video = document.createElement('video');
    /* doc: `controls` is the floor, not the plan — the builder below strips it
     * the moment it has replaced them. Setting it here means a dialog that
     * opens without field-notes-video.js still has a way to start the film. */
    video.controls = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.poster = link.dataset.fnPoster || '';

    var source = document.createElement('source');
    source.src = link.getAttribute('href');
    source.type = 'video/mp4';
    video.appendChild(source);

    /* doc: The captions track is the reason these films are worth opening
     * muted, which is how most people will meet them. Missing on a film with
     * no .vtt rather than pointing at a 404. `default` is what a reader gets
     * if the player never builds; when it does build it starts the track
     * hidden — both cuts print their own captions into the picture, so showing
     * this one on top would double-print — and puts it one CC click away. */
    if (link.dataset.fnVtt) {
      var track = document.createElement('track');
      track.kind = 'captions';
      track.srclang = 'en';
      track.label = 'English';
      track.src = link.dataset.fnVtt;
      track.default = true;
      video.appendChild(track);
    }

    /* doc: The aspect ratio drives the stage, not a fixed height: a 9:16 cut
     * and a 16:9 cut share this dialog, and the vertical one must stay inside
     * the viewport's height rather than running off the bottom of it. It is a
     * bare number (16/9 = 1.7778) because the CSS also feeds it to calc(),
     * which a `16 / 9` string cannot survive. */
    d.style.setProperty('--fn-film-modal-ar', link.dataset.fnRatio || '1.7778');
    d.setAttribute('aria-label', link.dataset.fnTitle || 'Film');

    /* doc: The frame the player builder expects, built fresh per open so the
     * close handler can empty the stage and leave nothing behind — the classes
     * and listeners buildPlayer attaches all live on this element, so reusing
     * one across opens would stack them.
     *
     * doc: `data-chapters` is empty and present, both deliberately. The
     * attribute is the builder's marker, and neither social cut is chaptered:
     * the landing film is one 89-second argument with five named movements,
     * while these are marketing reels a viewer either watches or closes. An
     * empty list still buys the branded scrub bar, CC, mute, fullscreen and the
     * time readout; it just draws no ticks. */
    var frame = document.createElement('div');
    frame.className = 'fn-vp';
    frame.setAttribute('data-chapters', '[]');
    frame.setAttribute('data-play-label', 'Play the film');
    frame.appendChild(video);
    /* doc: showModal() otherwise lands focus on the Close button, which is the
     * right default for a dialog of prose and the wrong one for a dialog that
     * is a film: the player's shortcuts (space, k, f, m, c) are bound to this
     * frame, so with focus on Close, Space closes the modal instead of pausing.
     * Close is one Tab away and Escape still closes from anywhere. */
    frame.autofocus = true;
    stage.appendChild(frame);
    if (window.fieldNotesVideo) window.fieldNotesVideo.buildPlayer(frame);

    d.showModal();
    /* doc: Playback starts from the click that opened the dialog rather than
     * from an `autoplay` attribute. The attribute races the dialog's own
     * opening and is the weaker claim on the browser's autoplay policy; a
     * play() call inside the click handler still carries its user activation,
     * which is what lets these films start with their sound on. A blocked or
     * interrupted play is not an error worth surfacing — the player is sitting
     * there showing its play disc, which is the correct next thing to click. */
    var started = video.play();
    if (started && started.catch) started.catch(function () {});
  }

  function init() {
    var links = document.querySelectorAll('a[data-fn-film-modal]');
    if (!links.length) return;
    /* doc: Older engines without <dialog> keep the plain link, which plays the
     * film in the browser's own viewer — the same fallback as no JS at all. */
    if (typeof HTMLDialogElement === 'undefined') return;
    links.forEach(function (link) {
      /* doc: The dialog has to land inside the container the player's CSS is
       * scoped to. A trigger sitting outside one has nowhere to put it, so it
       * stays the plain link it shipped as rather than opening a dialog with
       * no styling — the same choice as an engine with no <dialog> above. */
      if (!link.closest('.md-typeset')) return;
      link.addEventListener('click', function (event) {
        /* doc: A modified click is the browser's own affordance on an <a> —
         * Cmd/Ctrl for a new tab, Shift for a new window, middle-click for
         * the same — and these triggers are plain anchors to the .mp4, so
         * they keep it. Only a plain primary click is upgraded. */
        if (event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(link);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
