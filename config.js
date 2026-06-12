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

  // ─── GOOGLE SHEET ID ────────────────────────────────────────────────────────
  // The spreadsheet ID from your Google Sheet URL.
  // Sheet must be shared: Share → Anyone with the link → Viewer
  SHEET_ID: '16fQ4OBH9f7bZPtaf-n21IsQOm8fnLYPpyYSh_xp-iTg',

  // Tab names inside the spreadsheet
  TAB_NAMES: {
    EXECUTIVE:  'Executive Dashboard',
    REGISTRY:   'Brand Registry',
    ASSETS:     'Digital Asset Vault',
    MISSING:    'Missing Asset Checklist',
    SOCIAL:     'Social Posting Pipeline',
  },

  // ─── BRANDS ─────────────────────────────────────────────────────────────────
  BRANDS: [
    { id: 'DETEKCAM', label: 'DETEKCAM', color: '#1E5FC4', icon: 'camera' },
    { id: 'DETEKLAB', label: 'DETEKLAB', color: '#7030C0', icon: 'flask'  },
    { id: 'I-BG',     label: 'I-BG',     color: '#1E8C5A', icon: 'buildings' },
    { id: 'SIPSAFE',  label: 'SIPSAFE',  color: '#C43040', icon: 'shield-check' },
  ],

  // ─── REFRESH ────────────────────────────────────────────────────────────────
  // Auto-refresh interval in milliseconds (5 minutes).
  REFRESH_INTERVAL: 300000,

  // ─── DEMO MODE ──────────────────────────────────────────────────────────────
  // false = fetch live from Google Sheets. true = use built-in mock data.
  // Falls back to mock data automatically if the sheet fetch fails.
  USE_DEMO_DATA: false,

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
