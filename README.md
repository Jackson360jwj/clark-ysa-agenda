# Clark YSA Ward – Sacrament Meeting Conducting Sheet

A one-page web form for whoever is conducting sacrament meeting. It reads the
**Schedule** tab of the *Clark YSA Sacrament Agenda* Google Sheet, shows what is
already planned for a given Sunday (presiding, conducting, hymns, prayers,
speakers, musical number, announcements…), lets you type in whatever is still
missing, and the **Generate PDF** button downloads a print-ready conducting
sheet (US Letter, one page whenever it fits).

No build step. Plain HTML, CSS and JavaScript, hosted on GitHub Pages.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The form and the generated sheet |
| `styles.css` | Styling, including print layout (US Letter) |
| `app.js` | Loads the schedule, keeps your edits, drives the form |
| `pdf.js` | Lays out the conducting sheet as a PDF with jsPDF (loaded from cdnjs) |
| `hymns.js` | Hymn number → title lookup (1985 hymnbook, 1–341) |
| `config.js` | Ward name, Google Sheet ID, optional Apps Script URL |
| `data/schedule.json` | Snapshot of the Schedule tab, used if the sheet can't be reached |
| `apps-script/Code.gs` | Optional bridge that makes the page live and lets it save back |

## How the page gets the schedule

It tries three sources in order and tells you which one it is using (badge in the top right):

1. **Apps Script web app** – live read, and the **Save to Google Sheet** button
   appears. The sheet stays private. Set it up once following the comments at
   the top of `apps-script/Code.gs`, then paste the URL into ⚙ Settings on the
   page (or into `config.js`).
2. **Public CSV feed** – the sheet is currently shared "Anyone with the link can
   view", so this is what the live site uses. Read-only: edits stay in the
   browser until the Apps Script bridge is set up.
3. **Snapshot** – `data/schedule.json`, committed to this repo. Read-only.

Whatever the source, anything you type is kept in your browser (per Sunday) so a
refresh does not lose it.

## Using it on Sunday

1. Pick the Sunday (it defaults to the next one).
2. Blue-outlined fields came from the schedule; fill in the blanks.
   Type a hymn number and the title fills itself in.
3. Leave ward-business boxes empty if nothing is happening — empty sections are
   left off the sheet.
4. **Generate PDF**. The PDF downloads immediately (file name
   `Conducting Sheet YYYY-MM-DD.pdf`); a preview of the same sheet stays on
   screen with **Open PDF** and **Download PDF again** buttons.

## Updating the snapshot

If you are not using the Apps Script bridge, re-export the Schedule tab now and
then: File ▸ Download ▸ CSV, convert to the JSON shape in `data/schedule.json`,
commit and push.
