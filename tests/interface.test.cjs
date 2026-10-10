const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const key = 'quiz-your-lizard:v1';
const fixture = () => ({ version: 1, quizzes: [{ id: 'fixture', name: 'Test collection', description: 'Fixture', cards: [
  { id: 'a', question: 'First question', answer: 'First answer', notes: 'Original note', wrongAnswers: ['Wrong A', 'Wrong B'] },
  { id: 'b', question: 'Second question', answer: 'Second answer', notes: '', wrongAnswers: ['Wrong C'] }
] }], settings: { count: 2, reverse: false, secondChance: true }, history: [] });
function boot(saved) {
  const dom = new JSDOM(read('index.html'), { url: 'https://quiz-lizard.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, errors = [], downloads = [];
  w.addEventListener('error', e => errors.push(e.error));
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.HTMLAnchorElement.prototype.click = function () {};
  w.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.TextDecoder = TextDecoder;
  w.scrollTo = () => {};
  if (saved !== undefined) w.localStorage.setItem(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  for (const file of ['vendor/lucide.min.js', 'seed.js', 'core.js', 'app.js']) w.eval(read(file));
  const $ = selector => w.document.querySelector(selector);
  const click = selector => { const el = $(selector); assert.ok(el, 'Missing ' + selector); assert.notEqual(el.disabled, true); if (el.tagName === 'A') el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); else el.click(); assert.equal(errors.length, 0, errors[0]?.stack); };
  const fill = (selector, value) => { const el = $(selector); assert.ok(el); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = selector => { $(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); assert.equal(errors.length, 0, errors[0]?.stack); };
  const savedData = () => JSON.parse(w.localStorage.getItem(key));
  return { dom, w, $, click, fill, submit, savedData, errors, downloads };
}
const end = t => t.dom.window.close();

test('home and labeled navigation retain active state and protect an unfinished session', () => {
  const t = boot(fixture()), before = t.savedData();
  t.click('.nav-button[data-view="history"]');
  assert.equal(t.$('.nav-button[data-view="history"]').getAttribute('aria-current'), 'page');
  assert.equal(t.$('.nav-button[data-view="library"]').hasAttribute('aria-current'), false);
  t.click('.brand');
  assert.equal(t.$('.nav-button[data-view="library"]').getAttribute('aria-current'), 'page');
  assert.equal(t.w.document.activeElement, t.$('#main'));
  t.click('[data-action="open-quiz"]');
  assert.equal(t.$('.nav-button[data-view="library"]').getAttribute('aria-current'), 'page');
  t.click('[data-action="start"]');
  t.click('.brand');
  assert.match(t.$('#dialog-title').textContent, /Leave this session/);
  t.click('[data-action="close-dialog"]');
  assert.ok(t.$('.session-stage'));
  t.click('.nav-button[data-view="history"]');
  t.click('[data-action="leave-session"]');
  assert.equal(t.$('.nav-button[data-view="history"]').getAttribute('aria-current'), 'page');
  assert.deepEqual(t.savedData(), before);
  end(t);
});
function oldCapitalsState() {
  const t = boot(), saved = t.savedData();
  saved.quizzes = JSON.parse(JSON.stringify(t.w.QUIZ_SEED_PREVIOUS)).filter(q => q.id === 'legacy-set-4');
  end(t); return saved;
}

test('update available is visible in library and quiz; Later leaves data untouched', () => {
  const old = oldCapitalsState(), t = boot(old);
  assert.match(t.$('[data-action="base-update"]').textContent, /Update available/);
  t.click('[data-action="base-update"]');
  assert.match(t.$('#dialog-content').textContent, /same-state cities/);
  t.click('[data-action="close-dialog"]');
  assert.deepEqual(t.savedData(), old);
  t.click('[data-action="open-quiz"]');
  assert.ok(t.$('[data-action="base-update"]'));
  t.click('[data-action="base-update"]'); t.click('[data-action="install-base-update"]');
  assert.equal(t.$('[data-action="base-update"]'), null);
  assert.equal(t.savedData().quizzes.length, 1);
  assert.equal(t.savedData().quizzes[0].base.revision, 2);
  const saved = t.savedData(); end(t);
  const again = boot(saved); assert.equal(again.$('[data-action="base-update"]'), null); end(again);
});
test('edited old quizzes explain preservation and keep edits when updated', () => {
  const old = oldCapitalsState(); old.quizzes[0].cards[0].notes = 'My memory trick';
  const t = boot(old); t.click('[data-action="base-update"]');
  assert.match(t.$('#dialog-content').textContent, /personal copy/);
  t.click('[data-action="install-base-update"]');
  const personal = t.savedData().quizzes.find(q => !q.base);
  assert.equal(personal.cards[0].notes, 'My memory trick');
  assert.equal(t.$('#quiz-grid').children.length, 2); end(t);
});
test('failed base update retains the dialog and previous library for retry', () => {
  const old = oldCapitalsState(), t = boot(old); t.click('[data-action="base-update"]');
  t.w.Storage.prototype.setItem = () => { throw new Error('Quota'); };
  t.click('[data-action="install-base-update"]');
  assert.equal(t.$('#dialog').open, true);
  assert.match(t.$('.dialog-error').textContent, /Could not save/);
  assert.deepEqual(t.savedData(), old); end(t);
});
test('fresh library loads all default quizzes without network resources', () => {
  const t = boot();
  assert.equal(t.$('#quiz-grid').children.length, 6);
  assert.equal(t.savedData().quizzes.filter(q => q.id.startsWith('legacy-')).reduce((sum, q) => sum + q.cards.length, 0), 347);
  assert.equal(t.savedData().quizzes.reduce((sum, q) => sum + q.cards.length, 0), 458);
  assert.equal(t.savedData().quizzes.some(q => q.id === 'legacy-set-8'), false);
  assert.ok(t.$('svg.lucide-flask-conical'));
  assert.ok(t.$('svg.lucide-library'));
  assert.ok(t.$('svg.lucide-ghost'));
  assert.ok(t.$('svg.lucide-landmark'));
  t.fill('#quiz-search', 'German'); assert.equal(t.$('#quiz-grid').children.length, 1);
  assert.match(t.$('#quiz-grid').textContent, /German Numbers/);
  end(t);
});

test('existing libraries can review and add Horror Movies without changing saved collections', () => {
  const old = fixture(), t = boot(old);
  assert.equal(t.savedData().quizzes.length, 1);
  assert.ok(t.$('[aria-label="Add Horror Movies to library"]'));
  t.click('[data-action="new-base-quiz"][data-id="base-horror-movies"]');
  assert.match(t.$('#dialog-content').textContent, /31 questions/);
  t.click('[data-action="close-dialog"]');
  assert.deepEqual(t.savedData(), old);
  t.click('[data-action="new-base-quiz"][data-id="base-horror-movies"]'); t.click('[data-action="install-base-quiz"]');
  const saved = t.savedData();
  assert.deepEqual(saved.quizzes[0], old.quizzes[0]);
  assert.deepEqual(saved.settings, old.settings);
  assert.deepEqual(saved.history, old.history);
  assert.equal(saved.quizzes[1].id, 'base-horror-movies');
  assert.deepEqual(saved.quizzes[1].base, { id: 'base-horror-movies', revision: 1, modified: false });
  assert.equal(saved.quizzes[1].cards.length, 31);
  assert.equal(t.$('#main h1').textContent, 'Horror Movies');
  t.click('[data-mode="quiz"]'); t.click('[data-action="start"]');
  assert.equal(t.w.document.querySelectorAll('.answer-choice').length, 4);
  assert.ok(saved.quizzes[1].cards.some(c => c.question === t.$('.session-stage h1').textContent));
  end(t);
  const again = boot(saved);
  assert.equal(again.$('[data-action="new-base-quiz"][data-id="base-horror-movies"]'), null);
  assert.equal(again.savedData().quizzes.length, 2); end(again);
});

test('existing libraries can add and practice Everyday Science without changing personal content', () => {
  const old = fixture(), t = boot(old);
  const offer = '[data-action="new-base-quiz"][data-id="base-everyday-science"]';
  assert.ok(t.$(offer));
  t.click(offer);
  assert.match(t.$('#dialog-content').textContent, /40 questions/);
  t.click('[data-action="close-dialog"]');
  assert.deepEqual(t.savedData(), old);
  t.click(offer); t.click('[data-action="install-base-quiz"]');
  const saved = t.savedData();
  assert.deepEqual(saved.quizzes[0], old.quizzes[0]);
  assert.deepEqual(saved.settings, old.settings);
  assert.deepEqual(saved.history, old.history);
  assert.equal(saved.quizzes[1].cards.length, 40);
  assert.deepEqual(saved.quizzes[1].base, { id: 'base-everyday-science', revision: 1, modified: false });
  assert.equal(t.$('#main h1').textContent, 'Everyday Science');
  t.click('[data-action="start"]'); t.click('[data-action="reveal"]');
  assert.ok(t.$('.answer-notes').textContent.length > 0);
  end(t);
  const again = boot(saved);
  assert.equal(again.$(offer), null);
  assert.ok(again.$('.theme-lilac svg.lucide-flask-conical'));
  end(again);
});

test('existing libraries can add and practice Founding Fathers while preserving saved content', () => {
  const old = fixture(), t = boot(old);
  const offer = '[data-action="new-base-quiz"][data-id="base-founding-fathers"]';
  t.click(offer);
  assert.match(t.$('#dialog-content').textContent, /40 questions/);
  t.click('[data-action="close-dialog"]');
  assert.deepEqual(t.savedData(), old);
  t.click(offer); t.click('[data-action="install-base-quiz"]');
  const saved = t.savedData();
  assert.deepEqual(saved.quizzes[0], old.quizzes[0]);
  assert.deepEqual(saved.settings, old.settings);
  assert.deepEqual(saved.history, old.history);
  assert.equal(saved.quizzes[1].cards.length, 40);
  assert.deepEqual(saved.quizzes[1].base, { id: 'base-founding-fathers', revision: 1, modified: false });
  assert.equal(t.$('#main h1').textContent, 'Founding Fathers');
  t.click('[data-mode="quiz"]'); t.click('[data-action="start"]');
  assert.equal(t.w.document.querySelectorAll('.answer-choice').length, 4);
  end(t);
  const again = boot(saved);
  assert.equal(again.$(offer), null);
  assert.ok(again.$('.theme-peach svg.lucide-landmark'));
  end(again);
});

test('failed additions retain the original library and keep the add dialog for retry', () => {
  const old = fixture(), t = boot(old);
  t.click('[data-action="new-base-quiz"]');
  t.w.Storage.prototype.setItem = () => { throw new Error('Quota'); };
  t.click('[data-action="install-base-quiz"]');
  assert.equal(t.$('#dialog').open, true);
  assert.match(t.$('.dialog-error').textContent, /Could not save/);
  assert.deepEqual(t.savedData(), old); end(t);
});
test('the footer release version also versions static and dynamically rendered assets', () => {
  const t = boot();
  const version = t.$('meta[name="app-version"]').content;
  assert.match(version, /^v\d{8}-\d{4}$/);
  assert.equal(t.$('#app-version').textContent, version);
  for (const el of t.w.document.querySelectorAll('script[src], link[href], img[src]')) {
    const url = new URL(el.getAttribute('src') || el.getAttribute('href'), t.w.location.href);
    assert.equal(url.searchParams.get('v'), version, url.href);
  }
  t.click('[data-action="open-quiz"]');
  assert.equal(new URL(t.$('.practice-art img').src).searchParams.get('v'), version);
  end(t);
});
test('quiz and question create/edit survive reload, including custom wrong answers', () => {
  const t = boot(fixture());
  t.click('[data-action="new-quiz"]');
  t.fill('#quiz-form [name="name"]', 'My quiz'); t.submit('#quiz-form');
  t.click('[data-action="new-card"]');
  t.fill('[name="question"]', 'Question <script>literal</script>');
  t.fill('[name="answer"]', 'Answer'); t.fill('[name="wrong0"]', 'Other'); t.fill('[name="notes"]', 'A note');
  t.submit('#card-form');
  assert.equal(t.$('#card-list script'), null);
  t.click('[data-action="edit-card"]');
  assert.equal(t.$('[name="wrong0"]').value, 'Other');
  t.fill('[name="notes"]', 'Updated note'); t.submit('#card-form');
  const saved = t.savedData(); end(t);
  const next = boot(saved);
  const q = next.savedData().quizzes.find(q => q.name === 'My quiz');
  assert.equal(q.cards[0].notes, 'Updated note'); assert.deepEqual(q.cards[0].wrongAnswers, ['Other']);
  end(next);
});
test('canceling an edit leaves persisted data untouched', () => {
  const t = boot(fixture());
  t.click('[data-action="open-quiz"]'); t.click('[data-tab="questions"]');
  const before = t.w.localStorage.getItem(key);
  t.click('[data-action="edit-card"]'); t.fill('[name="wrong0"]', 'Changed'); t.click('[data-action="close-dialog"]');
  assert.equal(t.w.localStorage.getItem(key), before);
  end(t);
});
test('second chance and first attempt results persist as separate outcomes', () => {
  const t = boot(fixture());
  t.click('[data-action="open-quiz"]'); t.click('[data-mode="quiz"]'); t.click('[data-action="start"]');
  const expected = () => fixture().quizzes[0].cards.find(c => c.question === t.$('.session-stage h1').textContent).answer;
  const pick = correct => Array.from(t.w.document.querySelectorAll('.answer-choice')).find(b => (b.querySelector('span:nth-child(2)').textContent === expected()) === correct).click();
  pick(false); assert.match(t.$('.feedback').textContent, /another try/);
  pick(true); t.click('[data-action="next"]'); pick(true); t.click('[data-action="next"]');
  const result = t.savedData().history[0];
  assert.equal(result.first, 1); assert.equal(result.second, 1); assert.equal(result.wrong, 0); assert.equal(result.total, 2);
  t.click('[data-view="history"]'); assert.match(t.$('.history-score').textContent, /50%/);
  assert.equal(t.errors.length, 0); end(t);
});
test('reverse flashcards swap sides, reveal notes, and can move backward', () => {
  const state = fixture(); state.settings.reverse = true;
  const t = boot(state); t.click('[data-action="open-quiz"]'); t.click('[data-action="start"]');
  const first = t.$('.session-stage h1').textContent;
  assert.match(first, /answer$/); t.click('[data-action="reveal"]');
  assert.match(t.$('.flashcard-answer h2').textContent, /question$/);
  t.click('[data-action="next"]'); t.click('[data-action="previous"]');
  assert.equal(t.$('.session-stage h1').textContent, first); end(t);
});
test('spelling hints preserve typed text and hinted success is recorded as assisted', () => {
  const state = fixture(); state.settings.count = 1;
  const t = boot(state); t.click('[data-action="open-quiz"]'); t.click('[data-mode="spelling"]'); t.click('[data-action="start"]');
  t.fill('#spelling-answer', 'First'); t.click('[data-action="hint"]');
  assert.equal(t.$('#spelling-answer').value, 'First');
  const c = state.quizzes[0].cards.find(c => c.question === t.$('.session-stage h1').textContent);
  t.fill('#spelling-answer', c.answer.toUpperCase()); t.submit('#spelling-form'); t.click('[data-action="next"]');
  assert.equal(t.savedData().history[0].second, 1); end(t);
});
test('an empty quiz and a single text question do not start broken quiz sessions', () => {
  const state = fixture(); state.quizzes[0].cards = [];
  const t = boot(state); t.click('[data-action="open-quiz"]');
  assert.equal(t.$('[data-action="start"]').disabled, true); end(t);
  state.quizzes[0].cards = [{ id: 'only', question: 'Q', answer: 'A', notes: '', wrongAnswers: [] }];
  const one = boot(state); one.click('[data-action="open-quiz"]'); one.click('[data-mode="quiz"]'); one.click('[data-action="start"]');
  assert.match(one.$('#toast').textContent, /distinct answer/); assert.equal(one.$('.session-stage'), null); end(one);
});
async function upload(t, text, name = 'test.json') {
  const file = { name, size: Buffer.byteLength(text), text: async () => text };
  Object.defineProperty(t.$('#import-file'), 'files', { configurable: true, value: [file] });
  t.$('#import-file').dispatchEvent(new t.w.Event('change'));
  await new Promise(resolve => setImmediate(resolve));
}
test('import guide downloads a usable template and imports it without replacing saved content', async () => {
  const old = fixture(), t = boot(old);
  t.click('[data-action="import-guide"]');
  assert.equal(t.$('#dialog-title').textContent, 'Create an import file');
  const example = t.$('#import-json-example').textContent;
  assert.ok(Array.isArray(JSON.parse(example)));
  t.click('[data-action="download-import-example"]');
  const exported = await new Promise((resolve, reject) => {
    const reader = new t.w.FileReader();
    reader.onload = () => resolve(reader.result); reader.onerror = reject;
    reader.readAsText(t.downloads[0]);
  });
  assert.equal(exported, example);
  assert.deepEqual(t.savedData(), old);
  t.click('[data-action="guide-import"]');
  assert.equal(t.$('#dialog').open, false);
  await upload(t, exported, 'quiz-example.json');
  assert.match(t.$('#dialog-content').textContent, /1 quiz/);
  t.click('[data-action="confirm-import"]');
  const saved = t.savedData();
  assert.deepEqual(saved.quizzes[0], old.quizzes[0]);
  assert.deepEqual(saved.settings, old.settings);
  assert.deepEqual(saved.history, old.history);
  assert.equal(saved.quizzes[1].cards[0].answer, '4');
  assert.deepEqual(saved.quizzes[1].cards[0].wrongAnswers, ['3', '5', '6']);
  assert.ok(saved.quizzes[1].id);
  end(t);
});

test('AI prompt copies with its example and offers manual selection when clipboard access fails', async () => {
  const t = boot(fixture());
  t.click('[data-action="import-guide"]');
  let copied;
  Object.defineProperty(t.w.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } }, configurable: true });
  t.click('[data-action="copy-import-prompt"]');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(copied, t.$('#import-ai-prompt').value);
  assert.match(copied, /\[TOPIC\]/);
  assert.match(copied, /top-level array/);
  assert.match(copied, /exactly three plausible wrongAnswers/);
  assert.match(t.$('#copy-prompt-status').textContent, /Prompt copied/);
  t.w.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  t.click('[data-action="copy-import-prompt"]');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(t.$('#copy-prompt-status').textContent, /Select and copy/);
  assert.equal(t.$('#import-ai-prompt').selectionStart, 0);
  assert.equal(t.$('#import-ai-prompt').selectionEnd, copied.length);
  end(t);
});

test('JSON imports append fresh identifiers and preserve/remap history', async () => {
  const original = fixture(); original.history = [{ id: 'result', quizId: 'fixture', quizName: 'Test collection', mode: 'quiz', date: new Date().toISOString(), total: 2, first: 1, second: 1, wrong: 0 }];
  const t = boot(fixture()); await upload(t, JSON.stringify(original)); t.click('[data-action="confirm-import"]');
  const saved = t.savedData(); assert.equal(saved.quizzes.length, 2);
  assert.notEqual(saved.quizzes[1].id, saved.quizzes[0].id);
  assert.equal(saved.history[0].quizId, saved.quizzes[1].id);
  assert.notEqual(saved.quizzes[1].cards[0].id, 'a'); end(t);
});
test('importing a base quiz creates an independent personal copy', async () => {
  const source = boot(), backup = source.savedData(); end(source);
  const t = boot(fixture()); await upload(t, JSON.stringify(backup)); t.click('[data-action="confirm-import"]');
  assert.ok(t.savedData().quizzes.slice(1).every(q => q.base === undefined));
  const saved = t.savedData(); end(t);
  const reloaded = boot(saved); assert.equal(reloaded.$('[data-action="base-update"]'), null); end(reloaded);
});
test('legacy QYL imports handle XML escaping, notes, and custom distractors', async () => {
  const t = boot(fixture());
  await upload(t, '<words name="Old collection"><word><Word1>A &amp; B</Word1><Word2><![CDATA[<answer>]]></Word2><Note>Notes</Note><Word3>Wrong</Word3></word></words>', 'old.qyl');
  t.click('[data-action="confirm-import"]');
  const c = t.savedData().quizzes[1].cards[0]; assert.equal(c.question, 'A & B'); assert.equal(c.answer, '<answer>'); assert.deepEqual(c.wrongAnswers, ['Wrong']); end(t);
});
test('QYL can append into an existing quiz; invalid import leaves saved data intact', async () => {
  const t = boot(fixture()); await upload(t, '<words><word><Word1>Q</Word1><Word2>A</Word2></word></words>', 'old.qyl');
  t.fill('#import-target', 'fixture'); t.click('[data-action="confirm-import"]'); assert.equal(t.savedData().quizzes[0].cards.length, 3);
  const before = t.w.localStorage.getItem(key);
  await upload(t, '{"version":1,"quizzes":[{"name":"Bad","cards":[{"question":"Q"}]}]}');
  assert.match(t.$('#toast').textContent, /Import failed/); assert.equal(t.w.localStorage.getItem(key), before); end(t);
});
test('failed writes show an error inside the editor and retain edits for retry', () => {
  const t = boot(fixture()); t.click('[data-action="new-quiz"]'); t.fill('[name="name"]', 'Not yet saved');
  const before = t.w.localStorage.getItem(key);
  Object.getPrototypeOf(t.w.localStorage).setItem = () => { throw new Error('QuotaExceededError'); };
  t.submit('#quiz-form'); assert.equal(t.$('#dialog').open, true); assert.match(t.$('.dialog-error').textContent, /Could not save/);
  assert.equal(t.$('[name="name"]').value, 'Not yet saved'); assert.equal(t.w.localStorage.getItem(key), before); end(t);
});
test('malformed storage stays available for recovery export', () => {
  const t = boot('{broken'); assert.equal(t.w.localStorage.getItem(key), '{broken');
  t.click('[data-action="backup"]'); assert.equal(t.downloads.length, 1); assert.equal(t.$('#storage-label').textContent, 'Saving unavailable'); end(t);
});
