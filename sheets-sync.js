/**
 * MathBuddy — Google Sheets Sync (Fixed for Apps Script redirects)
 * Project KABULIG · Sir Dyon · SDO Romblon
 */

const SHEETS_URL = process.env.SHEETS_URL || "";

async function syncToSheets(action, data) {
  if (!SHEETS_URL) { console.log("[Sheets] No SHEETS_URL set"); return null; }
  try {
    console.log("[Sheets] Syncing:", action);
    const payload = JSON.stringify({ action, ...data });
    
    const r = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: payload,
      redirect: "follow"
    });
    
    const text = await r.text();
    try {
      const result = JSON.parse(text);
      console.log("[Sheets]", action, "->", result.message || "ok");
      return result;
    } catch (e) {
      console.log("[Sheets] Redirect detected, using GET fallback...");
      const getUrl = SHEETS_URL + "?action=" + action + "&data=" + encodeURIComponent(payload);
      const r2 = await fetch(getUrl, { redirect: "follow" });
      const text2 = await r2.text();
      const result2 = JSON.parse(text2);
      console.log("[Sheets]", action, "->", result2.message || "ok (GET)");
      return result2;
    }
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
