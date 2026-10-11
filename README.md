# Quiz Your Lizard

A plain HTML, CSS, and JavaScript prototype of the original Quiz Your Lizard app.
No framework, build step, account, backend, or runtime network dependency.

Repository: https://github.com/davidbreyer/quiz-your-lizard

## GitHub Pages

Site address: https://www.davidbreyer.com/quiz-your-lizard/
The GitHub Pages address redirects to this existing custom domain.

The workflow in `.github/workflows/pages.yml` publishes the static app on every
push to `main` and can also be run manually from GitHub Actions. In the repository's
Settings > Pages, select **GitHub Actions** as the publishing source to enable it.
Only the app files listed below are included in the deployment artifact.

The hosted app stores quizzes in your browser at the Pages address. To move data
from the local prototype, export a JSON backup there and import it on the hosted site.

## Release Versions and Caching

The footer displays a release version such as `v20260826-1747` (year, month, day,
and 24-hour time). Each Pages deployment generates this timestamp in
`America/New_York` and stamps the same value into every local asset reference:
`app.js?v=v20260826-1747`, for example. Scripts, stylesheets, the favicon, and
images all use this query parameter, including images created by JavaScript.
Filenames stay stable. Inline SVG icons do not fetch separate files.

For local releases, run `python tools/version-site.py --version vYYYYMMDD-HHMM`
with the actual release timestamp. The deployed artifact is stamped automatically.
Release versions are separate from base-quiz revisions and the saved-data format.

Cloudflare must include the `v` query parameter in its cache key for this to refresh
cached assets. If the HTML page itself is cached, it must also be refreshed or
purged so browsers receive the new asset URLs. See
[Cloudflare cache keys](https://developers.cloudflare.com/cache/how-to/cache-keys/).

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
- Results, missed-question study and practice, and the last 100 completed quiz/spelling sessions.
- Pop quizzes show explanatory notes after an answer is resolved, preserving a second chance before revealing them.
- **Practice what I missed** starts a new quiz or spelling session using only missed questions, retaining reverse mode and settings. Pop-quiz choices still use the full collection. Each completed attempt is saved separately; **Practice again** repeats the current practice subset.
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

## Base Quiz Updates

Everyday Science is the new default in place of OSX Shell Commands. Its 40 original
questions cover kitchen science, household physics, weather and water, plants and
fungi, and everyday astronomy. Every question has three curated wrong answers and
an explanatory study note. Research references and the editable source are in
`data/everyday-science.json`. Existing saved OSX quizzes, personal edits, and their
practice history remain on the device; retiring a default does not remove it from
an existing library.

Horror Movies is a new Halloween collection with 31 original, spoiler-light movie
clues and three curated wrong answers per question. It spans classic horror,
slashers, creature features, and modern films. Release and director notes identify
the intended version when a title has remakes. The editable source and research
references are in `data/horror-movies.json`.

Founding Fathers adds 40 original clues about revolutionary leadership, diplomacy,
constitutional debates, inventions, and the founders' lives. Each has three curated
wrong answers and a study explanation. The editable source and per-question research
references are in `data/founding-fathers.json`.

Fresh browsers include six collections, including Everyday Science, Horror Movies,
and Founding Fathers. Existing libraries offer these new collections when missing after
refreshing the site. Choose **Add to library**,
review the description, then confirm **Add to library**. Adding a quiz preserves
other collections, settings, and history. New collections are never silently
inserted into saved libraries, and deleted quizzes stay deleted until you choose
to add them again. Only seeds marked `offerToExisting` appear in this new-quiz offer.

Published base quizzes have a revision number. Existing browsers show **Update
available** on a quiz's library card and detail page after reopening or refreshing
the updated site. Select it to review the changes, then choose **Update quiz** or
**Later**. Updates are never installed automatically.

Untouched base quizzes update in place and retain practice history. Edited base
quizzes are kept as a separate **personal copy**, with their existing history; the
new edition appears alongside them. Settings and other quizzes are preserved.
Deleted quizzes are not re-added, and imported quizzes remain personal copies.
Old libraries from before revision tracking are recognized without replacing their
contents. If the original edition cannot be compared, the app preserves a copy.

US State Capitals revision 2 includes three alternatives from the same state for
each of its 50 questions. The alternatives were verified against the
[Census National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html).
Hawaii alternatives are census-designated places. Reverse sessions continue to use
other state names as alternatives.

World Capitals revision 2 adds three curated alternatives to each of its 196
questions. These are cities or towns in the same country, except Monaco,
Singapore, and Vatican City, which use nearby capitals. Several outdated answers
are corrected; questions about countries with multiple capitals specify the
capital's role. Alternative legitimate capitals are excluded from wrong answers.
City names are adapted from [GeoNames](https://www.geonames.org/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Curated choices, source
record IDs, and references for capital corrections live in
`data/world-capitals-update.json`. To verify the choices, download
[cities500.zip](https://download.geonames.org/export/dump/cities500.zip) and run
`python tools/verify-world-cities.py PATH_TO_ZIP`.

For maintenance, curated capital alternatives and release notes live in
`data/state-capitals-update.json` and `data/world-capitals-update.json`.
Run `python tools/extract-seed.py` to regenerate
`seed.js`, retaining the original edition for safe adoption of older saved copies.
Increase the quiz's revision for every published content change. Future revisions
must keep stable quiz IDs; preserve original edition data for browsers that have
not yet adopted revision tracking. To recheck the city names, download the Census
2026 National Places ZIP and run `python tools/verify-state-cities.py PATH_TO_ZIP`.

## Storage Safety

The library's **Import guide** opens a compact guide with a downloadable JSON
example, a copyable AI prompt, and format rules. For authoring, use a top-level
array of quiz objects: `name`, optional `description`, and a `cards` array. Each
card needs string `question` and `answer` fields; `notes` and `wrongAnswers`
(zero to three strings) are optional. IDs and version metadata are unnecessary.
Save as UTF-8 `.json`, then use **Import** and review the destination before
confirming. The guide also explains limits and the supported backup/QYL formats.

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

The three active legacy collections contain 347 linked questions; Everyday Science
adds 40, Horror Movies adds 31, and Founding Fathers adds 40, for a default total of
458. The archived OSX
collection contains 174 additional questions and remains in the original source.
The original SQLite
database also contains one row not linked to these collections; it was not included.
The remaining content and historical notes are archival 2011 material: geography,
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
