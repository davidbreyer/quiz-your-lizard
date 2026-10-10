(function (root) {
  'use strict';
  const VERSION = 1;
  const KEY = 'quiz-your-lizard:v1';
  const id = () => globalThis.crypto.randomUUID();
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = text => text.normalize('NFC').trim().toLocaleLowerCase();
  const shuffle = (items, random = Math.random) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  function validateQuizzes(quizzes) {
    if (!Array.isArray(quizzes) || quizzes.length > 1000) throw new Error('Expected a list of up to 1,000 quizzes.');
    return quizzes.map(q => {
      if (!q || typeof q.name !== 'string' || !q.name.trim() || q.name.length > 200) throw new Error('Every quiz needs a name (up to 200 characters).');
      if (!Array.isArray(q.cards) || q.cards.length > 20000) throw new Error('Every quiz needs a question list (up to 20,000 questions).');
      const quizId = typeof q.id === 'string' ? q.id : id();
      const base = q.base && q.base.id === quizId && Number.isInteger(q.base.revision) && q.base.revision > 0 ? { base: { id: quizId, revision: q.base.revision, modified: q.base.modified !== false } } : {};
      return { id: quizId, ...base, name: q.name.trim(), description: typeof q.description === 'string' ? q.description.slice(0, 1000) : '', cards: q.cards.map(c => {
        if (!c || typeof c.question !== 'string' || !c.question.trim() || typeof c.answer !== 'string' || !c.answer.trim()) throw new Error('Every question needs both a question and an answer.');
        if (c.question.length > 10000 || c.answer.length > 10000 || (c.notes || '').length > 20000) throw new Error('A question is too long to import.');
        if (c.wrongAnswers !== undefined && (!Array.isArray(c.wrongAnswers) || c.wrongAnswers.length > 3 || c.wrongAnswers.some(a => typeof a !== 'string' || a.length > 10000))) throw new Error('Wrong answers must be a list of up to three text answers.');
        return { id: typeof c.id === 'string' ? c.id : id(), question: c.question.trim(), answer: c.answer.trim(), notes: typeof c.notes === 'string' ? c.notes : '', wrongAnswers: (c.wrongAnswers || []).map(a => a.trim()).filter(Boolean) };
      }) };
    });
  }
  function validateState(data) {
    if (!data || data.version !== VERSION) throw new Error('This backup uses an unsupported format version.');
    const quizzes = validateQuizzes(data.quizzes);
    const ids = new Set();
    for (const q of quizzes) {
      if (ids.has(q.id)) throw new Error('Duplicate quiz identifiers in saved data.');
      ids.add(q.id);
      const cards = new Set();
      for (const c of q.cards) { if (cards.has(c.id)) throw new Error('Duplicate question identifiers.'); cards.add(c.id); }
    }
    const settings = data.settings || {};
    return { version: VERSION, quizzes, settings: { count: Number.isInteger(settings.count) ? Math.max(1, Math.min(200, settings.count)) : 20, reverse: settings.reverse === true, secondChance: settings.secondChance !== false }, history: Array.isArray(data.history) ? data.history.filter(h => h && typeof h.quizName === 'string' && ['quiz', 'spelling'].includes(h.mode) && Number.isFinite(h.total) && h.total > 0 && Number.isFinite(h.first) && h.first >= 0 && h.first <= h.total && Number.isFinite(h.second) && h.second >= 0 && Number.isFinite(h.wrong) && h.wrong >= 0 && h.first + h.second + h.wrong === h.total && !Number.isNaN(Date.parse(h.date))).slice(0, 100) : [] };
  }
  const quizContent = q => JSON.stringify({ name: q.name, description: q.description, cards: q.cards });
  const seedRevision = q => Number.isInteger(q.revision) && q.revision > 0 ? q.revision : 1;
  function baseQuiz(seed) {
    const q = validateQuizzes([seed])[0];
    return { ...q, base: { id: q.id, revision: seedRevision(seed), modified: false } };
  }
  function baseUpdate(q, seeds) {
    if (!q?.base) return null;
    const latest = seeds.find(s => s.id === q.base.id);
    if (!latest || seedRevision(latest) <= q.base.revision) return null;
    return { latest: baseQuiz(latest), notes: latest.updateNotes || 'An updated edition of this quiz is ready.', keepCopy: q.base.modified };
  }
  function applyBaseUpdate(data, quizId, seeds) {
    const index = data.quizzes.findIndex(q => q.id === quizId);
    const current = data.quizzes[index], update = baseUpdate(current, seeds);
    if (!update) throw new Error('This quiz is already up to date.');
    if (update.keepCopy) {
      const suffix = ' (personal copy)';
      const personal = { ...clone(current), id: id(), name: current.name.slice(0, 200 - suffix.length) + suffix };
      delete personal.base;
      data.quizzes.push(personal);
      data.history.forEach(h => { if (h.quizId === current.id) h.quizId = personal.id; });
    }
    data.quizzes[index] = update.latest;
  }
  function newBaseQuizzes(data, seeds) {
    const owned = new Set(data.quizzes.map(q => q.id));
    return seeds.filter(q => q.offerToExisting === true && !owned.has(q.id));
  }
  function addBaseQuiz(data, quizId, seeds) {
    const seed = newBaseQuizzes(data, seeds).find(q => q.id === quizId);
    if (!seed) throw new Error('This quiz is already in your library or is no longer available.');
    data.quizzes.push(baseQuiz(seed));
  }
  class Store {
    constructor(storage, seed, previousSeed = []) {
      this.storage = storage;
      this.raw = storage.getItem(KEY);
      this.data = this.raw === null ? { version: VERSION, quizzes: seed.map(baseQuiz), settings: { count: 20, reverse: false, secondChance: true }, history: [] } : validateState(JSON.parse(this.raw));
      // Recognize pre-versioning seed copies by their stable original IDs.
      // Compare with the original edition; never replace content during adoption.
      for (const q of this.data.quizzes) {
        const latest = seed.find(s => s.id === q.id);
        if (q.base || !latest) continue;
        const original = previousSeed.find(s => s.id === q.id) || (seedRevision(latest) === 1 ? latest : null);
        q.base = { id: q.id, revision: 1, modified: !original || quizContent(q) !== quizContent(validateQuizzes([original])[0]) };
      }
    }
    save(data) {
      if (this.storage.getItem(KEY) !== this.raw) throw new Error('Quizzes changed in another tab. Close this editor and reload before saving.');
      const checked = validateState(data);
      for (const q of checked.quizzes) {
        const before = this.data.quizzes.find(old => old.id === q.id);
        if (q.base && before?.base && q.base.revision === before.base.revision && (before.base.modified || quizContent(q) !== quizContent(before))) q.base.modified = true;
      }
      const raw = JSON.stringify(checked);
      try { this.storage.setItem(KEY, raw); }
      catch { throw new Error('Could not save on this device. Storage may be full or disabled. Export a backup before closing.'); }
      this.raw = raw;
      this.data = checked;
      return checked;
    }
  }
  function choicesFor(card, cards, reverse = false) {
    const answer = reverse ? card.question : card.answer;
    const seen = new Set([normalize(answer)]);
    const wrong = [];
    const add = text => { if (text && !seen.has(normalize(text)) && wrong.length < 3) { seen.add(normalize(text)); wrong.push(text); } };
    // Legacy custom distractors are answers, so reverse sessions use other questions.
    if (!reverse) card.wrongAnswers.forEach(add);
    shuffle(cards).forEach(c => { if (c.id !== card.id) add(reverse ? c.question : c.answer); });
    if (/^-?\d+$/.test(answer) && Number.isSafeInteger(Number(answer))) {
      shuffle([-3, -2, -1, 1, 2, 3]).forEach(offset => add(String(Number(answer) + offset)));
    }
    return shuffle([{ text: answer, correct: true }, ...wrong.map(text => ({ text, correct: false }))]);
  }
  function buildSession(quiz, mode, settings) {
    const items = shuffle(quiz.cards).map(card => ({ ...card, prompt: settings.reverse ? card.answer : card.question, expected: settings.reverse ? card.question : card.answer, choices: mode === 'quiz' ? choicesFor(card, quiz.cards, settings.reverse) : [] })).filter(c => mode !== 'quiz' || c.choices.length > 1);
    return { quizId: quiz.id, quizName: quiz.name, mode, settings: { ...settings }, items: mode === 'study' ? items : items.slice(0, settings.count), index: 0, outcomes: [], attempts: 0, disabled: [], feedback: '', resolved: false, revealed: false, hints: 0 };
  }
  function respond(session, correct, skip = false) {
    if (session.resolved) return 'resolved';
    if (!correct && !skip && session.mode === 'quiz' && session.settings.secondChance && session.attempts === 0) {
      session.attempts++;
      return 'retry';
    }
    if (!correct && !skip && session.mode === 'spelling') { session.attempts++; return 'retry'; }
    session.outcomes.push(correct ? (session.attempts || session.hints ? 'second' : 'first') : 'wrong');
    session.resolved = true;
    return correct ? 'correct' : 'wrong';
  }
  function tally(outcomes) {
    return { first: outcomes.filter(o => o === 'first').length, second: outcomes.filter(o => o === 'second').length, wrong: outcomes.filter(o => o === 'wrong').length };
  }
  const api = { VERSION, KEY, id, clone, normalize, shuffle, validateQuizzes, validateState, baseUpdate, applyBaseUpdate, newBaseQuizzes, addBaseQuiz, Store, choicesFor, buildSession, respond, tally };
  if (typeof module !== 'undefined') module.exports = api;
  root.QuizCore = api;
})(globalThis);
