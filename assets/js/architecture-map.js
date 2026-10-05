/* ==========================================================================
   Architecture map — an interactive system diagram drawn from a JSON spec.

   Markup (progressive enhancement — with JS off the fallback block renders and
   the page's own prose carries every fact the diagram does):

     <figure class="fn-arch" aria-label="…">
       <script type="application/json" class="fn-arch__data">{ … }</script>
       <div class="fn-arch__fallback">…</div>
     </figure>

   Spec (all coordinates are SVG user units in `view`):
     view   [w, h]
     lanes  [{ label, y, h, x?, w? }]                    — horizontal context bands
     nodes  [{ id, kind, x, y, w, h, tag, title, sub,      kind: actor | page | apex |
               runs, body, code: [], href, more }]         data | job | event | external
     edges  [{ id, from, to, fs, ts, fo?, to_?, via?,     fs/ts: side (top|right|bottom|left)
               label, lx?, ly? }]                          fo/to_: offset along the side
     flows  [{ id, n, title, intro, steps: [{ edge, text }] }]

   Everything chromatic comes from the Field Notes tokens in field-notes.css, so
   the map recolours with the theme rather than carrying its own palette.
   ========================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CHAR_W = 5.75;   // IBM Plex Mono advance at the 9.6px edge-label size
  var LINE_H = 11.5;
  var uid = 0;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function anchor(n, side, offset) {
    var o = offset || 0;
    switch (side) {
      case 'top': return [n.x + n.w / 2 + o, n.y];
      case 'bottom': return [n.x + n.w / 2 + o, n.y + n.h];
      case 'left': return [n.x, n.y + n.h / 2 + o];
      default: return [n.x + n.w, n.y + n.h / 2 + o];
    }
  }

  function horizontal(side) { return side === 'left' || side === 'right'; }

  // Orthogonal route between two anchors. An explicit `via` wins; otherwise one
  // or two elbows are chosen from the exit and entry sides.
  function route(e, a, b) {
    if (e.via) return [a].concat(e.via, [b]);
    var h1 = horizontal(e.fs), h2 = horizontal(e.ts);
    if (a[0] === b[0] || a[1] === b[1]) return [a, b];
    if (h1 && h2) { var mx = (a[0] + b[0]) / 2; return [a, [mx, a[1]], [mx, b[1]], b]; }
    if (!h1 && !h2) { var my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
    return h1 ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b];
  }

  function longestMid(pts) {
    var best = 0, mid = pts[0];
    for (var i = 1; i < pts.length; i++) {
      var len = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      if (len > best) { best = len; mid = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]; }
    }
    return mid;
  }

  function multiline(parent, lines, x, y, cls, lineH) {
    var t = el('text', { x: x, y: y, class: cls }, parent);
    lines.forEach(function (line, i) {
      var s = el('tspan', { x: x, dy: i === 0 ? 0 : lineH }, t);
      s.textContent = line;
    });
    return t;
  }

  function build(root) {
    var dataEl = root.querySelector('.fn-arch__data');
    if (!dataEl) return;
    var spec;
    try { spec = JSON.parse(dataEl.textContent); } catch (err) { return; }

    var id = 'fn-arch-' + (++uid);
    var nodesById = {};
    spec.nodes.forEach(function (n) { nodesById[n.id] = n; });
    var edgesById = {};
    spec.edges.forEach(function (e) { edgesById[e.id] = e; });

    /* ---- chrome: toolbar ---- */
    var bar = html('div', 'fn-arch__bar');
    var chips = html('div', 'fn-arch__chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Show one journey through the system');
    var chipEls = {};
    [{ id: '', n: '', title: 'Overview' }].concat(spec.flows).forEach(function (f) {
      var b = html('button', 'fn-arch__chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      if (f.n) { var num = html('b', null, f.n); b.appendChild(num); }
      b.appendChild(document.createTextNode(f.title));
      b.addEventListener('click', function () { showFlow(f.id); });
      chips.appendChild(b);
      chipEls[f.id] = b;
    });
    var expand = html('button', 'fn-arch__expand');
    expand.type = 'button';
    expand.setAttribute('aria-label', 'Expand the map');
    expand.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';
    bar.appendChild(chips);
    bar.appendChild(expand);

    /* ---- the drawing ---- */
    var scroller = html('div', 'fn-arch__scroll');
    var svg = el('svg', {
      viewBox: '0 0 ' + spec.view[0] + ' ' + spec.view[1],
      class: 'fn-arch__svg',
      role: 'group',
      'aria-label': root.getAttribute('aria-label') || 'System map'
    }, scroller);
    svg.style.setProperty('--fn-arch-w', spec.view[0]);

    var defs = el('defs', {}, svg);
    [['a', 'fn-arch__head'], ['on', 'fn-arch__head is-on']].forEach(function (m) {
      var marker = el('marker', {
        id: id + '-' + m[0], viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'
      }, defs);
      el('path', { d: 'M0 1.2 9 5 0 8.8z', class: m[1] }, marker);
    });

    var gLanes = el('g', { class: 'fn-arch__lanes' }, svg);
    var gEdges = el('g', { class: 'fn-arch__edges' }, svg);
    var gNodes = el('g', { class: 'fn-arch__nodes' }, svg);
    var gLabels = el('g', { class: 'fn-arch__labels' }, svg);

    (spec.lanes || []).forEach(function (l) {
      var g = el('g', { class: 'fn-arch__lane' }, gLanes);
      el('rect', { x: l.x || 8, y: l.y, width: l.w || spec.view[0] - 16, height: l.h, rx: 8 }, g);
      var t = el('text', { x: (l.x || 8) + 12, y: l.y + 18, class: 'fn-arch__lane-label' }, g);
      t.textContent = l.label;
    });

    var edgeEls = {};
    spec.edges.forEach(function (e) {
      var a = anchor(nodesById[e.from], e.fs, e.fo);
      var b = anchor(nodesById[e.to], e.ts, e.to_);
      var pts = route(e, a, b);
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      var g = el('g', { class: 'fn-arch__edge' + (e.optional ? ' is-optional' : '') }, gEdges);
      el('path', { d: d, class: 'fn-arch__line', 'marker-end': 'url(#' + id + '-a)' }, g);
      el('path', { d: d, class: 'fn-arch__flowline', 'marker-end': 'url(#' + id + '-on)' }, g);

      var at = (e.lx != null) ? [e.lx, e.ly] : longestMid(pts);
      var lg = el('g', { class: 'fn-arch__label' }, gLabels);
      if (e.label) {
        var lines = e.label.split('\n');
        var w = Math.max.apply(null, lines.map(function (s) { return s.length; })) * CHAR_W + 10;
        var h = lines.length * LINE_H + 5;
        el('rect', { x: at[0] - w / 2, y: at[1] - h / 2, width: w, height: h, rx: 3 }, lg);
        multiline(lg, lines, at[0], at[1] - h / 2 + 11.2, 'fn-arch__label-text', LINE_H);
      }
      var badge = el('g', { class: 'fn-arch__badge' }, lg);
      var bx = e.label ? at[0] - (Math.max.apply(null, e.label.split('\n').map(function (s) { return s.length; })) * CHAR_W + 10) / 2 - 9 : at[0];
      el('circle', { cx: bx, cy: at[1], r: 8 }, badge);
      var bt = el('text', { x: bx, y: at[1] + 3.3 }, badge);
      edgeEls[e.id] = { g: g, label: lg, badgeText: bt };
    });

    var nodeEls = {};
    spec.nodes.forEach(function (n) {
      var g = el('g', {
        class: 'fn-arch__node is-' + n.kind,
        tabindex: 0,
        role: 'button',
        'aria-label': n.title + (n.sub ? ' — ' + n.sub.replace(/\n/g, ' ') : '') + '. Show details.'
      }, gNodes);
      el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.kind === 'event' ? n.h / 2 : 6, class: 'fn-arch__box' }, g);
      if (n.kind === 'data') {
        el('line', { x1: n.x + 1, x2: n.x + n.w - 1, y1: n.y + 4, y2: n.y + 4, class: 'fn-arch__rule' }, g);
      }
      var inset = n.kind === 'event' ? 18 : 10;
      var tag = el('text', { x: n.x + inset, y: n.y + 15, class: 'fn-arch__tag' }, g);
      tag.textContent = n.tag;
      multiline(g, n.title.split('\n'), n.x + inset, n.y + 31, 'fn-arch__title', 13.5);
      if (n.sub) {
        var offset = 31 + n.title.split('\n').length * 13.5 + 1;
        multiline(g, n.sub.split('\n'), n.x + inset, n.y + offset, 'fn-arch__sub', 11);
      }
      g.addEventListener('click', function () { pick(n.id); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(n.id); }
      });
      nodeEls[n.id] = g;
    });

    /* ---- the reading panel under the map ---- */
    var panel = html('div', 'fn-arch__panel');
    panel.setAttribute('aria-live', 'polite');

    var fallback = root.querySelector('.fn-arch__fallback');
    if (fallback) fallback.hidden = true;
    root.appendChild(bar);
    root.appendChild(scroller);
    root.appendChild(panel);
    root.classList.add('is-ready');

    /* ---- state ---- */
    var current = '';

    function clearMarks() {
      svg.classList.remove('is-focused');
      Object.keys(nodeEls).forEach(function (k) { nodeEls[k].classList.remove('is-on', 'is-picked'); });
      Object.keys(edgeEls).forEach(function (k) {
        edgeEls[k].g.classList.remove('is-on', 'is-step');
        edgeEls[k].label.classList.remove('is-on', 'is-step', 'has-badge');
        edgeEls[k].badgeText.textContent = '';
      });
    }

    function lightEdge(edgeId, n) {
      var e = edgesById[edgeId], ee = edgeEls[edgeId];
      if (!e || !ee) return;
      ee.g.classList.add('is-on');
      ee.label.classList.add('is-on');
      nodeEls[e.from].classList.add('is-on');
      nodeEls[e.to].classList.add('is-on');
      if (n) { ee.badgeText.textContent = n; ee.label.classList.add('has-badge'); }
    }

    function setChip(flowId) {
      Object.keys(chipEls).forEach(function (k) {
        chipEls[k].setAttribute('aria-pressed', k === flowId ? 'true' : 'false');
      });
    }

    function overviewPanel() {
      panel.innerHTML = '';
      panel.appendChild(html('p', 'fn-arch__hint',
        'Pick a journey above to trace it step by step, or select any box to see what it is, who it runs as, and which code implements it.'));
    }

    function showFlow(flowId) {
      current = flowId;
      setChip(flowId);
      clearMarks();
      if (!flowId) { overviewPanel(); return; }
      var flow = spec.flows.filter(function (f) { return f.id === flowId; })[0];
      svg.classList.add('is-focused');
      flow.steps.forEach(function (s, i) { lightEdge(s.edge, String(i + 1)); });

      panel.innerHTML = '';
      var head = html('p', 'fn-arch__panel-head');
      head.appendChild(html('span', 'fn-arch__panel-n', flow.n));
      head.appendChild(document.createTextNode(flow.title));
      panel.appendChild(head);
      if (flow.intro) panel.appendChild(html('p', 'fn-arch__panel-intro', flow.intro));
      var ol = html('ol', 'fn-arch__steps');
      flow.steps.forEach(function (s, i) {
        var li = html('li');
        var b = html('button', 'fn-arch__step');
        b.type = 'button';
        b.appendChild(html('b', null, String(i + 1)));
        b.appendChild(html('span', null, s.text));
        b.addEventListener('mouseenter', function () { stepFocus(s.edge, true); });
        b.addEventListener('mouseleave', function () { stepFocus(s.edge, false); });
        b.addEventListener('focus', function () { stepFocus(s.edge, true); });
        b.addEventListener('blur', function () { stepFocus(s.edge, false); });
        li.appendChild(b);
        ol.appendChild(li);
      });
      panel.appendChild(ol);
      if (flow.more) panel.appendChild(moreLink(flow.more));
    }

    function stepFocus(edgeId, on) {
      svg.classList.toggle('is-stepping', on);
      edgeEls[edgeId].g.classList.toggle('is-step', on);
      edgeEls[edgeId].label.classList.toggle('is-step', on);
    }

    function moreLink(more) {
      var p = html('p', 'fn-arch__more');
      var a = html('a', null, more.text + ' →');
      a.href = more.href;
      p.appendChild(a);
      return p;
    }

    function pick(nodeId) {
      var n = nodesById[nodeId];
      current = '';
      setChip(null);
      clearMarks();
      svg.classList.add('is-focused');
      nodeEls[nodeId].classList.add('is-on', 'is-picked');
      spec.edges.forEach(function (e) {
        if (e.from === nodeId || e.to === nodeId) lightEdge(e.id);
      });

      panel.innerHTML = '';
      var head = html('p', 'fn-arch__panel-head');
      head.appendChild(html('span', 'fn-arch__panel-tag', n.tag));
      head.appendChild(document.createTextNode(n.title.replace(/\n/g, ' ')));
      panel.appendChild(head);
      if (n.runs) {
        var runs = html('p', 'fn-arch__runs');
        runs.appendChild(html('span', null, 'Runs as'));
        runs.appendChild(document.createTextNode(n.runs));
        panel.appendChild(runs);
      }
      if (n.body) panel.appendChild(html('p', 'fn-arch__panel-intro', n.body));
      if (n.code && n.code.length) {
        var code = html('p', 'fn-arch__code');
        code.appendChild(html('span', null, 'In the code'));
        n.code.forEach(function (c) { code.appendChild(html('code', null, c)); });
        panel.appendChild(code);
      }
      if (n.more) panel.appendChild(moreLink(n.more));
      var back = html('button', 'fn-arch__back', '← Back to the overview');
      back.type = 'button';
      back.addEventListener('click', function () { showFlow(''); nodeEls[nodeId].focus(); });
      panel.appendChild(back);
    }

    /* ---- expand to the full viewport (docs site only — not packaged CSS) ---- */
    // The backdrop sits beside the figure, inside the same stacking context,
    // so it covers the header and sidebars without covering the map.
    var backdrop = html('div', 'fn-arch__backdrop');
    backdrop.addEventListener('click', function () { setExpanded(false); });
    function setExpanded(on) {
      root.classList.toggle('is-expanded', on);
      document.documentElement.classList.toggle('fn-arch-locked', on);
      expand.setAttribute('aria-label', on ? 'Close the expanded map' : 'Expand the map');
      if (on) root.parentNode.insertBefore(backdrop, root);
      else if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
    expand.addEventListener('click', function () { setExpanded(!root.classList.contains('is-expanded')); });
    root.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (root.classList.contains('is-expanded')) setExpanded(false);
      else if (svg.classList.contains('is-focused')) showFlow('');
    });

    showFlow('');
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.fn-arch'), build);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
