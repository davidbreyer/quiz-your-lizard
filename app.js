(() => {
  'use strict';
  const C = QuizCore;
  const $ = selector => document.querySelector(selector);
  const appVersion = $('meta[name="app-version"]').content;
  const asset = path => `${path}?v=${encodeURIComponent(appVersion)}`;
  const main = $('#main');
  const dialog = $('#dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const button = (action, text, symbol, cls = 'button', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${text}</button>`;
  const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.7 } });
  let store, data, view = 'library', activeId = null, tab = 'practice', mode = 'study', session = null, search = '', cardSearch = '', imported = null;
  let readOnly = false, recovery = null, toastTimer;
  try {
    store = new C.Store(localStorage, window.QUIZ_SEED, window.QUIZ_SEED_PREVIOUS);
    data = store.data;
    if (store.raw === null) data = store.save(data);
  } catch (error) {
    readOnly = true;
    try { recovery = localStorage.getItem(C.KEY); } catch { /* Storage access itself may be unavailable. */ }
    data = { version: 1, quizzes: C.clone(window.QUIZ_SEED), settings: { count: 20, reverse: false, secondChance: true }, history: [] };
    window.setTimeout(() => toast(recovery ? 'Saved data could not be opened. Export the recovery file before changing browser data.' : error.message, true), 100);
  }
  function toast(message, persistent = false) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    if (dialog.open) {
      let alert = dialog.querySelector('.dialog-error');
      if (!alert) { alert = document.createElement('p'); alert.className = 'dialog-error'; alert.setAttribute('role', 'alert'); $('#dialog-content').append(alert); }
      alert.textContent = message;
    }
    if (!persistent) toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500);
  }
  function commit(change) {
    if (readOnly) { toast('Saving is unavailable. Your existing data has been preserved. Export a backup before closing.', true); return false; }
    const next = C.clone(data);
    try { change(next); data = store.save(next); updateStorage(); return true; }
    catch (error) { toast(error.message, true); return false; }
  }
  function updateStorage() {
    const bytes = JSON.stringify(data).length * 2;
    $('#storage-label').textContent = readOnly ? 'Saving unavailable' : 'Saved on this device';
    $('#storage-meter').style.width = `${Math.max(2, Math.min(100, bytes / (5 * 1024 * 1024) * 100))}%`;
    $('#storage-meter').title = `Approximately ${(bytes / 1024).toFixed(0)} KB of quiz data`;
    $('#library-count').textContent = data.quizzes.length;
  }
  const quiz = () => data.quizzes.find(q => q.id === activeId);
  function openDialog(title, content, wide = false) {
    dialog.classList.toggle('wide', wide);
    $('#dialog-content').innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2>${button('close-dialog', '', 'x', 'icon-button', 'aria-label="Close dialog" title="Close"')}</div>${content}`;
    if (!dialog.open) dialog.showModal();
    icons();
  }
  function navigate(target, id = null) {
    const go = () => {
      session = null; view = target; activeId = id; search = ''; cardSearch = ''; tab = 'practice'; render();
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    if (session && session.index < session.items.length) {
      openDialog('Leave this session?', `<p>Your answers in this session will not be saved.</p><div class="dialog-actions">${button('close-dialog', 'Keep practicing', null, 'button secondary')}${button('leave-session', 'Leave session', 'log-out')}</div>`);
      pendingNavigation = go;
    } else go();
  }
  let pendingNavigation = null;
  function render() {
    document.querySelectorAll('[data-view]').forEach(b => {
      const active = b.dataset.view === (view === 'quiz' ? 'library' : view);
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#breadcrumb').textContent = view === 'library' ? 'Your workspace / Quiz library' : view === 'history' ? 'Your workspace / Practice history' : `Quiz library / ${quiz()?.name || session?.quizName || 'Quiz'}`;
    if (view === 'library') renderLibrary();
    else if (view === 'history') renderHistory();
    else if (session) renderSession();
    else renderQuiz();
    updateStorage();
    icons();
  }
  const colors = ['sage', 'peach', 'lilac', 'sky'];
  const symbols = ['globe', 'languages', 'terminal', 'map'];
  const topics = {
    'legacy-set-4': { color: 'sage', symbol: 'map-pinned', label: 'Across America' },
    'legacy-set-5': { color: 'peach', symbol: 'languages', label: 'Say something new' },
    'legacy-set-8': { color: 'lilac', symbol: 'terminal', label: 'Command your craft' },
    'legacy-set-9': { color: 'sky', symbol: 'globe', label: 'Around the world' },
    'base-horror-movies': { color: 'horror', symbol: 'ghost', label: 'After dark' }
  };
  function updateNotice(q) {
    const update = !readOnly && C.baseUpdate(q, window.QUIZ_SEED);
    return update ? `<div class="quiz-update"><span>A new edition is ready</span>${button('base-update', 'Update available', 'refresh-cw', 'text-button', `data-id="${esc(q.id)}" aria-label="Update available for ${esc(q.name)}"`)}</div>` : '';
  }
  function showBaseUpdate(id) {
    const q = data.quizzes.find(item => item.id === id), update = C.baseUpdate(q, window.QUIZ_SEED);
    if (!update || readOnly) return;
    openDialog('Update ' + update.latest.name, `<p>${esc(update.notes)}</p><p class="update-preservation">${update.keepCopy ? `Your edited quiz and its practice history will be kept as <strong>${esc(q.name)} (personal copy)</strong>. The new edition will appear alongside it.` : 'Your practice history and settings will be kept. The new edition will replace this untouched base quiz.'}</p><div class="dialog-actions">${button('close-dialog', 'Later', null, 'button secondary')}${button('install-base-update', 'Update quiz', 'refresh-cw', 'button', `data-id="${esc(id)}"`)}</div>`);
  }
  function showNewBaseQuiz(id) {
    const seed = C.newBaseQuizzes(data, window.QUIZ_SEED).find(q => q.id === id);
    if (!seed || readOnly) return;
    openDialog('Add ' + seed.name, `<p>${esc(seed.description)}</p><p class="update-preservation">${seed.cards.length} questions with three custom wrong answers each. Your existing quizzes, settings, and practice history will be kept.</p><div class="dialog-actions">${button('close-dialog', 'Later', null, 'button secondary')}${button('install-base-quiz', 'Add to library', 'plus', 'button', `data-id="${esc(id)}"`)}</div>`);
  }
  function renderLibrary() {
    const total = data.quizzes.reduce((sum, q) => sum + q.cards.length, 0);
    main.innerHTML = `<div class="page-heading library-heading"><div><div class="eyebrow">YOUR DAILY DOSE OF DISCOVERY</div><h1>Your quiz library<span class="heading-dot">.</span></h1></div><div class="heading-actions">${button('import', 'Import', 'upload', 'button secondary')}${button('new-quiz', 'New quiz', 'plus')}</div></div>
      <section class="library-hero" aria-label="Welcome"><div class="hero-copy"><span class="hero-kicker">${icon('sparkles')} A LITTLE PRACTICE. A LOT OF POSSIBILITY.</span><h2>Feed your<br><em>curiosity.</em></h2><p><span class="hero-intro">Big discoveries start with small questions.<br></span>Pick a quiz and see where it takes you.</p><a class="hero-link" href="#quiz-grid">Find your next challenge ${icon('arrow-down')}</a></div><div class="hero-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="hero-spark spark-one">${icon('sparkles')}</span><span class="hero-spark spark-two">${icon('star')}</span><img src="${esc(asset('assets/lizard-mark.svg'))}" alt=""><span class="hero-note">Small steps. Big brain energy.</span></div></section>
      <section class="stats-band" aria-label="Library summary"><div><span class="stat-label">Quizzes in your library</span><strong>${data.quizzes.length}<small>collections</small></strong></div><div><span class="stat-label">A world of questions</span><strong>${total.toLocaleString()}<small>questions</small></strong></div><div><span class="stat-label">Practice makes progress</span><strong>${data.history.length}<small>completed sessions</small></strong></div><div class="stat-note">${icon('sparkles')}<span>Stay curious.<br>Keep growing.</span></div></section>
      ${readOnly ? '' : C.newBaseQuizzes(data, window.QUIZ_SEED).map(q => `<section class="quiz-update" aria-label="New quiz available"><div><strong>New quiz available: ${esc(q.name)}</strong><p>${esc(q.description)}</p></div>${button('new-base-quiz', 'Add to library', 'plus', 'button secondary', `data-id="${esc(q.id)}" aria-label="Add ${esc(q.name)} to library"`)}</section>`).join('')}
      <div class="section-toolbar"><h2>All quizzes <span class="count">${data.quizzes.length}</span></h2><label class="search">${icon('search')}<input id="quiz-search" placeholder="Search your quizzes" aria-label="Search your quizzes" value="${esc(search)}" type="search"></label></div><section class="quiz-grid" id="quiz-grid" aria-label="Quizzes"></section>`;
    renderGrid();
  }
  function renderGrid() {
    const filtered = data.quizzes.filter(q => C.normalize(q.name).includes(C.normalize(search)));
    $('#quiz-grid').innerHTML = filtered.map(q => {
      const index = data.quizzes.indexOf(q);
      const last = data.history.find(h => h.quizId === q.id);
      const topic = topics[q.base?.id || q.id] || { color: colors[index % 4], symbol: symbols[index % 4], label: 'Made for a curious mind' };
      return `<article class="quiz-card theme-${topic.color}"><div class="card-top"><span class="topic-icon ${topic.color}">${icon(topic.symbol)}</span><span class="card-kicker">${topic.label}</span>${button('quiz-menu', '', 'ellipsis', 'icon-button', `data-id="${esc(q.id)}" aria-label="Options for ${esc(q.name)}" title="Quiz options"`)}</div><div class="card-body"><h3><button class="title-button" data-action="open-quiz" data-id="${esc(q.id)}">${esc(q.name)}</button></h3><p class="card-description">${esc(q.description || 'Your next learning adventure')}</p>${updateNotice(q)}<div class="card-meta">${icon('layers')}<span>${q.cards.length} questions</span><span class="meta-dot">&middot;</span><span>${last ? 'Practiced ' + relativeDate(last.date) : 'Ready when you are'}</span></div><div class="card-bottom"><span class="badge">${q.cards.length ? 'Ready to practice' : 'Add your first question'}</span>${button('open-quiz', 'Open quiz', 'arrow-up-right', 'text-button', `data-id="${esc(q.id)}"`)}</div></div></article>`;
    }).join('') || `<div class="empty-state">${icon('search')}<h3>${search ? 'No quizzes found' : 'Your library starts here'}</h3><p>${search ? 'Try a different search.' : 'Create a quiz or import a collection.'}</p>${!search ? button('new-quiz', 'New quiz', 'plus') : ''}</div>`;
    icons();
  }
  function relativeDate(date) {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }
  function renderQuiz() {
    const q = quiz();
    if (!q) { view = 'library'; render(); return; }
    main.innerHTML = `${button('back', 'Quiz library', 'arrow-left', 'text-button back-button')}<div class="page-heading detail-heading"><div><div class="eyebrow">${q.cards.length} QUESTIONS</div><h1>${esc(q.name)}</h1><p>${esc(q.description || 'One question at a time.')}</p></div><div class="heading-actions">${button('export-quiz', '', 'download', 'icon-button bordered', 'aria-label="Export quiz" title="Export quiz"')}${button('edit-quiz', '', 'pencil', 'icon-button bordered', 'aria-label="Edit quiz details" title="Edit quiz details"')}${button('new-card', 'Add question', 'plus')}</div></div>${updateNotice(q)}<div class="tabs" role="tablist" aria-label="Quiz views"><button role="tab" aria-selected="${tab === 'practice'}" data-action="tab" data-tab="practice" class="${tab === 'practice' ? 'selected' : ''}">${icon('book-open')}Practice</button><button role="tab" aria-selected="${tab === 'questions'}" data-action="tab" data-tab="questions" class="${tab === 'questions' ? 'selected' : ''}">${icon('list')}Questions <span class="count">${q.cards.length}</span></button></div><section id="quiz-content"></section>`;
    if (tab === 'questions') {
      $('#quiz-content').innerHTML = `<div class="section-toolbar"><h2>Questions & answers</h2><label class="search">${icon('search')}<input id="card-search" type="search" placeholder="Search questions" aria-label="Search questions" value="${esc(cardSearch)}"></label></div><div id="card-list"></div>`;
      renderCards();
    } else {
      const s = data.settings;
      $('#quiz-content').innerHTML = `<div class="practice-layout"><div class="practice-main"><div class="eyebrow">FIND YOUR RHYTHM</div><h2>A little practice goes a long way.</h2><div class="mode-selector" role="group" aria-label="Practice mode">${[['study', 'book-open', 'Study'], ['quiz', 'circle-check', 'Pop quiz'], ['spelling', 'spell-check', 'Spelling']].map(([key, symbol, label]) => `<button data-action="mode" data-mode="${key}" class="${mode === key ? 'selected' : ''}" aria-pressed="${mode === key}">${icon(symbol)}${label}</button>`).join('')}</div><div class="practice-art"><img src="${esc(asset('assets/lizard-mark.svg'))}" alt="Quiz Your Lizard mascot"><div><span class="practice-kicker">${mode === 'study' ? 'A MOMENT TO REMEMBER' : mode === 'quiz' ? 'PUT IT TO THE TEST' : 'MAKE EVERY LETTER COUNT'}</span><h3>${mode === 'study' ? 'Let your curiosity lead.' : mode === 'quiz' ? 'Ready for a challenge?' : 'The answer is in you.'}</h3></div></div>${button('start', mode === 'study' ? 'Start studying' : mode === 'quiz' ? 'Start quiz' : 'Start spelling', 'arrow-right', 'button start-button', q.cards.length ? '' : 'disabled')}</div><aside class="session-options"><h3>Session options</h3><label class="option"><span>Questions per session</span><input id="question-count" type="number" min="1" max="200" value="${s.count}" aria-label="Questions per session"></label><label class="toggle-row"><span>Reverse questions & answers</span><input id="reverse" type="checkbox" role="switch" ${s.reverse ? 'checked' : ''}></label><label class="toggle-row"><span>Second chance in pop quiz</span><input id="second-chance" type="checkbox" role="switch" ${s.secondChance ? 'checked' : ''}></label><div class="options-meta">${icon('layers')}<span>${q.cards.length} questions in this collection</span></div></aside></div>`;
    }
  }
  function renderCards() {
    const cards = quiz().cards.filter(c => C.normalize(c.question + ' ' + c.answer + ' ' + c.notes).includes(C.normalize(cardSearch)));
    $('#card-list').innerHTML = cards.length ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th>Answer</th><th class="table-actions">Actions</th></tr></thead><tbody>${cards.map(c => `<tr><td><strong>${esc(c.question)}</strong>${c.notes ? `<span class="table-note">${esc(c.notes)}</span>` : ''}</td><td>${esc(c.answer)}${c.wrongAnswers.length ? `<span class="table-note">${c.wrongAnswers.length} custom choices</span>` : ''}</td><td class="table-actions">${button('edit-card', '', 'pencil', 'icon-button', `data-id="${esc(c.id)}" aria-label="Edit question" title="Edit question"`)}${button('delete-card', '', 'trash-2', 'icon-button danger-icon', `data-id="${esc(c.id)}" aria-label="Delete question" title="Delete question"`)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('notebook-pen')}<h3>${cardSearch ? 'No matching questions' : 'A fresh page'}</h3><p>${cardSearch ? 'Try a different search.' : 'Add a question to start practicing.'}</p>${cardSearch ? '' : button('new-card', 'Add question', 'plus')}</div>`;
    icons();
  }
  function saveSettings() {
    const count = Number($('#question-count').value);
    if (!Number.isInteger(count) || count < 1 || count > 200) { toast('Choose between 1 and 200 questions.'); $('#question-count').focus(); return false; }
    const settings = { count, reverse: $('#reverse').checked, secondChance: $('#second-chance').checked };
    return commit(next => { next.settings = settings; });
  }
  function startSession() {
    if (!saveSettings()) return;
    session = C.buildSession(quiz(), mode, data.settings);
    if (!session.items.length) { session = null; toast(mode === 'quiz' ? 'Add another distinct answer or a custom wrong answer to enable pop quiz.' : 'Add a question first.'); return; }
    render();
    window.scrollTo(0, 0);
  }
  function renderSession() {
    if (session.index >= session.items.length) { renderResults(); return; }
    const s = session, c = s.items[s.index];
    const label = s.mode === 'study' ? 'Study' : s.mode === 'quiz' ? 'Pop quiz' : 'Spelling';
    main.innerHTML = `<div class="session-top">${button('end', 'End session', 'arrow-left', 'text-button')}<span>${label}${s.settings.reverse ? ' / Reversed' : ''}</span><span>${s.index + 1} / ${s.items.length}</span></div><div class="session-progress"><span style="width:${s.index / s.items.length * 100}%"></span></div><section class="session-stage"><div class="eyebrow">${esc(s.quizName)}</div><h1>${esc(c.prompt)}</h1><div id="answer-area"></div></section>`;
    let area;
    if (s.mode === 'study') {
      area = `<div class="flashcard-answer">${s.revealed ? `<span class="eyebrow">ANSWER</span><h2>${esc(c.expected)}</h2>${c.notes ? `<p class="answer-notes">${esc(c.notes)}</p>` : ''}` : `<div class="unrevealed">${icon('book-open')}</div>`}</div><div class="session-buttons">${button('previous', '', 'arrow-left', 'icon-button bordered', `aria-label="Previous question" title="Previous question" ${s.index === 0 ? 'disabled' : ''}`)}${s.revealed ? button('next', s.index === s.items.length - 1 ? 'Finish studying' : 'Next question', 'arrow-right') : button('reveal', 'Show answer', 'eye')}</div>`;
    } else if (s.mode === 'quiz') {
      area = `<div class="answer-choices">${c.choices.map((choice, i) => `<button class="answer-choice ${s.resolved && choice.correct ? 'correct' : ''} ${s.disabled.includes(i) ? 'incorrect' : ''}" data-action="answer" data-index="${i}" ${s.resolved || s.disabled.includes(i) ? 'disabled' : ''}><span class="choice-letter">${String.fromCharCode(65 + i)}</span><span>${esc(choice.text)}</span>${s.resolved && choice.correct ? icon('check') : ''}</button>`).join('')}</div>${feedback(s)}${s.resolved ? button('next', s.index === s.items.length - 1 ? 'See results' : 'Next question', 'arrow-right') : ''}`;
    } else {
      area = `<form id="spelling-form"><label for="spelling-answer" class="sr-only">Your answer</label><input id="spelling-answer" class="spelling-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Your answer" ${s.resolved ? 'disabled' : ''}><div class="spelling-tools">${button('hint', 'Hint', 'lightbulb', 'text-button', s.resolved ? 'disabled' : '')}${button('skip', 'Reveal answer', 'eye', 'text-button', s.resolved ? 'disabled' : '')}</div><div class="hint-line">${s.hints ? `<span>Hint</span> ${esc(Array.from(c.expected).slice(0, s.hints).join(''))}` : ''}</div>${feedback(s)}${s.resolved ? button('next', s.index === s.items.length - 1 ? 'See results' : 'Next question', 'arrow-right') : '<button class="button" type="submit">Check answer</button>'}</form>`;
    }
    $('#answer-area').innerHTML = area;
    icons();
    if (s.mode === 'spelling' && !s.resolved) $('#spelling-answer').focus();
    if (s.resolved) main.querySelector('[data-action="next"]')?.focus();
  }
  function feedback(s) {
    return `<div class="feedback ${s.feedback === 'correct' ? 'success' : ''}" role="status">${s.feedback === 'correct' ? 'Correct! Nicely done.' : s.feedback === 'retry' ? 'Not quite. Give it another try.' : s.feedback === 'wrong' ? `The answer was ${esc(s.items[s.index].expected)}.` : ''}</div>`;
  }
  function nextQuestion() {
    if (session.mode !== 'study' && !session.resolved) return;
    session.index++;
    Object.assign(session, { attempts: 0, disabled: [], feedback: '', resolved: false, revealed: false, hints: 0 });
    if (session.index === session.items.length && session.mode !== 'study') {
      const entry = { id: C.id(), quizId: session.quizId, quizName: session.quizName, mode: session.mode, date: new Date().toISOString(), total: session.outcomes.length, ...C.tally(session.outcomes) };
      session.saved = commit(next => { next.history.unshift(entry); next.history = next.history.slice(0, 100); });
    }
    render();
  }
  function renderResults() {
    const s = session, study = s.mode === 'study', counts = C.tally(s.outcomes);
    main.innerHTML = `<section class="results"><span class="result-icon">${icon(study ? 'book-open-check' : 'party-popper')}</span><div class="eyebrow">${esc(s.quizName)}</div><h1>${study ? 'A little wiser already.' : 'Good practice. Great progress.'}</h1><p>${study ? `You studied ${s.items.length} questions.` : `${counts.first} of ${s.items.length} correct on the first attempt.`}</p>${study ? '' : `<div class="results-counts"><div><strong>${counts.first}</strong><span>First attempt</span></div><div><strong>${counts.second}</strong><span>${s.mode === 'quiz' ? 'Second attempt' : 'With help'}</span></div><div><strong>${counts.wrong}</strong><span>To revisit</span></div></div>`}<div class="session-buttons">${button('end', 'Back to quiz', 'arrow-left', 'button secondary')}${button('retry', 'Practice again', 'rotate-ccw')}${counts.wrong ? button('review-missed', 'Study missed questions', 'book-open', 'button secondary') : ''}</div>${!study && !s.saved ? '<p class="save-warning">This result could not be saved. Export your results below.</p>' + button('export-result', 'Export result', 'download', 'text-button') : ''}${!study ? `<details class="result-review"><summary>Review answers</summary>${s.items.map((c, i) => `<div><span class="result-mark ${s.outcomes[i] === 'wrong' ? 'missed' : ''}">${icon(s.outcomes[i] === 'wrong' ? 'x' : 'check')}</span><div><strong>${esc(c.prompt)}</strong><p>${esc(c.expected)}</p></div></div>`).join('')}</details>` : ''}</section>`;
  }
  function renderHistory() {
    main.innerHTML = `<div class="page-heading"><div><div class="eyebrow">ONE SESSION AT A TIME</div><h1>Your progress<span class="heading-dot">.</span></h1><p>Every question is another step forward.</p></div>${button('backup', 'Export backup', 'download', 'button secondary')}</div>${data.history.length ? `<div class="history-list">${data.history.map(h => `<article class="history-row"><span class="topic-icon ${h.mode === 'quiz' ? 'sage' : 'peach'}">${icon(h.mode === 'quiz' ? 'circle-check' : 'spell-check')}</span><div class="history-name"><h3>${esc(h.quizName)}</h3><p>${h.mode === 'quiz' ? 'Pop quiz' : 'Spelling'} &middot; ${new Date(h.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div><div class="history-score"><strong>${Math.round(h.first / h.total * 100)}%</strong><span>first attempt</span></div><span class="history-detail">${h.first} first &middot; ${h.second} assisted &middot; ${h.wrong} missed</span>${data.quizzes.some(q => q.id === h.quizId) ? button('open-quiz', '', 'arrow-up-right', 'icon-button', `data-id="${esc(h.quizId)}" aria-label="Open ${esc(h.quizName)}" title="Open quiz"`) : ''}</article>`).join('')}</div>` : `<div class="empty-state">${icon('chart-no-axes-combined')}<h2>A new chapter</h2><p>Completed pop quiz and spelling sessions will appear here.</p>${button('back', 'Explore quizzes', 'arrow-right')}</div>`}`;
  }
  function editQuiz(id = null) {
    const q = data.quizzes.find(item => item.id === id);
    openDialog(q ? 'Edit quiz' : 'A new quiz', `<form id="quiz-form" data-id="${esc(id || '')}"><label>Quiz name<input name="name" required maxlength="200" value="${esc(q?.name || '')}" placeholder="e.g. French vocabulary"></label><label>Description<textarea name="description" maxlength="1000" rows="3" placeholder="A few words about this collection">${esc(q?.description || '')}</textarea></label><div class="dialog-actions">${button('close-dialog', 'Cancel', null, 'button secondary')}<button class="button" type="submit">${q ? 'Save changes' : 'Create quiz'}</button></div></form>`);
  }
  function editCard(id = null) {
    const c = quiz().cards.find(item => item.id === id);
    openDialog(c ? 'Edit question' : 'Add a question', `<form id="card-form" data-id="${esc(id || '')}"><div class="form-pair"><label>Question<textarea name="question" required maxlength="10000" rows="3" placeholder="What would you like to remember?">${esc(c?.question || '')}</textarea></label><label>Answer<textarea name="answer" required maxlength="10000" rows="3" placeholder="The answer">${esc(c?.answer || '')}</textarea></label></div><label>Notes <span class="optional">Optional</span><textarea name="notes" maxlength="20000" rows="2">${esc(c?.notes || '')}</textarea></label><fieldset><legend>Wrong answers <span class="optional">Optional</span></legend>${[0, 1, 2].map(i => `<input name="wrong${i}" aria-label="Wrong answer ${i + 1}" maxlength="10000" value="${esc(c?.wrongAnswers[i] || '')}" placeholder="Alternative answer ${i + 1}">`).join('')}</fieldset><div class="dialog-actions">${button('close-dialog', 'Cancel', null, 'button secondary')}<button class="button" type="submit">Save question</button></div></form>`, true);
  }
  function download(name, content, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filename = name => name.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 80) || 'quiz';
  function exportQyl(q) {
    const doc = document.implementation.createDocument(null, 'words');
    doc.documentElement.setAttribute('name', q.name);
    q.cards.forEach(c => {
      const word = doc.createElement('word');
      Object.entries({ Word1: c.question, Word2: c.answer, Note: c.notes, ...Object.fromEntries(c.wrongAnswers.map((a, i) => [`Word${i + 3}`, a])) }).forEach(([tag, value]) => { const node = doc.createElement(tag); node.textContent = value; word.append(node); });
      doc.documentElement.append(word);
    });
    download(filename(q.name) + '.qyl', new XMLSerializer().serializeToString(doc), 'application/xml');
  }
  function exportMenu(id = activeId) {
    const q = data.quizzes.find(item => item.id === id);
    if (!q) return;
    openDialog('Export ' + q.name, `<div class="export-options">${button('export-json', 'Quiz file (.json)', 'file-json', 'button secondary', `data-id="${esc(q.id)}"`)}${button('export-qyl', 'Legacy file (.qyl)', 'file-code', 'button secondary', `data-id="${esc(q.id)}"`)}</div>`);
  }
  async function readImport(file) {
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('This file is too large. Import a quiz file smaller than 4 MB.');
      const raw = (await file.text()).trim();
      let content, history = [];
      if (raw.startsWith('{') || raw.startsWith('[')) {
        const value = JSON.parse(raw);
        if (Array.isArray(value)) content = value;
        else if (value.version === C.VERSION && Array.isArray(value.quizzes)) {
          const checked = C.validateState(value); content = checked.quizzes; history = checked.history;
        } else throw new Error('This is not a supported Quiz Your Lizard file.');
      } else {
        let xml = raw;
        if (!xml.startsWith('<')) xml = new TextDecoder().decode(Uint8Array.from(atob(xml), c => c.charCodeAt(0)));
        if (/<!DOCTYPE/i.test(xml)) throw new Error('Quiz XML must not contain a document type declaration.');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'words') throw new Error('This .qyl file is not valid quiz XML.');
        const cards = Array.from(doc.documentElement.children).map(word => {
          if (word.tagName !== 'word') throw new Error('Unexpected entry in quiz XML.');
          const get = name => Array.from(word.children).find(n => n.tagName === name)?.textContent || '';
          return { question: get('Word1'), answer: get('Word2'), notes: get('Note'), wrongAnswers: ['Word3', 'Word4', 'Word5'].map(get).filter(Boolean) };
        });
        content = [{ name: doc.documentElement.getAttribute('name') || file.name.replace(/\.[^.]+$/, ''), cards }];
      }
      const quizzes = C.validateQuizzes(content);
      if (!quizzes.length) throw new Error('This file contains no quizzes.');
      imported = { quizzes, history };
      openDialog('Import quizzes', `<p>${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'} &middot; ${quizzes.reduce((sum, q) => sum + q.cards.length, 0)} questions${history.length ? ` &middot; ${history.length} practice results` : ''}</p><ul class="import-list">${quizzes.map(q => `<li><strong>${esc(q.name)}</strong><span>${q.cards.length} questions</span></li>`).join('')}</ul><label class="import-target">Destination<select id="import-target"><option value="new">New collections</option>${quizzes.length === 1 ? data.quizzes.map(q => `<option value="${esc(q.id)}">Add questions to ${esc(q.name)}</option>`).join('') : ''}</select></label><div class="dialog-actions">${button('close-dialog', 'Cancel', null, 'button secondary')}${button('confirm-import', 'Import', 'upload')}</div>`);
    } catch (error) { toast('Import failed: ' + error.message, true); }
  }
  function confirmImport() {
    const target = $('#import-target').value;
    const map = new Map();
    const fresh = imported.quizzes.map(q => { const newId = C.id(); map.set(q.id, newId); const { base, ...personal } = q; return { ...personal, id: newId, cards: q.cards.map(c => ({ ...c, id: C.id() })) }; });
    if (commit(next => {
      if (target === 'new') { next.quizzes.push(...fresh); next.history = [...imported.history.map(h => ({ ...h, id: C.id(), quizId: map.get(h.quizId) || null })), ...next.history].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 100); }
      else { const destination = next.quizzes.find(q => q.id === target); if (!destination) throw new Error('The destination quiz no longer exists.'); destination.cards.push(...fresh[0].cards); }
    })) { dialog.close(); view = 'library'; session = null; render(); toast('Import complete.'); imported = null; }
  }
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]');
    if (nav) { event.preventDefault(); navigate(nav.dataset.view); return; }
    const b = event.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const action = b.dataset.action, id = b.dataset.id;
    if (action === 'close-dialog') dialog.close();
    else if (action === 'base-update') showBaseUpdate(id);
    else if (action === 'install-base-update') {
      if (commit(next => C.applyBaseUpdate(next, id, window.QUIZ_SEED))) { dialog.close(); render(); toast('New quiz edition installed.'); }
    }
    else if (action === 'new-base-quiz') showNewBaseQuiz(id);
    else if (action === 'install-base-quiz') {
      if (commit(next => C.addBaseQuiz(next, id, window.QUIZ_SEED))) { dialog.close(); mode = 'study'; navigate('quiz', id); toast('Quiz added to your library.'); }
    }
    else if (action === 'leave-session') { dialog.close(); pendingNavigation?.(); pendingNavigation = null; }
    else if (action === 'back') navigate('library');
    else if (action === 'open-quiz') { mode = 'study'; navigate('quiz', id); }
    else if (action === 'new-quiz') editQuiz();
    else if (action === 'edit-quiz') editQuiz(activeId);
    else if (action === 'new-card') editCard();
    else if (action === 'edit-card') editCard(id);
    else if (action === 'tab') { tab = b.dataset.tab; render(); }
    else if (action === 'mode') { if (saveSettings()) { mode = b.dataset.mode; render(); } }
    else if (action === 'start') startSession();
    else if (action === 'end') navigate('quiz', activeId);
    else if (action === 'reveal') { session.revealed = true; render(); }
    else if (action === 'previous') { session.index--; session.revealed = false; render(); }
    else if (action === 'next') nextQuestion();
    else if (action === 'answer') {
      const index = Number(b.dataset.index), correct = session.items[session.index].choices[index].correct;
      if (session.resolved || session.disabled.includes(index)) return;
      if (!correct) session.disabled.push(index);
      session.feedback = C.respond(session, correct); render();
    }
    else if (action === 'hint') { session.hints = Math.min(session.hints + 1, Array.from(session.items[session.index].expected).length); const typed = $('#spelling-answer').value; render(); $('#spelling-answer').value = typed; }
    else if (action === 'skip') { session.feedback = C.respond(session, false, true); render(); }
    else if (action === 'retry') { session = C.buildSession(quiz(), session.mode, session.settings); render(); }
    else if (action === 'review-missed') { const s = session; const missed = { ...quiz(), cards: s.items.filter((c, i) => s.outcomes[i] === 'wrong') }; session = C.buildSession(missed, 'study', s.settings); render(); }
    else if (action === 'export-result') download('quiz-lizard-result.json', JSON.stringify({ quizName: session.quizName, mode: session.mode, ...C.tally(session.outcomes), total: session.outcomes.length }, null, 2));
    else if (action === 'quiz-menu') {
      const q = data.quizzes.find(item => item.id === id);
      openDialog(q.name, `<div class="export-options">${button('rename-quiz', 'Edit details', 'pencil', 'button secondary', `data-id="${esc(id)}"`)}${button('export-quiz', 'Export quiz', 'download', 'button secondary', `data-id="${esc(id)}"`)}${button('delete-quiz', 'Delete quiz', 'trash-2', 'button danger-outline', `data-id="${esc(id)}"`)}</div>`);
    }
    else if (action === 'rename-quiz') editQuiz(id);
    else if (action === 'delete-card' || action === 'delete-quiz') {
      const q = action === 'delete-quiz' ? data.quizzes.find(item => item.id === id) : quiz();
      openDialog(action === 'delete-quiz' ? 'Delete this quiz?' : 'Delete this question?', `<p>${action === 'delete-quiz' ? `${esc(q.name)} and its ${q.cards.length} questions will be removed.` : 'This question and its custom choices will be removed.'}</p><div class="dialog-actions">${button('close-dialog', 'Cancel', null, 'button secondary')}${button(action === 'delete-quiz' ? 'confirm-delete-quiz' : 'confirm-delete-card', 'Delete', 'trash-2', 'button danger', `data-id="${esc(id)}"`)}</div>`);
    }
    else if (action === 'confirm-delete-quiz') { if (commit(next => { next.quizzes = next.quizzes.filter(q => q.id !== id); })) { dialog.close(); navigate('library'); toast('Quiz deleted.'); } }
    else if (action === 'confirm-delete-card') { if (commit(next => { next.quizzes.find(q => q.id === activeId).cards = quiz().cards.filter(c => c.id !== id); })) { dialog.close(); render(); toast('Question deleted.'); } }
    else if (action === 'export-quiz') exportMenu(id || activeId);
    else if (action === 'export-json') { download(filename(data.quizzes.find(q => q.id === id).name) + '.json', JSON.stringify({ version: 1, quizzes: [data.quizzes.find(q => q.id === id)] }, null, 2)); dialog.close(); }
    else if (action === 'export-qyl') { exportQyl(data.quizzes.find(q => q.id === id)); dialog.close(); }
    else if (action === 'backup') download(recovery ? 'quiz-lizard-recovery.json' : `quiz-lizard-backup-${new Date().toISOString().slice(0, 10)}.json`, recovery || JSON.stringify(data, null, 2));
    else if (action === 'import') $('#import-file').click();
    else if (action === 'confirm-import') confirmImport();
  });
  document.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'spelling-form') { if (session.resolved) return; session.feedback = C.respond(session, C.normalize($('#spelling-answer').value) === C.normalize(session.items[session.index].expected)); render(); return; }
    if (!form.matches('#quiz-form, #card-form')) return;
    const values = new FormData(form), id = form.dataset.id;
    if (form.id === 'quiz-form') {
      const name = values.get('name').trim();
      if (!name) { toast('Give your quiz a name.'); return; }
      const created = id || C.id();
      if (commit(next => { const q = next.quizzes.find(item => item.id === id); if (q) { q.name = name; q.description = values.get('description').trim(); } else next.quizzes.push({ id: created, name, description: values.get('description').trim(), cards: [] }); })) { dialog.close(); activeId = created; view = 'quiz'; tab = id ? tab : 'questions'; render(); toast(id ? 'Quiz updated.' : 'Quiz created.'); }
    } else {
      const card = { id: id || C.id(), question: values.get('question').trim(), answer: values.get('answer').trim(), notes: values.get('notes').trim(), wrongAnswers: [0, 1, 2].map(i => values.get(`wrong${i}`).trim()).filter(Boolean) };
      if (!card.question || !card.answer) { toast('Add both a question and an answer.'); return; }
      if (commit(next => { const q = next.quizzes.find(item => item.id === activeId); const index = q.cards.findIndex(c => c.id === id); if (index < 0) q.cards.push(card); else q.cards[index] = card; })) { dialog.close(); tab = 'questions'; render(); toast('Question saved.'); }
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'quiz-search') { search = event.target.value; renderGrid(); }
    if (event.target.id === 'card-search') { cardSearch = event.target.value; renderCards(); }
  });
  document.addEventListener('change', event => { if (['question-count', 'reverse', 'second-chance'].includes(event.target.id)) saveSettings(); });
  document.addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const current = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    document.querySelectorAll('[role="tab"]')[next].focus();
  });
  $('#import-file').addEventListener('change', event => { readImport(event.target.files[0]); event.target.value = ''; });
  $('.brand').addEventListener('click', event => { event.preventDefault(); navigate('library'); });
  window.addEventListener('storage', event => {
    if (event.key !== C.KEY && event.key !== null) return;
    toast('Your library changed in another tab. Reload to see the latest quizzes.', true);
  });
  render();
})();
