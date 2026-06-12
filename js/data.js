/**
 * data.js — Live data from Drive Live Registry Google Sheet tab
 *
 * All dashboard data is derived from a single tab: "Drive Live Registry".
 * The tab is populated by the Apps Script sync (DBCC → Sync Drive Files).
 * The sheet must be publicly shared: Share → Anyone with the link → Viewer.
 */

// ─── Column indices in Drive Live Registry (0-based) ──────────────────────────
// 0:File ID  1:File Name  2:Type  3:MIME Type  4:Brand
// 5:Parent   6:Full Path  7:URL   8:Created    9:Modified
// 10:Owner   11:Size      12:Naming Check  13:Status  14:Last Synced

const COL = {
  FILE_ID:  0, NAME:    1, TYPE:   2, MIME:   3, BRAND:   4,
  PARENT:   5, PATH:    6, URL:    7, CREATED:8, MODIFIED:9,
  OWNER:   10, SIZE:   11, NAMING:12, STATUS:13, SYNCED:  14,
};

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      row.push(field.trim()); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
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

// ─── Fetch a single tab as parsed CSV rows ────────────────────────────────────

async function fetchTab(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching tab "${tabName}"`);
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error(
      `Tab "${tabName}" is not accessible. ` +
      `Open your Google Sheet → Share → Anyone with the link → Viewer.`
    );
  }
  return parseCSV(text);
}

// ─── Relative time formatter ──────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return hrs + ' hr ago';
  const days = Math.floor(hrs / 24);
  return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function parseKPIs(rows) {
  const data = rows.slice(1);  // skip header
  const files   = data.filter(r => (r[COL.TYPE] || '') !== 'Folder');
  const folders = data.filter(r => (r[COL.TYPE] || '') === 'Folder');

  // Unique brands (exclude UNASSIGNED)
  const brands = new Set(
    data.map(r => (r[COL.BRAND] || '').trim()).filter(b => b && b !== 'UNASSIGNED')
  );

  const renameNeeded = files.filter(r => (r[COL.NAMING] || '') === 'Rename Needed').length;
  const autoLogged   = files.filter(r => (r[COL.STATUS] || '') === 'Synced').length;
  const pending      = files.filter(r => !(r[COL.PATH] || '').trim()).length;
  const okFiles      = files.filter(r => (r[COL.NAMING] || '') === 'OK').length;
  const health       = files.length > 0 ? Math.round((okFiles / files.length) * 100) : 0;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyMod  = files.filter(r => {
    const d = new Date(r[COL.MODIFIED] || '');
    return !isNaN(d.getTime()) && d.getTime() >= sevenDaysAgo;
  }).length;

  return {
    total_brands:      { value: brands.size,    change: 0, trend: 'stable' },
    total_assets:      { value: files.length,   change: 0, trend: 'stable' },
    total_folders:     { value: folders.length, change: 0, trend: 'stable' },
    rename_needed:     { value: renameNeeded,   change: 0, trend: renameNeeded > 0 ? 'up' : 'stable' },
    recently_modified: { value: recentlyMod,    change: 0, trend: 'stable' },
    auto_logged:       { value: autoLogged,     change: 0, trend: 'stable' },
    pending_review:    { value: pending,        change: 0, trend: 'stable' },
    overall_health:    { value: health,         change: 0, trend: health >= 80 ? 'up' : 'down', unit: '%' },
  };
}

// ─── Brand Asset Summary ──────────────────────────────────────────────────────

function parseBrandSummary(rows) {
  const data = rows.slice(1);
  const map  = {};

  data.forEach(r => {
    const brand  = (r[COL.BRAND] || 'UNASSIGNED').trim();
    const type   = (r[COL.TYPE]  || '').trim();
    const naming = (r[COL.NAMING]|| '').trim();
    if (brand === 'UNASSIGNED') return;

    if (!map[brand]) map[brand] = { id: brand, label: brand, totalFiles: 0, reviewed: 0, renameNeeded: 0 };

    if (type !== 'Folder') {
      map[brand].totalFiles++;
      if (naming === 'OK')            map[brand].reviewed++;
      if (naming === 'Rename Needed') map[brand].renameNeeded++;
    }
  });

  return Object.values(map)
    .filter(b => b.totalFiles > 0)
    .map(b => {
      const cfg    = CONFIG.BRANDS.find(x => x.id === b.id) || {};
      b.color      = cfg.color || '#888888';
      b.pending    = b.renameNeeded;
      b.health     = b.totalFiles > 0 ? Math.round((b.reviewed / b.totalFiles) * 100) : 0;
      return b;
    })
    .sort((a, b) => b.totalFiles - a.totalFiles);
}

// ─── Recent Uploads (most recently modified files) ────────────────────────────

function parseRecentUploads(rows) {
  const MIME_TYPE_MAP = {
    pdf: 'doc', ai: 'vector', svg: 'vector', eps: 'vector',
    psd: 'image', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
    mp4: 'video', mov: 'video', avi: 'video',
    zip: 'archive', rar: 'archive',
  };

  return rows.slice(1)
    .filter(r => (r[COL.TYPE] || '') !== 'Folder' && r[COL.NAME])
    .sort((a, b) => {
      const da = new Date(a[COL.MODIFIED] || 0).getTime();
      const db = new Date(b[COL.MODIFIED] || 0).getTime();
      return db - da;
    })
    .slice(0, 10)
    .map(r => {
      const filename = r[COL.NAME] || 'Unknown';
      const ext      = filename.split('.').pop().toLowerCase();
      const dateRaw  = (r[COL.MODIFIED] || r[COL.CREATED] || '').substring(0, 10);
      return {
        filename,
        brand:  (r[COL.BRAND] || 'UNASSIGNED').toUpperCase().trim(),
        date:   dateRaw || '—',
        size:   r[COL.SIZE] || '—',
        status: 'auto-logged',
        type:   MIME_TYPE_MAP[ext] || 'file',
      };
    });
}

// ─── Priority Actions (rename-needed files, grouped by brand) ─────────────────

function parseActions(rows) {
  const brandCounts = {};
  rows.slice(1).forEach(r => {
    if ((r[COL.NAMING] || '') !== 'Rename Needed') return;
    if ((r[COL.TYPE]   || '') === 'Folder')        return;
    const brand = (r[COL.BRAND] || 'UNASSIGNED').trim();
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
  });

  return Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([brand, count], i) => ({
      id:       i,
      priority: count > 50 ? 'high' : count > 20 ? 'medium' : 'low',
      title:    `Rename ${count} non-compliant file${count !== 1 ? 's' : ''} in ${brand}`,
      brand,
      due:      '—',
      owner:    '—',
    }));
}

// ─── Rename Compliance (per-brand OK vs Rename Needed) ────────────────────────

function parseRenameCompliance(rows) {
  const map = {};
  rows.slice(1).forEach(r => {
    const brand  = (r[COL.BRAND] || 'UNASSIGNED').trim();
    const type   = (r[COL.TYPE]  || '').trim();
    const naming = (r[COL.NAMING]|| '').trim();
    if (brand === 'UNASSIGNED' || type === 'Folder') return;

    if (!map[brand]) map[brand] = { brand, total: 0, renamed: 0 };
    map[brand].total++;
    if (naming === 'OK') map[brand].renamed++;
  });

  return Object.values(map)
    .filter(b => b.total > 0)
    .map(b => ({
      ...b,
      compliance: parseFloat(((b.renamed / b.total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Drive Sync Status (per-brand summary from registry) ─────────────────────

function parseDriveSync(rows) {
  const map = {};
  rows.slice(1).forEach(r => {
    const brand  = (r[COL.BRAND]  || '').trim();
    const type   = (r[COL.TYPE]   || '').trim();
    const synced = (r[COL.SYNCED] || '').trim();
    if (!brand || brand === 'UNASSIGNED' || type === 'Folder') return;

    if (!map[brand]) map[brand] = { brand, status: 'synced', lastSyncRaw: '', filesSynced: 0, errors: 0 };
    map[brand].filesSynced++;
    if (synced && synced > map[brand].lastSyncRaw) map[brand].lastSyncRaw = synced;
  });

  return Object.values(map)
    .sort((a, b) => b.filesSynced - a.filesSynced)
    .map(b => ({
      brand:       b.brand,
      status:      'synced',
      lastSync:    relativeTime(b.lastSyncRaw),
      filesSynced: b.filesSynced,
      errors:      0,
    }));
}

// ─── Live fetch ───────────────────────────────────────────────────────────────

async function fetchLiveData() {
  const rows = await fetchTab(CONFIG.TAB_NAMES.DRIVE_REGISTRY);

  if (!rows || rows.length < 2) {
    throw new Error(
      `The Drive Live Registry tab is empty. ` +
      `Open your Google Sheet and run DBCC → Sync Drive Files first.`
    );
  }

  const brands           = parseBrandSummary(rows);
  const recentUploads    = parseRecentUploads(rows);
  const actions          = parseActions(rows);
  const renameCompliance = parseRenameCompliance(rows);
  const driveSync        = parseDriveSync(rows);

  return {
    kpis: parseKPIs(rows),
    brands:  brands.length  ? brands           : [],
    recentUploads: recentUploads.length ? recentUploads  : [],
    actions: actions.length ? actions          : [],
    renameCompliance: renameCompliance.length ? renameCompliance : [],
    driveSync: driveSync.length ? driveSync : [],
    meta: { lastUpdated: new Date().toISOString(), source: 'live' },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function loadDashboardData() {
  return fetchLiveData();
}
