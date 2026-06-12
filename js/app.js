/**
 * app.js — Dashboard orchestration and lifecycle
 */

// ─── Global safety net (runs before any other code) ──────────────────────────
// Catches JS errors AND unhandled promise rejections so the screen is never blank.

window.onerror = function (msg, src, line, col) {
  var el = document.getElementById('dashboard-content') || document.getElementById('app');
  if (!el) return false;
  el.innerHTML =
    '<div style="padding:32px;display:flex;flex-direction:column;gap:14px;max-width:640px;margin:40px auto">' +
    '<span style="font-size:32px;color:#C43040">⚠</span>' +
    '<h3 style="font-size:15px;font-weight:600;color:#1A1028;margin:0">JavaScript Error — cannot load dashboard</h3>' +
    '<pre style="background:rgba(196,48,64,0.07);border:1px solid rgba(196,48,64,0.2);padding:12px;border-radius:8px;' +
    'font-size:11px;white-space:pre-wrap;word-break:break-all;color:#1A1028;margin:0">' +
    String(msg || '') + '\n' + String(src || '') + ':' + (line || 0) + ':' + (col || 0) +
    '</pre>' +
    '<button onclick="location.reload()" style="align-self:flex-start;padding:8px 20px;background:#FFD0E6;' +
    'border:1px solid #F4AECB;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">Reload page</button>' +
    '</div>';
  return false;
};

window.onunhandledrejection = function (event) {
  var el = document.getElementById('dashboard-content');
  if (!el) return;
  var reason = event.reason;
  if (typeof ErrorState === 'function') {
    el.innerHTML = ErrorState(reason instanceof Error ? reason : new Error(String(reason || 'Unhandled rejection')));
  } else {
    el.innerHTML =
      '<div style="padding:32px;color:#1A1028;max-width:640px;margin:40px auto">' +
      '<h3 style="margin:0 0 8px">Unhandled Error</h3>' +
      '<pre style="font-size:12px;background:rgba(196,48,64,0.07);padding:12px;border-radius:8px">' +
      String(reason || '') + '</pre>' +
      '</div>';
  }
};

// ─── Main IIFE ────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  let refreshTimer = null;
  let currentData  = null;
  let isLoading    = false;

  // ─── Render pipeline ───────────────────────────────────────────────────────

  function renderDashboard(data) {
    const root = document.getElementById('dashboard-content');
    if (!root) return;

    root.innerHTML = [
      KPIGrid(data.kpis),
      BrandAssetSummary(data.brands),
      `<div class="two-col">
        ${RecentUploads(data.recentUploads)}
        ${PriorityActions(data.actions)}
      </div>`,
      `<div class="two-col">
        ${RenameCompliance(data.renameCompliance)}
        ${DriveSyncStatus(data.driveSync)}
      </div>`,
    ].join('');

    updateHeader(data.meta);
    animateCounters();
    animateProgressBars();
    bindNavHighlight();
  }

  function updateHeader(meta) {
    const headerEl = document.getElementById('top-header');
    if (!headerEl) return;

    const updated = meta && meta.lastUpdated
      ? new Date(meta.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    const isDemo = !meta || meta.source === 'demo';

    const updatedEl = headerEl.querySelector('.last-updated');
    if (updatedEl) updatedEl.innerHTML = `<i class="ph ph-clock"></i> Updated ${updated}`;

    const titleDiv = headerEl.querySelector('.header-title');
    if (titleDiv) {
      titleDiv.querySelectorAll('.demo-badge, .live-badge').forEach(b => b.remove());
      const badge = document.createElement('span');
      badge.className = isDemo ? 'demo-badge' : 'live-badge';
      badge.textContent = isDemo ? 'Demo Data' : 'Live Data';
      titleDiv.appendChild(badge);
    }

    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.remove('spinning');
  }

  // ─── Counter animation ─────────────────────────────────────────────────────

  function animateCounters() {
    document.querySelectorAll('[data-rive-target="counter"]').forEach(el => {
      const target = parseFloat(el.dataset.value) || 0;
      const isFloat = (el.dataset.value || '').includes('.');
      const duration = 800;
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = target * ease;

        const unit = el.dataset.unit || '';
        if (unit === '%') {
          el.textContent = Math.round(current) + '%';
        } else if (target >= 1000) {
          const k = current / 1000;
          el.textContent = k >= 1 ? k.toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(current).toString();
        } else {
          el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toString();
        }

        if (progress < 1) requestAnimationFrame(tick);
      }

      el.textContent = '0';
      requestAnimationFrame(tick);
    });
  }

  // ─── Progress bar animation ────────────────────────────────────────────────

  function animateProgressBars() {
    document.querySelectorAll('[data-rive-target="progress-bar"]').forEach(el => {
      const targetWidth = el.style.width;
      el.style.width = '0%';
      requestAnimationFrame(() => {
        el.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
        el.style.width = targetWidth;
      });
    });

    document.querySelectorAll('.ring-arc').forEach(arc => {
      const totalLength = arc.getTotalLength ? arc.getTotalLength() : 150;
      arc.style.strokeDashoffset = totalLength.toString();
      requestAnimationFrame(() => {
        arc.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)';
        arc.style.strokeDashoffset = '';
      });
    });
  }

  // ─── Nav highlight on scroll ───────────────────────────────────────────────

  function bindNavHighlight() {
    const sections = document.querySelectorAll('.dashboard-section');
    const navItems = document.querySelectorAll('.nav-item');

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navItems.forEach(n => {
            n.classList.toggle('nav-item--active', n.dataset.section === id);
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-60px 0px -60% 0px' });

    sections.forEach(s => observer.observe(s));
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  function showLoading() {
    const root = document.getElementById('dashboard-content');
    if (!root) return;
    root.innerHTML = `
      <div class="loading-grid">
        ${LoadingSkeleton(8, 'kpi')}
      </div>
      <div class="loading-grid loading-grid--single">
        ${LoadingSkeleton(1, 'table')}
      </div>
      <div class="loading-grid loading-grid--two">
        ${LoadingSkeleton(2, 'list')}
      </div>
      <div class="loading-grid loading-grid--two">
        ${LoadingSkeleton(2, 'list')}
      </div>`;
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async function refresh() {
    if (isLoading) return;
    isLoading = true;

    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('spinning');

    try {
      const data = await loadDashboardData();
      currentData = data;
      renderDashboard(data);
    } catch (err) {
      // Log every diagnostic field
      console.error('[DBCC] Fetch failed');
      console.error('[DBCC] message:    ', err.message);
      console.error('[DBCC] url:        ', err.url        || 'N/A');
      console.error('[DBCC] httpStatus: ', err.httpStatus !== undefined ? err.httpStatus : 'N/A');
      console.error('[DBCC] preview:    ', err.preview    || 'N/A');
      console.error('[DBCC] stack:      ', err.stack      || 'N/A');

      // Always show the error card — never leave a blank screen
      const root = document.getElementById('dashboard-content');
      if (root) root.innerHTML = ErrorState(err);
    } finally {
      isLoading = false;
      if (btn) btn.classList.remove('spinning');
    }
  }

  // ─── Sidebar toggle ────────────────────────────────────────────────────────

  function toggleSidebar() {
    document.getElementById('sidebar') && document.getElementById('sidebar').classList.toggle('sidebar--open');
    document.getElementById('app')     && document.getElementById('app').classList.toggle('sidebar-open');
  }

  // ─── Auto-refresh ──────────────────────────────────────────────────────────

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (CONFIG.REFRESH_INTERVAL > 0) {
      refreshTimer = setInterval(refresh, CONFIG.REFRESH_INTERVAL);
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    const app = document.getElementById('app');
    if (!app) {
      console.error('[DBCC] #app element not found — cannot mount dashboard');
      return;
    }

    try {
      app.innerHTML = `
        ${Sidebar()}
        <div class="main-wrap">
          <header class="top-header" id="top-header">
            <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">
              <i class="ph ph-list"></i>
            </button>
            <div class="header-title">
              <h1>${CONFIG.TITLE}</h1>
            </div>
            <div class="header-actions">
              <span class="last-updated text-muted"><i class="ph ph-clock"></i> Loading…</span>
              <button class="btn-icon spinning" id="refreshBtn" aria-label="Refresh">
                <i class="ph ph-arrows-clockwise"></i>
              </button>
            </div>
          </header>
          <main class="main-content" id="dashboard-content" role="main"></main>
        </div>`;
    } catch (shellErr) {
      console.error('[DBCC] Shell render error:', shellErr);
      app.innerHTML =
        '<div style="padding:32px;max-width:640px;margin:40px auto;color:#1A1028">' +
        '<h3 style="margin:0 0 8px;font-size:15px;font-weight:600">Dashboard shell failed to render</h3>' +
        '<pre style="font-size:11px;background:rgba(196,48,64,0.07);padding:12px;border-radius:8px">' +
        (shellErr.message || String(shellErr)) + '</pre>' +
        '<button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#FFD0E6;' +
        'border:none;border-radius:8px;cursor:pointer;font-weight:600">Reload page</button>' +
        '</div>';
      return;
    }

    showLoading();

    document.getElementById('refreshBtn')  && document.getElementById('refreshBtn').addEventListener('click', refresh);
    document.getElementById('sidebarToggle') && document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

    document.addEventListener('click', e => {
      if (e.target.closest('.nav-item') && window.innerWidth < 900) {
        document.getElementById('sidebar') && document.getElementById('sidebar').classList.remove('sidebar--open');
        document.getElementById('app')     && document.getElementById('app').classList.remove('sidebar-open');
      }
    });

    await refresh();
    startAutoRefresh();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  window.DBCC = { refresh, toggleSidebar, getData: () => currentData };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
