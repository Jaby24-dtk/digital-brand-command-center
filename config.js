/**
 * Digital Brand Command Center — Configuration
 * Sheet must be shared: Share → Anyone with the link → Viewer
 */

const CONFIG = {

  // ─── GOOGLE SHEET ID ────────────────────────────────────────────────────────
  SHEET_ID: '16fQ4OBH9f7bZPtaf-n21IsQOm8fnLYPpyYSh_xp-iTg',

  // Tab names inside the spreadsheet
  TAB_NAMES: {
    EXECUTIVE:      'Executive Dashboard',
    DRIVE_REGISTRY: 'Drive Live Registry',
    REGISTRY:       'Brand Registry',
    ASSETS:         'Digital Asset Vault',
    MISSING:        'Missing Asset Checklist',
    SOCIAL:         'Social Posting Pipeline',
  },

  // ─── BRANDS ─────────────────────────────────────────────────────────────────
  BRANDS: [
    { id: 'DETEKCAM',    label: 'DETEKCAM',    color: '#1E5FC4', icon: 'camera'        },
    { id: 'DETEKLAB',    label: 'DETEKLAB',    color: '#7030C0', icon: 'flask'          },
    { id: 'I-BG',        label: 'I-BG',        color: '#1E8C5A', icon: 'buildings'     },
    { id: 'SIPSAFE',     label: 'SIPSAFE',     color: '#C43040', icon: 'shield-check'  },
    { id: 'GERMONIZER',  label: 'GERMONIZER',  color: '#E5A020', icon: 'leaf'          },
    { id: 'CORPORATE',   label: 'CORPORATE',   color: '#4A5568', icon: 'briefcase'     },
    { id: 'SOCIAL MEDIA',label: 'SOCIAL MEDIA',color: '#E91E8C', icon: 'share-network' },
    { id: 'VENDOR',      label: 'VENDOR',      color: '#00897B', icon: 'package'       },
    { id: 'ARCHIVE',     label: 'ARCHIVE',     color: '#78909C', icon: 'archive'       },
    { id: 'INBOX',       label: 'INBOX',       color: '#F4511E', icon: 'tray'          },
  ],

  // ─── REFRESH ────────────────────────────────────────────────────────────────
  REFRESH_INTERVAL: 300000,  // 5 minutes

  // ─── DASHBOARD META ─────────────────────────────────────────────────────────
  TITLE: 'Digital Brand Command Center',
  ORG_NAME: 'I-BG Creative',
};
