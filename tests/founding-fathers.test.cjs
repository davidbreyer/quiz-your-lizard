const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../seed.js'), 'utf8'), context);
const seeds = JSON.parse(JSON.stringify(context.window.QUIZ_SEED));
const founders = seeds.find(q => q.id === 'base-founding-fathers');

test('40 founding-era clues have notes, source references, and exactly three distinct curated distractors', () => {
  assert.deepEqual(founders, require('../data/founding-fathers.json'));
  C.validateQuizzes([founders]);
  assert.equal(founders.cards.length, 40);
  assert.equal(new Set(founders.cards.map(c => c.id)).size, 40);
  assert.equal(new Set(founders.cards.map(c => C.normalize(c.question))).size, 40);
  for (const card of founders.cards) {
    assert.ok(card.notes.trim().length, card.question);
    assert.match(founders.sources[card.id], /^https:\/\//);
    assert.equal(card.wrongAnswers.length, 3, card.question);
    const choices = C.choicesFor(card, founders.cards);
    assert.equal(choices.length, 4, card.question);
    assert.equal(new Set(choices.map(c => C.normalize(c.text))).size, 4, card.question);
    assert.equal(choices.filter(c => c.correct).length, 1, card.question);
    assert.equal(choices.find(c => c.correct).text, card.answer);
    assert.deepEqual(choices.filter(c => !c.correct).map(c => c.text).sort(), [...card.wrongAnswers].sort());
  }
  for (const mode of ['study', 'quiz', 'spelling']) {
    for (const reverse of [false, true]) {
      assert.equal(C.buildSession(founders, mode, { count: 40, reverse, secondChance: true }).items.length, 40);
    }
  }
});
