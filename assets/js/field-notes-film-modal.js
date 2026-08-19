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
 */
(function () {
  'use strict';

  var dialog = null;

  /* doc: One dialog is built on first use and reused. The <video> inside it is
   * rebuilt per open and torn down on close: leaving a paused element in the
   * DOM keeps the buffered film in memory, and a fresh element is also how the
   * next open starts at zero rather than where the last one was abandoned. */
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'fn-film-modal';
    /* doc: The dialog's accessible name is the film's own title, which open()
     * writes into the caption span. Without the aria-labelledby a screen
     * reader announces the two cards as the same unnamed "dialog", and the
     * one thing a listener needs to know is which of the two films opened. */
    dialog.setAttribute('aria-labelledby', 'fn-film-modal-title');
    dialog.innerHTML =
      '<div class="fn-film-modal__frame">' +
      '<p class="fn-film-modal__cap"><span id="fn-film-modal-title" data-fn-modal-title></span>' +
      '<button type="button" class="fn-film-modal__x" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>' +
      '</button></p>' +
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
    document.body.appendChild(dialog);
    return dialog;
  }

  function open(link) {
    var d = ensureDialog();
    var stage = d.querySelector('[data-fn-modal-stage]');
    var video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.poster = link.dataset.fnPoster || '';

    var source = document.createElement('source');
    source.src = link.getAttribute('href');
    source.type = 'video/mp4';
    video.appendChild(source);

    /* doc: The captions track is the reason these films are worth opening
     * muted, which is how most people will meet them. Missing on a film with
     * no .vtt rather than pointing at a 404. */
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
    d.querySelector('[data-fn-modal-title]').textContent = link.dataset.fnTitle || '';
    stage.appendChild(video);
    d.showModal();
  }

  function init() {
    var links = document.querySelectorAll('a[data-fn-film-modal]');
    if (!links.length) return;
    /* doc: Older engines without <dialog> keep the plain link, which plays the
     * film in the browser's own viewer — the same fallback as no JS at all. */
    if (typeof HTMLDialogElement === 'undefined') return;
    links.forEach(function (link) {
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
