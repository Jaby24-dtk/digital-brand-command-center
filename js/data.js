/**
 * data.js — Live Google Sheets data with demo fallback
 *
 * Fetches 4 tabs via the public gviz/tq CSV endpoint (no API key needed).
 * The sheet must be shared: Share → Anyone with the link → Viewer.
 */

// ─── CSV Parser ────────────────────────────────────────────────────────────────
// Returns an array of arrays. Handles quoted fields, embedded commas, CRLF.

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped ""
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      row.push(field.trim()); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      row.push(field.trim());
      if (row.some(c => c !== '')) rows.push(row);
      row = []; field = '';
    } else {
      field += ch;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field.trim()); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

// ─── Sheet URL builder ─────────────────────────────────────────────────────────

function sheetUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

// ─── Single tab fetch ──────────────────────────────────────────────────────────

async function fetchTab(tabName) {
  const res = await fetch(sheetUrl(tabName), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for tab "${tabName}"`);
  const text = await res.text();
  // gviz returns an HTML error page when the sheet is not publicly accessible
  if (text.trim().startsWith('<')) {
    throw new Error(`Tab "${tabName}" is not accessible. Open the sheet → Share → Anyone with the link → Viewer.`);
  }
  return parseCSV(text);
}

// ─── Health text → numeric % ───────────────────────────────────────────────────

function healthTextToScore(val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n > 0) return Math.min(100, n);
  const map = {
    EXCELLENT: 95, GOOD: 82, OK: 70, FAIR: 55,
    POOR: 35, CRITICAL: 20, URGENT: 22,
  };
  return map[(val || '').toUpperCase().trim()] || 50;
}

// ─── Executive Dashboard → KPIs ───────────────────────────────────────────────
// Layout: row[0]=title  row[1]=timestamp  row[2]=headers  row[3]=values

function parseKPIs(execRows, socialRows, missingRows) {
  const kpis = {
    total_brands:    { value: 0, change: 0, trend: 'stable' },
    total_assets:    { value: 0, change: 0, trend: 'stable' },
    pending_review:  { value: 0, change: 0, trend: 'stable' },
    rename_needed:   { value: 0, change: 0, trend: 'stable' },
    auto_logged:     { value: 0, change: 0, trend: 'stable' },
    social_accounts: { value: 0, change: 0, trend: 'stable' },
    upcoming_posts:  { value: 0, change: 0, trend: 'stable' },
    access_risks:    { value: 0, change: 0, trend: 'stable' },
    domains_tracked: { value: 0, change: 0, trend: 'stable' },
    overall_health:  { value: 50, change: 0, trend: 'stable', unit: '%' },
  };

  if (execRows && execRows.length >= 4) {
    const headers = execRows[2] || [];
    const vals    = execRows[3] || [];
    headers.forEach((h, i) => {
      const key = (h || '').toUpperCase().trim();
      const v   = (vals[i] || '').trim();
      if (key === 'TOTAL BRANDS')    kpis.total_brands.value    = parseInt(v)  || 0;
      if (key === 'TOTAL ASSETS')    kpis.total_assets.value    = parseInt(v)  || 0;
      if (key === 'PENDING REVIEW')  kpis.pending_review.value  = parseInt(v)  || 0;
      if (key === 'RENAME NEEDED')   kpis.rename_needed.value   = parseInt(v)  || 0;
      if (key === 'AUTO LOGGED')     kpis.auto_logged.value     = parseInt(v)  || 0;
      if (key === 'SOCIAL ACCOUNTS') kpis.social_accounts.value = parseInt(v)  || 0;
      if (key === 'OVERALL HEALTH')  kpis.overall_health.value  = healthTextToScore(v);
    });
  }

  // Upcoming posts: count Draft / Scheduled / Planned rows in Social Pipeline
  // Column 9 = Status
  if (socialRows && socialRows.length > 1) {
    const active = new Set(['draft', 'scheduled', 'upcoming', 'planned', 'in progress', 'in-progress']);
    kpis.upcoming_posts.value = socialRows.slice(1)
      .filter(r => active.has((r[9] || '').toLowerCase().trim()))
      .length;
  }

  // Access risks: Missing Checklist items that mention access/password/domain/ssl
  // Column 1 = Missing Item
  if (missingRows && missingRows.length > 1) {
    const riskKw = ['password', 'access', 'ssl', 'domain', 'registrar', 'expiry', 'security'];
    kpis.access_risks.value = missingRows.slice(1)
      .filter(r => riskKw.some(k => (r[1] || '').toLowerCase().includes(k)))
      .length;

    // Domains tracked: items mentioning "domain"
    const domainItems = missingRows.slice(1)
      .filter(r => (r[1] || '').toLowerCase().includes('domain')).length;
    kpis.domains_tracked.value = domainItems || CONFIG.BRANDS.length;
  }

  return kpis;
}

// ─── Digital Asset Vault → Brand Summary ──────────────────────────────────────
// Col 0:Brand  Col 5:Status  Col 15:Naming Check

function parseBrandSummary(assetRows, missingRows) {
  if (!assetRows || assetRows.length < 2) return null;

  const data = assetRows.slice(1); // skip header row

  return CONFIG.BRANDS.map(cfg => {
    const id   = cfg.id;
    const rows = data.filter(r => (r[0] || '').toUpperCase().trim() === id);

    const total        = rows.length;
    const pending      = rows.filter(r => (r[5] || '').trim() === 'Pending Review').length;
    const reviewed     = rows.filter(r => (r[5] || '').trim() === 'Approved').length;
    const renameNeeded = rows.filter(r => (r[15] || '').trim() === 'Rename Needed').length;

    // Health computed from missing checklist (fewer high-priority gaps = healthier)
    let missingHigh = 0, missingMed = 0;
    if (missingRows && missingRows.length > 1) {
      missingRows.slice(1).forEach(r => {
        if ((r[0] || '').toUpperCase().trim() !== id) return;
        const pri = (r[2] || '').toLowerCase().trim();
        if (pri === 'high')   missingHigh++;
        if (pri === 'medium') missingMed++;
      });
    }
    const health = Math.max(10, Math.min(95, 100 - missingHigh * 12 - missingMed * 5));

    return { id, label: cfg.label, color: cfg.color, totalFiles: total, reviewed, pending, renameNeeded, health };
  });
}

// ─── Digital Asset Vault → Recent Uploads ─────────────────────────────────────
// Auto Logged rows = files uploaded via Make.com automation
// Col 0:Brand  Col 1:Asset Type  Col 2:Filename  Col 5:Status  Col 10:Review Date

function parseRecentUploads(assetRows) {
  if (!assetRows || assetRows.length < 2) return null;

  const EXT_TYPE = {
    pdf: 'doc', ai: 'vector', svg: 'vector', eps: 'vector',
    psd: 'image', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
    mp4: 'video', mov: 'video', avi: 'video',
    zip: 'archive', rar: 'archive',
  };

  return assetRows.slice(1)
    .filter(r => (r[5] || '').trim() === 'Auto Logged')
    .slice(0, 10)
    .map(r => {
      const filename = r[2] || 'Unknown file';
      const ext      = filename.split('.').pop().toLowerCase();
      return {
        filename,
        brand:  (r[0] || 'AUTO').toUpperCase(),
        date:   r[10] || new Date().toISOString().split('T')[0],
        size:   '—',
        status: 'auto-logged',
        type:   EXT_TYPE[ext] || 'file',
      };
    });
}

// ─── Missing Asset Checklist → Actions ────────────────────────────────────────
// Col 0:Brand  Col 1:Missing Item  Col 2:Priority  Col 5:Status  Col 6:Owner

function parseActions(missingRows) {
  if (!missingRows || missingRows.length < 2) return null;

  const PRI_MAP = { high: 'high', medium: 'medium', low: 'low', '': 'low' };

  return missingRows.slice(1).map((r, i) => ({
    id:       i,
    priority: PRI_MAP[(r[2] || '').toLowerCase().trim()] || 'low',
    title:    r[1] || 'Unknown action',
    brand:    (r[0] || 'ALL').toUpperCase(),
    due:      '—',
    owner:    r[6] || '—',
  }));
}

// ─── Digital Asset Vault → Rename Compliance ──────────────────────────────────

function parseRenameCompliance(assetRows) {
  if (!assetRows || assetRows.length < 2) return null;

  const data = assetRows.slice(1);

  return CONFIG.BRANDS.map(cfg => {
    const id   = cfg.id;
    const rows = data.filter(r => (r[0] || '').toUpperCase().trim() === id);
    if (rows.length === 0) return { brand: id, total: 0, renamed: 0, compliance: 0 };
    const renameNeeded = rows.filter(r => (r[15] || '').trim() === 'Rename Needed').length;
    const renamed      = rows.length - renameNeeded;
    return {
      brand:      id,
      total:      rows.length,
      renamed,
      compliance: parseFloat(((renamed / rows.length) * 100).toFixed(1)),
    };
  });
}

// ─── Live fetch ────────────────────────────────────────────────────────────────

async function fetchLiveData() {
  const [execRows, assetRows, missingRows, socialRows] = await Promise.all([
    fetchTab(CONFIG.TAB_NAMES.EXECUTIVE),
    fetchTab(CONFIG.TAB_NAMES.ASSETS),
    fetchTab(CONFIG.TAB_NAMES.MISSING),
    fetchTab(CONFIG.TAB_NAMES.SOCIAL),
  ]);

  const mock = getMockData();

  const brands           = parseBrandSummary(assetRows, missingRows) || mock.brands;
  const recentUploads    = parseRecentUploads(assetRows)             || mock.recentUploads;
  const actions          = parseActions(missingRows)                 || mock.actions;
  const renameCompliance = parseRenameCompliance(assetRows)          || mock.renameCompliance;

  return {
    kpis:  parseKPIs(execRows, socialRows, missingRows),
    brands,
    recentUploads,
    actions,
    renameCompliance,
    driveSync: mock.driveSync, // no source tab — keep mock
    meta: { lastUpdated: new Date().toISOString(), source: 'live' },
  };
}

// ─── Demo / Mock Data ──────────────────────────────────────────────────────────

function getMockData() {
  return {
    kpis: {
      total_brands:    { value: 4,    change:  0,  trend: 'stable' },
      total_assets:    { value: 2847, change: +47, trend: 'up'     },
      pending_review:  { value: 34,   change: -12, trend: 'down'   },
      rename_needed:   { value: 127,  change:  -8, trend: 'down'   },
      auto_logged:     { value: 892,  change: +23, trend: 'up'     },
      social_accounts: { value: 18,   change:   0, trend: 'stable' },
      upcoming_posts:  { value: 12,   change:  +4, trend: 'up'     },
      access_risks:    { value: 3,    change:  -1, trend: 'down'   },
      domains_tracked: { value: 7,    change:   0, trend: 'stable' },
      overall_health:  { value: 78,   change:  +2, trend: 'up', unit: '%' },
    },
    brands: [
      { id: 'DETEKCAM', label: 'DETEKCAM', color: '#1E5FC4', totalFiles: 890, reviewed: 820, pending: 45, renameNeeded: 25, health: 87 },
      { id: 'DETEKLAB', label: 'DETEKLAB', color: '#7030C0', totalFiles: 745, reviewed: 690, pending: 35, renameNeeded: 20, health: 89 },
      { id: 'I-BG',     label: 'I-BG',     color: '#1E8C5A', totalFiles: 612, reviewed: 540, pending: 62, renameNeeded: 10, health: 85 },
      { id: 'SIPSAFE',  label: 'SIPSAFE',  color: '#C43040', totalFiles: 600, reviewed: 520, pending: 55, renameNeeded: 25, health: 72 },
    ],
    recentUploads: [
      { filename: 'brand_identity_v3.ai',   brand: 'DETEKCAM', date: '2026-06-12', size: '4.2 MB',  status: 'new',      type: 'vector'  },
      { filename: 'logo_dark_final.svg',    brand: 'DETEKLAB', date: '2026-06-12', size: '128 KB',  status: 'review',   type: 'vector'  },
      { filename: 'social_headers_Q2.psd',  brand: 'SIPSAFE',  date: '2026-06-11', size: '18.7 MB', status: 'review',   type: 'image'   },
      { filename: 'brand_guidelines_v2.pdf',brand: 'I-BG',     date: '2026-06-11', size: '6.1 MB',  status: 'approved', type: 'doc'     },
      { filename: 'icon_set_outlined.ai',   brand: 'DETEKCAM', date: '2026-06-10', size: '2.8 MB',  status: 'new',      type: 'vector'  },
    ],
    actions: [
      { id: 1, priority: 'critical', title: 'Resolve 18 Drive sync errors in SIPSAFE folder',  brand: 'SIPSAFE',  due: '2026-06-13', owner: 'IT Operations'  },
      { id: 2, priority: 'high',     title: 'Review & approve 45 pending DETEKCAM assets',     brand: 'DETEKCAM', due: '2026-06-14', owner: 'Creative Lead'  },
      { id: 3, priority: 'high',     title: 'Update social media headers before Q2 campaign',  brand: 'SIPSAFE',  due: '2026-06-15', owner: 'Marketing Team' },
      { id: 4, priority: 'medium',   title: 'Rename 62 non-compliant I-BG asset files',        brand: 'I-BG',     due: '2026-06-17', owner: 'Brand Manager'  },
    ],
    renameCompliance: [
      { brand: 'DETEKCAM', total: 890, renamed: 865, compliance: 97.2 },
      { brand: 'DETEKLAB', total: 745, renamed: 725, compliance: 97.3 },
      { brand: 'I-BG',     total: 612, renamed: 575, compliance: 93.9 },
      { brand: 'SIPSAFE',  total: 600, renamed: 555, compliance: 92.5 },
    ],
    driveSync: [
      { brand: 'DETEKCAM', status: 'synced',  lastSync: '2 hrs ago',  filesSynced: 890, errors: 0  },
      { brand: 'DETEKLAB', status: 'synced',  lastSync: '4 hrs ago',  filesSynced: 743, errors: 2  },
      { brand: 'I-BG',     status: 'syncing', lastSync: '30 min ago', filesSynced: 598, errors: 0  },
      { brand: 'SIPSAFE',  status: 'error',   lastSync: '18 hrs ago', filesSynced: 582, errors: 18 },
    ],
    meta: { lastUpdated: new Date().toISOString(), source: 'demo' },
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

async function loadDashboardData() {
  if (!CONFIG.USE_DEMO_DATA) {
    try {
      return await fetchLiveData();
    } catch (err) {
      console.warn('[DBCC] Live fetch failed — using demo data:', err.message);
    }
  }
  return getMockData();
}
