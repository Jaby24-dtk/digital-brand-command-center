/**
 * ================================================================
 * DIGITAL BRAND COMMAND CENTER — Drive Live Registry Sync
 * ================================================================
 * Sheet:       https://docs.google.com/spreadsheets/d/16fQ4OBH9f7bZPtaf-n21IsQOm8fnLYPpyYSh_xp-iTg
 * Root Folder: https://drive.google.com/drive/folders/1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx
 *
 * HOW TO INSTALL:
 *   1. Open your Google Sheet
 *   2. Extensions → Apps Script
 *   3. Delete any existing code, paste this entire file
 *   4. Save (Ctrl+S), reload your sheet
 *   5. Use DBCC menu → Sync Drive Files
 *   6. Run "Setup Hourly Trigger" once to enable auto-sync
 * ================================================================
 */

// ─── Configuration ────────────────────────────────────────────────────────────

var DC = {
  ROOT_FOLDER_ID: '1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx',
  REGISTRY_TAB:   'Drive Live Registry',
  EXEC_TAB:       'Executive Dashboard',
  TRIGGER_FUNC:   'syncDriveFiles',
  TRIGGER_HOURS:  1,
  BRANDS: [
    'DETEKCAM', 'DETEKLAB', 'I-BG', 'SIPSAFE',
    'GERMONIZER', 'CORPORATE', 'SOCIAL MEDIA', 'VENDOR', 'ARCHIVE', 'INBOX',
  ],
};

// Registry tab column headers (19 columns)
// Cols 1-15: populated by sync. Cols 16-19: rename workflow (user-filled / written by rename function).
var REGISTRY_HEADERS = [
  'File ID', 'File Name', 'Type', 'MIME Type', 'Brand',
  'Parent Folder', 'Full Folder Path', 'Google Drive URL',
  'Created Date', 'Modified Date', 'Owner', 'Size',
  'Naming Check', 'Status', 'Last Synced',
  'Suggested New Name', 'Rename Approval', 'Rename Result', 'Renamed Date',
];

// Column indices (0-based) for rename workflow columns
var RENAME_COL = {
  FILE_ID:      0,
  FILE_NAME:    1,
  TYPE:         2,
  NAMING:       12,
  SUGGESTED:    15,
  APPROVAL:     16,
  RESULT:       17,
  RENAMED_DATE: 18,
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
  'image/vnd.adobe.photoshop':                'Photoshop',
  'application/postscript':                   'Illustrator / EPS',
  'video/mp4':                                'Video (MP4)',
  'video/quicktime':                          'Video (MOV)',
  'video/x-msvideo':                          'Video (AVI)',
  'audio/mpeg':                               'Audio (MP3)',
  'audio/wav':                                'Audio (WAV)',
  'application/zip':                          'ZIP',
  'text/plain':                               'Text',
  'application/json':                         'JSON',
  'font/ttf':                                 'Font (TTF)',
  'font/otf':                                 'Font (OTF)',
};

// ─── Custom Menu ──────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('DBCC', [
    { name: 'Sync Drive Files',        functionName: 'syncDriveFiles'       },
    { name: 'Rename Approved Files',   functionName: 'renameApprovedFiles'  },
    null,
    { name: 'Setup Hourly Trigger',    functionName: 'setupHourlyTrigger'   },
    { name: 'Remove Trigger',          functionName: 'removeTrigger'        },
    { name: 'View Trigger Status',     functionName: 'showTriggerStatus'    },
  ]);
}

// ─── Main: Sync Drive Files ───────────────────────────────────────────────────

function syncDriveFiles() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getOrCreateSheet(ss, DC.REGISTRY_TAB);
  var syncTime = new Date();

  ss.toast('Scanning Google Drive...', 'DBCC Sync', -1);
  Logger.log('syncDriveFiles started: ' + syncTime.toISOString());

  var root    = DriveApp.getFolderById(DC.ROOT_FOLDER_ID);
  var results = [];
  scanFolder(root, '', results);

  Logger.log('Scan complete: ' + results.length + ' items found');
  ss.toast('Writing ' + results.length + ' items to sheet...', 'DBCC Sync', -1);

  writeToSheet(sheet, results, syncTime);
  updateKPISummary(ss, results);

  var msg = results.length + ' items synced. Last run: ' + syncTime.toLocaleString();
  ss.toast(msg, 'DBCC Sync Complete', 8);
  Logger.log('syncDriveFiles complete: ' + msg);
}

// ─── Create tab if it does not exist ─────────────────────────────────────────

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Created new sheet tab: ' + name);
  }
  return sheet;
}

// ─── Recursive Folder Scanner ─────────────────────────────────────────────────

function scanFolder(folder, parentPath, results) {
  var name   = folder.getName();
  var path   = parentPath ? parentPath + ' / ' + name : name;
  var brand  = detectBrand(name, path);

  // Add this folder as a row (skip the root folder itself)
  if (parentPath !== '') {
    results.push({
      fileId:   folder.getId(),
      fileName: name,
      type:     'Folder',
      mimeType: 'application/vnd.google-apps.folder',
      brand:    brand,
      parent:   getParentName(folder),
      path:     path,
      url:      folder.getUrl(),
      created:  '',
      modified: '',
      owner:    '',
      size:     '',
      naming:   'Folder',
      status:   'Synced',
    });
  }

  // Files in this folder
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file   = files.next();
    var fName  = file.getName();
    var fBrand = detectBrand(fName, path);

    results.push({
      fileId:   file.getId(),
      fileName: fName,
      type:     getMimeLabel(file.getMimeType()),
      mimeType: file.getMimeType(),
      brand:    fBrand !== 'UNASSIGNED' ? fBrand : brand,
      parent:   name,
      path:     path,
      url:      file.getUrl(),
      created:  safeDate(file.getDateCreated()),
      modified: safeDate(file.getLastUpdated()),
      owner:    getOwnerEmail(file),
      size:     formatSize(file.getSize()),
      naming:   checkNaming(fName, fBrand !== 'UNASSIGNED' ? fBrand : brand),
      status:   'Synced',
    });
  }

  // Recurse into subfolders
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    scanFolder(subs.next(), path, results);
  }
}

// ─── Brand Detection ──────────────────────────────────────────────────────────

function detectBrand(name, path) {
  var s = (name + ' ' + path).toUpperCase();

  if (s.indexOf('DETEKCAM')     > -1) return 'DETEKCAM';
  if (s.indexOf('DETEKLAB')     > -1) return 'DETEKLAB';
  if (s.indexOf('I-BG')         > -1) return 'I-BG';
  if (s.indexOf('IBG')          > -1) return 'I-BG';
  if (s.indexOf('I_BG')         > -1) return 'I-BG';
  if (s.indexOf('SIPSAFE')      > -1) return 'SIPSAFE';
  if (s.indexOf('GERMONIZER')   > -1) return 'GERMONIZER';
  if (s.indexOf('CORPORATE')    > -1) return 'CORPORATE';
  if (s.indexOf('SOCIAL MEDIA') > -1) return 'SOCIAL MEDIA';
  if (s.indexOf('SOCIALMEDIA')  > -1) return 'SOCIAL MEDIA';
  if (s.indexOf('VENDOR')       > -1) return 'VENDOR';
  if (s.indexOf('ARCHIVE')      > -1) return 'ARCHIVE';
  if (s.indexOf('INBOX')        > -1) return 'INBOX';

  return 'UNASSIGNED';
}

// ─── Naming Convention Check ──────────────────────────────────────────────────
// Rule: BRAND_CATEGORY_DESCRIPTION_DATE → OK
//       Otherwise → Rename Needed

function checkNaming(filename, brand) {
  var base  = filename.replace(/\.[^.]+$/, '');  // strip extension
  var parts = base.split('_');

  if (parts.length < 2) return 'Rename Needed';

  // Part 0 must match a known brand (case-insensitive, ignore dashes/spaces)
  var p0          = parts[0].toUpperCase().replace(/[-\s]/g, '');
  var brandNorm   = (brand || '').toUpperCase().replace(/[-\s]/g, '');
  var knownNorms  = DC.BRANDS.map(function(b) { return b.toUpperCase().replace(/[-\s]/g, ''); });

  var brandMatch  = knownNorms.indexOf(p0) > -1 || p0 === brandNorm;

  // Part 1 = category (must exist and be non-trivial)
  var hasCategory = parts.length >= 2 && parts[1].length >= 2;

  if (brandMatch && hasCategory) return 'OK';
  return 'Rename Needed';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeLabel(mime) {
  return MIME_MAP[mime] || mime || 'Unknown';
}

function getOwnerEmail(file) {
  try {
    var owner = file.getOwner();
    return owner ? owner.getEmail() : '';
  } catch (e) {
    return '';
  }
}

function getParentName(folder) {
  try {
    var parents = folder.getParents();
    return parents.hasNext() ? parents.next().getName() : '';
  } catch (e) {
    return '';
  }
}

function safeDate(d) {
  try {
    return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '';
  } catch (e) {
    return '';
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024)                  return bytes + ' B';
  if (bytes < 1024 * 1024)           return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024)    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ─── Write to Drive Live Registry ────────────────────────────────────────────

function writeToSheet(sheet, rows, syncTime) {
  var syncTimeStr = Utilities.formatDate(syncTime, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  // Preserve rename workflow columns (cols 16-19) before wiping the sheet.
  // Keyed by File ID so values survive even if row order changes.
  var savedRename = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existing = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();
    existing.forEach(function(r) {
      var fid = (r[RENAME_COL.FILE_ID] || '').toString().trim();
      if (fid) {
        savedRename[fid] = {
          suggested:   r[RENAME_COL.SUGGESTED]    || '',
          approval:    r[RENAME_COL.APPROVAL]     || '',
          result:      r[RENAME_COL.RESULT]       || '',
          renamedDate: r[RENAME_COL.RENAMED_DATE] || '',
        };
      }
    });
    sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).clearContent().clearFormat();
  }

  // Write header row — sync cols in blue, rename cols in amber
  sheet.getRange(1, 1, 1, 15)
    .setValues([REGISTRY_HEADERS.slice(0, 15)])
    .setFontWeight('bold')
    .setBackground('#e8f0fe');
  sheet.getRange(1, 16, 1, 4)
    .setValues([REGISTRY_HEADERS.slice(15)])
    .setFontWeight('bold')
    .setBackground('#fef3c7');

  if (rows.length === 0) return;

  // Build 2D array — restore saved rename values per file ID
  var output = rows.map(function(r) {
    var rd = savedRename[r.fileId] || {};
    return [
      r.fileId,   r.fileName, r.type,    r.mimeType, r.brand,
      r.parent,   r.path,     r.url,     r.created,  r.modified,
      r.owner,    r.size,     r.naming,  r.status,   syncTimeStr,
      rd.suggested   || '',
      rd.approval    || '',
      rd.result      || '',
      rd.renamedDate || '',
    ];
  });

  sheet.getRange(2, 1, output.length, REGISTRY_HEADERS.length).setValues(output);

  // Color-code Naming Check column (col 13)
  var namingColors = rows.map(function(r) {
    if (r.naming === 'OK')            return ['#d4edda'];
    if (r.naming === 'Folder')        return ['#e8eaf6'];
    if (r.naming === 'Rename Needed') return ['#f8d7da'];
    return [null];
  });
  sheet.getRange(2, 13, rows.length, 1).setBackgrounds(namingColors);

  // Light-shade folder rows in the Type column (col 3)
  var typeColors = rows.map(function(r) {
    return r.type === 'Folder' ? ['#f0f3ff'] : [null];
  });
  sheet.getRange(2, 3, rows.length, 1).setBackgrounds(typeColors);

  // Color-code Rename Result column (col 18)
  var resultColors = output.map(function(r) {
    var result = (r[RENAME_COL.RESULT] || '').toString();
    if (result === 'Renamed')         return ['#d4edda'];
    if (result.indexOf('Error') > -1) return ['#f8d7da'];
    return [null];
  });
  sheet.getRange(2, RENAME_COL.RESULT + 1, output.length, 1).setBackgrounds(resultColors);

  sheet.autoResizeColumns(1, REGISTRY_HEADERS.length);
  sheet.setFrozenRows(1);

  Logger.log('writeToSheet: ' + rows.length + ' rows written');
}

// ─── Update Executive Dashboard KPI Summary ───────────────────────────────────

function updateKPISummary(ss, rows) {
  var exec = ss.getSheetByName(DC.EXEC_TAB);
  if (!exec) {
    Logger.log('Executive Dashboard tab not found — skipping KPI update');
    return;
  }

  var files   = rows.filter(function(r) { return r.type !== 'Folder'; });
  var folders = rows.filter(function(r) { return r.type === 'Folder'; });

  // Unique brands (excluding UNASSIGNED)
  var brandSet = {};
  files.forEach(function(r) {
    if (r.brand && r.brand !== 'UNASSIGNED') brandSet[r.brand] = true;
  });
  var totalBrands  = Object.keys(brandSet).length;
  var totalAssets  = files.length;
  var totalFolders = folders.length;

  var renameNeeded = files.filter(function(r) { return r.naming === 'Rename Needed'; }).length;
  var autoLogged   = files.filter(function(r) { return r.status === 'Synced'; }).length;

  // Pending = files with no path (shouldn't happen, but just in case)
  var pending = files.filter(function(r) { return !r.path || r.path.trim() === ''; }).length;

  // Recently Modified = files with Modified Date in last 7 days
  var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var recentlyMod  = files.filter(function(r) {
    if (!r.modified) return false;
    var d = new Date(r.modified);
    return !isNaN(d.getTime()) && d >= sevenDaysAgo;
  }).length;

  // Overall Health = % of files with Naming Check = OK
  var okFiles = files.filter(function(r) { return r.naming === 'OK'; }).length;
  var health  = totalAssets > 0 ? Math.round((okFiles / totalAssets) * 100) : 0;

  // Write KPI header (row 3) and values (row 4) in Executive Dashboard
  var kpiHeaders = [
    'Total Brands', 'Total Assets', 'Total Folders', 'Rename Needed',
    'Recently Modified', 'Auto Logged', 'Pending Review', 'Overall Health',
  ];
  var kpiValues = [
    totalBrands, totalAssets, totalFolders, renameNeeded,
    recentlyMod, autoLogged, pending, health + '%',
  ];

  exec.getRange(2, 2).setValue(new Date());
  exec.getRange(3, 1, 1, kpiHeaders.length).setValues([kpiHeaders]).setFontWeight('bold').setBackground('#f3f3f3');
  exec.getRange(4, 1, 1, kpiValues.length).setValues([kpiValues]);

  Logger.log(
    'KPI update: brands=' + totalBrands +
    ' assets=' + totalAssets +
    ' folders=' + totalFolders +
    ' rename=' + renameNeeded +
    ' recent=' + recentlyMod +
    ' health=' + health + '%'
  );
}

// ─── Rename Approved Files ────────────────────────────────────────────────────
//
// Renames files in Drive where:
//   Type ≠ Folder
//   Naming Check = Rename Needed
//   Rename Approval = YES  (case-insensitive)
//   Suggested New Name is not blank
//   File ID is not blank
//
// After a successful rename, updates the row in-place:
//   File Name      ← Suggested New Name
//   Naming Check   ← OK
//   Rename Result  ← Renamed
//   Renamed Date   ← now
//
// On failure writes the error message into Rename Result.
// Does not re-process rows already marked Rename Result = Renamed.

function renameApprovedFiles() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);

  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'Drive Live Registry tab not found.\nRun DBCC → Sync Drive Files first.'
    );
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(
      'No data in Drive Live Registry.\nRun DBCC → Sync Drive Files first.'
    );
    return;
  }

  var data = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();

  var renamed = 0, failed = 0, skipped = 0;
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  ss.toast('Processing rename approvals...', 'DBCC Rename', -1);

  for (var i = 0; i < data.length; i++) {
    var row  = data[i];
    var sheetRow = i + 2; // 1-indexed, offset by header

    var fileId    = (row[RENAME_COL.FILE_ID]   || '').toString().trim();
    var type      = (row[RENAME_COL.TYPE]      || '').toString().trim();
    var naming    = (row[RENAME_COL.NAMING]    || '').toString().trim();
    var suggested = (row[RENAME_COL.SUGGESTED] || '').toString().trim();
    var approval  = (row[RENAME_COL.APPROVAL]  || '').toString().trim().toUpperCase();
    var result    = (row[RENAME_COL.RESULT]    || '').toString().trim();

    // Skip folders regardless of other columns
    if (type === 'Folder') { skipped++; continue; }

    // Skip rows that have already been renamed successfully
    if (result === 'Renamed') { skipped++; continue; }

    // All conditions must be met
    if (!fileId)                   { skipped++; continue; }
    if (naming  !== 'Rename Needed') { skipped++; continue; }
    if (approval !== 'YES')          { skipped++; continue; }
    if (!suggested)                  { skipped++; continue; }

    try {
      var file = DriveApp.getFileById(fileId);
      file.setName(suggested);

      // Update the row in-place (1-indexed columns)
      sheet.getRange(sheetRow, RENAME_COL.FILE_NAME    + 1).setValue(suggested);
      sheet.getRange(sheetRow, RENAME_COL.NAMING       + 1).setValue('OK').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RESULT       + 1).setValue('Renamed').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RENAMED_DATE + 1).setValue(now);

      renamed++;
      Logger.log('Renamed [row ' + sheetRow + '] ' + fileId + ' → "' + suggested + '"');

    } catch (e) {
      sheet.getRange(sheetRow, RENAME_COL.RESULT + 1)
        .setValue('Error: ' + e.message)
        .setBackground('#f8d7da');
      failed++;
      Logger.log('Rename failed [row ' + sheetRow + '] ' + fileId + ': ' + e.message);
    }
  }

  SpreadsheetApp.flush();

  var summary =
    'Rename complete.\n\n' +
    '✓ Renamed : ' + renamed  + '\n' +
    '✗ Failed  : ' + failed   + '\n' +
    '— Skipped : ' + skipped;

  ss.toast(summary.replace(/\n/g, '  '), 'DBCC Rename Complete', 10);
  SpreadsheetApp.getUi().alert(summary);
  Logger.log('renameApprovedFiles done — renamed=' + renamed + ' failed=' + failed + ' skipped=' + skipped);
}

// ─── Hourly Trigger Management ────────────────────────────────────────────────

function setupHourlyTrigger() {
  removeTrigger();
  ScriptApp.newTrigger(DC.TRIGGER_FUNC)
    .timeBased()
    .everyHours(DC.TRIGGER_HOURS)
    .create();
  SpreadsheetApp.getUi().alert(
    'Hourly trigger created.\n\nsyncDriveFiles() will run automatically every hour.'
  );
}

function removeTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === DC.TRIGGER_FUNC) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) Logger.log('Removed ' + removed + ' trigger(s)');
}

function showTriggerStatus() {
  var active = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === DC.TRIGGER_FUNC;
  });
  SpreadsheetApp.getUi().alert(active.length > 0
    ? 'Trigger active: syncDriveFiles() runs every ' + DC.TRIGGER_HOURS + ' hour(s).\nTotal triggers: ' + active.length
    : 'No trigger active.\n\nUse DBCC → Setup Hourly Trigger to enable auto-sync.'
  );
}
