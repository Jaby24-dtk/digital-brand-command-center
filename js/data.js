/**
 * data.js — Data fetching, parsing, and mock data layer
 */

// ─── CSV Parser ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').trim().replace(/^"|"$/g, '');
    });
    return row;
  });
}

// ─── Fetch helper with CORS proxy fallback ───────────────────────────────────

async function fetchSheet(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseCSV(text);
  } catch (err) {
    console.warn('[DBCC] Sheet fetch failed:', url, err.message);
    return null;
  }
}

// ─── Map raw rows → model ─────────────────────────────────────────────────

function mapKPIs(rows, map) {
  const kpis = {};
  rows.forEach(row => {
    const key = (row[map.metric] || '').toLowerCase().replace(/\s+/g, '_');
    kpis[key] = {
      value:  parseFloat(row[map.value])  || 0,
      change: parseFloat(row[map.change]) || 0,
      trend:  (row[map.trend] || 'stable').toLowerCase(),
    };
  });
  return kpis;
}

function mapAssets(rows, map) {
  return rows.map(row => ({
    id:          row[map.brand] || '',
    label:       row[map.brand] || '',
    totalFiles:  parseInt(row[map.total])    || 0,
    reviewed:    parseInt(row[map.reviewed]) || 0,
    pending:     parseInt(row[map.pending])  || 0,
    renameNeeded:parseInt(row[map.rename])   || 0,
    health:      parseFloat(row[map.health]) || 0,
  }));
}

function mapUploads(rows, map) {
  return rows.map(row => ({
    filename: row[map.filename] || '',
    brand:    row[map.brand]    || '',
    date:     row[map.date]     || '',
    size:     row[map.size]     || '',
    status:   (row[map.status] || 'new').toLowerCase(),
    type:     (row[map.type]   || 'file').toLowerCase(),
  }));
}

function mapActions(rows, map) {
  return rows.map((row, i) => ({
    id:       i,
    priority: (row[map.priority] || 'low').toLowerCase(),
    title:    row[map.title]    || '',
    brand:    row[map.brand]    || '',
    due:      row[map.due]      || '',
    owner:    row[map.owner]    || '',
  }));
}

function mapRename(rows, map) {
  return rows.map(row => ({
    brand:      row[map.brand] || '',
    total:      parseInt(row[map.total])     || 0,
    renamed:    parseInt(row[map.renamed])   || 0,
    compliance: parseFloat(row[map.compliance]) || 0,
  }));
}

function mapDrive(rows, map) {
  return rows.map(row => ({
    brand:       row[map.brand]    || '',
    status:      (row[map.status]  || 'unknown').toLowerCase(),
    lastSync:    row[map.lastSync] || '—',
    filesSynced: parseInt(row[map.files])  || 0,
    errors:      parseInt(row[map.errors]) || 0,
  }));
}

// ─── Live fetch ──────────────────────────────────────────────────────────────

async function fetchLiveData() {
  const { DATA_SOURCE_URL, DATA_FORMAT, SHEETS, COLUMN_MAP } = CONFIG;

  // Apps Script JSON endpoint (all sheets in one response)
  if (DATA_SOURCE_URL && DATA_FORMAT === 'json') {
    try {
      const res = await fetch(DATA_SOURCE_URL, { cache: 'no-store' });
      const json = await res.json();
      return {
        kpis:             mapKPIs(json.kpis     || [], COLUMN_MAP.kpi),
        brands:           mapAssets(json.assets || [], COLUMN_MAP.assets),
        recentUploads:    mapUploads(json.uploads || [], COLUMN_MAP.uploads),
        actions:          mapActions(json.actions || [], COLUMN_MAP.actions),
        renameCompliance: mapRename(json.rename  || [], COLUMN_MAP.rename),
        driveSync:        mapDrive(json.drive    || [], COLUMN_MAP.drive),
        meta: { lastUpdated: new Date().toISOString(), source: 'live' },
      };
    } catch (err) {
      console.warn('[DBCC] JSON fetch failed:', err);
      return null;
    }
  }

  // Individual CSV sheets
  if (SHEETS.KPI.url) {
    const [kpiRows, assetRows, uploadRows, actionRows, renameRows, driveRows] = await Promise.all([
      fetchSheet(SHEETS.KPI.url),
      fetchSheet(SHEETS.ASSETS.url),
      fetchSheet(SHEETS.UPLOADS.url),
      fetchSheet(SHEETS.ACTIONS.url),
      fetchSheet(SHEETS.RENAME.url),
      fetchSheet(SHEETS.DRIVE.url),
    ]);
    if (!kpiRows) return null;
    return {
      kpis:             mapKPIs(kpiRows     || [], COLUMN_MAP.kpi),
      brands:           mapAssets(assetRows || [], COLUMN_MAP.assets),
      recentUploads:    mapUploads(uploadRows || [], COLUMN_MAP.uploads),
      actions:          mapActions(actionRows || [], COLUMN_MAP.actions),
      renameCompliance: mapRename(renameRows  || [], COLUMN_MAP.rename),
      driveSync:        mapDrive(driveRows    || [], COLUMN_MAP.drive),
      meta: { lastUpdated: new Date().toISOString(), source: 'csv' },
    };
  }

  return null;
}

// ─── Demo / Mock Data ─────────────────────────────────────────────────────────

function getMockData() {
  return {
    kpis: {
      total_brands:   { value: 4,    change:  0,   trend: 'stable' },
      total_assets:   { value: 2847, change: +47,  trend: 'up'     },
      pending_review: { value: 34,   change: -12,  trend: 'down'   },
      rename_needed:  { value: 127,  change: -8,   trend: 'down'   },
      auto_logged:    { value: 892,  change: +23,  trend: 'up'     },
      social_accounts:{ value: 18,   change:  0,   trend: 'stable' },
      upcoming_posts: { value: 12,   change: +4,   trend: 'up'     },
      access_risks:   { value: 3,    change: -1,   trend: 'down'   },
      domains_tracked:{ value: 7,    change:  0,   trend: 'stable' },
      overall_health: { value: 78,   change: +2,   trend: 'up', unit: '%' },
    },
    brands: [
      { id: 'DETEKCAM', label: 'DETEKCAM', color: '#1E5FC4', totalFiles: 890, reviewed: 820, pending: 45, renameNeeded: 25, health: 87 },
      { id: 'DETEKLAB', label: 'DETEKLAB', color: '#7030C0', totalFiles: 745, reviewed: 690, pending: 35, renameNeeded: 20, health: 89 },
      { id: 'I-BG',     label: 'I-BG',     color: '#1E8C5A', totalFiles: 612, reviewed: 540, pending: 62, renameNeeded: 10, health: 85 },
      { id: 'SIPSAFE',  label: 'SIPSAFE',  color: '#C43040', totalFiles: 600, reviewed: 520, pending: 55, renameNeeded: 25, health: 72 },
    ],
    recentUploads: [
      { filename: 'brand_identity_v3.ai',        brand: 'DETEKCAM', date: '2026-06-12', size: '4.2 MB',  status: 'new',     type: 'vector'  },
      { filename: 'logo_dark_final.svg',          brand: 'DETEKLAB', date: '2026-06-12', size: '128 KB',  status: 'review',  type: 'vector'  },
      { filename: 'social_headers_Q2.psd',        brand: 'SIPSAFE',  date: '2026-06-11', size: '18.7 MB', status: 'review',  type: 'image'   },
      { filename: 'brand_guidelines_v2.pdf',      brand: 'I-BG',     date: '2026-06-11', size: '6.1 MB',  status: 'approved',type: 'doc'     },
      { filename: 'icon_set_outlined.ai',         brand: 'DETEKCAM', date: '2026-06-10', size: '2.8 MB',  status: 'new',     type: 'vector'  },
      { filename: 'typography_specimen.pdf',      brand: 'DETEKLAB', date: '2026-06-10', size: '3.4 MB',  status: 'approved',type: 'doc'     },
      { filename: 'product_renders_hero.zip',     brand: 'SIPSAFE',  date: '2026-06-09', size: '94 MB',   status: 'review',  type: 'archive' },
      { filename: 'color_palette_2026.ase',       brand: 'I-BG',     date: '2026-06-09', size: '22 KB',   status: 'approved',type: 'asset'   },
    ],
    actions: [
      { id: 1, priority: 'critical', title: 'Resolve 18 Drive sync errors in SIPSAFE folder',       brand: 'SIPSAFE',  due: '2026-06-13', owner: 'IT Operations'   },
      { id: 2, priority: 'high',     title: 'Review & approve 45 pending DETEKCAM assets',          brand: 'DETEKCAM', due: '2026-06-14', owner: 'Creative Lead'   },
      { id: 3, priority: 'high',     title: 'Update social media headers before Q2 campaign',       brand: 'SIPSAFE',  due: '2026-06-15', owner: 'Marketing Team'  },
      { id: 4, priority: 'medium',   title: 'Rename 62 non-compliant I-BG asset files',             brand: 'I-BG',     due: '2026-06-17', owner: 'Brand Manager'   },
      { id: 5, priority: 'medium',   title: 'Audit access permissions — 3 risks flagged',          brand: 'ALL',      due: '2026-06-18', owner: 'Security Team'   },
      { id: 6, priority: 'low',      title: 'Archive Q1 DETEKLAB campaign templates',               brand: 'DETEKLAB', due: '2026-06-20', owner: 'Brand Manager'   },
      { id: 7, priority: 'low',      title: 'Add missing alt text to 12 DETEKCAM web assets',      brand: 'DETEKCAM', due: '2026-06-22', owner: 'Web Team'        },
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

// ─── Public API ───────────────────────────────────────────────────────────────

async function loadDashboardData() {
  if (!CONFIG.USE_DEMO_DATA) {
    const live = await fetchLiveData();
    if (live) return live;
    console.warn('[DBCC] Falling back to demo data');
  }
  return getMockData();
}
