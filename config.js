/**
 * Digital Brand Command Center — Configuration
 *
 * ─── HOW TO CONNECT YOUR GOOGLE SHEETS ───────────────────────────────────────
 *
 * Option A — Published CSV (simplest):
 *   1. Open your Google Sheet
 *   2. File > Share > Publish to web
 *   3. Select each tab > CSV > Publish
 *   4. Paste the URL into the matching SHEETS entry below
 *   5. Set USE_DEMO_DATA to false
 *
 * Option B — Apps Script Web App (full JSON, recommended for production):
 *   1. In your sheet: Extensions > Apps Script
 *   2. Deploy as Web App (access: Anyone)
 *   3. Paste the /exec URL into DATA_SOURCE_URL below
 *   4. Set DATA_FORMAT to 'json' and USE_DEMO_DATA to false
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CONFIG = {

  // ─── PRIMARY DATA SOURCE ────────────────────────────────────────────────────
  // Set this to your Apps Script Web App URL for full JSON support
  DATA_SOURCE_URL: '',

  // Data format returned by DATA_SOURCE_URL: 'json' | 'csv'
  DATA_FORMAT: 'json',

  // ─── INDIVIDUAL SHEET CSV URLS (Option A) ───────────────────────────────────
  // Replace '' with the published CSV URL for each tab.
  // Format: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID
  SHEETS: {
    KPI:     { url: '', label: 'KPI Metrics' },
    ASSETS:  { url: '', label: 'Brand Assets' },
    UPLOADS: { url: '', label: 'Recent Uploads' },
    ACTIONS: { url: '', label: 'Action Items' },
    RENAME:  { url: '', label: 'Rename Compliance' },
    DRIVE:   { url: '', label: 'Drive Sync' },
  },

  // ─── BRANDS ─────────────────────────────────────────────────────────────────
  BRANDS: [
    { id: 'DETEKCAM', label: 'DETEKCAM', color: '#1E5FC4', icon: 'camera' },
    { id: 'DETEKLAB', label: 'DETEKLAB', color: '#7030C0', icon: 'flask'  },
    { id: 'I-BG',     label: 'I-BG',     color: '#1E8C5A', icon: 'buildings' },
    { id: 'SIPSAFE',  label: 'SIPSAFE',  color: '#C43040', icon: 'shield-check' },
  ],

  // ─── REFRESH ────────────────────────────────────────────────────────────────
  // Auto-refresh interval in milliseconds. Set to 0 to disable.
  REFRESH_INTERVAL: 30000,

  // ─── DEMO MODE ──────────────────────────────────────────────────────────────
  // Displays realistic mock data when no DATA_SOURCE_URL is configured.
  // Set to false once your data source is connected.
  USE_DEMO_DATA: true,

  // ─── COLUMN MAP ─────────────────────────────────────────────────────────────
  // Map your Google Sheet column headers to dashboard data fields.
  COLUMN_MAP: {
    kpi:     { metric: 'Metric', value: 'Value', change: 'Change', trend: 'Trend' },
    assets:  { brand: 'Brand', total: 'Total Files', reviewed: 'Reviewed', pending: 'Pending', rename: 'Rename Needed', health: 'Health %' },
    uploads: { filename: 'Filename', brand: 'Brand', date: 'Date', size: 'Size', status: 'Status', type: 'Type' },
    actions: { priority: 'Priority', title: 'Title', brand: 'Brand', due: 'Due Date', owner: 'Owner' },
    rename:  { brand: 'Brand', total: 'Total Files', renamed: 'Renamed', compliance: 'Compliance %' },
    drive:   { brand: 'Brand', status: 'Status', lastSync: 'Last Sync', files: 'Files Synced', errors: 'Errors' },
  },

  // ─── DASHBOARD META ─────────────────────────────────────────────────────────
  TITLE: 'Digital Brand Command Center',
  ORG_NAME: 'I-BG Creative',
};
