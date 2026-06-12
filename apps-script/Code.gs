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
  ROOT_FOLDER_ID:    '1CdF3craHFtAWiigQJgMgW9NJSAsOEgPx',
  REGISTRY_TAB:      'Drive Live Registry',
  EXEC_TAB:          'Executive Dashboard',
  AUTOMATION_LOG_TAB:'Automation Log',
  TRIGGER_FUNC:      'syncAndAutoRenameNewFiles',
  TRIGGER_HOURS:     1,
  BRANDS: [
    'DETEKCAM', 'DETEKLAB', 'I-BG', 'SIPSAFE',
    'GERMONIZER', 'CORPORATE', 'SOCIAL MEDIA', 'VENDOR', 'ARCHIVE', 'INBOX',
  ],
};

// Registry tab column headers (20 columns)
// Cols 1-15: populated by sync. Cols 16-20: rename workflow (user-filled / auto-written).
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
var LOG_HEADERS = ['Timestamp', 'Action', 'Brand', 'File Name', 'Old Name', 'New Name', 'Result', 'Notes'];

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
    { name: 'Setup Hourly Trigger',         functionName: 'setupHourlyTrigger'        },
    { name: 'Remove Trigger',               functionName: 'removeTrigger'             },
    { name: 'View Trigger Status',          functionName: 'showTriggerStatus'         },
  ]);
}

// ─── Orchestrator: Sync + Auto Rename New Files ───────────────────────────────
// Runs the full pipeline: sync → suggest → approve → rename.
// Called by the hourly trigger and the "Sync + Auto Rename New Files" menu item.

function syncAndAutoRenameNewFiles() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var log = _getOrCreateLogSheet(ss);
  var now = _now();

  Logger.log('syncAndAutoRenameNewFiles: pipeline start');
  ss.toast('DBCC: Starting sync + auto rename…', 'DBCC', -1);
  _logAction(log, now, 'Pipeline Start', '', '', '', '', 'OK', '');

  try { syncDriveFiles(); }
  catch(e) {
    Logger.log('syncDriveFiles error: ' + e.message);
    _logAction(log, _now(), 'Sync Error', '', '', '', '', 'Error', e.message);
  }

  try { autoSuggestNames(); }
  catch(e) {
    Logger.log('autoSuggestNames error: ' + e.message);
    _logAction(log, _now(), 'Suggest Error', '', '', '', '', 'Error', e.message);
  }

  try { autoApproveNewFiles(); }
  catch(e) {
    Logger.log('autoApproveNewFiles error: ' + e.message);
    _logAction(log, _now(), 'Approve Error', '', '', '', '', 'Error', e.message);
  }

  try { renameApprovedFiles(); }
  catch(e) {
    Logger.log('renameApprovedFiles error: ' + e.message);
    _logAction(log, _now(), 'Rename Error', '', '', '', '', 'Error', e.message);
  }

  _logAction(log, _now(), 'Pipeline Complete', '', '', '', '', 'OK', '');
  ss.toast('Sync + auto rename complete.', 'DBCC', 8);
  Logger.log('syncAndAutoRenameNewFiles: pipeline complete');
}

// ─── Main: Sync Drive Files ───────────────────────────────────────────────────

function syncDriveFiles() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var sheet    = getOrCreateSheet(ss, DC.REGISTRY_TAB);
  var syncTime = new Date();

  ss.toast('Scanning Google Drive…', 'DBCC Sync', -1);
  Logger.log('syncDriveFiles started: ' + syncTime.toISOString());

  var root    = DriveApp.getFolderById(DC.ROOT_FOLDER_ID);
  var results = [];
  scanFolder(root, '', results);

  Logger.log('Scan complete: ' + results.length + ' items found');
  ss.toast('Writing ' + results.length + ' items to sheet…', 'DBCC Sync', -1);

  writeToSheet(sheet, results, syncTime);
  updateKPISummary(ss, results);

  var log = _getOrCreateLogSheet(ss);
  _logAction(log, _now(), 'Sync Complete', '', '', '', '', 'OK', results.length + ' items');

  var msg = results.length + ' items synced. Last run: ' + syncTime.toLocaleString();
  ss.toast(msg, 'DBCC Sync Complete', 8);
  Logger.log('syncDriveFiles complete: ' + msg);
}

// ─── Auto Suggest Names ───────────────────────────────────────────────────────
// Generates BRAND_PARENTFOLDER_DESCRIPTION_YYYYMMDD for every qualifying row.
// Writes Suggested New Name and Skipped Reason only. Does not rename files.

function autoSuggestNames() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);

  if (!sheet) {
    _safeAlert('Drive Live Registry tab not found.\nRun DBCC → Sync Drive Files first.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    _safeAlert('No data found. Run DBCC → Sync Drive Files first.');
    return;
  }

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

    var reason = '';
    if      (type === 'Folder')          reason = 'Folder skipped';
    else if (!fileId)                    reason = 'Missing File ID';
    else if (!brand)                     reason = 'Missing Brand';
    else if (brand === 'UNASSIGNED')     reason = 'Unclassified brand';
    else if (!parent)                    reason = 'Missing Parent Folder';
    else if (naming !== 'Rename Needed') reason = 'Already OK';
    else if (existing !== '')            reason = 'Suggested name already exists';

    if (reason) {
      updates.push({ row: sheetRow, suggestion: null, reason: reason });
      skipped++;
      continue;
    }

    var name = _buildSuggestedName(brand, parent, fileName, today);
    updates.push({ row: sheetRow, suggestion: name, reason: '' });
    _logAction(log, _now(), 'Suggested', brand, fileName, fileName, name, 'OK', '');
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

  _logAction(log, _now(), 'Suggest Summary', '', '', '', '', 'OK',
    'Suggested: ' + suggested + '  Skipped: ' + skipped);

  var summary = 'Auto-suggest complete.\n\n✓ Suggested: ' + suggested + '\n— Skipped: ' + skipped;
  ss.toast(summary.replace(/\n/g, '  '), 'DBCC Auto Suggest', 8);
  _safeAlert(summary);
  Logger.log('autoSuggestNames: suggested=' + suggested + ' skipped=' + skipped);
}

// ─── Auto Approve New Files ───────────────────────────────────────────────────
// Sets Rename Approval = YES for files where:
//   - Type = File
//   - Naming Check = Rename Needed
//   - Suggested New Name is filled
//   - Rename Approval is blank  (never explicitly set)
//   - Rename Result is blank    (not already renamed)

function autoApproveNewFiles() {
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

    var type      = (row[RENAME_COL.TYPE]      || '').toString().trim();
    var naming    = (row[RENAME_COL.NAMING]    || '').toString().trim();
    var suggested = (row[RENAME_COL.SUGGESTED] || '').toString().trim();
    var approval  = (row[RENAME_COL.APPROVAL]  || '').toString().trim();
    var result    = (row[RENAME_COL.RESULT]    || '').toString().trim();
    var brand     = (row[4] || '').toString().trim();
    var fileName  = (row[1] || '').toString().trim();

    if (type === 'Folder')          continue;
    if (naming !== 'Rename Needed') continue;
    if (!suggested)                 continue;
    if (approval !== '')            continue; // don't overwrite existing decision
    if (result !== '')              continue; // already processed

    sheet.getRange(sheetRow, RENAME_COL.APPROVAL + 1).setValue('YES');
    _logAction(log, _now(), 'Auto Approved', brand, fileName, fileName, suggested, 'OK', '');
    approved++;
  }

  SpreadsheetApp.flush();
  Logger.log('autoApproveNewFiles: approved=' + approved);
}

// ─── Rename Approved Files ────────────────────────────────────────────────────
// Renames files in Drive where Rename Approval = YES and Rename Result is blank.
// Updates File Name, Naming Check, Rename Result, Renamed Date in-place.
// Logs every rename success and failure to Automation Log.

function renameApprovedFiles() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DC.REGISTRY_TAB);

  if (!sheet) {
    _safeAlert('Drive Live Registry tab not found.\nRun DBCC → Sync Drive Files first.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    _safeAlert('No data in Drive Live Registry.\nRun DBCC → Sync Drive Files first.');
    return;
  }

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

    if (type === 'Folder')           { skipped++; continue; }
    if (result === 'Renamed')        { skipped++; continue; }
    if (!fileId)                     { skipped++; continue; }
    if (naming !== 'Rename Needed')  { skipped++; continue; }
    if (approval !== 'YES')          { skipped++; continue; }
    if (!suggested)                  { skipped++; continue; }

    try {
      DriveApp.getFileById(fileId).setName(suggested);

      sheet.getRange(sheetRow, RENAME_COL.FILE_NAME    + 1).setValue(suggested);
      sheet.getRange(sheetRow, RENAME_COL.NAMING       + 1).setValue('OK').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RESULT       + 1).setValue('Renamed').setBackground('#d4edda');
      sheet.getRange(sheetRow, RENAME_COL.RENAMED_DATE + 1).setValue(now);

      _logAction(log, now, 'Renamed', brand, suggested, fileName, suggested, 'Success', '');
      renamed++;
      Logger.log('Renamed [row ' + sheetRow + '] ' + fileId + ' → "' + suggested + '"');

    } catch (e) {
      sheet.getRange(sheetRow, RENAME_COL.RESULT + 1)
        .setValue('Error: ' + e.message)
        .setBackground('#f8d7da');
      _logAction(log, now, 'Rename Failed', brand, fileName, fileName, suggested, 'Error', e.message);
      failed++;
      Logger.log('Rename failed [row ' + sheetRow + '] ' + fileId + ': ' + e.message);
    }
  }

  SpreadsheetApp.flush();

  _logAction(log, _now(), 'Rename Summary', '', '', '', '',
    failed > 0 ? 'Partial' : 'OK',
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
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(5, 220);
    sheet.setColumnWidth(6, 220);
    sheet.setColumnWidth(8, 260);
    Logger.log('Created Automation Log tab');
  }
  return sheet;
}

function _logAction(logSheet, timestamp, action, brand, fileName, oldName, newName, result, notes) {
  try {
    logSheet.appendRow([timestamp, action, brand, fileName, oldName, newName, result, notes || '']);
  } catch(e) {
    Logger.log('_logAction error: ' + e.message);
  }
}

function _now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function _safeAlert(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) { /* trigger context — skip alert */ }
}

// ─── Name Generation Helpers ──────────────────────────────────────────────────

// Builds: BRAND_PARENTFOLDER_DESCRIPTION_YYYYMMDD
function _buildSuggestedName(brand, parent, fileName, today) {
  var brandPart  = _normalizeBrand(brand);
  var folderPart = _normalizeFolder(parent);
  var descPart   = _deriveDescription(fileName, brand, folderPart);

  var parts = [brandPart, folderPart];
  if (descPart) parts.push(descPart);
  parts.push(today);

  return parts.join('_');
}

function _normalizeBrand(brand) {
  return (brand || 'UNASSIGNED')
    .toUpperCase()
    .replace(/[\s\-]/g, '');
}

function _normalizeFolder(folderName) {
  return (folderName || 'ASSETS')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
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
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Created new sheet tab: ' + name);
  }
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
      brand: fBrand !== 'UNASSIGNED' ? fBrand : brand, parent: name, path: path,
      url: file.getUrl(), created: safeDate(file.getDateCreated()),
      modified: safeDate(file.getLastUpdated()), owner: getOwnerEmail(file),
      size: formatSize(file.getSize()),
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
  if (parts.length < 2) return 'Rename Needed';
  var p0         = parts[0].toUpperCase().replace(/[-\s]/g, '');
  var knownNorms = DC.BRANDS.map(function(b) { return b.toUpperCase().replace(/[-\s]/g, ''); });
  var brandMatch = knownNorms.indexOf(p0) > -1;
  var hasCategory = parts.length >= 2 && parts[1].length >= 2;
  if (brandMatch && hasCategory) return 'OK';
  return 'Rename Needed';
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

// ─── Write to Drive Live Registry ────────────────────────────────────────────

function writeToSheet(sheet, rows, syncTime) {
  var syncTimeStr = Utilities.formatDate(syncTime, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  // Preserve rename workflow columns by File ID before wiping
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

  // Header: sync cols blue, workflow cols amber
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

  // Naming Check colors
  var namingColors = rows.map(function(r) {
    if (r.naming === 'OK')            return ['#d4edda'];
    if (r.naming === 'Folder')        return ['#e8eaf6'];
    if (r.naming === 'Rename Needed') return ['#f8d7da'];
    return [null];
  });
  sheet.getRange(2, 13, rows.length, 1).setBackgrounds(namingColors);

  // Folder row shade in Type column
  sheet.getRange(2, 3, rows.length, 1).setBackgrounds(
    rows.map(function(r) { return r.type === 'Folder' ? ['#f0f3ff'] : [null]; })
  );

  // Rename Result colors
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
  if (!exec) { Logger.log('Executive Dashboard tab not found — skipping KPI update'); return; }

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

  Logger.log('KPI update: brands=' + totalBrands + ' assets=' + totalAssets + ' rename=' + renameNeeded + ' health=' + health + '%');
}

// ─── Trigger Management ───────────────────────────────────────────────────────

function setupHourlyTrigger() {
  removeTrigger();
  ScriptApp.newTrigger(DC.TRIGGER_FUNC)
    .timeBased()
    .everyHours(DC.TRIGGER_HOURS)
    .create();
  SpreadsheetApp.getUi().alert(
    'Hourly trigger created.\n\n' +
    'Every hour the pipeline runs:\n' +
    '  1. Sync Drive Files\n' +
    '  2. Auto Suggest Names\n' +
    '  3. Auto Approve New Files\n' +
    '  4. Rename Approved Files\n\n' +
    'All actions are logged to the Automation Log tab.'
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
      '\nRuns every ' + DC.TRIGGER_HOURS + ' hour(s).'
    : 'No trigger active.\n\nUse DBCC → Setup Hourly Trigger to enable auto-sync + auto-rename.'
  );
}
