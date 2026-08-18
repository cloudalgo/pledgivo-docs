(function () {
  function init() {
    var dataEl = document.getElementById('dm-data');
    var cyEl = document.getElementById('dm-cy');
    if (!dataEl || !cyEl || typeof cytoscape === 'undefined') return;

    var DATA = JSON.parse(dataEl.textContent);
    var nodesById = {};
    DATA.nodes.forEach(function (n) { nodesById[n.id] = n; });
    var domainMeta = DATA.domains || {};

    var cyNodes = DATA.nodes.map(function (n) {
      return {
        data: {
          id: n.id, label: n.label, apiName: n.apiName, pluralLabel: n.pluralLabel,
          description: n.description, kind: n.kind, domain: n.domain,
          sharingModel: n.sharingModel, fieldCount: n.fieldCount, fields: n.fields
        }
      };
    });
    var cyEdges = DATA.edges.map(function (e) {
      return { data: { id: e.id, source: e.source, target: e.target, field: e.field, relKind: e.relKind } };
    });

    function domainColor(d) { return (domainMeta[d] && domainMeta[d].color) || '#5A6472'; }

    var cy = cytoscape({
      container: cyEl,
      elements: { nodes: cyNodes, edges: cyEdges },
      wheelSensitivity: 0.25,
      minZoom: 0.25,
      maxZoom: 2.5,
      style: [
        {
          selector: 'node', style: {
            'background-color': function (ele) { return domainColor(ele.data('domain')); },
            'label': 'data(label)',
            'color': '#161F35',
            'font-family': 'IBM Plex Sans, sans-serif',
            'font-size': 10,
            'font-weight': 500,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': 78,
            'width': 92,
            'height': 92,
            'shape': 'round-rectangle',
            'border-width': 2,
            'border-color': '#ffffff',
            'background-opacity': 0.16,
            'text-background-color': '#F6F5F0',
            'text-background-opacity': 0.85,
            'text-background-padding': 2
          }
        },
        { selector: 'node[kind = "standard"]', style: { 'border-style': 'double', 'border-width': 4 } },
        { selector: 'node[kind = "mdt"]', style: { 'shape': 'round-diamond' } },
        { selector: 'node[kind = "event"]', style: { 'shape': 'round-hexagon' } },
        {
          selector: 'edge', style: {
            'width': 1.4,
            'line-color': '#c9c7ba',
            'target-arrow-color': '#c9c7ba',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            'opacity': 0.85
          }
        },
        { selector: '.dm-dim', style: { 'opacity': 0.12 } },
        { selector: '.dm-selected', style: { 'border-color': '#E0533D', 'border-width': 3, 'background-opacity': 0.35 } },
        { selector: '.dm-neighbor', style: { 'border-color': '#1C2B46', 'border-width': 2.5 } },
        { selector: 'edge.dm-active', style: { 'line-color': '#E0533D', 'target-arrow-color': '#E0533D', 'width': 2.2, 'opacity': 1 } }
      ],
      layout: { name: 'cose', animate: false, nodeRepulsion: 9000, idealEdgeLength: 130, gravity: 0.35, numIter: 1500 }
    });

    var panelEl = document.getElementById('dm-panel');
    var emptyPanelHtml =
      '<div class="dm-panel-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' +
      '<div>Click any object in the diagram<br/>to see its fields and relationships.</div></div>';

    function clearSelection() {
      cy.elements().removeClass('dm-dim dm-selected dm-neighbor');
      cy.edges().removeClass('dm-active');
      if (panelEl) panelEl.innerHTML = emptyPanelHtml;
    }

    function escapeHtml(s) {
      return (s || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // A packaged API name runs to 39 characters with no spaces in it, which is
    // wider than the panel column. CSS can only break that mid-identifier
    // ("Donor_Portal_Empty_Recurr / ing_Message__c"), so offer the browser a
    // break at each underscore instead — the one place a reader expects one.
    // The trailing suffix is kept whole: breaking inside "__c" reads as a typo.
    function breakableApi(api) {
      var m = (api || '').match(/(__[a-z]+)$/);
      var suffix = m ? m[1] : '';
      var base = m ? api.slice(0, -suffix.length) : (api || '');
      return escapeHtml(base).replace(/_/g, '_<wbr>') + escapeHtml(suffix);
    }

    // Label, a hairline that takes up the slack, then the count. The count used
    // to be a bare <span> with no styling, which rendered "Fields4" and read as
    // "FIELDS4" once the title was uppercased.
    function sectionTitle(label, count) {
      return '<p class="dm-panel-section-title"><span class="t">' + escapeHtml(label) +
        '</span><span class="rule"></span><span class="n">' + count + '</span></p>';
    }

    function selectNode(node) {
      var id = node.id();
      cy.elements().addClass('dm-dim');
      node.removeClass('dm-dim').addClass('dm-selected');
      node.closedNeighborhood().removeClass('dm-dim');
      node.connectedEdges().forEach(function (e) {
        e.addClass('dm-active');
        var other = e.source().id() === id ? e.target() : e.source();
        other.addClass('dm-neighbor');
      });

      var d = node.data();
      var relatedOut = cy.edges('[source = "' + id + '"]').map(function (e) {
        return { dir: 'out', field: e.data('field'), other: nodesById[e.data('target')], otherId: e.data('target') };
      });
      var relatedIn = cy.edges('[target = "' + id + '"]').map(function (e) {
        return { dir: 'in', field: e.data('field'), other: nodesById[e.data('source')], otherId: e.data('source') };
      });
      var related = relatedOut.concat(relatedIn);

      // The type used to carry " → <target>" as well, which made the longest
      // label 36 monospace characters — wider than the panel at any viewport,
      // so the row overflowed and squeezed the name column to nothing. The
      // target is not lost: every reference field on this model has an edge, so
      // the Relationships section above already names it, and does it with a
      // click-to-jump the field row never had.
      var fieldsHtml = (d.fields || []).map(function (f) {
        return '<div class="dm-field-row"><span class="dm-field-name">' + breakableApi(f.apiName) +
          (f.required ? '<span class="req">*</span>' : '') + '</span><span class="dm-field-type">' +
          escapeHtml(f.type) + '</span></div>';
      }).join('');

      // Rows, not pills. A pill holding "Recurring Donation → Recurring_Donation__c"
      // is 40 characters wide and wrapped inside its own border in this column,
      // which read as a broken chip rather than a link. A row gives the object
      // name and the field that points at it their own lines, and makes the
      // whole strip the click target instead of a wrapped pill.
      var relHtml = related.map(function (r) {
        var arrow = r.dir === 'out' ? '→' : '←';
        var label = r.other ? r.other.label : r.otherId;
        return '<div class="dm-rel-row" data-jump="' + escapeHtml(r.otherId) + '" role="button" tabindex="0">' +
          '<span class="dm-rel-dir" aria-hidden="true">' + arrow + '</span>' +
          '<span class="dm-rel-main"><span class="dm-rel-obj">' + escapeHtml(label) + '</span>' +
          '<span class="dm-rel-field">' + breakableApi(r.field) + '</span></span></div>';
      }).join('');

      if (!panelEl) return;
      // The identity block is its own element so CSS can pin it: a 40-field list
      // scrolls for several screens inside this panel, and without a pinned head
      // there is nothing on screen saying which object the fields belong to.
      panelEl.innerHTML =
        '<div class="dm-panel-head">' +
        '<p class="dm-panel-kicker">' + escapeHtml((domainMeta[d.domain] && domainMeta[d.domain].label) || d.domain) + '</p>' +
        '<h3 class="dm-panel-title">' + escapeHtml(d.label) + '</h3>' +
        '<p class="dm-panel-api">' + breakableApi(d.apiName) + '</p>' +
        '<div class="dm-panel-meta">' +
        '<span class="dm-meta-chip">' + escapeHtml(d.kind) + '</span>' +
        '<span class="dm-meta-chip">' + d.fieldCount + ' fields</span>' +
        (d.sharingModel ? '<span class="dm-meta-chip">' + escapeHtml(d.sharingModel) + '</span>' : '') +
        '</div></div>' +
        '<p class="dm-panel-desc">' + escapeHtml(d.description || 'No description on the deployed metadata yet.') + '</p>' +
        (related.length ? sectionTitle('Relationships', related.length) + '<div class="dm-rel-list">' + relHtml + '</div>' : '') +
        sectionTitle('Fields', d.fields ? d.fields.length : 0) +
        '<div class="dm-field-list">' + fieldsHtml + '</div>';
      panelEl.scrollTop = 0;

      panelEl.querySelectorAll('[data-jump]').forEach(function (row) {
        function jump() {
          var target = cy.getElementById(row.getAttribute('data-jump'));
          if (target && target.length) {
            selectNode(target);
            cy.animate({ center: { eles: target }, zoom: Math.max(cy.zoom(), 1) }, { duration: 260 });
          }
        }
        row.addEventListener('click', jump);
        // A div with role="button" gets no key handling for free.
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); jump(); }
        });
      });
    }

    cy.on('tap', 'node', function (evt) { selectNode(evt.target); });
    cy.on('tap', function (evt) { if (evt.target === cy) clearSelection(); });

    var fsBtn = document.getElementById('dm-fullscreen');
    var dmApp = cyEl.closest('.dm-app');
    function isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    function updateFsBtn() {
      if (!fsBtn) return;
      var active = isFullscreen();
      fsBtn.textContent = active ? '⤢' : '⛶';
      fsBtn.title = active ? 'Exit full screen' : 'Full screen';
    }
    if (fsBtn && dmApp) {
      fsBtn.addEventListener('click', function () {
        if (isFullscreen()) {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else if (dmApp.requestFullscreen) {
          dmApp.requestFullscreen();
        } else if (dmApp.webkitRequestFullscreen) {
          dmApp.webkitRequestFullscreen();
        }
      });
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (evt) {
        document.addEventListener(evt, function () {
          updateFsBtn();
          cy.resize();
          cy.fit(undefined, 40);
        });
      });
    }

    var zoomIn = document.getElementById('dm-zoom-in');
    var zoomOut = document.getElementById('dm-zoom-out');
    var zoomFit = document.getElementById('dm-zoom-fit');
    if (zoomIn) zoomIn.addEventListener('click', function () { cy.zoom(cy.zoom() * 1.25); });
    if (zoomOut) zoomOut.addEventListener('click', function () { cy.zoom(cy.zoom() * 0.8); });
    if (zoomFit) zoomFit.addEventListener('click', function () { cy.fit(undefined, 40); });

    var searchInput = document.getElementById('dm-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.trim().toLowerCase();
        if (!q) { cy.elements().removeClass('dm-dim'); return; }
        cy.nodes().forEach(function (n) {
          var hay = (n.data('label') + ' ' + n.data('apiName')).toLowerCase();
          n.toggleClass('dm-dim', hay.indexOf(q) === -1);
        });
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var q = searchInput.value.trim().toLowerCase();
        var match = cy.nodes().filter(function (n) {
          return (n.data('label') + ' ' + n.data('apiName')).toLowerCase().indexOf(q) !== -1;
        })[0];
        if (match) { selectNode(match); cy.animate({ center: { eles: match }, zoom: 1.1 }, { duration: 260 }); }
      });
    }

    var domainKeys = Object.keys(domainMeta);
    var activeDomains = {};
    domainKeys.forEach(function (k) { activeDomains[k] = true; });
    var filterWrap = document.getElementById('dm-domain-filters');
    if (filterWrap) {
      domainKeys.forEach(function (k) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dm-domain-btn';
        btn.innerHTML = '<span class="sw" style="background:' + domainMeta[k].color + '"></span>' + domainMeta[k].label;
        btn.addEventListener('click', function () {
          activeDomains[k] = !activeDomains[k];
          btn.classList.toggle('is-off', !activeDomains[k]);
          cy.nodes().forEach(function (n) { n.toggleClass('dm-dim', !activeDomains[n.data('domain')]); });
          cy.edges().forEach(function (e) {
            var on = activeDomains[e.source().data('domain')] && activeDomains[e.target().data('domain')];
            e.toggleClass('dm-dim', !on);
          });
        });
        filterWrap.appendChild(btn);
      });
    }

    var legendWrap = document.getElementById('legend-strip');
    if (legendWrap) {
      domainKeys.forEach(function (k) {
        var item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = '<span class="legend-swatch" style="background:' + domainMeta[k].color + '"></span>' + domainMeta[k].label;
        legendWrap.appendChild(item);
      });
      var noteItem = document.createElement('div');
      noteItem.className = 'legend-item';
      noteItem.style.marginLeft = 'auto';
      noteItem.style.color = 'var(--fn-ink-faint)';
      noteItem.textContent = DATA.nodes.length + ' objects · ' + DATA.edges.length + ' relationships · generated from deployed metadata';
      legendWrap.appendChild(noteItem);
    }

    cy.ready(function () { cy.fit(undefined, 40); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
