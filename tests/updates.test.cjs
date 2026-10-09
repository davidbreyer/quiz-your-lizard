const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../core.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../seed.js'), 'utf8'), context);
const seeds = JSON.parse(JSON.stringify(context.window.QUIZ_SEED));
const previous = JSON.parse(JSON.stringify(context.window.QUIZ_SEED_PREVIOUS));
const capitalsId = 'legacy-set-4';
function storageFor(quizzes) {
  let raw = JSON.stringify({ version: 1, quizzes, settings: { count: 7, reverse: false, secondChance: true }, history: [
    { id: 'history', quizId: capitalsId, quizName: 'US State Capitals', mode: 'quiz', date: '2026-10-09T12:00:00Z', total: 1, first: 1, second: 0, wrong: 0 }
  ] });
  return { getItem: () => raw, setItem: (_, value) => { raw = value; } };
}
const original = () => C.clone(previous[0]);
test('old untouched seeds offer an opt-in update without changing saved content', () => {
  const storage = storageFor([original()]), raw = storage.getItem();
  const store = new C.Store(storage, seeds, previous), q = store.data.quizzes[0];
  assert.equal(q.cards[0].wrongAnswers.length, 0);
  assert.equal(storage.getItem(), raw);
  assert.equal(C.baseUpdate(q, seeds).keepCopy, false);
  const next = C.clone(store.data); C.applyBaseUpdate(next, capitalsId, seeds); store.save(next);
  assert.equal(store.data.quizzes.length, 1);
  assert.equal(store.data.quizzes[0].base.revision, 2);
  assert.equal(store.data.quizzes[0].base.modified, false);
  assert.equal(store.data.settings.count, 7);
  assert.equal(store.data.history[0].quizId, capitalsId);
  assert.equal(C.baseUpdate(new C.Store(storage, seeds, previous).data.quizzes[0], seeds), null);
});
test('pre-versioning personal edits and history survive as a separate copy', () => {
  const old = original(); old.name = 'My capitals'; old.cards[0].notes = 'My note'; old.cards.pop();
  const store = new C.Store(storageFor([old]), seeds, previous), next = C.clone(store.data);
  assert.equal(C.baseUpdate(next.quizzes[0], seeds).keepCopy, true);
  C.applyBaseUpdate(next, capitalsId, seeds); store.save(next);
  const personal = store.data.quizzes.find(q => q.id !== capitalsId);
  assert.equal(personal.name, 'My capitals (personal copy)');
  assert.equal(personal.cards[0].notes, 'My note');
  assert.equal(personal.cards.length, 49);
  assert.equal(personal.base, undefined);
  assert.equal(store.data.history[0].quizId, personal.id);
  assert.equal(store.data.quizzes[0].cards.length, 50);
});
test('new installs get latest seeds; later edits are tracked across reloads and revisions', () => {
  const storage = storageFor([]); storage.getItem = () => null;
  let raw = null; storage.getItem = () => raw; storage.setItem = (_, value) => { raw = value; };
  const store = new C.Store(storage, seeds, previous); store.save(store.data);
  assert.equal(store.data.quizzes[0].base.revision, 2);
  const next = C.clone(store.data); next.quizzes[0].cards[0].answer = 'My custom answer'; store.save(next);
  const reload = new C.Store(storage, seeds, previous);
  assert.equal(reload.data.quizzes[0].base.modified, true);
  const future = C.clone(seeds); future[0].revision = 3;
  assert.equal(C.baseUpdate(reload.data.quizzes[0], future).keepCopy, true);
});
test('deletion is respected and unrelated quiz copies do not receive base updates', () => {
  const personal = original(); personal.id = 'imported-copy';
  const store = new C.Store(storageFor([personal]), seeds, previous);
  assert.equal(store.data.quizzes.length, 1);
  assert.equal(C.baseUpdate(store.data.quizzes[0], seeds), null);
});
test('a maximum-length edited quiz name still allows a preserved copy to be saved', () => {
  const old = original(); old.name = 'X'.repeat(200);
  const store = new C.Store(storageFor([old]), seeds, previous), next = C.clone(store.data);
  C.applyBaseUpdate(next, capitalsId, seeds); store.save(next);
  assert.equal(store.data.quizzes[1].name.length, 200);
  assert.match(store.data.quizzes[1].name, /\(personal copy\)$/);
});
test('quota and concurrent-tab failures leave an update unapplied', () => {
  const storage = storageFor([original()]), store = new C.Store(storage, seeds, previous);
  const raw = storage.getItem(), next = C.clone(store.data); C.applyBaseUpdate(next, capitalsId, seeds);
  const save = storage.setItem; storage.setItem = () => { throw new Error('Quota'); };
  assert.throws(() => store.save(next), /Could not save/);
  assert.equal(storage.getItem(), raw); assert.equal(store.data.quizzes[0].base.revision, 1);
  storage.setItem = save; storage.setItem(C.KEY, raw + ' ');
  assert.throws(() => store.save(next), /another tab/);
  assert.equal(store.data.quizzes[0].base.revision, 1);
});
test('all 50 capitals have exactly three curated distinct distractors in forward quiz mode', () => {
  const capitals = seeds.find(q => q.id === capitalsId);
  assert.equal(capitals.cards.length, 50);
  for (const c of capitals.cards) {
    assert.equal(c.wrongAnswers.length, 3);
    const choices = C.choicesFor(c, capitals.cards);
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices.map(choice => C.normalize(choice.text))).size, 4);
    assert.deepEqual(choices.filter(choice => !choice.correct).map(choice => choice.text).sort(), [...c.wrongAnswers].sort());
  }
});
