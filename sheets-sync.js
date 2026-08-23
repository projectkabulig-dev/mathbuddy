/**
 * MathBuddy — Google Sheets Sync (GET-only, no redirect issues)
 * Project KABULIG · Sir Dyon · SDO Romblon
 */

const SHEETS_URL = process.env.SHEETS_URL || "";

async function syncToSheets(action, data) {
  if (!SHEETS_URL) { console.log("[Sheets] No SHEETS_URL set"); return null; }
  try {
    const payload = encodeURIComponent(JSON.stringify({ action, ...data }));
    const url = SHEETS_URL + "?action=" + action + "&data=" + payload;
    console.log("[Sheets] Syncing:", action);
    const r = await fetch(url, { redirect: "follow" });
    const text = await r.text();
    const result = JSON.parse(text);
    console.log("[Sheets]", action, "->", result.message || result.error || "done");
    return result;
  } catch (e) {
    console.log("[Sheets] Failed:", e.message);
    return null;
  }
}

async function sheetsAddLearner(learner) {
  return syncToSheets("addLearner", learner);
}

async function sheetsSaveAttempt(attempt) {
  return syncToSheets("saveAttempt", attempt);
}

module.exports = { syncToSheets, sheetsAddLearner, sheetsSaveAttempt };
