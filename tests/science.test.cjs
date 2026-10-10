const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../seed.js'), 'utf8'), context);
const seeds = JSON.parse(JSON.stringify(context.window.QUIZ_SEED));
const science = seeds.find(q => q.id === 'base-everyday-science');

test('40 science questions have explanatory notes and exactly three distinct custom wrong answers', () => {
  assert.deepEqual(science, require('../data/everyday-science.json'));
  C.validateQuizzes([science]);
  assert.equal(science.cards.length, 40);
  assert.equal(new Set(science.cards.map(c => c.id)).size, 40);
  assert.equal(new Set(science.cards.map(c => C.normalize(c.question))).size, 40);
  for (const card of science.cards) {
    assert.equal(card.wrongAnswers.length, 3, card.question);
    assert.ok(card.notes.trim().length, card.question);
    assert.match(science.sources[card.id], /^https:\/\//);
    const choices = C.choicesFor(card, science.cards);
    assert.equal(choices.length, 4, card.question);
    assert.equal(new Set(choices.map(c => C.normalize(c.text))).size, 4, card.question);
    assert.equal(choices.filter(c => c.correct).length, 1, card.question);
    assert.equal(choices.find(c => c.correct).text, card.answer);
    assert.deepEqual(choices.filter(c => !c.correct).map(c => c.text).sort(), [...card.wrongAnswers].sort());
  }
  for (const mode of ['study', 'quiz', 'spelling']) {
    for (const reverse of [false, true]) {
      assert.equal(C.buildSession(science, mode, { count: 40, reverse, secondChance: true }).items.length, 40);
    }
  }
});

test('science replaces the default shell quiz while retirement preserves saved edits and history', () => {
  assert.equal(seeds.some(q => q.id === 'legacy-set-8'), false);
  const old = C.validateState({ version: 1, quizzes: [{
    id: 'legacy-set-8', name: 'My OSX commands', description: 'Personal notes',
    base: { id: 'legacy-set-8', revision: 1, modified: true },
    cards: [{ id: 'shell-personal', question: 'My command', answer: 'My answer', notes: 'Keep this', wrongAnswers: [] }]
  }], settings: { count: 7, reverse: true, secondChance: false }, history: [{
    id: 'shell-history', quizId: 'legacy-set-8', quizName: 'My OSX commands', mode: 'quiz',
    date: '2026-10-09T12:00:00Z', total: 1, first: 1, second: 0, wrong: 0
  }] });
  let raw = JSON.stringify(old);
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const store = new C.Store(storage, seeds);
  assert.deepEqual(store.data, old);
  const next = C.clone(store.data);
  C.addBaseQuiz(next, science.id, seeds); store.save(next);
  assert.deepEqual(store.data.quizzes[0], old.quizzes[0]);
  assert.deepEqual(store.data.settings, old.settings);
  assert.deepEqual(store.data.history, old.history);
  assert.equal(store.data.quizzes[1].base.revision, 1);
  assert.deepEqual(new C.Store(storage, seeds).data, store.data);
});
