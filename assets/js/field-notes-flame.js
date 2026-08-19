/* Field Notes — striking the hero flame.
 *
 * doc: The flame on the landing page is CSS from top to bottom; the only thing
 * this file adds is WHEN it catches, and the match-strike sound that goes with
 * it. Everything visual still works with JavaScript off — the stylesheet lights
 * the flame on its own delay (see `.fn-hero-flame` in field-notes.css) and this
 * file only takes that delay over once it has run.
 *
 * doc: Why the sound is tied to an interaction rather than to page load.
 * Chrome, Safari and Firefox all refuse to start audio until the page has had
 * a real user gesture, and a docs home page has usually had none. Audio fired
 * on a load timer therefore does not play quietly or late — it does not play
 * at all, and it throws while failing. So the strike waits for the reader.
 *
 * doc: Not every interaction counts. Only "activation" events — pointerdown,
 * keydown, touchstart — satisfy the autoplay policy; pointermove, wheel and
 * scroll do not, however deliberate they feel. Both kinds light the flame (a
 * reader who only moves the mouse should still see it), but only the first
 * kind attempts sound. Anything else would mean calling AudioContext.resume()
 * where it is guaranteed to reject.
 *
 * doc: The sound is synthesised, not a file. A match strike is a burst of
 * filtered noise (the scrape), a short crackle tail (the head catching) and a
 * low swell (the flame taking) — all of which the Web Audio API makes out of
 * arithmetic. That is a few hundred bytes of code instead of an audio asset to
 * host, license and download, and it cannot 404.
 */
(function () {
  'use strict';

  var flame = document.querySelector('.fn-hero-flame');
  if (!flame) return;

  // doc: Reduced motion is handled entirely in CSS, which switches the build
  // off and leaves the flame at full size. Holding it here would fight that,
  // and there is deliberately no sound: a reader who has asked for less motion
  // has not asked for audio either.
  var quiet = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (quiet && quiet.matches) return;

  // doc: The CSS build is a 2.05s delay followed by ~1.2s of staggered layer
  // reveals. Holding pauses every animation in the subtree at t=0; releasing
  // seeks past the delay so the flame answers the gesture within ~150ms rather
  // than two seconds after it. HOLD_SEEK_MS is that delay less the lead-in —
  // keep it in step with the delays in field-notes.css if they move.
  var HOLD_SEEK_MS = 1900;
  // doc: Nobody waits on a decoration. A reader who touches nothing gets the
  // flame on roughly the schedule they would have had with JavaScript off.
  var FALLBACK_MS = 900;
  var ACTIVATION = ['pointerdown', 'keydown', 'touchstart'];
  var PASSIVE = ['pointermove', 'wheel', 'scroll'];
  var struck = false;

  flame.classList.add('fn-hero-flame--hold');

  function light(withSound) {
    if (struck) return;
    struck = true;
    ACTIVATION.forEach(function (t) { document.removeEventListener(t, onActivate, true); });
    PASSIVE.forEach(function (t) { window.removeEventListener(t, onPassive, true); });
    clearTimeout(timer);

    // doc: Seek first, unpause second. Setting currentTime on a paused CSS
    // animation is honoured; doing it after the class comes off would show a
    // frame of the un-seeked flame.
    if (document.getAnimations) {
      document.getAnimations().forEach(function (a) {
        if (!a.effect || !flame.contains(a.effect.target)) return;
        try { a.currentTime = HOLD_SEEK_MS; } catch (e) { /* not seekable — it will just run late */ }
      });
    }
    flame.classList.remove('fn-hero-flame--hold');
    if (withSound) strike();
  }

  function onActivate() { light(true); }
  function onPassive() { light(false); }

  var timer = setTimeout(function () { light(false); }, FALLBACK_MS);
  ACTIVATION.forEach(function (t) { document.addEventListener(t, onActivate, true); });
  PASSIVE.forEach(function (t) { window.addEventListener(t, onPassive, true); });

  /* doc: The strike itself. Three overlapping voices, timed against the CSS
   * build so the ear and the eye agree: the scrape lands as the ember bed
   * lights, the crackle across the frames the core and kernel arrive, and the
   * swell rides the outer layers out to full size. Every node is scheduled up
   * front and the context is closed afterwards, so nothing is left running.
   */
  function strike() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    var ctx;
    try { ctx = new Ctx(); } catch (e) { return; }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

    var t0 = ctx.currentTime + 0.02;
    var master = ctx.createGain();
    master.gain.value = 0.16;              // doc: quiet by design — this is a page decoration, not an alert
    master.connect(ctx.destination);

    // doc: One second of white noise, reused by every voice below. Generating
    // it once and re-pointing buffer sources at it costs a single allocation.
    var frames = Math.floor(ctx.sampleRate);
    var noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    function burst(start, dur, freq, q, peak, type) {
      var src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      var filter = ctx.createBiquadFilter();
      filter.type = type || 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + dur * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(filter); filter.connect(gain); gain.connect(master);
      src.start(start); src.stop(start + dur + 0.02);
      return filter;
    }

    // doc: The scrape — head dragged down the striker. Bright, gritty, short,
    // and swept downward in frequency because the match is losing speed.
    var scrape = burst(t0, 0.13, 2600, 1.1, 0.9);
    scrape.frequency.setValueAtTime(3400, t0);
    scrape.frequency.exponentialRampToValueAtTime(1500, t0 + 0.13);

    // doc: The catch — a harder, lower burst on the frame the core lights.
    burst(t0 + 0.24, 0.09, 1200, 0.8, 1.0);

    // doc: Crackle. A handful of very short high ticks scattered across the
    // half-second the inner layers arrive in, thinning out as the head settles.
    for (var c = 0; c < 7; c++) {
      var at = t0 + 0.26 + Math.random() * 0.5;
      burst(at, 0.012 + Math.random() * 0.02, 3200 + Math.random() * 2600, 3, 0.28);
    }

    // doc: The swell — the flame taking hold. Low-passed noise coming up under
    // everything else across the second the outer layers build in.
    var swell = ctx.createBufferSource();
    swell.buffer = noise;
    swell.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, t0 + 0.2);
    lp.frequency.linearRampToValueAtTime(620, t0 + 1.0);
    var swellGain = ctx.createGain();
    swellGain.gain.setValueAtTime(0.0001, t0 + 0.2);
    swellGain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.65);
    swellGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    swell.connect(lp); lp.connect(swellGain); swellGain.connect(master);
    swell.start(t0 + 0.2); swell.stop(t0 + 1.55);

    // doc: Close the context once the last voice has stopped. Browsers cap how
    // many AudioContexts a page may hold, and this one has no further use.
    setTimeout(function () { if (ctx.close) ctx.close(); }, 2600);
  }
})();
