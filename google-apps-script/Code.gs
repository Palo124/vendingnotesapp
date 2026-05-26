/**
 * Google Apps Script for Vending Site Survey
 *
 * Setup:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Paste this file, set APPS_SCRIPT_SECRET
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy deployment URL into assets/config.js → scriptUrl
 * 5. Same secret in config.js and APPS_SCRIPT_SECRET below
 */

const APPS_SCRIPT_SECRET = "change-me-to-a-long-random-string";
const SHEET_NAME = "Sheet1";

const HEADERS = [
  "Area/District",
  "Address",
  "Building Name",
  "Building Type",
  "Estimated People Count",
  "Existing Machine?",
  "Operator Name",
  "Machine Quality (1-5)",
  "Card Payment?",
  "Coffee Available?",
  "Nearby Food Distance",
  "Access Difficulty",
  "Notes",
  "Potential Score (1-10)",
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.secret !== APPS_SCRIPT_SECRET) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!payload.row || !Array.isArray(payload.row)) {
      return jsonResponse({ ok: false, error: "Missing row" }, 400);
    }

    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    if (payload.row.length !== HEADERS.length) {
      return jsonResponse({
        ok: false,
        error: "Expected " + HEADERS.length + " columns, got " + payload.row.length,
      }, 400);
    }

    sheet.appendRow(payload.row.map(normalizeCell_));
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
}

function doGet() {
  return jsonResponse({ ok: true, message: "Vending survey endpoint ready" });
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const empty = firstRow.every(function (cell) {
    return String(cell).trim() === "";
  });

  if (empty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const mismatch = HEADERS.some(function (header, i) {
    return String(firstRow[i]).trim() !== header;
  });

  if (mismatch) {
    throw new Error("Sheet1 row 1 headers do not match expected columns");
  }
}

function normalizeCell_(value) {
  if (value == null) return "";
  return String(value).trim();
}

function jsonResponse(obj, _code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
