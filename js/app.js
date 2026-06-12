/**
 * app.js — Dashboard orchestration and lifecycle
 */

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

    // Replace Phosphor icon placeholders
    if (window.PhosphorIcons) {
      // Icons are already rendered via CSS class — no JS replace needed
    }
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

    // Sync source badge (Demo / Live)
    const titleDiv = headerEl.querySelector('.header-title');
    if (titleDiv) {
      titleDiv.querySelectorAll('.demo-badge, .live-badge').forEach(b => b.remove());
      const badge = document.createElement('span');
      badge.className = isDemo ? 'demo-badge' : 'live-badge';
      badge.textContent = isDemo ? 'Demo Data' : 'Live Data';
      titleDiv.appendChild(badge);
    }

    // Remove loading spinner
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.remove('spinning');
  }

  // ─── Counter animation ─────────────────────────────────────────────────────

  function animateCounters() {
    document.querySelectorAll('[data-rive-target="counter"]').forEach(el => {
      const target = parseFloat(el.dataset.value) || 0;
      const isFloat = el.dataset.value.includes('.');
      const duration = 800;
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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

    // Health ring arcs
    document.querySelectorAll('.ring-arc').forEach(arc => {
      const totalLength = arc.getTotalLength?.() || 150;
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
        ${LoadingSkeleton(10, 'kpi')}
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
      console.error('[DBCC] Refresh error:', err);
      const root = document.getElementById('dashboard-content');
      if (root) root.innerHTML = ErrorState(err.message || 'Failed to load dashboard data.');
    } finally {
      isLoading = false;
      if (btn) btn.classList.remove('spinning');
    }
  }

  // ─── Sidebar toggle ────────────────────────────────────────────────────────

  function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('sidebar--open');
    document.getElementById('app')?.classList.toggle('sidebar-open');
  }

  // ─── Auto-refresh ─────────────────────────────────────────────────────────

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (CONFIG.REFRESH_INTERVAL > 0) {
      refreshTimer = setInterval(refresh, CONFIG.REFRESH_INTERVAL);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    // Inject sidebar and header shell
    const app = document.getElementById('app');
    if (!app) return;

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
        <main class="main-content" id="dashboard-content" role="main">
          <!-- content renders here -->
        </main>
      </div>`;

    showLoading();

    document.getElementById('refreshBtn')?.addEventListener('click', refresh);
    document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);

    // Close sidebar on nav link click (mobile)
    document.addEventListener('click', e => {
      if (e.target.closest('.nav-item') && window.innerWidth < 900) {
        document.getElementById('sidebar')?.classList.remove('sidebar--open');
        document.getElementById('app')?.classList.remove('sidebar-open');
      }
    });

    await refresh();
    startAutoRefresh();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  window.DBCC = { refresh, toggleSidebar, getData: () => currentData };

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
