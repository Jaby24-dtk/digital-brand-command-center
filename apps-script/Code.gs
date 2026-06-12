/**
 * ================================================================
 * DIGITAL BRAND COMMAND CENTER — Google Drive Sync Script
 * ================================================================
 * Sheet:       https://docs.google.com/spreadsheets/d/16fQ4OBH9f7bZPtaf-n21IsQOm8fnLYPpyYSh_xp-iTg
 * Root Folder: https://drive.google.com/drive/folders/1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx
 *
 * HOW TO INSTALL:
 *   1. Open your Google Sheet
 *   2. Extensions → Apps Script
 *   3. Delete any existing code, paste this entire file
 *   4. Save (Ctrl+S), then reload your sheet
 *   5. Use the "⚡ Command Center" menu → "🔄 Sync Drive Files"
 *   6. Run "⏱ Setup Hourly Trigger" once to enable auto-sync
 * ================================================================
 */

// ─── Configuration ────────────────────────────────────────────────────────────

var DC = {
  ROOT_FOLDER_ID: '1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx',
  VAULT_TAB:      'Digital Asset Vault',
  EXEC_TAB:       'Executive Dashboard',
  TRIGGER_FUNC:   'syncDriveFiles',
  TRIGGER_HOURS:  1,
  BRANDS:         ['DETEKCAM', 'DETEKLAB', 'I-BG', 'SIPSAFE'],
};

// Platform keyword → canonical label
var PLATFORM_MAP = {
  'INSTAGRAM': 'Instagram', 'IG': 'Instagram',
  'TIKTOK':    'TikTok',    'TT': 'TikTok',
  'FACEBOOK':  'Facebook',  'FB': 'Facebook',
  'YOUTUBE':   'YouTube',   'YT': 'YouTube',
  'TWITTER':   'Twitter/X', 'TW': 'Twitter/X', 'X': 'Twitter/X',
  'LINKEDIN':  'LinkedIn',  'LI': 'LinkedIn',
  'WEBSITE':   'Website',   'WEB': 'Website',
  'EMAIL':     'Email',     'EM': 'Email',
  'MAKE':      'Make.com',  'AUTOMATION': 'Make.com',
  'PRINT':     'Print',     'OOH': 'OOH',
  'STORIES':   'Stories',   'REELS': 'Reels',
};

// MIME type → human-readable label
var MIME_MAP = {
  'application/vnd.google-apps.folder':       'Folder',
  'application/vnd.google-apps.document':     'Google Doc',
  'application/vnd.google-apps.spreadsheet':  'Google Sheet',
  'application/vnd.google-apps.presentation': 'Presentation',
  'application/vnd.google-apps.form':         'Google Form',
  'application/pdf':                          'PDF',
  'image/jpeg':                               'Image (JPG)',
  'image/png':                                'Image (PNG)',
  'image/gif':                                'Image (GIF)',
  'image/webp':                               'Image (WebP)',
  'image/svg+xml':                            'SVG',
  'image/vnd.adobe.photoshop':                'Photoshop (PSD)',
  'application/postscript':                   'Illustrator / EPS',
  'video/mp4':                                'Video (MP4)',
  'video/quicktime':                          'Video (MOV)',
  'video/x-msvideo':                          'Video (AVI)',
  'audio/mpeg':                               'Audio (MP3)',
  'audio/wav':                                'Audio (WAV)',
  'application/zip':                          'Archive (ZIP)',
  'application/x-rar-compressed':             'Archive (RAR)',
  'font/ttf':                                 'Font (TTF)',
  'font/otf':                                 'Font (OTF)',
  'text/plain':                               'Text File',
  'application/json':                         'JSON',
};

// Expected naming convention: BRAND_PLATFORM_CATEGORY_Description_YYYYMMDD
var VAULT_HEADERS = [
  'Brand', 'Asset Type', 'Folder/File Name', 'Google Drive Link', 'Owner',
  'Status', 'Notes', 'Category', 'Platform', 'Review Owner', 'Review Date',
  'Final Folder', 'Parsed Brand', 'Parsed Platform', 'Parsed Category / Campaign',
  'Naming Check'
];

// ─── Custom Menu ──────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('⚡ Command Center', [
    { name: '🔄 Sync Drive Files',          functionName: 'syncDriveFiles'    },
    { name: '📊 Refresh KPI Summary',        functionName: 'updateKPISummary'  },
    null, // separator
    { name: '⏱ Setup Hourly Trigger',        functionName: 'setupHourlyTrigger' },
    { name: '🗑 Remove Trigger',              functionName: 'removeTrigger'      },
    { name: 'ℹ️ View Trigger Status',         functionName: 'showTriggerStatus'  },
  ]);
}

// ─── Main: Sync Drive Files ───────────────────────────────────────────────────

function syncDriveFiles() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.VAULT_TAB);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Sheet "' + DC.VAULT_TAB + '" not found.\nPlease create it first.');
    return;
  }

  ss.toast('📂 Scanning Google Drive folders...', '⚡ Command Center', -1);

  // Snapshot existing manual edits so we can preserve them
  var existingMap = buildExistingMap(sheet);

  // Recursively scan from root folder
  var root    = DriveApp.getFolderById(DC.ROOT_FOLDER_ID);
  var scanned = [];
  scanFolder(root, '', scanned);

  ss.toast('⚙️ Processing ' + scanned.length + ' items...', '⚡ Command Center', -1);

  // Merge with existing data (preserves Status, Notes, Review Owner, Review Date)
  var rows = scanned.map(function(item) { return mergeWithExisting(item, existingMap); });

  // Sort: brand folders first, then by brand name, then by filename
  rows.sort(function(a, b) {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    if (a.assetType === 'Folder' && b.assetType !== 'Folder') return -1;
    if (a.assetType !== 'Folder' && b.assetType === 'Folder') return 1;
    return a.name.localeCompare(b.name);
  });

  // Write to sheet
  writeToSheet(sheet, rows);

  // Refresh KPI numbers on Executive Dashboard
  updateKPISummary();

  ss.toast(
    '✅ ' + rows.length + ' items synced from Google Drive.\nLast run: ' + new Date().toLocaleString(),
    '⚡ Sync Complete',
    6
  );

  Logger.log('Sync complete: ' + rows.length + ' items written to ' + DC.VAULT_TAB);
}

// ─── Recursive Folder Scanner ─────────────────────────────────────────────────

function scanFolder(folder, parentPath, results) {
  var folderName = folder.getName();
  var folderPath = parentPath ? parentPath + ' / ' + folderName : folderName;
  var brand      = detectBrand(folderName, folderPath);

  // Add the folder entry (skip the root folder itself)
  if (parentPath !== '') {
    results.push(buildRow({
      brand:       brand,
      assetType:   'Folder',
      name:        folderName,
      link:        folder.getUrl(),
      owner:       '',
      mimeType:    'application/vnd.google-apps.folder',
      path:        folderPath,
      isFolder:    true,
      createdDate: null,
    }));
  }

  // Scan all files in this folder
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    results.push(buildRow({
      brand:       brand,
      assetType:   getMimeLabel(file.getMimeType()),
      name:        file.getName(),
      link:        file.getUrl(),
      owner:       getOwnerEmail(file),
      mimeType:    file.getMimeType(),
      path:        folderPath,
      isFolder:    false,
      createdDate: file.getDateCreated(),
    }));
  }

  // Recurse into subfolders
  var subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    scanFolder(subfolders.next(), folderPath, results);
  }
}

// ─── Build a single row object ────────────────────────────────────────────────

function buildRow(item) {
  var parsed    = parseFilename(item.name);
  var naming    = checkNaming(item.name, item.brand, parsed, item.isFolder);
  var platform  = parsed.platform  || detectFromPath(item.path, PLATFORM_MAP);
  var category  = parsed.category  || detectCategoryFromPath(item.path);

  // Determine initial status
  var status = 'Pending Review';
  var notes  = '';
  if (item.isFolder) {
    notes = 'Folder — detected by Drive Sync';
  } else if (item.owner && item.owner.toLowerCase().indexOf('automation') > -1) {
    status = 'Auto Logged';
    notes  = 'Uploaded via Make.com / Drive Automation';
  }

  return {
    brand:          item.brand,
    assetType:      item.assetType,
    name:           item.name,
    link:           item.link,
    owner:          item.owner,
    status:         status,
    notes:          notes,
    category:       category,
    platform:       platform,
    reviewOwner:    '',
    reviewDate:     '',
    finalFolder:    suggestFinalFolder(item.brand, category, platform),
    parsedBrand:    parsed.brand    || '',
    parsedPlatform: parsed.platform || '',
    parsedCategory: parsed.category || '',
    namingCheck:    naming,
  };
}

// ─── Brand Detection ──────────────────────────────────────────────────────────

function detectBrand(name, path) {
  var combined = (name + ' ' + path).toUpperCase();

  // Direct match (including I-BG variants)
  if (combined.indexOf('DETEKCAM') > -1) return 'DETEKCAM';
  if (combined.indexOf('DETEKLAB') > -1) return 'DETEKLAB';
  if (combined.indexOf('I-BG')     > -1) return 'I-BG';
  if (combined.indexOf('IBG')      > -1) return 'I-BG';
  if (combined.indexOf('I_BG')     > -1) return 'I-BG';
  if (combined.indexOf('SIPSAFE')  > -1) return 'SIPSAFE';

  return 'AUTO';
}

// ─── Filename Parser ──────────────────────────────────────────────────────────
// Convention: BRAND_PLATFORM_CATEGORY_Description_YYYYMMDD

function parseFilename(filename) {
  var base   = filename.replace(/\.[^.]+$/, ''); // strip extension
  var parts  = base.split('_');
  var result = { brand: '', platform: '', category: '', description: '', date: '' };

  if (parts.length < 1) return result;

  // Part 0 → Brand
  var p0upper = parts[0].toUpperCase().replace('-', '');
  var brandMatch = DC.BRANDS.filter(function(b) {
    return b.replace('-', '') === p0upper;
  });
  if (brandMatch.length > 0) result.brand = brandMatch[0];

  // Part 1 → Platform
  if (parts.length >= 2) {
    var p1 = parts[1].toUpperCase();
    result.platform = PLATFORM_MAP[p1] || '';
  }

  // Part 2 → Category / Campaign
  if (parts.length >= 3) {
    result.category = parts[2];
  }

  // Part 3+ → Description (everything except last segment if it looks like a date)
  if (parts.length >= 4) {
    var last = parts[parts.length - 1];
    if (/^\d{6,8}$/.test(last)) {
      result.date        = last;
      result.description = parts.slice(3, -1).join(' ');
    } else {
      result.description = parts.slice(3).join(' ');
    }
  }

  return result;
}

// ─── Naming Convention Check ─────────────────────────────────────────────────

function checkNaming(filename, brand, parsed, isFolder) {
  if (isFolder) return 'Folder';

  var hasBrand    = parsed.brand    && DC.BRANDS.indexOf(parsed.brand) > -1;
  var hasPlatform = parsed.platform && Object.keys(PLATFORM_MAP).some(function(k) {
    return PLATFORM_MAP[k] === parsed.platform;
  });
  var hasCategory = parsed.category && parsed.category.length > 1;

  if (hasBrand && hasPlatform && hasCategory) return 'Compliant ✓';
  if (hasBrand && hasPlatform)                return 'Partial — Missing Category';
  if (hasBrand)                               return 'Partial — Missing Platform';
  return 'Rename Needed';
}

// ─── Detect platform or category from folder path ────────────────────────────

function detectFromPath(path, map) {
  var upper = path.toUpperCase();
  var keys  = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (upper.indexOf(keys[i]) > -1) return map[keys[i]];
  }
  return '';
}

function detectCategoryFromPath(path) {
  var CATS = ['ASSETS', 'VIDEOS', 'CAMPAIGNS', 'LOGOS', 'SOCIAL', 'BRAND', 'TEMPLATES', 'PRESENTATIONS', 'REELS'];
  var upper = path.toUpperCase();
  for (var i = 0; i < CATS.length; i++) {
    if (upper.indexOf(CATS[i]) > -1) {
      return CATS[i].charAt(0) + CATS[i].slice(1).toLowerCase();
    }
  }
  return '';
}

// ─── Suggest a final folder path ─────────────────────────────────────────────

function suggestFinalFolder(brand, category, platform) {
  if (!brand || brand === 'AUTO') return 'Needs Brand Assignment';
  var path = brand;
  if (category) path += ' / ' + category.toUpperCase();
  if (platform && platform !== category) path += ' / ' + platform;
  return path;
}

// ─── MIME type → human label ──────────────────────────────────────────────────

function getMimeLabel(mime) {
  return MIME_MAP[mime] || mime || 'Unknown';
}

// ─── Get file owner email safely ──────────────────────────────────────────────

function getOwnerEmail(file) {
  try {
    var owner = file.getOwner();
    return owner ? owner.getEmail() : 'Google Drive Automation';
  } catch (e) {
    return 'Google Drive Automation';
  }
}

// ─── Preserve existing manual edits ──────────────────────────────────────────
// Reads current vault data and builds a map: Drive URL → manual field values

function buildExistingMap(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
  var map  = {};
  data.forEach(function(row) {
    var link  = row[3]; // Column D = Google Drive Link
    var brand = (row[0] || '').toString().trim();
    var name  = (row[2] || '').toString().trim();

    // Primary key: Drive link (most reliable)
    // Fallback key: brand + filename (catches manually-entered rows with no link yet)
    var key = link || (brand + '|' + name);
    if (key) {
      map[key] = {
        status:      row[5],
        notes:       row[6],
        category:    row[7],
        platform:    row[8],
        reviewOwner: row[9],
        reviewDate:  row[10],
      };
    }
  });
  return map;
}

function mergeWithExisting(item, existingMap) {
  // Try Drive link first, then brand|filename fallback
  var prev = existingMap[item.link] || existingMap[item.brand + '|' + item.name];
  if (!prev) return item;

  if (prev.status && prev.status !== '' && prev.status !== 'Auto Logged') item.status = prev.status;
  if (prev.notes       && prev.notes !== '')       item.notes       = prev.notes;
  if (prev.category    && prev.category !== '')    item.category    = prev.category;
  if (prev.platform    && prev.platform !== '')    item.platform    = prev.platform;
  if (prev.reviewOwner && prev.reviewOwner !== '') item.reviewOwner = prev.reviewOwner;
  if (prev.reviewDate  && prev.reviewDate !== '')  item.reviewDate  = prev.reviewDate;

  return item;
}


// ─── Write rows to Digital Asset Vault ───────────────────────────────────────

function writeToSheet(sheet, rows) {
  // Write header
  sheet.getRange(1, 1, 1, VAULT_HEADERS.length)
    .setValues([VAULT_HEADERS])
    .setFontWeight('bold')
    .setBackground('#f3f3f3');

  // Clear old data rows
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, VAULT_HEADERS.length).clearContent().clearFormat();
  }

  if (rows.length === 0) return;

  // Build 2D array and write in one batch (fast)
  var output = rows.map(function(r) {
    return [
      r.brand, r.assetType, r.name, r.link, r.owner,
      r.status, r.notes, r.category, r.platform,
      r.reviewOwner, r.reviewDate, r.finalFolder,
      r.parsedBrand, r.parsedPlatform, r.parsedCategory, r.namingCheck,
    ];
  });
  sheet.getRange(2, 1, output.length, VAULT_HEADERS.length).setValues(output);

  // ── Colour-code Status column (F = col 6) ──
  var statusColors = rows.map(function(r) {
    switch (r.status) {
      case 'Approved':       return ['#d4edda'];
      case 'Pending Review': return ['#fff3cd'];
      case 'Auto Logged':    return ['#d1ecf1'];
      default:               return [null];
    }
  });
  sheet.getRange(2, 6, rows.length, 1).setBackgrounds(statusColors);

  // ── Colour-code Naming Check column (P = col 16) ──
  var namingColors = rows.map(function(r) {
    var v = r.namingCheck;
    if (v === 'Compliant ✓')      return ['#d4edda'];
    if (v.indexOf('Partial') > -1) return ['#fff3cd'];
    if (v === 'Rename Needed')     return ['#f8d7da'];
    return [null];
  });
  sheet.getRange(2, 16, rows.length, 1).setBackgrounds(namingColors);

  // ── Auto-fit columns ──
  sheet.autoResizeColumns(1, VAULT_HEADERS.length);

  // ── Freeze header row ──
  sheet.setFrozenRows(1);
}

// ─── Update Executive Dashboard KPI row ──────────────────────────────────────

function updateKPISummary() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var vault = ss.getSheetByName(DC.VAULT_TAB);
  var exec  = ss.getSheetByName(DC.EXEC_TAB);
  if (!vault || !exec) return;

  var data = vault.getLastRow() > 1
    ? vault.getRange(2, 1, vault.getLastRow() - 1, 16).getValues()
    : [];

  var totalAssets   = data.length;
  var pending       = data.filter(function(r) { return r[5] === 'Pending Review'; }).length;
  var renameNeeded  = data.filter(function(r) { return r[15] === 'Rename Needed'; }).length;
  var autoLogged    = data.filter(function(r) { return r[5] === 'Auto Logged'; }).length;

  // Executive Dashboard layout (1-indexed rows):
  // Row 2 col B = Last refreshed timestamp
  // Row 4 = KPI values: A=Brands, B=Assets, C=Pending, D=Rename, E=AutoLogged
  exec.getRange(2, 2).setValue(new Date());
  exec.getRange(4, 1).setValue(DC.BRANDS.length);
  exec.getRange(4, 2).setValue(totalAssets);
  exec.getRange(4, 3).setValue(pending);
  exec.getRange(4, 4).setValue(renameNeeded);
  exec.getRange(4, 5).setValue(autoLogged);

  Logger.log('KPI summary updated: assets=' + totalAssets + ', pending=' + pending + ', rename=' + renameNeeded);
}

// ─── Hourly Time Trigger ──────────────────────────────────────────────────────

function setupHourlyTrigger() {
  removeTrigger(); // Remove any existing trigger first to avoid duplicates

  ScriptApp.newTrigger(DC.TRIGGER_FUNC)
    .timeBased()
    .everyHours(DC.TRIGGER_HOURS)
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ Hourly trigger created!\n\n' +
    'Drive sync will run automatically every hour.\n' +
    'You can also run it manually via ⚡ Command Center → 🔄 Sync Drive Files.'
  );
}

function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed  = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === DC.TRIGGER_FUNC) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) {
    Logger.log('Removed ' + removed + ' trigger(s) for ' + DC.TRIGGER_FUNC);
  }
}

function showTriggerStatus() {
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === DC.TRIGGER_FUNC;
  });

  if (triggers.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No trigger active.\n\nUse ⏱ Setup Hourly Trigger to enable auto-sync.');
  } else {
    SpreadsheetApp.getUi().alert(
      '✅ Trigger active!\n\n' +
      'Function: ' + triggers[0].getHandlerFunction() + '\n' +
      'Type: Time-based (every ' + DC.TRIGGER_HOURS + ' hour)\n' +
      'Total triggers: ' + triggers.length
    );
  }
}
