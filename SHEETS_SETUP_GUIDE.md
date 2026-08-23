# MathBuddy + Google Sheets Setup Guide
## Project KABULIG · Sir Dyon · SDO Romblon

## STEP 1: Gumawa ng Google Sheet

1. Pumunta sa **sheets.google.com**
2. Click **"Blank spreadsheet"**
3. I-rename sa: **MathBuddy Database**
4. I-rename ang Sheet1 tab sa ibaba → **Learners**
5. Click **"+"** sa ibaba para mag-add ng sheet → i-rename sa **Attempts**
6. Click **"+"** ulit → i-rename sa **Dashboard**

## STEP 2: I-paste ang Apps Script Code

1. Sa Google Sheets, click **Extensions** → **Apps Script**
2. I-delete ang default code (`function myFunction()...`)
3. I-paste ang buong content ng **Code.gs** file
4. Click **Save** (Ctrl+S)
5. I-rename ang project sa taas: **MathBuddy API**

## STEP 3: Deploy as Web App

1. Sa Apps Script, click **Deploy** → **New Deployment**
2. Sa "Select type", click gear icon → piliin **Web App**
3. Fill in:
   - Description: `MathBuddy Database API`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Click **Authorize access** → piliin ang Google account mo → Allow
6. **COPY ang Web App URL** — kailangan ito!
   (Mukhang ganito: `https://script.google.com/macros/s/AKfycb.../exec`)

## STEP 4: Initialize ang Sheets

1. Buksan sa browser: `YOUR_WEB_APP_URL?action=init`
2. Dapat lumabas: `{"ok":true,"message":"Sheets initialized"}`
3. Balik sa Google Sheets — may headers na sa Learners at Attempts

## STEP 5: Add sa Railway

1. Sa Railway dashboard, click ang mathbuddy service
2. Click **Variables** tab
3. Add new variable:
   - Key: **SHEETS_URL**
   - Value: *(paste ang Web App URL mo)*
4. Click **Deploy** para ma-apply

## STEP 6: Update server.js sa GitHub

Kailangan i-update ang server.js para mag-sync sa Sheets.
Sa bawat learner registration at attempt, automatic na nag-se-send sa Google Sheets.

### Sa taas ng server.js, idagdag:
```javascript
const { sheetsAddLearner, sheetsSaveAttempt } = require("./sheets-sync");
```

### Sa POST /api/learners endpoint, idagdag pagkatapos ng db.run:
```javascript
sheetsAddLearner(learner); // async, fire-and-forget
```

### Sa POST /api/attempt endpoint, sa saveAttempt function, idagdag:
```javascript
sheetsSaveAttempt({
  learnerId: b.learnerId,
  learnerName: b.learnerName || "",
  competency: b.competency,
  question: b.question,
  expected: String(b.expected),
  answer: String(b.answer),
  correct: !!b.correct,
  difficulty: b.difficulty || 1,
  mastery: s.mastery,
  created_at: now()
});
```

## DONE! 🎉

Ngayon lahat ng student data ay:
- ✅ Saved sa SQLite (fast, local sa Railway)
- ✅ Synced sa Google Sheets (permanent, viewable by teacher)
- ✅ Auto-updates ang Dashboard sheet
- ✅ Color-coded: green = correct, red = wrong
- ✅ Teachers can view/export/print anytime

## SHEET STRUCTURE

### Learners Sheet
| ID | Name | Grade | Section | School | Created At |
|----|------|-------|---------|--------|------------|

### Attempts Sheet  
| Learner ID | Learner Name | Competency | Question | Expected | Answer | Correct | Difficulty | Mastery | Created At |
|------------|-------------|------------|----------|----------|--------|---------|------------|---------|------------|

### Dashboard Sheet
| Last Updated | Total Learners | Total Attempts | Overall Accuracy | Average Mastery |
|-------------|----------------|----------------|-----------------|-----------------|
