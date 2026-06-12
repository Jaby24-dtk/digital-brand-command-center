/**
 * app.js — Dashboard orchestration
 */

// Unhandled promise rejection safety net
window.onunhandledrejection = function (ev) {
  var r = ev.reason;
  var el = document.getElementById('dashboard-content') || document.getElementById('app');
  if (el) el.innerHTML = buildErrorCard(r instanceof Error ? r : new Error(String(r || 'Unhandled rejection')));
};

// ─── Self-contained diagnostic helpers (no external deps) ────────────────────

function buildDiagPanel(url) {
  return (
    '<div style="padding:40px;display:flex;flex-direction:column;gap:14px;max-width:700px;margin:0 auto;font-family:sans-serif">' +
    '<p style="margin:0;font-size:14px;font-weight:600;color:#1A1028">&#8203;Connecting to Google Sheet…</p>' +
    '<div style="border:1px solid rgba(26,16,40,.12);border-radius:10px;overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    _drow('Fetch URL', '<span style="font-size:11px;font-family:monospace;word-break:break-all;color:rgba(26,16,40,.68)">' + _esc(url) + '</span>') +
    _drow('HTTP Status', '<em style="color:rgba(26,16,40,.4)">requesting…</em>') +
    _drow('Response', '<em style="color:rgba(26,16,40,.4)">waiting…</em>') +
    _drow('Rows', '<em style="color:rgba(26,16,40,.4)">waiting…</em>') +
    '</table></div></div>'
  );
}

function buildErrorCard(err) {
  var msg     = (err && err.message) || 'Unknown error';
  var url     = (err && err.url)     || '';
  var status  = (err && err.httpStatus !== undefined) ? String(err.httpStatus) : '—';
  var preview = (err && err.preview) || '';
  var size    = (err && err.responseSize !== undefined) ? (err.responseSize + ' bytes') : '—';
  var rows    = (err && err.rows     !== undefined) ? String(err.rows) : '—';
  var sheetId = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.SHEET_ID) || '';
  var isHttp  = /^\d+$/.test(status) && parseInt(status, 10) >= 400;

  return (
    '<div style="padding:40px;display:flex;flex-direction:column;gap:18px;max-width:700px;margin:0 auto;font-family:sans-serif">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<span style="font-size:28px;color:#C43040">&#9888;</span>' +
    '<h3 style="margin:0;font-size:16px;font-weight:600;color:#1A1028">Cannot Load Dashboard Data</h3>' +
    '</div>' +
    '<p style="margin:0;font-size:13px;color:rgba(26,16,40,.68);line-height:1.55">' + _esc(msg) + '</p>' +
    '<div style="border:1px solid rgba(26,16,40,.12);border-radius:10px;overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    _drow('Fetch URL', url ? '<span style="font-size:11px;font-family:monospace;word-break:break-all">' + _esc(url) + '</span>' : '—') +
    _drow('HTTP Status', '<strong style="color:' + (isHttp ? '#C43040' : '#1A1028') + '">' + _esc(status) + '</strong>') +
    _drow('Response Size', _esc(size)) +
    _drow('Rows Loaded', _esc(rows)) +
    (preview ? _drow('Response', '<pre style="margin:0;font-size:10px;max-height:80px;overflow:auto;white-space:pre-wrap;color:rgba(26,16,40,.7)">' + _esc(preview.substring(0, 300)) + '</pre>') : '') +
    '</table></div>' +
    '<div style="background:rgba(255,255,255,.55);border:1px solid rgba(26,16,40,.09);border-radius:10px;padding:14px 18px;font-size:13px">' +
    '<p style="margin:0 0 8px;font-weight:600;color:#1A1028">To fix:</p>' +
    '<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;color:rgba(26,16,40,.68)">' +
    '<li>Open your <a href="https://docs.google.com/spreadsheets/d/' + sheetId + '" target="_blank" style="color:#C94F80;font-weight:600">Google Sheet</a></li>' +
    '<li><strong>Share → Anyone with the link → Viewer</strong></li>' +
    '<li>In Apps Script: run <strong>DBCC → Sync Drive Files</strong> to create Drive Live Registry tab</li>' +
    '</ol></div>' +
    '<button onclick="window.DBCC&&window.DBCC.refresh?window.DBCC.refresh():location.reload()" ' +
    'style="align-self:flex-start;padding:10px 22px;background:#FFD0E6;border:1px solid #F4AECB;' +
    'border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:#9B2E5E">' +
    '↻ Retry</button></div>'
  );
}

function _drow(label, val) {
  return (
    '<tr style="border-top:1px solid rgba(26,16,40,.09)">' +
    '<td style="padding:8px 12px;font-weight:600;font-size:11px;color:#1A1028;white-space:nowrap;' +
    'vertical-align:top;background:rgba(26,16,40,.03);border-right:1px solid rgba(26,16,40,.09);width:100px">' + label + '</td>' +
    '<td style="padding:8px 12px;color:rgba(26,16,40,.68);vertical-align:top">' + val + '</td>' +
    '</tr>'
  );
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _registryUrl() {
  try {
    return 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(CONFIG.TAB_NAMES.DRIVE_REGISTRY);
  } catch (e) {
    return 'Could not build URL: ' + e.message;
  }
}

// ─── Main IIFE ────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var refreshTimer = null;
  var currentData  = null;
  var isLoading    = false;

  // ─── Render pipeline ───────────────────────────────────────────────────────

  function renderDashboard(data) {
    var root = document.getElementById('dashboard-content');
    if (!root) return;

    var html = '';
    try { html += KPIGrid(data.kpis); }                 catch (e) { html += _sectionErr('KPI Grid', e); }
    try { html += BrandAssetSummary(data.brands); }     catch (e) { html += _sectionErr('Brand Summary', e); }
    try {
      html += '<div class="two-col">';
      try { html += RecentUploads(data.recentUploads); } catch (e) { html += _sectionErr('Recent Uploads', e); }
      try { html += PriorityActions(data.actions); }     catch (e) { html += _sectionErr('Actions', e); }
      html += '</div>';
    } catch (e) { html += _sectionErr('Two-col row 1', e); }
    try {
      html += '<div class="two-col">';
      try { html += RenameCompliance(data.renameCompliance); } catch (e) { html += _sectionErr('Rename Compliance', e); }
      try { html += DriveSyncStatus(data.driveSync); }         catch (e) { html += _sectionErr('Drive Sync', e); }
      html += '</div>';
    } catch (e) { html += _sectionErr('Two-col row 2', e); }

    root.innerHTML = html;

    try { updateHeader(data.meta); }   catch (e) { console.error('[DBCC] updateHeader:', e); }
    try { animateCounters(); }         catch (e) {}
    try { animateProgressBars(); }     catch (e) {}
    try { bindNavHighlight(); }        catch (e) {}
  }

  function _sectionErr(name, e) {
    console.error('[DBCC] Section render error (' + name + '):', e);
    return '<div style="padding:16px;margin:8px 0;background:rgba(196,48,64,.07);border:1px solid rgba(196,48,64,.2);border-radius:8px;font-size:12px;font-family:sans-serif">' +
      '<strong style="color:#C43040">' + name + ' failed to render:</strong> ' + _esc(e.message) + '</div>';
  }

  function updateHeader(meta) {
    var headerEl = document.getElementById('top-header');
    if (!headerEl) return;
    var updated = meta && meta.lastUpdated
      ? new Date(meta.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    var isDemo = !meta || meta.source === 'demo';
    var updatedEl = headerEl.querySelector('.last-updated');
    if (updatedEl) updatedEl.innerHTML = '<i class="ph ph-clock"></i> Updated ' + updated;
    var titleDiv = headerEl.querySelector('.header-title');
    if (titleDiv) {
      [].forEach.call(titleDiv.querySelectorAll('.demo-badge,.live-badge'), function (b) { b.remove(); });
      var badge = document.createElement('span');
      badge.className = isDemo ? 'demo-badge' : 'live-badge';
      badge.textContent = isDemo ? 'Demo Data' : 'Live Data';
      titleDiv.appendChild(badge);
    }
    var btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.remove('spinning');
  }

  // ─── Counter animation ─────────────────────────────────────────────────────

  function animateCounters() {
    document.querySelectorAll('[data-rive-target="counter"]').forEach(function (el) {
      var target = parseFloat(el.dataset.value) || 0;
      var isFloat = (el.dataset.value || '').indexOf('.') > -1;
      var duration = 800;
      var start = performance.now();
      function tick(now) {
        var p = Math.min((now - start) / duration, 1);
        var ease = 1 - Math.pow(1 - p, 3);
        var current = target * ease;
        var unit = el.dataset.unit || '';
        if (unit === '%') {
          el.textContent = Math.round(current) + '%';
        } else if (target >= 1000) {
          var k = current / 1000;
          el.textContent = k >= 1 ? k.toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(current).toString();
        } else {
          el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toString();
        }
        if (p < 1) requestAnimationFrame(tick);
      }
      el.textContent = '0';
      requestAnimationFrame(tick);
    });
  }

  // ─── Progress bar animation ────────────────────────────────────────────────

  function animateProgressBars() {
    document.querySelectorAll('[data-rive-target="progress-bar"]').forEach(function (el) {
      var w = el.style.width;
      el.style.width = '0%';
      requestAnimationFrame(function () {
        el.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
        el.style.width = w;
      });
    });
    document.querySelectorAll('.ring-arc').forEach(function (arc) {
      var len = arc.getTotalLength ? arc.getTotalLength() : 150;
      arc.style.strokeDashoffset = len.toString();
      requestAnimationFrame(function () {
        arc.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)';
        arc.style.strokeDashoffset = '';
      });
    });
  }

  // ─── Nav highlight on scroll ───────────────────────────────────────────────

  function bindNavHighlight() {
    var sections = document.querySelectorAll('.dashboard-section');
    var navItems = document.querySelectorAll('.nav-item');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          navItems.forEach(function (n) {
            n.classList.toggle('nav-item--active', n.dataset.section === id);
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-60px 0px -60% 0px' });
    sections.forEach(function (s) { observer.observe(s); });
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async function refresh() {
    if (isLoading) return;
    isLoading = true;

    var root = document.getElementById('dashboard-content');
    var btn  = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('spinning');

    // Show fetch diagnostic panel immediately — before any network call
    var fetchUrl = _registryUrl();
    if (root) root.innerHTML = buildDiagPanel(fetchUrl);

    try {
      var data = await loadDashboardData();
      currentData = data;
      renderDashboard(data);
    } catch (err) {
      console.error('[DBCC] ──────────────────────────────────────');
      console.error('[DBCC] Fetch failed');
      console.error('[DBCC] message:      ', err.message);
      console.error('[DBCC] url:          ', err.url        || 'N/A');
      console.error('[DBCC] httpStatus:   ', err.httpStatus !== undefined ? err.httpStatus : 'N/A');
      console.error('[DBCC] responseSize: ', err.responseSize !== undefined ? err.responseSize : 'N/A');
      console.error('[DBCC] rows:         ', err.rows       !== undefined ? err.rows : 'N/A');
      console.error('[DBCC] preview:      ', err.preview    || 'N/A');
      console.error('[DBCC] ──────────────────────────────────────');
      if (root) root.innerHTML = buildErrorCard(err);
    } finally {
      isLoading = false;
      if (btn) btn.classList.remove('spinning');
    }
  }

  // ─── Sidebar toggle ────────────────────────────────────────────────────────

  function toggleSidebar() {
    var s = document.getElementById('sidebar');
    var a = document.getElementById('app');
    if (s) s.classList.toggle('sidebar--open');
    if (a) a.classList.toggle('sidebar-open');
  }

  // ─── Auto-refresh ──────────────────────────────────────────────────────────

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (typeof CONFIG !== 'undefined' && CONFIG.REFRESH_INTERVAL > 0) {
      refreshTimer = setInterval(refresh, CONFIG.REFRESH_INTERVAL);
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    // Remove pre-JS loading screen immediately
    var preJs = document.getElementById('pre-js');
    if (preJs) preJs.remove();

    var app = document.getElementById('app');
    if (!app) {
      console.error('[DBCC] #app not found');
      document.body.innerHTML = buildErrorCard(new Error('#app element missing from HTML'));
      return;
    }

    // Build shell (sidebar + header + content area)
    try {
      app.innerHTML = (typeof Sidebar === 'function' ? Sidebar() : '') +
        '<div class="main-wrap">' +
        '<header class="top-header" id="top-header">' +
        '<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar"><i class="ph ph-list"></i></button>' +
        '<div class="header-title"><h1>' + (typeof CONFIG !== 'undefined' ? CONFIG.TITLE : 'DBCC') + '</h1></div>' +
        '<div class="header-actions">' +
        '<span class="last-updated text-muted"><i class="ph ph-clock"></i> Loading…</span>' +
        '<button class="btn-icon spinning" id="refreshBtn" aria-label="Refresh"><i class="ph ph-arrows-clockwise"></i></button>' +
        '</div></header>' +
        '<main class="main-content" id="dashboard-content" role="main"></main>' +
        '</div>';
    } catch (shellErr) {
      console.error('[DBCC] Shell render error:', shellErr);
      app.innerHTML = buildErrorCard(shellErr);
      return;
    }

    var rfBtn = document.getElementById('refreshBtn');
    var sbBtn = document.getElementById('sidebarToggle');
    if (rfBtn) rfBtn.addEventListener('click', refresh);
    if (sbBtn) sbBtn.addEventListener('click', toggleSidebar);
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav-item') && window.innerWidth < 900) {
        var s = document.getElementById('sidebar');
        var a = document.getElementById('app');
        if (s) s.classList.remove('sidebar--open');
        if (a) a.classList.remove('sidebar-open');
      }
    });

    try {
      await refresh();
    } catch (err) {
      console.error('[DBCC] refresh() threw unexpectedly:', err);
      var root = document.getElementById('dashboard-content') || app;
      root.innerHTML = buildErrorCard(err);
    }

    startAutoRefresh();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  window.DBCC = { refresh: refresh, toggleSidebar: toggleSidebar, getData: function () { return currentData; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
