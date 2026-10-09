const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const card = (question, answer, wrongAnswers = []) => ({ id: C.id(), question, answer, notes: '', wrongAnswers });
const seed = () => [{ id: 'quiz', name: 'Sample', cards: [card('One', '1'), card('Two', '2'), card('Three', '3')] }];
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('storage survives a fresh store instance and seeds do not replace edits', () => {
  const storage = memoryStorage(), store = new C.Store(storage, seed());
  store.save({ ...store.data, quizzes: [] });
  assert.deepEqual(new C.Store(storage, seed()).data.quizzes, []);
});
test('quota failure keeps the previous saved and in-memory state', () => {
  const storage = memoryStorage(), store = new C.Store(storage, seed());
  store.save(store.data);
  const prior = store.raw;
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => store.save({ ...store.data, quizzes: [] }), /Could not save/);
  assert.equal(store.raw, prior);
  assert.equal(store.data.quizzes.length, 1);
  assert.equal(storage.getItem(C.KEY), prior);
});
test('another tab cannot silently overwrite a stale snapshot', () => {
  const storage = memoryStorage(), first = new C.Store(storage, seed());
  first.save(first.data);
  const second = new C.Store(storage, seed());
  first.save({ ...first.data, quizzes: [] });
  assert.throws(() => second.save(second.data), /another tab/);
});
test('malformed saved data is preserved rather than replaced by seeds', () => {
  const storage = memoryStorage(); storage.setItem(C.KEY, '{broken');
  assert.throws(() => new C.Store(storage, seed()));
  assert.equal(storage.getItem(C.KEY), '{broken');
});
test('choice generation deduplicates text and does not invent text distractors', () => {
  const current = card('A', 'Same', [' same ', 'Different', 'Different']);
  const choices = C.choicesFor(current, [current, card('B', 'Same'), card('C', 'Third')]);
  assert.equal(choices.filter(c => c.correct).length, 1);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(c => C.normalize(c.text))).size, choices.length);
  assert.equal(C.choicesFor(card('Only', 'Text'), []).length, 1);
});
test('numeric answers can generate distinct choices even in a one-card set', () => {
  const current = card('Value', '0');
  const choices = C.choicesFor(current, [current]);
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map(c => c.text)).size, 4);
});
test('reverse mode uses questions rather than forward custom distractors', () => {
  const current = card('First', 'Uno', ['Wrong']);
  const choices = C.choicesFor(current, [current, card('Second', 'Dos')], true);
  assert.deepEqual(new Set(choices.map(c => c.text)), new Set(['First', 'Second']));
});
test('second chance scores exactly once and resets for the next question', () => {
  const s = C.buildSession(seed()[0], 'quiz', { count: 3, secondChance: true, reverse: false });
  assert.equal(C.respond(s, false), 'retry');
  assert.equal(C.respond(s, true), 'correct');
  assert.equal(C.respond(s, true), 'resolved');
  assert.deepEqual(C.tally(s.outcomes), { first: 0, second: 1, wrong: 0 });
  s.resolved = false; s.attempts = 0;
  assert.equal(C.respond(s, true), 'correct');
  assert.deepEqual(C.tally(s.outcomes), { first: 1, second: 1, wrong: 0 });
});
test('a second wrong choice counts as a miss', () => {
  const s = C.buildSession(seed()[0], 'quiz', { count: 1, secondChance: true });
  C.respond(s, false); C.respond(s, false);
  assert.deepEqual(s.outcomes, ['wrong']);
});
test('spelling distinguishes unaided, hinted, retried, and revealed answers', () => {
  for (const setup of [s => {}, s => { s.hints = 1; }, s => C.respond(s, false)]) {
    const s = C.buildSession(seed()[0], 'spelling', { count: 1 });
    setup(s); C.respond(s, true);
    assert.equal(s.outcomes[0], s.hints || s.attempts ? 'second' : 'first');
  }
  const s = C.buildSession(seed()[0], 'spelling', { count: 1 });
  C.respond(s, false, true); assert.deepEqual(s.outcomes, ['wrong']);
  assert.equal(C.normalize(' Mu\u0308nchen '), C.normalize('M\u00fcnchen'));
});
test('imports reject partial or malformed question lists and unknown versions', () => {
  assert.throws(() => C.validateQuizzes([{ name: 'Bad', cards: [{ question: 'Missing answer' }] }]));
  assert.throws(() => C.validateQuizzes([{ name: 'Bad', cards: [card('Q', 'A', [42])] }]));
  assert.throws(() => C.validateState({ version: 9, quizzes: [] }));
  const q = seed()[0]; q.cards.push({ ...q.cards[0] });
  assert.throws(() => C.validateState({ version: 1, quizzes: [q] }), /Duplicate/);
});
