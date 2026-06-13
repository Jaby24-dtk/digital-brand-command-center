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
 *   6. Run "Setup Hourly Trigger" once to enable auto-sync + auto-rename
 * ================================================================
 */

// ─── Configuration ────────────────────────────────────────────────────────────

var DC = {
  ROOT_FOLDER_ID:     '1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx',
  REGISTRY_TAB:       'Drive Live Registry',
  EXEC_TAB:           'Executive Dashboard',
  AUTOMATION_LOG_TAB: 'Automation Log',
  TRIGGER_FUNC:       'syncAndAutoRenameNewFiles',
  TRIGGER_MINUTES:    15,
  BRANDS: [
    'DETEKCAM', 'DETEKLAB', 'I-BG', 'SIPSAFE',
    'GERMONIZER', 'CORPORATE', 'SOCIAL MEDIA', 'VENDOR', 'ARCHIVE', 'INBOX',
  ],
};

// Registry tab column headers (20 columns)
var REGISTRY_HEADERS = [
  'File ID', 'File Name', 'Type', 'MIME Type', 'Brand',
  'Parent Folder', 'Full Folder Path', 'Google Drive URL',
  'Created Date', 'Modified Date', 'Owner', 'Size',
  'Naming Check', 'Status', 'Last Synced',
  'Suggested New Name', 'Rename Approval', 'Rename Result', 'Renamed Date', 'Skipped Reason',
];

// Column indices (0-based)
var RENAME_COL = {
  FILE_ID:        0,
  FILE_NAME:      1,
  TYPE:           2,
  NAMING:         12,
  SUGGESTED:      15,
  APPROVAL:       16,
  RESULT:         17,
  RENAMED_DATE:   18,
  SKIPPED_REASON: 19,
};

// Automation Log column headers
var LOG_HEADERS = [
  'Timestamp', 'Action', 'File ID', 'Old File Name',
  'New File Name', 'Brand', 'Result', 'Message', 'Triggered By',
];

// Tracks how the current pipeline was invoked
var _triggeredBy = 'Manual';

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

var DESC_STOP_WORDS = [
  'the','a','an','of','in','on','at','to','for','and','or','by','with','from',
  'is','was','are','be','been','img','image','photo','file','new','final','copy',
  'version','draft','v1','v2','v3','v4','rev','edit','edited','export','exported',
  'untitled','document','logo','icon','asset','original','temp','test',
  '0','1','2','3','01','02','03',
];

// ─── Custom Menu ──────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('DBCC', [
    { name: 'Sync Drive Files',             functionName: 'syncDriveFiles'            },
    { name: 'Auto Suggest Names',           functionName: 'autoSuggestNames'          },
    { name: 'Rename Approved Files',        functionName: 'renameApprovedFiles'       },
    { name: 'Sync + Auto Rename New Files', functionName: 'syncAndAutoRenameNewFiles' },
    null,
    { name: 'View Automation Log',          functionName: 'viewAutomationLog'         },
    null,
    { name: 'Setup Hourly Trigger',         functionName: 'setupHourlyTrigger'        },
    { name: 'Remove Trigger',               functionName: 'removeTrigger'             },
    { name: 'View Trigger Status',          functionName: 'showTriggerStatus'         },
  ]);
}

// ─── Orchestrator: Sync + Auto Rename New Files ───────────────────────────────

function syncAndAutoRenameNewFiles() {
  _triggeredBy = 'Auto Pipeline';
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var log = _getOrCreateLogSheet(ss);

  Logger.log('syncAndAutoRenameNewFiles: pipeline start');
  ss.toast('DBCC: Starting sync + auto rename…', 'DBCC', -1);
  _log(log, 'Pipeline Start', '', '', '', '', 'OK', '');

  try { syncDriveFiles(); }
  catch(e) {
    Logger.log('syncDriveFiles error: ' + e.message);
    _log(log, 'Sync Error', '', '', '', '', 'Failed', e.message);
  }

  try { autoSuggestNames(); }
  catch(e) {
    Logger.log('autoSuggestNames error: ' + e.message);
    _log(log, 'Suggest Error', '', '', '', '', 'Failed', e.message);
  }

  try { autoApproveNewFiles(); }
  catch(e) {
    Logger.log('autoApproveNewFiles error: ' + e.message);
    _log(log, 'Approve Error', '', '', '', '', 'Failed', e.message);
  }

  try { renameApprovedFiles(); }
  catch(e) {
    Logger.log('renameApprovedFiles error: ' + e.message);
    _log(log, 'Rename Error', '', '', '', '', 'Failed', e.message);
  }

  _log(log, 'Pipeline Complete', '', '', '', '', 'OK', '');
  ss.toast('Sync + auto rename complete.', 'DBCC', 8);
  Logger.log('syncAndAutoRenameNewFiles: pipeline complete');
}

// ─── Sync Drive Files ─────────────────────────────────────────────────────────

function syncDriveFiles() {
  _triggeredBy = _triggeredBy || 'Manual';
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getOrCreateSheet(ss, DC.REGISTRY_TAB);
  var syncTime = new Date();
  var log      = _getOrCreateLogSheet(ss);

  ss.toast('Scanning Google Drive…', 'DBCC Sync', -1);
  Logger.log('syncDriveFiles started: ' + syncTime.toISOString());

  var root    = DriveApp.getFolderById(DC.ROOT_FOLDER_ID);
  var results = [];
  scanFolder(root, '', results);

  ss.toast('Writing ' + results.length + ' items to sheet…', 'DBCC Sync', -1);
  writeToSheet(sheet, results, syncTime);
  updateKPISummary(ss, results);

  _log(log, 'Sync', '', '', '', '', 'Success', results.length + ' items synced');
  ss.toast(results.length + ' items synced.', 'DBCC Sync Complete', 8);
  Logger.log('syncDriveFiles complete: ' + results.length + ' items');
}

// ─── Auto Suggest Names ───────────────────────────────────────────────────────

function autoSuggestNames() {
  _triggeredBy = _triggeredBy || 'Manual';
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);

  if (!sheet) { _safeAlert('Drive Live Registry tab not found.\nRun DBCC → Sync Drive Files first.'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { _safeAlert('No data found. Run DBCC → Sync Drive Files first.'); return; }

  var data      = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();
  var today     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var log       = _getOrCreateLogSheet(ss);
  var updates   = [];
  var suggested = 0, skipped = 0;

  ss.toast('Generating name suggestions…', 'DBCC Auto Suggest', -1);

  for (var i = 0; i < data.length; i++) {
    var row      = data[i];
    var sheetRow = i + 2;

    var fileId   = (row[0]  || '').toString().trim();
    var fileName = (row[1]  || '').toString().trim();
    var type     = (row[2]  || '').toString().trim();
    var brand    = (row[4]  || '').toString().trim();
    var parent   = (row[5]  || '').toString().trim();
    var naming   = (row[12] || '').toString().trim();
    var existing = (row[15] || '').toString().trim();

    // Silently skip folders — clear any stale "Folder skipped" reason
    if (type === 'Folder') {
      var oldReason = (row[RENAME_COL.SKIPPED_REASON] || '').toString().trim();
      if (oldReason === 'Folder skipped') {
        updates.push({ row: sheetRow, suggestion: null, reason: '' });
      }
      skipped++;
      continue;
    }

    var reason = '';
    if      (!fileId)                    reason = 'Missing File ID';
    else if (!brand)                     reason = 'Missing Brand';
    else if (brand === 'UNASSIGNED')     reason = 'Unclassified brand';
    else if (!parent)                    reason = 'Missing Parent Folder';
    else if (naming !== 'Rename Needed') reason = 'Already OK';
    else if (existing !== '')            reason = 'Suggested name already exists';

    if (reason) {
      updates.push({ row: sheetRow, suggestion: null, reason: reason });
      // Log only actionable problems
      if (reason === 'Missing File ID') {
        _log(log, 'Suggest Skipped', fileId, fileName, '', brand, 'Skipped', reason);
      }
      skipped++;
      continue;
    }

    var name = _buildSuggestedName(brand, parent, fileName, today);
    updates.push({ row: sheetRow, suggestion: name, reason: '' });
    _log(log, 'Suggested', fileId, fileName, name, brand, 'Success', '');
    suggested++;
  }

  updates.forEach(function(u) {
    if (u.suggestion !== null) {
      sheet.getRange(u.row, RENAME_COL.SUGGESTED      + 1).setValue(u.suggestion);
      sheet.getRange(u.row, RENAME_COL.SKIPPED_REASON + 1).setValue('');
    } else {
      sheet.getRange(u.row, RENAME_COL.SKIPPED_REASON + 1).setValue(u.reason);
    }
  });
  SpreadsheetApp.flush();

  _log(log, 'Suggest Summary', '', '', '', '', 'Success',
    'Suggested: ' + suggested + '  Skipped: ' + skipped);
  ss.toast('Suggested: ' + suggested + '  Skipped: ' + skipped, 'DBCC Auto Suggest', 8);
  _safeAlert('Auto-suggest complete.\n\n✓ Suggested: ' + suggested + '\n— Skipped: ' + skipped);
  Logger.log('autoSuggestNames: suggested=' + suggested + ' skipped=' + skipped);
}

// ─── Auto Approve New Files ───────────────────────────────────────────────────

function autoApproveNewFiles() {
  _triggeredBy = _triggeredBy || 'Manual';
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data     = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();
  var log      = _getOrCreateLogSheet(ss);
  var approved = 0;

  for (var i = 0; i < data.length; i++) {
    var row      = data[i];
    var sheetRow = i + 2;

    var fileId    = (row[RENAME_COL.FILE_ID]   || '').toString().trim();
    var fileName  = (row[RENAME_COL.FILE_NAME] || '').toString().trim();
    var type      = (row[RENAME_COL.TYPE]      || '').toString().trim();
    var brand     = (row[4]                    || '').toString().trim();
    var naming    = (row[RENAME_COL.NAMING]    || '').toString().trim();
    var suggested = (row[RENAME_COL.SUGGESTED] || '').toString().trim();
    var approval  = (row[RENAME_COL.APPROVAL]  || '').toString().trim();
    var result    = (row[RENAME_COL.RESULT]    || '').toString().trim();

    if (type === 'Folder')          continue;
    if (naming !== 'Rename Needed') continue;
    if (!suggested)                 continue;
    if (approval !== '')            continue;
    if (result !== '')              continue;

    sheet.getRange(sheetRow, RENAME_COL.APPROVAL + 1).setValue('YES');
    _log(log, 'Auto Approved', fileId, fileName, suggested, brand, 'Success', '');
    approved++;
  }

  SpreadsheetApp.flush();
  Logger.log('autoApproveNewFiles: approved=' + approved);
}

// ─── Rename Approved Files ────────────────────────────────────────────────────

function renameApprovedFiles() {
  _triggeredBy = _triggeredBy || 'Manual';
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);

  if (!sheet) { _safeAlert('Drive Live Registry tab not found.\nRun DBCC → Sync Drive Files first.'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { _safeAlert('No data in Drive Live Registry.\nRun DBCC → Sync Drive Files first.'); return; }

  var data    = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();
  var log     = _getOrCreateLogSheet(ss);
  var renamed = 0, failed = 0, skipped = 0;
  var now     = _now();

  ss.toast('Processing rename approvals…', 'DBCC Rename', -1);

  for (var i = 0; i < data.length; i++) {
    var row      = data[i];
    var sheetRow = i + 2;

    var fileId    = (row[RENAME_COL.FILE_ID]   || '').toString().trim();
    var fileName  = (row[RENAME_COL.FILE_NAME] || '').toString().trim();
    var type      = (row[RENAME_COL.TYPE]      || '').toString().trim();
    var brand     = (row[4]                    || '').toString().trim();
    var naming    = (row[RENAME_COL.NAMING]    || '').toString().trim();
    var suggested = (row[RENAME_COL.SUGGESTED] || '').toString().trim();
    var approval  = (row[RENAME_COL.APPROVAL]  || '').toString().trim().toUpperCase();
    var result    = (row[RENAME_COL.RESULT]    || '').toString().trim();

    if (type === 'Folder')          { skipped++; continue; }
    if (result === 'Renamed')       { skipped++; continue; }
    if (naming !== 'Rename Needed') { skipped++; continue; }
    if (approval !== 'YES')         { skipped++; continue; }

    // Log important skips
    if (!fileId) {
      _log(log, 'Rename Skipped', fileId, fileName, suggested, brand, 'Skipped', 'Missing File ID');
      skipped++; continue;
    }
    if (!suggested) {
      _log(log, 'Rename Skipped', fileId, fileName, '', brand, 'Skipped', 'Missing Suggested New Name');
      skipped++; continue;
    }

    try {
      DriveApp.getFileById(fileId).setName(suggested);

      sheet.getRange(sheetRow, RENAME_COL.FILE_NAME      + 1).setValue(suggested);
      sheet.getRange(sheetRow, RENAME_COL.NAMING         + 1).setValue('OK').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RESULT         + 1).setValue('Renamed').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RENAMED_DATE   + 1).setValue(now);
      sheet.getRange(sheetRow, RENAME_COL.SKIPPED_REASON + 1).setValue('');

      _log(log, 'Rename', fileId, fileName, suggested, brand, 'Success', '');
      renamed++;
      Logger.log('Renamed [row ' + sheetRow + '] ' + fileId + ' → "' + suggested + '"');

    } catch (e) {
      var errMsg = e.message || 'Unknown error';
      sheet.getRange(sheetRow, RENAME_COL.RESULT + 1)
        .setValue('Error: ' + errMsg)
        .setBackground('#f8d7da');

      // Classify the error for the log
      var errType = 'Failed';
      if (/permission|access|not authorized/i.test(errMsg)) errType = 'Permission Denied';
      if (/duplicate|already exists/i.test(errMsg))         errType = 'Duplicate Name';

      _log(log, 'Rename', fileId, fileName, suggested, brand, errType, errMsg);
      failed++;
      Logger.log('Rename failed [row ' + sheetRow + '] ' + fileId + ': ' + errMsg);
    }
  }

  SpreadsheetApp.flush();

  _log(log, 'Rename Summary', '', '', '', '',
    failed > 0 ? 'Partial' : 'Success',
    'Renamed: ' + renamed + '  Failed: ' + failed + '  Skipped: ' + skipped);

  var summary =
    'Rename complete.\n\n' +
    '✓ Renamed : ' + renamed  + '\n' +
    '✗ Failed  : ' + failed   + '\n' +
    '— Skipped : ' + skipped;

  ss.toast(summary.replace(/\n/g, '  '), 'DBCC Rename Complete', 10);
  _safeAlert(summary);
  Logger.log('renameApprovedFiles done — renamed=' + renamed + ' failed=' + failed + ' skipped=' + skipped);
}

// ─── Web App: live data endpoint (bypasses gviz caching) ─────────────────────

function doGet(e) {
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var regSheet = ss.getSheetByName(DC.REGISTRY_TAB);
    var logSheet = ss.getSheetByName(DC.AUTOMATION_LOG_TAB);
    var payload  = {
      timestamp: new Date().toISOString(),
      registry:  regSheet ? regSheet.getDataRange().getDisplayValues() : [],
      log:       logSheet ? logSheet.getDataRange().getDisplayValues() : [],
    };
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── View Automation Log ──────────────────────────────────────────────────────

function viewAutomationLog() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _getOrCreateLogSheet(ss);
  ss.setActiveSheet(sheet);
}

// ─── Automation Log helpers ───────────────────────────────────────────────────

function _getOrCreateLogSheet(ss) {
  var sheet = ss.getSheetByName(DC.AUTOMATION_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(DC.AUTOMATION_LOG_TAB);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length)
      .setValues([LOG_HEADERS])
      .setFontWeight('bold')
      .setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
    // Column widths
    sheet.setColumnWidth(1, 155); // Timestamp
    sheet.setColumnWidth(2, 130); // Action
    sheet.setColumnWidth(3, 200); // File ID
    sheet.setColumnWidth(4, 220); // Old File Name
    sheet.setColumnWidth(5, 220); // New File Name
    sheet.setColumnWidth(6, 110); // Brand
    sheet.setColumnWidth(7, 110); // Result
    sheet.setColumnWidth(8, 280); // Message
    sheet.setColumnWidth(9, 120); // Triggered By
    Logger.log('Created Automation Log tab');
  }
  return sheet;
}

// Append one row to the Automation Log. Never deletes existing rows.
function _log(logSheet, action, fileId, oldName, newName, brand, result, message) {
  try {
    logSheet.appendRow([
      _now(),
      action,
      fileId   || '',
      oldName  || '',
      newName  || '',
      brand    || '',
      result   || '',
      message  || '',
      _triggeredBy || 'Manual',
    ]);
  } catch(e) {
    Logger.log('_log error: ' + e.message);
  }
}

function _now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function _safeAlert(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) { /* trigger context — skip */ }
}

// ─── Name Generation Helpers ──────────────────────────────────────────────────

function _buildSuggestedName(brand, parent, fileName, today) {
  var brandPart  = _normalizeBrand(brand);
  var folderPart = _normalizeFolder(parent);
  var descPart   = _deriveDescription(fileName, brand, folderPart);
  var parts = [brandPart];
  // Skip folder if it's the same as the brand to avoid DETEKLAB_DETEKLAB_...
  if (folderPart && folderPart !== brandPart) parts.push(folderPart);
  if (descPart) parts.push(descPart);
  parts.push(today);
  return parts.join('_');
}

function _normalizeBrand(brand) {
  return (brand || 'UNASSIGNED').toUpperCase().replace(/[\s\-]/g, '');
}

function _normalizeFolder(folderName) {
  return (folderName || 'ASSETS').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
}

function _deriveDescription(fileName, brand, folderNorm) {
  var base   = fileName.replace(/\.[^.]+$/, '');
  var parts  = base.split(/[\s_\-\.]+/);
  var bNorm  = (brand || '').toUpperCase().replace(/[\s\-]/g, '');
  var fParts = folderNorm.split('_');

  var clean = parts.filter(function(p) {
    if (!p || p.length < 2) return false;
    var u = p.toUpperCase().replace(/[\s\-]/g, '');
    if (u === bNorm) return false;
    if (fParts.indexOf(u) > -1) return false;
    if (/^\d+$/.test(p)) return false;
    if (/^\d{4}/.test(p) && p.length >= 6) return false;
    if (DESC_STOP_WORDS.indexOf(p.toLowerCase()) > -1) return false;
    return true;
  });

  return clean.slice(0, 3).join('_').toUpperCase() || '';
}

// ─── Create tab if it does not exist ─────────────────────────────────────────

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); Logger.log('Created tab: ' + name); }
  return sheet;
}

// ─── Recursive Folder Scanner ─────────────────────────────────────────────────

function scanFolder(folder, parentPath, results) {
  var name  = folder.getName();
  var path  = parentPath ? parentPath + ' / ' + name : name;
  var brand = detectBrand(name, path);

  if (parentPath !== '') {
    results.push({
      fileId: folder.getId(), fileName: name, type: 'Folder',
      mimeType: 'application/vnd.google-apps.folder', brand: brand,
      parent: getParentName(folder), path: path, url: folder.getUrl(),
      created: '', modified: '', owner: '', size: '', naming: 'Folder', status: 'Synced',
    });
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    var file   = files.next();
    var fName  = file.getName();
    var fBrand = detectBrand(fName, path);
    results.push({
      fileId: file.getId(), fileName: fName,
      type: getMimeLabel(file.getMimeType()), mimeType: file.getMimeType(),
      brand: fBrand !== 'UNASSIGNED' ? fBrand : brand,
      parent: name, path: path, url: file.getUrl(),
      created: safeDate(file.getDateCreated()), modified: safeDate(file.getLastUpdated()),
      owner: getOwnerEmail(file), size: formatSize(file.getSize()),
      naming: checkNaming(fName, fBrand !== 'UNASSIGNED' ? fBrand : brand),
      status: 'Synced',
    });
  }

  var subs = folder.getFolders();
  while (subs.hasNext()) { scanFolder(subs.next(), path, results); }
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

function checkNaming(filename, brand) {
  var base  = filename.replace(/\.[^.]+$/, '');
  var parts = base.split('_');
  // Require full standard format: BRAND_FOLDER_DESCRIPTION_YYYYMMDD (≥4 parts)
  if (parts.length < 4) return 'Rename Needed';
  // First part must be a known brand (case-insensitive)
  var p0         = parts[0].toUpperCase().replace(/[-\s]/g, '');
  var knownNorms = DC.BRANDS.map(function(b) { return b.toUpperCase().replace(/[-\s]/g, ''); });
  if (knownNorms.indexOf(p0) < 0) return 'Rename Needed';
  // Last part must be an 8-digit date (YYYYMMDD)
  var lastPart = parts[parts.length - 1];
  if (!/^\d{8}$/.test(lastPart)) return 'Rename Needed';
  return 'OK';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeLabel(mime)  { return MIME_MAP[mime] || mime || 'Unknown'; }

function getOwnerEmail(file) {
  try { var o = file.getOwner(); return o ? o.getEmail() : ''; } catch(e) { return ''; }
}

function getParentName(folder) {
  try { var p = folder.getParents(); return p.hasNext() ? p.next().getName() : ''; } catch(e) { return ''; }
}

function safeDate(d) {
  try { return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : ''; } catch(e) { return ''; }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024)                return bytes + ' B';
  if (bytes < 1024 * 1024)         return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024)  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ─── Write to Drive Live Registry ─────────────────────────────────────────────

function writeToSheet(sheet, rows, syncTime) {
  var syncTimeStr = Utilities.formatDate(syncTime, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  var savedRename = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existing = sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).getValues();
    existing.forEach(function(r) {
      var fid = (r[RENAME_COL.FILE_ID] || '').toString().trim();
      if (fid) {
        savedRename[fid] = {
          suggested:     r[RENAME_COL.SUGGESTED]      || '',
          approval:      r[RENAME_COL.APPROVAL]       || '',
          result:        r[RENAME_COL.RESULT]         || '',
          renamedDate:   r[RENAME_COL.RENAMED_DATE]   || '',
          skippedReason: r[RENAME_COL.SKIPPED_REASON] || '',
        };
      }
    });
    sheet.getRange(2, 1, lastRow - 1, REGISTRY_HEADERS.length).clearContent().clearFormat();
  }

  sheet.getRange(1, 1, 1, 15).setValues([REGISTRY_HEADERS.slice(0, 15)]).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(1, 16, 1, 5).setValues([REGISTRY_HEADERS.slice(15)]).setFontWeight('bold').setBackground('#fef3c7');

  if (rows.length === 0) return;

  var output = rows.map(function(r) {
    var rd = savedRename[r.fileId] || {};
    return [
      r.fileId, r.fileName, r.type, r.mimeType, r.brand,
      r.parent, r.path, r.url, r.created, r.modified,
      r.owner, r.size, r.naming, r.status, syncTimeStr,
      rd.suggested || '', rd.approval || '', rd.result || '',
      rd.renamedDate || '', rd.skippedReason || '',
    ];
  });

  sheet.getRange(2, 1, output.length, REGISTRY_HEADERS.length).setValues(output);

  sheet.getRange(2, 13, rows.length, 1).setBackgrounds(rows.map(function(r) {
    if (r.naming === 'OK')            return ['#d4edda'];
    if (r.naming === 'Folder')        return ['#e8eaf6'];
    if (r.naming === 'Rename Needed') return ['#f8d7da'];
    return [null];
  }));

  sheet.getRange(2, 3, rows.length, 1).setBackgrounds(
    rows.map(function(r) { return r.type === 'Folder' ? ['#f0f3ff'] : [null]; })
  );

  sheet.getRange(2, RENAME_COL.RESULT + 1, output.length, 1).setBackgrounds(
    output.map(function(r) {
      var res = (r[RENAME_COL.RESULT] || '').toString();
      if (res === 'Renamed')         return ['#d4edda'];
      if (res.indexOf('Error') > -1) return ['#f8d7da'];
      return [null];
    })
  );

  sheet.autoResizeColumns(1, REGISTRY_HEADERS.length);
  sheet.setFrozenRows(1);
  Logger.log('writeToSheet: ' + rows.length + ' rows written');
}

// ─── Update Executive Dashboard KPI Summary ───────────────────────────────────

function updateKPISummary(ss, rows) {
  var exec = ss.getSheetByName(DC.EXEC_TAB);
  if (!exec) { Logger.log('Executive Dashboard tab not found — skipping'); return; }

  var files   = rows.filter(function(r) { return r.type !== 'Folder'; });
  var folders = rows.filter(function(r) { return r.type === 'Folder'; });
  var brandSet = {};
  files.forEach(function(r) { if (r.brand && r.brand !== 'UNASSIGNED') brandSet[r.brand] = true; });

  var totalBrands  = Object.keys(brandSet).length;
  var totalAssets  = files.length;
  var totalFolders = folders.length;
  var renameNeeded = files.filter(function(r) { return r.naming === 'Rename Needed'; }).length;
  var autoLogged   = files.filter(function(r) { return r.status === 'Synced'; }).length;
  var pending      = files.filter(function(r) { return !r.path || r.path.trim() === ''; }).length;

  var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var recentlyMod  = files.filter(function(r) {
    var d = new Date(r.modified || ''); return !isNaN(d.getTime()) && d >= sevenDaysAgo;
  }).length;

  var okFiles = files.filter(function(r) { return r.naming === 'OK'; }).length;
  var health  = totalAssets > 0 ? Math.round((okFiles / totalAssets) * 100) : 0;

  var kpiHeaders = ['Total Brands','Total Assets','Total Folders','Rename Needed','Recently Modified','Auto Logged','Pending Review','Overall Health'];
  var kpiValues  = [totalBrands, totalAssets, totalFolders, renameNeeded, recentlyMod, autoLogged, pending, health + '%'];

  exec.getRange(2, 2).setValue(new Date());
  exec.getRange(3, 1, 1, kpiHeaders.length).setValues([kpiHeaders]).setFontWeight('bold').setBackground('#f3f3f3');
  exec.getRange(4, 1, 1, kpiValues.length).setValues([kpiValues]);
}

// ─── Trigger Management ───────────────────────────────────────────────────────

function setupHourlyTrigger() {
  removeTrigger();
  ScriptApp.newTrigger(DC.TRIGGER_FUNC)
    .timeBased()
    .everyMinutes(DC.TRIGGER_MINUTES)
    .create();
  SpreadsheetApp.getUi().alert(
    'Trigger created — runs every ' + DC.TRIGGER_MINUTES + ' minutes.\n\n' +
    'Pipeline:\n' +
    '  1. Sync Drive Files\n' +
    '  2. Auto Suggest Names\n' +
    '  3. Auto Approve New Files\n' +
    '  4. Rename Approved Files\n\n' +
    'All actions logged to the Automation Log tab.'
  );
}

function removeTrigger() {
  var FUNCS = ['syncDriveFiles', 'syncAndAutoRenameNewFiles'];
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (FUNCS.indexOf(t.getHandlerFunction()) > -1) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) Logger.log('Removed ' + removed + ' trigger(s)');
}

function showTriggerStatus() {
  var FUNCS  = ['syncDriveFiles', 'syncAndAutoRenameNewFiles'];
  var active = ScriptApp.getProjectTriggers().filter(function(t) {
    return FUNCS.indexOf(t.getHandlerFunction()) > -1;
  });
  SpreadsheetApp.getUi().alert(active.length > 0
    ? 'Trigger active: ' + active.map(function(t) { return t.getHandlerFunction(); }).join(', ') +
      '\nRuns every ' + DC.TRIGGER_MINUTES + ' minutes.'
    : 'No trigger active.\n\nUse DBCC → Setup Hourly Trigger to enable auto-sync + auto-rename.'
  );
}
