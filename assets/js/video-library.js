/* Field Notes — the Video Library page (videos.md).
 *
 * doc: Drives docs/videos.md entirely from the <script id="video-manifest">
 * block scripts/generate_video_manifest.py rewrites on every build — nothing
 * here names a specific recording. Selecting a playlist item builds a fresh
 * .fn-vp frame and hands it to field-notes-video.js's buildPlayer(), the same
 * upgrade every guide page's walkthrough film gets, so the scrub bar, CC
 * toggle and keyboard shortcuts behave identically here.
 *
 * doc: buildPlayer()'s own wireChapters() is not used — it requires the
 * chapter <ul> to sit inside a .fn-film ancestor of the frame (a convention
 * for markup that ships fixed on the page), which this page's dynamically
 * rebuilt #vlChapters does not have. The click-to-seek and aria-current
 * highlight logic below is a deliberate, small duplicate of that function
 * against the returned `api` object instead.
 */
(function () {
  'use strict';

  var GROUP_LABELS = { walkthroughs: 'Walkthroughs', trailers: 'Trailers & Highlights' };
  var GROUP_ORDER = ['walkthroughs', 'trailers'];

  var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function readManifest() {
    var el = document.getElementById('video-manifest');
    if (!el) return null;
    try {
      var videos = JSON.parse(el.textContent || '[]');
      return Array.isArray(videos) ? videos : null;
    } catch (e) {
      return null;
    }
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function chapterPairs(video) {
    return video.chapters.map(function (c) { return [c.t, c.label]; });
  }

  function buildFrame(video) {
    var frame = document.createElement('div');
    frame.className = 'fn-vp';
    frame.setAttribute('data-chapters', JSON.stringify(chapterPairs(video)));
    frame.setAttribute('data-play-label', 'Play ' + video.title);

    var v = document.createElement('video');
    v.setAttribute('controls', '');
    v.setAttribute('preload', 'metadata');
    v.setAttribute('playsinline', '');
    if (video.poster) v.setAttribute('poster', video.poster);

    /* doc: WebM first - the browser takes the first <source> it can play, and
       the VP9 file is the smaller of the two; the MP4 is the fallback. */
    if (video.webm) {
      var webm = document.createElement('source');
      webm.src = video.webm;
      webm.type = 'video/webm';
      v.appendChild(webm);
    }
    var source = document.createElement('source');
    source.src = video.src;
    source.type = 'video/mp4';
    v.appendChild(source);

    if (video.vtt) {
      var track = document.createElement('track');
      track.kind = 'captions';
      track.src = video.vtt;
      track.srclang = 'en';
      track.label = 'English';
      v.appendChild(track);
    }

    frame.appendChild(v);
    return frame;
  }

  function init() {
    var videos = readManifest();
    var stage = document.getElementById('vlStage');
    var playlist = document.getElementById('vlPlaylist');
    var playlistEmpty = document.getElementById('vlPlaylistEmpty');
    var kicker = document.getElementById('vlKicker');
    var title = document.getElementById('vlTitle');
    var chaptersList = document.getElementById('vlChapters');
    var chaptersEmpty = document.getElementById('vlChaptersEmpty');
    var countEl = document.getElementById('vlCount');
    if (!videos || !stage || !playlist || !kicker || !title || !chaptersList || !chaptersEmpty) return;

    if (!videos.length) {
      playlistEmpty.hidden = false;
      return;
    }

    countEl.hidden = false;
    countEl.textContent = videos.length + (videos.length === 1 ? ' video' : ' videos');

    var currentApi = null;
    var playlistButtons = [];

    // doc: One delegated listener on the chapter list, set up once — a per-
    // selection listener would stack a new one on every click since the
    // list element itself is never recreated, only its contents.
    chaptersList.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-t]');
      if (!button || !currentApi) return;
      currentApi.video.currentTime = Number(button.dataset.t);
      currentApi.video.play();
    });

    function renderChapters(video) {
      chaptersList.innerHTML = '';
      if (!video.chapters.length) {
        chaptersList.hidden = true;
        chaptersEmpty.hidden = false;
        return;
      }
      chaptersEmpty.hidden = true;
      chaptersList.hidden = false;
      var buttons = video.chapters.map(function (c) {
        var li = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.t = String(c.t);
        var stamp = document.createElement('b');
        stamp.textContent = fmtTime(c.t);
        button.appendChild(stamp);
        button.appendChild(document.createTextNode(' ' + c.label));
        li.appendChild(button);
        chaptersList.appendChild(li);
        return button;
      });
      if (currentApi) {
        currentApi.onchapter = function (i) {
          buttons.forEach(function (b, n) {
            if (n === i) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
          });
        };
      }
    }

    function selectVideo(video, button) {
      playlistButtons.forEach(function (b) {
        var active = b === button;
        b.classList.toggle('is-active', active);
        if (active) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });

      kicker.textContent = [video.duration, GROUP_LABELS[video.group] || video.group]
        .filter(Boolean).join(' · ');
      title.textContent = video.title;

      stage.innerHTML = '';
      var frame = buildFrame(video);
      stage.appendChild(frame);

      // doc: A missing window.fieldNotesVideo (script failed to load/parse)
      // leaves the frame's native `controls` attribute on — the same
      // graceful-degradation contract every other page's film honours.
      currentApi = window.fieldNotesVideo ? window.fieldNotesVideo.buildPlayer(frame) : null;
      renderChapters(video);
    }

    var groups = {};
    videos.forEach(function (video) {
      (groups[video.group] || (groups[video.group] = [])).push(video);
    });

    var firstVideo = null;
    var firstButton = null;

    GROUP_ORDER.concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) === -1; }))
      .forEach(function (groupKey) {
        var groupVideos = groups[groupKey];
        if (!groupVideos || !groupVideos.length) return;

        var section = document.createElement('div');
        section.className = 'vl-group';

        var label = document.createElement('p');
        label.className = 'vl-group-label';
        label.textContent = GROUP_LABELS[groupKey] || groupKey;
        section.appendChild(label);

        var list = document.createElement('ul');
        list.className = 'vl-list';

        groupVideos.forEach(function (video) {
          var li = document.createElement('li');
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'vl-item';

          var thumb = document.createElement('span');
          thumb.className = 'vl-item__thumb';
          if (video.poster) {
            var img = document.createElement('img');
            img.src = video.poster;
            img.alt = '';
            img.loading = 'lazy';
            img.width = 160;
            img.height = 90;
            thumb.appendChild(img);
          } else {
            thumb.classList.add('vl-item__thumb--empty');
            thumb.innerHTML = PLAY_ICON;
          }
          button.appendChild(thumb);

          var meta = document.createElement('span');
          meta.className = 'vl-item__meta';
          var itemTitle = document.createElement('span');
          itemTitle.className = 'vl-item__title';
          itemTitle.textContent = video.title;
          meta.appendChild(itemTitle);
          if (video.duration) {
            var duration = document.createElement('span');
            duration.className = 'vl-item__duration';
            duration.textContent = video.duration;
            meta.appendChild(duration);
          }
          button.appendChild(meta);

          button.addEventListener('click', function () { selectVideo(video, button); });
          playlistButtons.push(button);
          li.appendChild(button);
          list.appendChild(li);

          if (!firstVideo) { firstVideo = video; firstButton = button; }
        });

        section.appendChild(list);
        playlist.appendChild(section);
      });

    if (firstVideo) selectVideo(firstVideo, firstButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
