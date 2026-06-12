/**
 * components.js — Reusable HTML component renderers
 * All functions return an HTML string.
 */

// ─── Icon library (Phosphor-compatible class names) ──────────────────────────

const ICON = {
  // Usage: ICON.svg('buildings') → <i class="ph ph-buildings">
  svg: name => `<i class="ph ph-${name}" aria-hidden="true"></i>`,
};

// ─── KPI Meta config ─────────────────────────────────────────────────────────

const KPI_META = {
  total_brands:    { label: 'Total Brands',    icon: 'stack',         unit: '',  accent: 'pink'    },
  total_assets:    { label: 'Total Assets',    icon: 'folder-open',   unit: '',  accent: 'blue'    },
  pending_review:  { label: 'Pending Review',  icon: 'clock',         unit: '',  accent: 'yellow'  },
  rename_needed:   { label: 'Rename Needed',   icon: 'pencil-simple', unit: '',  accent: 'orange'  },
  auto_logged:     { label: 'Auto-logged',     icon: 'lightning',     unit: '',  accent: 'purple'  },
  social_accounts: { label: 'Social Accounts', icon: 'share-network', unit: '',  accent: 'teal'    },
  upcoming_posts:  { label: 'Upcoming Posts',  icon: 'calendar-blank',unit: '',  accent: 'blue'    },
  access_risks:    { label: 'Access Risks',    icon: 'shield-warning',unit: '',  accent: 'red'     },
  domains_tracked: { label: 'Domains Tracked', icon: 'globe',         unit: '',  accent: 'teal'    },
  overall_health:  { label: 'Overall Health',  icon: 'heartbeat',     unit: '%', accent: 'green'   },
};

// ─── Utility helpers ─────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

function trendIcon(trend, change) {
  if (trend === 'up')    return `<span class="trend trend--up">${ICON.svg('trend-up')} +${Math.abs(change)}</span>`;
  if (trend === 'down')  return `<span class="trend trend--down">${ICON.svg('trend-down')} −${Math.abs(change)}</span>`;
  return `<span class="trend trend--stable">${ICON.svg('minus')} —</span>`;
}

function statusBadge(status) {
  const map = {
    new:       { cls: 'blue',   label: 'New'      },
    review:    { cls: 'yellow', label: 'Review'   },
    approved:  { cls: 'green',  label: 'Approved' },
    synced:    { cls: 'green',  label: 'Synced'   },
    syncing:   { cls: 'blue',   label: 'Syncing'  },
    error:     { cls: 'red',    label: 'Error'    },
    pending:   { cls: 'yellow', label: 'Pending'  },
    warning:   { cls: 'yellow', label: 'Warning'  },
    critical:  { cls: 'red',    label: 'Critical' },
    high:      { cls: 'orange', label: 'High'     },
    medium:    { cls: 'yellow', label: 'Medium'   },
    low:       { cls: 'teal',   label: 'Low'      },
  };
  const s = map[status] || { cls: 'muted', label: status };
  return `<span class="badge badge--${s.cls}">${s.label}</span>`;
}

function healthColor(pct) {
  if (pct >= 85) return 'var(--green)';
  if (pct >= 65) return 'var(--status-warning)';
  return 'var(--status-danger)';
}

function fileTypeIcon(type) {
  const map = { vector: 'bezier-curve', image: 'image', doc: 'file-text', archive: 'archive', asset: 'palette', video: 'video' };
  return ICON.svg(map[type] || 'file');
}

function brandDot(brandId) {
  const brand = CONFIG.BRANDS.find(b => b.id === brandId);
  const color = brand ? brand.color : '#888';
  return `<span class="brand-dot" style="background:${color}"></span>`;
}

function healthRing(pct, size = 44) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = healthColor(pct);
  return `
    <div class="health-ring" data-rive-target="status-ring" data-value="${pct}" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="3"
          stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ * 0.25}"
          stroke-linecap="round" class="ring-arc"/>
      </svg>
      <span class="ring-label" style="color:${color}">${pct}%</span>
    </div>`;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, action = '' }) {
  return `
    <div class="section-header">
      <div>
        <h2 class="section-title">${title}</h2>
        ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
      </div>
      ${action ? `<div class="section-action">${action}</div>` : ''}
    </div>`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard(key, data) {
  const meta = KPI_META[key] || { label: key, icon: 'chart-bar', unit: '', accent: 'gold' };
  const val = data.unit === '%' ? data.value + '%' : formatNumber(data.value);
  const isHealth = key === 'overall_health';
  const isRisk = key === 'access_risks' && data.value > 0;

  return `
    <article class="kpi-card glass-card ${isRisk ? 'kpi-card--risk' : ''}" role="region" aria-label="${meta.label}">
      <div class="kpi-card__header">
        <div class="kpi-icon kpi-icon--${meta.accent}">${ICON.svg(meta.icon)}</div>
        ${trendIcon(data.trend, data.change)}
      </div>
      <div class="kpi-card__body">
        <div class="kpi-value" data-rive-target="counter" data-value="${data.value}" data-unit="${data.unit || ''}">${val}</div>
        <div class="kpi-label">${meta.label}</div>
      </div>
      ${isHealth ? `<div class="kpi-card__footer"><div class="health-bar"><div class="health-bar__fill" style="width:${data.value}%;background:${healthColor(data.value)}"></div></div></div>` : ''}
    </article>`;
}

// ─── KPI Grid ────────────────────────────────────────────────────────────────

function KPIGrid(kpis) {
  const order = ['total_brands','total_assets','pending_review','rename_needed','auto_logged',
                 'social_accounts','upcoming_posts','access_risks','domains_tracked','overall_health'];
  return `
    <section id="kpi-section" class="dashboard-section">
      ${SectionHeader({ title: 'Executive KPIs', subtitle: 'Live performance overview across all brands' })}
      <div class="kpi-grid">
        ${order.map(k => KPICard(k, kpis[k] || { value: 0, change: 0, trend: 'stable' })).join('')}
      </div>
    </section>`;
}

// ─── Brand Asset Summary ─────────────────────────────────────────────────────

function BrandRow(brand) {
  const b = CONFIG.BRANDS.find(b => b.id === brand.id) || {};
  return `
    <tr class="brand-row" data-brand="${brand.id}">
      <td>
        <div class="brand-cell">
          <span class="brand-color-bar" style="background:${b.color || brand.color || '#888'}"></span>
          <span class="brand-name">${brand.label}</span>
        </div>
      </td>
      <td class="num">${brand.totalFiles.toLocaleString()}</td>
      <td class="num text-success">${brand.reviewed.toLocaleString()}</td>
      <td class="num">
        <span class="${brand.pending > 40 ? 'text-warning' : 'text-muted'}">${brand.pending}</span>
      </td>
      <td class="num">
        <span class="${brand.renameNeeded > 20 ? 'text-danger' : 'text-muted'}">${brand.renameNeeded}</span>
      </td>
      <td>${healthRing(brand.health, 44)}</td>
    </tr>`;
}

function BrandAssetSummary(brands) {
  return `
    <section id="brand-summary" class="dashboard-section">
      ${SectionHeader({ title: 'Brand Asset Summary', subtitle: 'File counts and health scores per brand' })}
      <div class="glass-card table-card">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Total Files</th>
                <th>Reviewed</th>
                <th>Pending</th>
                <th>Rename Needed</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              ${brands.map(BrandRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

// ─── Recent Asset Uploads ─────────────────────────────────────────────────────

function UploadItem(upload) {
  const brand = CONFIG.BRANDS.find(b => b.id === upload.brand) || {};
  return `
    <li class="upload-item">
      <div class="upload-icon upload-icon--${upload.type}">${fileTypeIcon(upload.type)}</div>
      <div class="upload-info">
        <span class="upload-name" title="${upload.filename}">${upload.filename}</span>
        <span class="upload-meta">
          ${brandDot(upload.brand)}
          <span style="color:${brand.color || '#888'}">${upload.brand}</span>
          <span class="sep">·</span>
          <span class="text-muted">${upload.size}</span>
        </span>
      </div>
      <div class="upload-right">
        ${statusBadge(upload.status)}
        <span class="upload-date text-muted">${upload.date}</span>
      </div>
    </li>`;
}

function RecentUploads(uploads) {
  return `
    <section id="recent-uploads" class="dashboard-section dashboard-section--half">
      ${SectionHeader({ title: 'Recent Uploads', subtitle: `${uploads.length} files` })}
      <div class="glass-card list-card">
        <ul class="upload-list">
          ${uploads.map(UploadItem).join('')}
        </ul>
      </div>
    </section>`;
}

// ─── Priority Action Items ────────────────────────────────────────────────────

function ActionItem(action) {
  const brand = CONFIG.BRANDS.find(b => b.id === action.brand) || {};
  const brandColor = brand.color || '#888';
  return `
    <li class="action-item action-item--${action.priority}">
      <div class="action-priority-bar" style="background:${action.priority === 'critical' ? 'var(--status-danger)' : action.priority === 'high' ? 'var(--status-orange)' : action.priority === 'medium' ? 'var(--status-warning)' : 'var(--status-info)'}"></div>
      <div class="action-content">
        <div class="action-header">
          ${statusBadge(action.priority)}
          <span class="action-brand" style="color:${brandColor}">${action.brand}</span>
        </div>
        <p class="action-title">${action.title}</p>
        <div class="action-footer">
          <span class="text-muted">${ICON.svg('user')} ${action.owner}</span>
          <span class="text-muted">${ICON.svg('calendar-blank')} ${action.due}</span>
        </div>
      </div>
    </li>`;
}

function PriorityActions(actions) {
  return `
    <section id="priority-actions" class="dashboard-section dashboard-section--half">
      ${SectionHeader({ title: 'Priority Actions', subtitle: `${actions.filter(a => a.priority === 'critical' || a.priority === 'high').length} high priority` })}
      <div class="glass-card list-card">
        <ul class="action-list">
          ${actions.map(ActionItem).join('')}
        </ul>
      </div>
    </section>`;
}

// ─── File Rename Compliance ───────────────────────────────────────────────────

function RenameBar(item) {
  const brand = CONFIG.BRANDS.find(b => b.id === item.brand) || {};
  const color = brand.color || '#888';
  const pct = item.compliance;
  const barColor = pct >= 95 ? 'var(--status-success)' : pct >= 85 ? 'var(--status-warning)' : 'var(--status-danger)';
  return `
    <div class="rename-row">
      <div class="rename-brand">
        <span class="brand-dot" style="background:${color}"></span>
        <span class="rename-brand-name">${item.brand}</span>
        <span class="rename-count text-muted">${item.renamed.toLocaleString()} / ${item.total.toLocaleString()}</span>
      </div>
      <div class="rename-bar-wrap">
        <div class="rename-bar">
          <div class="rename-bar__fill" style="width:${pct}%;background:${barColor}" data-rive-target="progress-bar"></div>
        </div>
        <span class="rename-pct" style="color:${barColor}">${pct.toFixed(1)}%</span>
      </div>
    </div>`;
}

function RenameCompliance(data) {
  const avg = (data.reduce((s, d) => s + d.compliance, 0) / data.length).toFixed(1);
  return `
    <section id="rename-compliance" class="dashboard-section dashboard-section--half">
      ${SectionHeader({ title: 'File Rename Compliance', subtitle: `Avg ${avg}% across all brands` })}
      <div class="glass-card detail-card">
        <div class="rename-list">
          ${data.map(RenameBar).join('')}
        </div>
        <div class="compliance-legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--status-success)"></span>≥ 95% Good</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--status-warning)"></span>85–94% Fair</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--status-danger)"></span>&lt; 85% Needs Work</span>
        </div>
      </div>
    </section>`;
}

// ─── Drive Sync Status ────────────────────────────────────────────────────────

function DriveSyncCard(item) {
  const brand = CONFIG.BRANDS.find(b => b.id === item.brand) || {};
  const color = brand.color || '#888';
  const statusIcon = { synced: 'check-circle', syncing: 'arrows-clockwise', error: 'warning-circle', unknown: 'question' };
  const statusColor = { synced: 'var(--status-success)', syncing: 'var(--status-info)', error: 'var(--status-danger)', unknown: 'var(--text-muted)' };
  const isSyncing = item.status === 'syncing';
  return `
    <div class="drive-card glass-card ${item.status === 'error' ? 'drive-card--error' : ''}">
      <div class="drive-card__header">
        <div class="drive-brand">
          <span class="brand-dot" style="background:${color}"></span>
          <span class="drive-brand-name">${item.brand}</span>
        </div>
        <span class="drive-status" style="color:${statusColor[item.status] || '#888'}">
          <span class="${isSyncing ? 'spin-icon' : ''}">${ICON.svg(statusIcon[item.status] || 'question')}</span>
          ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </span>
      </div>
      <div class="drive-card__stats">
        <div class="drive-stat">
          <span class="drive-stat__val">${item.filesSynced.toLocaleString()}</span>
          <span class="drive-stat__lbl">Files synced</span>
        </div>
        <div class="drive-stat">
          <span class="drive-stat__val ${item.errors > 0 ? 'text-danger' : 'text-success'}">${item.errors}</span>
          <span class="drive-stat__lbl">Errors</span>
        </div>
        <div class="drive-stat">
          <span class="drive-stat__val text-muted">${item.lastSync}</span>
          <span class="drive-stat__lbl">Last sync</span>
        </div>
      </div>
      ${item.errors > 0 ? `<div class="drive-error-banner">${ICON.svg('warning')} ${item.errors} sync error${item.errors > 1 ? 's' : ''} — review required</div>` : ''}
    </div>`;
}

function DriveSyncStatus(data) {
  const errors = data.reduce((s, d) => s + d.errors, 0);
  return `
    <section id="drive-sync" class="dashboard-section dashboard-section--half">
      ${SectionHeader({ title: 'Drive Sync Status', subtitle: errors > 0 ? `${errors} total errors across drives` : 'All drives healthy' })}
      <div class="drive-grid">
        ${data.map(DriveSyncCard).join('')}
      </div>
    </section>`;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton(count = 1, type = 'card') {
  return Array.from({ length: count }, () =>
    `<div class="skeleton skeleton--${type}" data-rive-target="loading" aria-hidden="true"></div>`
  ).join('');
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState(message = 'Failed to load data') {
  return `
    <div class="error-state">
      ${ICON.svg('warning-circle')}
      <p>${message}</p>
      <button class="btn-retry" onclick="window.DBCC.refresh()">Retry</button>
    </div>`;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  const navItems = [
    { id: 'kpi-section',        icon: 'chart-bar',     label: 'Overview'     },
    { id: 'brand-summary',      icon: 'stack',         label: 'Brands'       },
    { id: 'recent-uploads',     icon: 'upload-simple', label: 'Uploads'      },
    { id: 'priority-actions',   icon: 'list-checks',   label: 'Actions'      },
    { id: 'rename-compliance',  icon: 'pencil-simple', label: 'Rename'       },
    { id: 'drive-sync',         icon: 'hard-drives',   label: 'Drive Sync'   },
  ];
  return `
    <aside class="sidebar" id="sidebar" role="navigation" aria-label="Dashboard navigation">
      <div class="sidebar__logo">
        <div class="logo-mark">${ICON.svg('crown-simple')}</div>
        <div class="logo-text">
          <span class="logo-title">DBCC</span>
          <span class="logo-sub">Brand Command</span>
        </div>
      </div>
      <nav class="sidebar__nav">
        ${navItems.map((item, i) => `
          <a href="#${item.id}" class="nav-item ${i === 0 ? 'nav-item--active' : ''}" data-section="${item.id}">
            ${ICON.svg(item.icon)}
            <span>${item.label}</span>
          </a>`).join('')}
      </nav>
      <div class="sidebar__footer">
        <div class="live-indicator">
          <span class="pulse-dot"></span>
          <span class="live-label">Live</span>
        </div>
      </div>
    </aside>`;
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header(meta) {
  const updated = meta && meta.lastUpdated
    ? new Date(meta.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
  const isDemo = meta && meta.source === 'demo';
  return `
    <header class="top-header">
      <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">
        ${ICON.svg('list')}
      </button>
      <div class="header-title">
        <h1>${CONFIG.TITLE}</h1>
        ${isDemo ? '<span class="demo-badge">Demo Data</span>' : ''}
      </div>
      <div class="header-actions">
        <span class="last-updated text-muted">${ICON.svg('clock')} Updated ${updated}</span>
        <button class="btn-icon" id="refreshBtn" aria-label="Refresh data" title="Refresh">
          ${ICON.svg('arrows-clockwise')}
        </button>
      </div>
    </header>`;
}
