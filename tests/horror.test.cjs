const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../seed.js'), 'utf8'), context);
const seeds = JSON.parse(JSON.stringify(context.window.QUIZ_SEED));
const horror = seeds.find(q => q.id === 'base-horror-movies');

test('31 Halloween clues have unique cards, film answers, and four distinct playable choices', () => {
  assert.equal(horror.cards.length, 31);
  assert.equal(new Set(horror.cards.map(c => c.id)).size, 31);
  assert.equal(new Set(horror.cards.map(c => C.normalize(c.question))).size, 31);
  assert.equal(new Set(horror.cards.map(c => C.normalize(c.answer))).size, 31);
  assert.deepEqual(horror, require('../data/horror-movies.json'));
  C.validateQuizzes([horror]);
  for (const card of horror.cards) {
    const choices = C.choicesFor(card, horror.cards);
    assert.equal(card.wrongAnswers.length, 3, card.question);
    assert.equal(choices.length, 4, card.question);
    assert.equal(new Set(choices.map(c => C.normalize(c.text))).size, 4, card.question);
    assert.equal(choices.find(c => c.correct).text, card.answer);
    assert.deepEqual(choices.filter(c => !c.correct).map(c => c.text).sort(), [...card.wrongAnswers].sort());
    assert.match(horror.sources[card.id], /^https:\/\//);
  }
  const session = C.buildSession(horror, 'quiz', { count: 31, reverse: false, secondChance: true });
  assert.equal(session.items.length, 31);
});

test('new base quizzes require an explicit addition and keep stable IDs for future updates', () => {
  let raw = JSON.stringify({ version: 1, quizzes: [], settings: { count: 7 }, history: [] });
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const store = new C.Store(storage, seeds);
  assert.equal(store.data.quizzes.length, 0);
  assert.deepEqual(C.newBaseQuizzes(store.data, seeds).map(q => q.id), ['base-everyday-science', horror.id, 'base-founding-fathers']);
  const next = C.clone(store.data);
  C.addBaseQuiz(next, horror.id, seeds); store.save(next);
  assert.equal(store.data.quizzes[0].base.revision, 1);
  assert.deepEqual(C.newBaseQuizzes(store.data, seeds).map(q => q.id), ['base-everyday-science', 'base-founding-fathers']);
  assert.throws(() => C.addBaseQuiz(store.data, horror.id, seeds), /already in your library/);
  const future = C.clone(seeds); future.find(q => q.id === horror.id).revision = 2;
  assert.equal(C.baseUpdate(store.data.quizzes[0], future).keepCopy, false);
  const deleted = C.clone(store.data); deleted.quizzes = []; store.save(deleted);
  assert.equal(new C.Store(storage, seeds).data.quizzes.length, 0);
});
