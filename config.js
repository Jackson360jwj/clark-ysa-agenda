// ---------------------------------------------------------------------------
// Clark YSA Ward – Sacrament Meeting Conducting Sheet – configuration
// ---------------------------------------------------------------------------
// Everything the page needs to know about *where* the schedule lives.
// The page reads the "Schedule" tab of the Google Sheet. It tries, in order:
//   1. The Apps Script web app (appsScriptUrl) – live read AND "Save to sheet".
//   2. The sheet's public CSV feed – works only if the sheet is shared
//      "Anyone with the link can view". Read-only.
//   3. data/schedule.json – a snapshot committed to this repo. Read-only.
// The Apps Script URL can also be pasted into the page's Settings panel, which
// stores it in the browser so you do not have to edit this file.
window.AGENDA_CONFIG = {
  wardName: "Clark YSA Ward",
  churchName: "The Church of Jesus Christ of Latter-day Saints",
  sheetId: "1ktwQilAGsllrzol8UaFviJBLzN4Wr3eg_SsIduX7Wcs",
  sheetTab: "Schedule",
  appsScriptUrl: "",
  snapshotUrl: "data/schedule.json",
  defaults: {
    presiding: "Bishop Jackson",
    stakeBusinessHint: "High Councilor"
  }
};
