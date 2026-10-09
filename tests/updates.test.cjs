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

test('all 196 world questions use three distinct curated wrong answers', () => {
  const world = seeds.find(q => q.id === 'legacy-set-9');
  assert.equal(world.revision, 2);
  assert.equal(world.cards.length, 196);
  assert.deepEqual(world.cards.map(c => c.id), previous.find(q => q.id === world.id).cards.map(c => c.id));
  for (const card of world.cards) {
    assert.equal(card.wrongAnswers.length, 3, card.question);
    const choices = C.choicesFor(card, world.cards);
    assert.equal(choices.length, 4, card.question);
    assert.equal(choices.filter(c => c.correct).length, 1, card.question);
    assert.equal(new Set(choices.map(c => C.normalize(c.text))).size, 4, card.question);
    assert.deepEqual(choices.filter(c => !c.correct).map(c => c.text).sort(), [...card.wrongAnswers].sort());
  }
});

test('old world libraries update independently and preserve personal content and history', () => {
  const oldWorld = C.clone(previous.find(q => q.id === 'legacy-set-9'));
  for (const edited of [false, true]) {
    const old = C.clone(oldWorld);
    if (edited) old.cards[0].notes = 'My world memory trick';
    const storage = storageFor([original(), old]);
    const raw = JSON.parse(storage.getItem());
    raw.history[0].quizId = old.id; raw.history[0].quizName = old.name;
    storage.setItem(C.KEY, JSON.stringify(raw));
    const store = new C.Store(storage, seeds, previous);
    assert.equal(C.baseUpdate(store.data.quizzes[1], seeds).keepCopy, edited);
    const next = C.clone(store.data);
    C.applyBaseUpdate(next, old.id, seeds); store.save(next);
    assert.equal(store.data.quizzes[0].base.revision, 1);
    assert.ok(C.baseUpdate(store.data.quizzes[0], seeds));
    assert.equal(store.data.quizzes[1].base.revision, 2);
    if (edited) {
      const personal = store.data.quizzes[2];
      assert.equal(personal.cards[0].notes, 'My world memory trick');
      assert.equal(store.data.history[0].quizId, personal.id);
    } else {
      assert.equal(store.data.quizzes.length, 2);
      assert.equal(store.data.history[0].quizId, old.id);
    }
    const reload = new C.Store(storage, seeds, previous);
    assert.equal(C.baseUpdate(reload.data.quizzes[1], seeds), null);
  }
});

test('world alternatives have country evidence and exclude alternative legitimate capitals', () => {
  const data = require('../data/world-capitals-update.json');
  const world = seeds.find(q => q.id === 'legacy-set-9');
  const cityStates = new Set(['MC', 'SG', 'VA']);
  for (const card of world.cards) {
    const proof = data.verification[card.id];
    assert.deepEqual(proof.places.map(p => p.name), card.wrongAnswers);
    assert.equal(new Set(proof.places.map(p => p.geonameId)).size, 3, card.question);
    if (!cityStates.has(proof.countryCode)) {
      assert.ok(proof.places.every(p => p.countryCode === proof.countryCode), card.question);
    }
  }
  const excluded = { 'legacy-card-1510': ['Cotonou'], 'legacy-card-1512': ['La Paz'],
    'legacy-card-1598': ['Putrajaya'], 'legacy-card-1617': ['The Hague'],
    'legacy-card-1653': ['Cape Town', 'Bloemfontein'], 'legacy-card-1655': ['Colombo'],
    'legacy-card-1658': ['Lobamba'], 'legacy-card-1685': ['Aden'] };
  for (const [id, alternatives] of Object.entries(excluded)) {
    assert.ok(alternatives.every(city => !world.cards.find(c => c.id === id).wrongAnswers.includes(city)));
  }
  for (const [id, capital] of Object.entries({ 'legacy-card-1519': 'Gitega',
    'legacy-card-1546': 'Ciudad de la Paz', 'legacy-card-1613': 'Naypyidaw',
    'legacy-card-1625': 'Ngerulmud', 'legacy-card-1655': 'Sri Jayewardenepura Kotte' })) {
    assert.equal(world.cards.find(c => c.id === id).answer, capital);
  }
});
