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
        { selector: '.dm-selected', style: { 'border-color': '#0F7B7F', 'border-width': 3, 'background-opacity': 0.35 } },
        { selector: '.dm-neighbor', style: { 'border-color': '#0A5457', 'border-width': 2.5 } },
        { selector: 'edge.dm-active', style: { 'line-color': '#0F7B7F', 'target-arrow-color': '#0F7B7F', 'width': 2.2, 'opacity': 1 } }
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

      var fieldsHtml = (d.fields || []).map(function (f) {
        var typeLabel = f.type + (f.referenceTo ? (' → ' + f.referenceTo) : '');
        return '<div class="dm-field-row"><span class="dm-field-name">' + escapeHtml(f.apiName) +
          (f.required ? '<span class="req">*</span>' : '') + '</span><span class="dm-field-type">' +
          escapeHtml(typeLabel) + '</span></div>';
      }).join('');

      var relHtml = related.map(function (r) {
        var arrow = r.dir === 'out' ? '→' : '←';
        var label = r.other ? r.other.label : r.otherId;
        return '<span class="dm-rel-chip" data-jump="' + r.otherId + '">' + escapeHtml(label) +
          ' <span class="arrow">' + arrow + ' ' + escapeHtml(r.field) + '</span></span>';
      }).join('');

      if (!panelEl) return;
      panelEl.innerHTML =
        '<p class="dm-panel-kicker">' + escapeHtml((domainMeta[d.domain] && domainMeta[d.domain].label) || d.domain) + '</p>' +
        '<h3 class="dm-panel-title">' + escapeHtml(d.label) + '</h3>' +
        '<p class="dm-panel-api">' + escapeHtml(d.apiName) + '</p>' +
        '<div class="dm-panel-meta">' +
        '<span class="dm-meta-chip">' + escapeHtml(d.kind) + '</span>' +
        '<span class="dm-meta-chip">' + d.fieldCount + ' fields</span>' +
        (d.sharingModel ? '<span class="dm-meta-chip">' + escapeHtml(d.sharingModel) + '</span>' : '') +
        '</div>' +
        '<p class="dm-panel-desc">' + escapeHtml(d.description || 'No description on the deployed metadata yet.') + '</p>' +
        (related.length ? '<p class="dm-panel-section-title">Relationships<span>' + related.length + '</span></p><div>' + relHtml + '</div>' : '') +
        '<p class="dm-panel-section-title">Fields<span>' + (d.fields ? d.fields.length : 0) + '</span></p>' +
        '<div>' + fieldsHtml + '</div>';

      panelEl.querySelectorAll('[data-jump]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var target = cy.getElementById(chip.getAttribute('data-jump'));
          if (target && target.length) {
            selectNode(target);
            cy.animate({ center: { eles: target }, zoom: Math.max(cy.zoom(), 1) }, { duration: 260 });
          }
        });
      });
    }

    cy.on('tap', 'node', function (evt) { selectNode(evt.target); });
    cy.on('tap', function (evt) { if (evt.target === cy) clearSelection(); });

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
