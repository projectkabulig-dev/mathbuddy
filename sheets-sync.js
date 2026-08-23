/**
 * MathBuddy — Google Sheets Sync
 * Add this to server.js to sync data to Google Sheets
 * 
 * Add SHEETS_URL to your Railway environment variables
 * (the Web App URL from Apps Script deployment)
 */

const SHEETS_URL = process.env.SHEETS_URL || "";

async function syncToSheets(action, data) {
  if (!SHEETS_URL) return null;
  try {
    const r = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data })
    });
    // Apps Script redirects; follow redirect
    if (r.status === 302 || r.redirected) {
      const finalUrl = r.url || r.headers?.get("location");
      if (finalUrl) {
        const r2 = await fetch(finalUrl);
        return await r2.json();
      }
    }
    const result = await r.json();
    console.log(`[Sheets] ${action}:`, result.message || "ok");
    return result;
  } catch (e) {
    console.log(`[Sheets] Sync failed (${action}):`, e.message);
    return null;
  }
}

// Sync learner registration
async function sheetsAddLearner(learner) {
  return syncToSheets("addLearner", learner);
}

// Sync single attempt
async function sheetsSaveAttempt(attempt) {
  return syncToSheets("saveAttempt", attempt);
}

// Sync batch of attempts
async function sheetsSaveBatch(attempts, learner) {
  return syncToSheets("saveBatch", { attempts, learner });
}

// Get learner profile from Sheets
async function sheetsGetProfile(learnerId) {
  return syncToSheets("getLearnerProfile", { learnerId });
}

module.exports = { syncToSheets, sheetsAddLearner, sheetsSaveAttempt, sheetsSaveBatch, sheetsGetProfile };
