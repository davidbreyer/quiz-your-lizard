# Quiz Your Lizard

A plain HTML, CSS, and JavaScript prototype of the original Quiz Your Lizard app.
No framework, build step, account, backend, or runtime network dependency.

Repository: https://github.com/davidbreyer/quiz-your-lizard

## Run

Open `index.html` in Chrome or Edge. All scripts, icons, and images are bundled locally.

For consistent browser storage behavior, serve this folder at a stable address:

```powershell
python -m http.server 8125 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8125`. This optional command serves the entire workspace,
so use it only for local development; publish only the app files listed below.
The prototype has no build or server requirement. Direct `file:` URL storage
behavior varies by browser; moving the HTML file or changing the host or port
can make the browser use a different storage area.

## Features

- Quiz library with search, creation, editing, and confirmed deletion.
- Question editor with answers, notes, and up to three custom wrong answers.
- Study flashcards with reveal, notes, previous/next, and reverse mode.
- Multiple-choice sessions with distinct shuffled choices and optional second chance.
- Spelling practice with Unicode-aware, case-insensitive answer matching,
  progressive hints, answer reveal, and assisted versus unassisted scoring.
- Configurable quiz/spelling session length, from 1 to 200 questions.
- Results, missed-question review, and the last 100 completed quiz/spelling sessions.
- Complete JSON backup export and import; single-quiz JSON and legacy XML `.qyl` export.
- Imports can create new collections or add questions to an existing collection.
- Responsive styles for desktop, tablets, and phones; keyboard-accessible dialogs.

This is a modern interpretation of the old app. Spelling uses explicit answer
submission rather than rejecting individual keystrokes. Interface text is currently
English; German quiz content is retained.

## Data

Storage key: `quiz-your-lizard:v1`. The versioned JSON document contains `quizzes`,
`settings`, and `history`. Each quiz contains `id`, `name`, `description`, and `cards`;
each card contains `id`, `question`, `answer`, `notes`, and `wrongAnswers`.

Existing saved data is never silently replaced with seed data. Writes validate the
whole document and report storage failures. A stale tab refuses to overwrite a newer
save. Unreadable saved data is kept intact and can be downloaded as a recovery file.
Keep only one editing tab open; the stale-snapshot check is not a database transaction
and cannot make simultaneous writes in separate tabs fully atomic.

Export backups regularly. Browser storage is specific to the browser profile and
origin, does not sync across devices, and can disappear when site data is cleared or
private browsing ends. Local storage generally has a 5 MiB allowance per origin;
images and audio should not be stored here. A future move to IndexedDB can keep the
same quiz model while adding larger storage and asynchronous reads/writes.

Imports are additive. They allocate new IDs, remap associated history, and preserve
current session settings. Importing the same file twice intentionally creates copies.
Files must be smaller than 4 MiB. Unknown format versions and incomplete questions
are rejected before the saved library changes.

The four original seed collections contain 521 linked questions. The original SQLite
database also contains one row not linked to these collections; it was not included.
These are archival 2011 collections, not refreshed reference material: geography,
population notes, and shell commands should be reviewed before reuse.

## Tests

Node.js is needed only for development tests:

```powershell
npm ci --ignore-scripts
npm test
```

The tests cover the quiz engine, failed/corrupt storage, conflicting tabs, editor
persistence, canceled edits, scoring, reverse flashcards, spelling hints, and
JSON/QYL import/export. DOM tests use jsdom; they do not verify browser layout,
touch behavior, real download prompts, or file-URL storage compatibility.

## App Files

For a static host, publish `index.html`, `styles.css`, `app.js`, `core.js`, `seed.js`,
`assets/`, and `vendor/`. No `node_modules`, development tests, or original source
clone should be published. Lucide icons are vendored under the license in
`vendor/LICENSE-lucide`. The logo and quiz collections come from the original app.

The archived Xamarin source is in `old-source/` locally and is ignored by this new
workspace's Git configuration. To regenerate the seed data, clone the original
repository into that folder and run the conversion script:

```powershell
git clone https://github.com/davidbreyer/QuizYourLizard.git old-source
python tools/extract-seed.py
```

The committed `seed.js` is already generated; the original clone and Python are
not needed to run this app.
