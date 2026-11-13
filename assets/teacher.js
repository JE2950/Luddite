/* Quiz app — teacher area: sign-in, library, set editor, pupil-view preview */
(function () {
'use strict';
if (!window.APP.configured) return; // config.js shows the setup message

const cfg = window.APP;
const cameForReset = /type=recovery/.test(location.hash + location.search);
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
const app = document.getElementById('app');

const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nowIso = () => new Date().toISOString();

/* ---------- streak scoring ---------- */
const BASE = 100;
const TIERS = [
  { from: 1, m: 1, label: '1–2 in a row' },
  { from: 3, m: 1.5, label: '3–4 in a row' },
  { from: 5, m: 2, label: '5–7 in a row' },
  { from: 8, m: 3, label: '8+ in a row' }
];
const multFor = streak => { let m = 1; for (const t of TIERS) if (streak >= t.from) m = t.m; return m; };
const fmtMult = m => '×' + (Number.isInteger(m) ? m : m.toFixed(1));

/* ---------- state ---------- */
let me = null;              // signed-in user
let hasTags = true;         // false until the tags column exists in the database
let isAdmin = false;        // can add teachers and set passwords
let folders = [];
let sets = [];
let assignments = [];       // this teacher's assignments and revision folders
let hasAssign = true;       // false until supabase/assignments.sql has been run
let view = { name: 'library', folder: 'mine' };
let ui = {};
let game = null;

const mkQ = (q = '', answers = ['', '', '', ''], correct = 0) => ({ id: uid(), q, answers, correct });
const getSet = id => sets.find(s => s.id === id);
const mine = s => me && s.owner === me.id;
const folderName = id => (folders.find(f => f.id === id) || {}).name || 'Unfiled';
const hasDupes = q => { const ks = q.answers.map(a => String(a).trim().toLowerCase()).filter(Boolean); return new Set(ks).size < ks.length; };
const validQ = q => LB.validQ(q);
const ansIn = a => LB.asAnswer(a);    // an image address pasted as an answer becomes a picture
const qIn = (text, q) => { const t = String(text || '').trim(); if (/^(img:)?https:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t)) { q.image = t.replace(/^img:/i, ''); q.q = ''; } return q; };
const ownerLabel = s => (s.owner_email || '').split('@')[0] || 'a teacher';

/* ---------- feedback ---------- */
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 5000 : 2200);
}
function saveStatus(state) {
  const s = document.getElementById('saved');
  if (!s) return;
  s.className = 'saved ' + (state === 'saved' ? 'on' : state === 'busy' ? 'busy' : state === 'bad' ? 'bad' : '');
  s.textContent = state === 'busy' ? 'Saving…' : state === 'bad' ? 'Not saved: check your connection' : 'Saved';
  if (state === 'saved') { clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('on'), 1400); }
}
function fail(what, error) {
  console.error(what, error);
  toast(`${what}. Check your connection and try again.`, true);
}

/* ---------- saving edits (debounced per set) ---------- */
const pending = new Map();
function queueSave(set) {
  set.updated_at = nowIso();
  clearTimeout(pending.get(set.id));
  saveStatus('busy');
  pending.set(set.id, setTimeout(() => flushSave(set), 700));
}
const noTagsColumn = e => e && /tags/.test(e.message || '') && /column|schema/i.test(e.message || '');
async function flushSave(set) {
  pending.delete(set.id);
  let { error } = await saveRow(set);
  if (noTagsColumn(error)) { hasTags = false; ({ error } = await saveRow(set)); }
  if (error) { saveStatus('bad'); console.error(error); return; }
  if (!pending.size) saveStatus('saved');
}
function saveRow(set) {
  return sb.from('sets')
    .update(hasTags ? { title: set.title, folder_id: set.folder_id, questions: set.questions, tags: set.tags || [], subject: set.subject || null } : { title: set.title, folder_id: set.folder_id, questions: set.questions })
    .eq('id', set.id);
}
async function flushAll() {
  for (const [id, t] of pending) { clearTimeout(t); const s = getSet(id); if (s) await flushSave(s); }
}
window.addEventListener('beforeunload', e => { if (pending.size) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- maths rendering ---------- */
function typeset(el) {
  const MJ = window.MathJax;
  if (!el || !MJ || !MJ.startup || !MJ.startup.promise) return;
  MJ.startup.promise
    .then(() => { try { MJ.typesetClear && MJ.typesetClear([el]); } catch (e) {} return MJ.typesetPromise([el]); })
    .catch(() => {});
}
window.addEventListener('load', () => typeset(app));

/* ---------- sign-in ---------- */
function renderSignIn(msg) {
  app.innerHTML = `<div class="gate"><form class="gate-card" id="signin">
    ${window.APP.logo()}
    ${window.APP.schoolLine()}
    <h1 style="font-size:24px">Teacher sign-in</h1>
    <div class="field"><label for="email">School email</label><input class="in" id="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="password">Password</label><input class="in" id="password" type="password" autocomplete="current-password" required></div>
    <p class="err" id="signin-err">${esc(msg || '')}</p>
    <button class="btn primary" id="signin-btn">Sign in</button>
    <button type="button" class="btn ghost small" data-act="forgot" style="align-self:center">Forgotten your password?</button>
    <p class="foot">Need an account? Ask the ${esc(window.APP.name)} admin to add you.<br><a href="${window.APP.playUrl}">Pupils: join a game here</a></p>
  </form></div>`;
  document.getElementById('email').focus();
}
function renderForgot(msg, sent) {
  app.innerHTML = `<div class="gate"><form class="gate-card" id="forgot">
    ${LBmark()}
    <h1 style="font-size:24px">Reset your password</h1>
    ${sent ? `<p>If there’s an account for that email, a reset link is on its way. Check your inbox (and junk folder), then follow the link.</p>
      <button type="button" class="btn" data-act="to-signin">Back to sign-in</button>`
    : `<p>Type your school email and we’ll send you a link to choose a new password.</p>
      <div class="field"><label for="forgot-email">School email</label><input class="in" id="forgot-email" type="email" autocomplete="username" required></div>
      <p class="err" id="forgot-err">${esc(msg || '')}</p>
      <button class="btn primary" id="forgot-btn">Send reset link</button>
      <button type="button" class="btn ghost small" data-act="to-signin" style="align-self:center">Back to sign-in</button>`}
  </form></div>`;
  const f = document.getElementById('forgot-email'); if (f) f.focus();
}
async function onForgot(e) {
  e.preventDefault();
  const btn = document.getElementById('forgot-btn'); btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.resetPasswordForEmail(document.getElementById('forgot-email').value.trim(), { redirectTo: location.origin + location.pathname });
  if (error && /rate|limit|seconds/i.test(error.message)) return renderForgot('Too many reset emails have been sent recently. Wait a while and try again, or ask your admin to set a new password for you.');
  renderForgot('', true); // same message whether or not the account exists
}
const LBmark = () => window.APP.logo();
async function onSignIn(e) {
  e.preventDefault();
  const btn = document.getElementById('signin-btn'), err = document.getElementById('signin-err');
  btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  });
  if (error) {
    btn.disabled = false; btn.textContent = 'Sign in';
    err.textContent = /invalid/i.test(error.message)
      ? 'That email and password don’t match. Check both and try again.'
      : 'Couldn’t sign in: ' + error.message;
  }
}

async function loadLibrary() {
  app.innerHTML = '<div class="loading">Loading your sets…</div>';
  const [f, s] = await Promise.all([
    sb.from('folders').select('id,name,created_at').order('name'),
    sb.from('sets').select('*').order('updated_at', { ascending: false })
  ]);
  if (f.error || s.error) {
    console.error(f.error || s.error);
    app.innerHTML = `<div class="gate"><div class="gate-card"><h1 style="font-size:24px">Couldn’t load your sets</h1><p>Check your internet connection, then reload the page.</p><button class="btn primary" onclick="location.reload()">Reload</button></div></div>`;
    return;
  }
  folders = f.data;
  sb.from('admins').select('user_id').eq('user_id', me.id).maybeSingle().then(r => { isAdmin = !!(r && r.data); if (isAdmin && view.name !== 'play') render(); }, () => {});
  hasTags = s.data.length ? 'tags' in s.data[0] : hasTags;
  const asg = await sb.from('assignments').select('*').order('created_at', { ascending: false });
  hasAssign = !asg.error; assignments = asg.error ? [] : asg.data;
  sets = s.data.map(x => ({ ...x, questions: Array.isArray(x.questions) ? x.questions : [], tags: Array.isArray(x.tags) ? x.tags : [] }));
  render();
}

/* ---------- shell ---------- */
function header() {
  return `<header class="top">
    ${window.APP.logo()}
    <span class="chip">Teacher</span>
    <span class="saved" id="saved">Saved</span>
    <span class="who">${hasAssign ? `<button class="btn small ${['assignments', 'assignment'].includes(view.name) ? '' : 'ghost'}" data-act="assignments">Assignments${assignments.length ? ` (${assignments.length})` : ''}</button>` : ''} ${esc(me.email)}${isAdmin ? ' <button class="btn small ghost" data-act="admin">Teachers</button>' : ''} <button class="btn small ghost" data-act="account">Password</button> <button class="btn small ghost" data-act="sign-out">Sign out</button> ${LB.helpButton('Show me round this page (?)')}</span>
  </header>`;
}
function render() {
  if (view.name !== 'play') stopTimer();
  if (view.name === 'library') app.innerHTML = `<div class="wrap">${header()}${renderLibrary()}</div>`;
  else if (view.name === 'edit') app.innerHTML = `<div class="wrap">${header()}${renderEditor()}</div>`;
  else if (view.name === 'view') app.innerHTML = `<div class="wrap">${header()}${renderView()}</div>`;
  else if (view.name === 'account') app.innerHTML = `<div class="wrap">${header()}${renderAccount()}</div>`;
  else if (view.name === 'admin') app.innerHTML = `<div class="wrap">${header()}${renderAdmin()}</div>`;
  else if (view.name === 'assignments') app.innerHTML = `<div class="wrap">${header()}${renderAssignments()}</div>`;
  else if (view.name === 'assignment') app.innerHTML = `<div class="wrap">${header()}${renderAssignment()}</div>`;
  else if (view.name === 'assign-new') app.innerHTML = `<div class="wrap">${header()}${renderAssignNew()}</div>`;
  else if (view.name === 'play') app.innerHTML = `<div class="wrap play">${renderPlay()}</div>`;
  else if (view.name === 'worksheet') app.innerHTML = `<div class="wrap">${header()}${renderWorksheet()}</div>`;
  typeset(app);
  if (view.name === 'worksheet') wsPreview();
  const f = app.querySelector('[data-autofocus]'); if (f) f.focus();
}

/* ---------- guided tours, one per page (the ? button) ---------- */
const TOURS = {
  library: () => [
    { sel: '.rail', title: 'Your library', text: 'My sets holds everything you have made. Unfiled is anything not yet in a folder. Other teachers’ sets lets you play or copy what colleagues have made. Your own folders sit underneath; + New folder adds one.' },
    { sel: '#search', title: 'Find a set', text: 'Type part of a name or a tag. A subject works too: type Latin, French, Geography or History. In Other teachers’ sets you can also search by teacher.' },
    { sel: '[data-act="new-set"]', title: 'Make a set', text: 'Opens an empty set in the editor. Type questions in, or paste them from Excel or Quizlet. It saves as you go.' },
    { sel: '.card', title: 'Each set', text: 'Host live game runs it on the board with the class joining on their laptops. Play solo tries it yourself. Assign gives pupils a code to play it on their own. The coloured label shows the subject, which sets the look, music, runners and treasures.' },
    { sel: '[data-act="assignments"]', title: 'Assignments', text: 'Every code you have handed out, with each pupil’s plays, scores and the questions they keep getting wrong. Open a folder and use Share for revision to give pupils a choice of sets.' },
    { sel: '[data-act="help"]', title: 'Help on every page', text: 'Each page has its own short tour. Press this button, or the ? key, whenever you want it again. Arrow keys move through it and Esc closes it.' }
  ],
  edit: () => [
    { sel: '#set-title', title: 'Name the set', text: 'Pupils see this name on the board and in revision folders.' },
    { sel: '#set-subject', title: 'Subject', text: 'Latin, French, Geography or History gives the game that subject’s look, music, runners and fishing treasures. Leave it on the first option and Ludus works the subject out from the questions. None keeps the Ludgrove look.' },
    { sel: '.q', title: 'A question', text: 'Type the question, then two to four answers. The round button marks the right one. If two answers are the same, a warning appears, because pupils would only see one of them.' },
    { sel: '.q-pic, .pic-btn', title: 'Pictures', text: 'Add a picture to the question, or press the picture button beside an answer to make that answer a picture. Pasting a picture’s web address into an answer box does the same. Use it for flags, maps and diagrams.' },
    { sel: '[data-act="toggle-import"]', title: 'Import questions', text: 'Paste rows from Excel, paste a Quizlet export, or upload a spreadsheet. With Quizlet you choose which way round the questions go, and cards that share a word are combined so no wrong answer is ever another right one.' },
    { sel: '[data-act="ask-swap"]', title: 'Swap questions and answers', text: 'Turns the whole set round: each right answer becomes the question and the question becomes its answer. Run it again to swap back.' },
    { sel: '[data-act="worksheet"]', title: 'Worksheets', text: 'Prints this set as a match up, crossword, gap fill, word search, anagrams or multiple choice sheet, with the answers on a separate page.' },
    { sel: '.q-prev', title: 'What pupils see', text: 'A preview of the question as it will look on a pupil’s screen, with the right answer marked.' },
    { sel: '[data-act="host-link"], [data-act="play"]', title: 'Use it', text: 'Host live game runs it with the class. Play solo lets you try it first.' }
  ],
  worksheet: () => [
    { sel: '.ws-kinds', title: 'Kind of sheet', text: 'Pick one. The preview changes straight away. Crosswords and word searches need answers made of letters, so questions with picture or number answers are left out of those.' },
    { sel: '#ws-count', title: 'How many', text: 'Choose how many questions go on the sheet. If you choose fewer than the set has, they are picked at random.' },
    { sel: '#ws-dir', title: 'Which way round', text: 'Each option shows a pair from this set, so you can see which word is the clue and which the pupils write. Sheets start English into Latin for a usual vocab set. Only single words are written, and an entry such as “rēx, rēgis” uses its first word.' },
    { sel: '[data-act="ws-seed"]', title: 'New layout', text: 'Shuffles the order, the grid and the questions picked. What you see in the preview is what prints.' },
    { sel: '[data-act="ws-print"]', title: 'Print', text: 'Prints the sheet, with the answers on the next page if that box is ticked. Choose Save as PDF in the print box to keep a copy.' }
  ],
  assignments: () => [
    { sel: '.tbl, .empty', title: 'Your codes', text: 'Each row is a code pupils use to play on their own. Click a title to see the results. To make a new one, click Assign on a set, or open a folder and click Share for revision.' }
  ],
  assignment: () => [
    { sel: '.join-banner', title: 'How pupils get in', text: 'Pupils go to the address, type the code, then their first name and the first letter of their surname. Scanning the QR code fills the code in for them.' },
    { sel: '[data-act="print-card"]', title: 'Print it', text: 'Print poster gives one large sheet for the wall. Print slips gives eight small ones to a page to cut up and hand out. Both take on the set’s subject design.' },
    { sel: '.tbl', title: 'Results', text: 'One row per pupil: plays, best score, accuracy and how many questions they still get wrong. Click a name to see those questions.' },
    { sel: '[data-act="toggle-open"]', title: 'Close or reopen', text: 'Closing stops new plays on this code and keeps the results. Delete removes the code and every saved play.' }
  ]
};
function matches(s, q) {
  if (!q) return true;
  q = q.toLowerCase().replace(/^#/, '');
  return (s.title || '').toLowerCase().includes(q) || THEME.label(THEME.subjectFor(s)).toLowerCase() === q || (s.tags || []).some(t => t.toLowerCase().includes(q)) || (!mine(s) && ownerLabel(s).toLowerCase().includes(q));
}
function setsIn(f) {
  if (f === 'mine') return sets.filter(mine);
  if (f === 'unfiled') return sets.filter(s => mine(s) && !s.folder_id);
  if (f === 'school') return sets.filter(s => !mine(s));
  return sets.filter(s => mine(s) && s.folder_id === f);
}
const setsFor = f => setsIn(f).filter(s => matches(s, ui.search));
function renderLibrary() {
  const f = view.folder;
  const list = setsFor(f).slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const isFolder = !['mine', 'unfiled', 'school'].includes(f);
  const folderBtn = (id, name, plain) => `<button class="fold ${f === id ? 'on' : ''}" data-act="folder" data-id="${id}"><span class="lbl">${plain ? '' : '<span class="ic"></span>'}${esc(name)}</span><span class="n">${setsIn(id).length}</span></button>`;
  const curName = f === 'mine' ? 'My sets' : f === 'unfiled' ? 'Unfiled' : f === 'school' ? 'Other teachers’ sets' : folderName(f);

  let rail = `<nav class="rail" aria-label="Folders"><h3>Library</h3>${folderBtn('mine', 'My sets', true)}${folderBtn('unfiled', 'Unfiled', true)}${folderBtn('school', 'Other teachers’ sets', true)}<h3>My folders</h3>`;
  rail += folders.map(x => folderBtn(x.id, x.name)).join('');
  rail += ui.newFolder
    ? `<form class="inline-form" data-form="new-folder"><label class="sr" for="new-folder-name">Folder name</label><input id="new-folder-name" placeholder="e.g. Year 8 set 4" data-autofocus maxlength="60"><button class="btn small primary">Add</button></form>`
    : `<button class="btn ghost small" data-act="new-folder" style="justify-content:flex-start">+ New folder</button>`;
  rail += `</nav>`;

  let head = `<div class="main-head"><div>`;
  if (isFolder && ui.renaming === f) {
    head += `<form class="inline-form" data-form="rename-folder" style="padding:0"><label class="sr" for="rename-folder">Folder name</label><input id="rename-folder" value="${esc(curName)}" data-autofocus maxlength="60"><button class="btn small primary">Rename</button><button type="button" class="btn small ghost" data-act="cancel">Cancel</button></form>`;
  } else head += `<h1>${esc(curName)}</h1>`;
  head += `<p>${f === 'school' ? 'View or play any set, or copy it into your own sets to edit it.' : `${list.length} ${list.length === 1 ? 'set' : 'sets'}${ui.search ? ' matching your search' : ''}`}</p></div><div class="head-acts">`;
  head += `<label class="sr" for="search">Search sets</label><input class="in search" id="search" type="search" placeholder="${f === 'school' ? 'Search by name, tag or teacher' : 'Search by name or tag'}" value="${esc(ui.search || '')}">`;
  if (isFolder && ui.renaming !== f && hasAssign) head += `<button class="btn small" data-act="assign-new" data-folder="${f}">Share for revision</button>`;
  if (isFolder && ui.renaming !== f) head += `<button class="btn small ghost" data-act="rename-folder">Rename</button><button class="btn small ghost danger" data-act="ask-del-folder">Delete folder</button>`;
  if (f !== 'school') head += `<button class="btn primary" data-act="new-set">+ New set</button>`;
  head += `</div></div>`;
  if (isFolder && ui.confirmFolder === f) head += `<div class="confirm" style="margin-bottom:16px">Delete the folder “${esc(curName)}”? Its sets move to Unfiled. <button class="btn small danger" data-act="del-folder">Delete folder</button><button class="btn small ghost" data-act="cancel">Keep it</button></div>`;

  let body;
  if (!list.length) {
    body = f === 'school'
      ? `<div class="empty"><h2>${ui.search ? 'No matching sets' : 'No other teachers’ sets yet'}</h2><p>${ui.search ? 'Try a different search.' : 'When colleagues make sets, they appear here.'}</p></div>`
      : ui.search ? `<div class="empty"><h2>No matching sets</h2><p>Nothing here matches “${esc(ui.search)}”. <button class="btn small ghost" data-act="clear-search">Clear search</button></p></div>`
      : `<div class="empty"><h2>No sets here yet</h2><p>Make one from scratch, or paste questions straight from Excel.</p><button class="btn primary" data-act="new-set">+ New set</button></div>`;
  } else {
    body = `<div class="grid" id="set-grid">${list.map(cardHTML).join('')}</div>`;
  }
  return `<div class="lib">${rail}<section style="min-width:0">${head}${body}</section></div>`;
}
function cardHTML(s) {
  const n = s.questions.length, ok = s.questions.filter(validQ).length;
  const stripes = s.questions.slice(0, 12).map(q => `<span class="t${q.correct % 4}"></span>`).join('');
  const own = mine(s);
  let acts;
  if (ui.confirmSet === s.id) acts = `<div class="confirm">Delete this set for good? <button class="btn small danger" data-act="del-set" data-id="${s.id}">Delete</button><button class="btn small ghost" data-act="cancel">Keep</button></div>`;
  else acts = `<div class="acts">${ok ? `<a class="btn small primary" href="host.html?set=${encodeURIComponent(s.id)}">Host live game</a>` : '<button class="btn small primary" disabled>Host live game</button>'}<button class="btn small" data-act="play" data-id="${s.id}" ${ok ? '' : 'disabled'}>▶ Play solo</button>`
    + (hasAssign && ok ? `<button class="btn small" data-act="assign-new" data-id="${s.id}">Assign</button>` : '')
    + `<button class="btn small" data-act="view" data-id="${s.id}">View</button>`
    + (own ? `<button class="btn small" data-act="edit" data-id="${s.id}">Edit</button>` : '')
    + `</div><div class="acts minor"><button class="btn small ghost" data-act="dup" data-id="${s.id}">${own ? 'Duplicate' : 'Copy to my sets'}</button>`
    + `<button class="btn small ghost" data-act="export" data-id="${s.id}">Export to Excel</button>`
    + (own ? `<button class="btn small ghost danger" data-act="ask-del-set" data-id="${s.id}">Delete</button>` : '')
    + `</div>`;
  return `<article class="card">
    <div class="stripes" aria-hidden="true">${stripes || '<span style="background:var(--line)"></span>'}</div>
    <h2><button class="title-link" data-act="view" data-id="${s.id}">${esc(s.title || 'Untitled set')}</button></h2>
    ${tagsHTML(s)}
    <div class="meta"><span>${n} ${n === 1 ? 'question' : 'questions'}</span>${own ? `<span>${esc(folderName(s.folder_id))}</span>` : `<span>by ${esc(ownerLabel(s))}</span>`}${own && ok < n ? `<span style="color:var(--bad)">${n - ok} unfinished</span>` : ''}</div>
    ${acts}
  </article>`;
}

const subjChip = s => { const k = THEME.subjectFor(s); return k ? `<button class="tag-chip subj subj-${k}" data-act="tag" data-tag="${esc(THEME.label(k))}" title="Show ${esc(THEME.label(k))} sets">${esc(THEME.label(k))}</button>` : ''; };
const tagsHTML = s => ((s.tags && s.tags.length) || THEME.subjectFor(s)) ? `<div class="tags">${subjChip(s)}${(s.tags || []).map(t => `<button class="tag-chip" data-act="tag" data-tag="${esc(t)}" title="Show sets tagged ${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';

/* ---------- change password ---------- */
function renderAccount() {
  return `${view.recovery ? '' : '<div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>'}
  <form class="panel-form" id="pw-form">
    <h1>${view.recovery ? 'Choose a new password' : 'Change your password'}</h1>
    <p class="hint">${view.recovery ? 'You’re signed in from the reset link. Pick a new password to finish.' : 'Use at least 8 characters.'}</p>
    <div class="field"><label for="pw1">New password</label><input class="in" id="pw1" type="password" autocomplete="new-password" minlength="8" required data-autofocus></div>
    <div class="field"><label for="pw2">Type it again</label><input class="in" id="pw2" type="password" autocomplete="new-password" minlength="8" required></div>
    <p class="err" id="pw-err"></p>
    <button class="btn primary" id="pw-btn">Save new password</button>
  </form>`;
}
async function onPassword(e) {
  e.preventDefault();
  const a = document.getElementById('pw1').value, b = document.getElementById('pw2').value, err = document.getElementById('pw-err');
  if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
  if (a !== b) { err.textContent = 'The two passwords don’t match.'; return; }
  const btn = document.getElementById('pw-btn'); btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) { btn.disabled = false; btn.textContent = 'Save new password'; err.textContent = /different|same/i.test(error.message) ? 'Choose a password you haven’t used before.' : 'Couldn’t save: ' + error.message; return; }
  toast('Password changed');
  view = { name: 'library', folder: 'mine' }; render();
}

/* ---------- admin: teachers (via the admin Edge Function named in config.js) ---------- */
async function adminCall(body) {
  const { data, error } = await sb.functions.invoke(window.APP.adminFunction, { body });
  if (error) {
    let msg = 'The admin tools aren’t set up yet, or couldn’t be reached.';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
    return { error: msg };
  }
  return data || {};
}
const tempPassword = () => { const w = ['maple','harbour','comet','pebble','lantern','orbit','meadow','falcon','tulip','quartz','ember','glacier']; const a = new Uint32Array(3); crypto.getRandomValues(a); return w[a[0] % w.length] + '-' + w[a[1] % w.length] + '-' + (10 + a[2] % 90); };
async function loadTeachers() {
  ui.teachers = null; ui.adminErr = ''; render();
  const r = await adminCall({ action: 'list' });
  if (r.error) ui.adminErr = r.error; else ui.teachers = r.teachers;
  if (view.name === 'admin') render();
}
function renderAdmin() {
  const t = ui.teachers;
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';
  return `<div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>
  <div class="main-head"><div><h1>Teachers</h1><p>Add colleagues, and set a new password if someone is locked out.</p></div></div>
  ${ui.adminNote ? `<div class="ro note-ok" role="status">${ui.adminNote}</div>` : ''}
  ${ui.adminErr ? `<div class="confirm" role="alert">${esc(ui.adminErr)}</div>` : ''}
  <form class="panel-form wide" id="add-teacher">
    <h2>Add a teacher</h2>
    <div class="ed-row">
      <div class="field" style="flex:2;min-width:220px"><label for="new-email">School email</label><input class="in" id="new-email" type="email" required style="width:100%"></div>
      <div class="field" style="flex:1;min-width:180px"><label for="new-pw">Starting password</label><input class="in mono-in" id="new-pw" value="${esc(ui.newPw || (ui.newPw = tempPassword()))}" minlength="8" required style="width:100%"></div>
      <button class="btn primary" id="add-btn">Add teacher</button>
    </div>
    <p class="hint" style="margin:0">Give them the email and starting password. They can change it under <b>Password</b> once signed in.</p>
  </form>
  ${t == null && !ui.adminErr ? '<div class="loading">Loading teachers…</div>' : ''}
  ${t ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Email</th><th>Added</th><th>Last signed in</th><th></th></tr></thead><tbody>
    ${t.map(u => `<tr><td>${esc(u.email)}${u.you ? ' <span class="chip">You</span>' : ''}${u.admin ? ' <span class="chip">Admin</span>' : ''}</td><td>${fmtD(u.created_at)}</td><td>${fmtD(u.last_sign_in_at)}</td>
      <td style="text-align:right">${ui.removing === u.id
        ? `<span class="confirm">Remove ${esc(u.email)}? Their sets and folders are deleted too. <button class="btn small danger" data-act="admin-remove" data-id="${u.id}">Remove</button><button class="btn small ghost" data-act="admin-cancel">Keep</button></span>`
        : `<button class="btn small" data-act="admin-pw" data-id="${u.id}" data-email="${esc(u.email)}">Set new password</button>${u.you ? '' : ` <button class="btn small ghost danger" data-act="admin-ask-remove" data-id="${u.id}">Remove</button>`}`}</td></tr>`).join('')}
  </tbody></table></div>` : ''}`;
}

/* ---------- assignments and revision folders ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1, so codes read clearly
const newCode = () => { const a = new Uint32Array(5); crypto.getRandomValues(a); return Array.from(a, n => CODE_CHARS[n % CODE_CHARS.length]).join(''); };
const pupilLink = a => cfg.joinUrl + '?a=' + a.code;
const asgTarget = a => a.set_id ? (getSet(a.set_id) || { title: 'A deleted set', questions: [] }) : { title: folderName(a.folder_id) };
const asgSets = a => a.set_id ? [getSet(a.set_id)].filter(Boolean) : sets.filter(s => s.folder_id === a.folder_id && mine(s));
const fmtDay = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const qrSVG = (text, cell = 4) => { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true }); } catch (e) { return ''; } };

function renderAssignNew() {
  const set = view.setId && getSet(view.setId), isFolder = !!view.folderId;
  const name = isFolder ? folderName(view.folderId) : (set && set.title) || 'Untitled set';
  const n = isFolder ? sets.filter(s => s.folder_id === view.folderId && mine(s)).length : 0;
  return `<div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>
  <form class="panel-form wide" id="assign-form">
    <h1>${isFolder ? 'Share a folder for revision' : 'Set an assignment'}</h1>
    <p class="hint" style="margin:0">${isFolder ? `Pupils choose from the ${n} ${n === 1 ? 'set' : 'sets'} in <b>${esc(name)}</b>, including any you add later, and replay them as often as they like.` : `Pupils play <b>${esc(name)}</b> on their own, as often as they like.`} They sign in with a code and their first name and surname initial. Every play is saved for you to see.</p>
    <div class="ed-row">
      <div class="field" style="flex:2;min-width:220px"><label for="as-title">Title pupils see</label><input class="in" id="as-title" maxlength="80" value="${esc(isFolder && !/revision/i.test(name) ? name + ' revision' : name)}" style="width:100%"></div>
      <div class="field"><label for="as-mode">Mode</label><select id="as-mode"><option value="classic">${esc(window.APP.modes.classic)}</option><option value="fishing">${esc(window.APP.modes.fishing)}</option></select></div>
      <div class="field"><label for="as-min">Each round</label><select id="as-min">${[3, 5, 10, 15, 0].map(m => `<option value="${m}" ${m === 5 ? 'selected' : ''}>${m ? m + ' minutes' : 'Until they finish'}</option>`).join('')}</select></div>
      <div class="field"><label for="as-due">Due (optional)</label><input class="in" id="as-due" type="date"></div>
    </div>
    <p class="err" id="as-err"></p>
    <div class="ed-row"><button class="btn primary" id="as-btn">Create code</button></div>
  </form>`;
}
async function createAssignment() {
  const btn = document.getElementById('as-btn'), err = document.getElementById('as-err');
  btn.disabled = true; btn.textContent = 'Creating…';
  const due = document.getElementById('as-due').value;
  const row = { title: document.getElementById('as-title').value.trim(), mode: document.getElementById('as-mode').value, minutes: +document.getElementById('as-min').value,
    due_at: due ? new Date(due + 'T18:00:00').toISOString() : null, set_id: view.setId || null, folder_id: view.folderId || null };
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from('assignments').insert({ ...row, code: newCode() }).select('*').single();
    if (!error) { assignments.unshift(data); view = { name: 'assignment', id: data.id }; ui = {}; render(); loadResults(); return; }
    if (!/duplicate|unique/i.test(error.message)) { console.error(error); err.textContent = 'Couldn’t create the code. Check your connection and try again.'; break; }
  }
  btn.disabled = false; btn.textContent = 'Create code';
}

function renderAssignments() {
  return `<div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>
  <div class="main-head"><div><h1>Assignments</h1><p>Codes pupils use to play on their own. To make one, click <b>Assign</b> on a set, or open a folder and click <b>Share for revision</b>.</p></div></div>
  ${assignments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Title</th><th>Code</th><th>What</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
    ${assignments.map(a => `<tr><td><button class="title-link" data-act="assignment" data-id="${a.id}"><b>${esc(a.title || asgTarget(a).title)}</b></button></td>
      <td class="num"><b>${esc(a.code)}</b></td><td>${a.set_id ? 'Set: ' : 'Revision folder: '}${esc(asgTarget(a).title || 'Untitled set')}</td>
      <td>${a.due_at ? fmtDay(a.due_at) : '<span class="hint">–</span>'}</td><td>${a.open ? 'Open' : '<span class="hint">Closed</span>'}</td>
      <td style="text-align:right"><button class="btn small" data-act="assignment" data-id="${a.id}">Results</button></td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty"><h2>No assignments yet</h2><p>Click <b>Assign</b> on any set to make one.</p></div>'}`;
}

/* Results: one row per pupil, built from every play on this code */
function pupilSummaries(a) {
  const by = new Map();
  (ui.attempts || []).forEach(t => {
    const key = t.pupil.toLowerCase();
    const p = by.get(key) || { name: t.pupil, plays: 0, best: 0, answered: 0, correct: 0, last: null, per: new Map() };
    p.plays++; p.best = Math.max(p.best, Number(t.score) || 0); p.answered += t.answered; p.correct += t.correct;
    if (!p.last || t.updated_at > p.last) p.last = t.updated_at;
    (t.log || []).forEach(e => { const k = t.set_id + '|' + e.qid; const r = p.per.get(k) || { set_id: t.set_id, qid: e.qid, seen: 0, right: 0, wrong: 0, wrongs: [], last: null }; r.seen++; if (e.right) r.right++; else { r.wrong++; r.wrongs.push(e.choice); } r.last = e.right; p.per.set(k, r); });
    by.set(key, p);
  });
  return [...by.values()].sort((x, y) => x.name.localeCompare(y.name));
}
const qFor = (setId, qid) => { const s = getSet(setId); return s && s.questions.find(q => q.id === qid); };
function renderAssignment() {
  const a = assignments.find(x => x.id === view.id);
  if (!a) { view = { name: 'assignments' }; return renderAssignments(); }
  const link = pupilLink(a), ps = pupilSummaries(a), fish = a.mode === 'fishing';
  const rows = ps.map(p => {
    const weak = [...p.per.values()].filter(r => r.wrong > 0 && r.wrong >= r.right);
    const open = ui.openPupil === p.name.toLowerCase();
    return `<tr><td><button class="title-link" data-act="pupil-row" data-name="${esc(p.name.toLowerCase())}"><b>${esc(p.name)}</b></button></td><td class="num">${p.plays}</td>
      <td class="num">${fish ? LB_fmtKg(p.best) : p.best.toLocaleString('en-GB')}</td><td class="num">${p.correct}/${p.answered}</td>
      <td class="num">${p.answered ? Math.round(100 * p.correct / p.answered) + '%' : '–'}</td><td class="num">${weak.length}</td><td>${p.last ? fmtDay(p.last) : ''}</td></tr>
      ${open ? `<tr><td colspan="7" style="background:var(--sunk)">${weak.length ? `<b>Questions to practise</b><ul style="margin:6px 0 0;padding-left:20px">${weak.map(r => { const q = qFor(r.set_id, r.qid); return q ? `<li>${esc(LB.qText(q))}: <span class="hint">right ${r.right}, wrong ${r.wrong}; answer ${LB.ansHTML(q.answers[q.correct])}${r.wrongs.length ? `; put ${[...new Set(r.wrongs)].map(i => LB.ansHTML(q.answers[i])).join(', ')}` : ''}</span></li>` : ''; }).join('')}</ul>` : 'No weak questions.'}</td></tr>` : ''}`;
  }).join('');
  return `<div class="toolbar"><button class="btn ghost small" data-act="assignments">← Assignments</button></div>
  <div class="main-head"><div><span class="qlabel">${a.set_id ? 'Assignment' : 'Revision folder'} · ${esc(asgTarget(a).title || 'Untitled set')}${a.due_at ? ' · due ' + fmtDay(a.due_at) : ''}</span><h1>${esc(a.title || asgTarget(a).title)}</h1></div>
    <div class="head-acts"><button class="btn" data-act="print-card" data-id="${a.id}">Print poster</button><button class="btn" data-act="print-slips" data-id="${a.id}">Print slips</button>
      <button class="btn" data-act="toggle-open" data-id="${a.id}">${a.open ? 'Close' : 'Reopen'}</button><button class="btn ghost danger" data-act="ask-del-asg">Delete</button></div></div>
  ${ui.confirmAsg ? `<div class="confirm" style="margin-bottom:16px">Delete this code and all ${(ui.attempts || []).length} saved plays? <button class="btn small danger" data-act="del-asg" data-id="${a.id}">Delete</button><button class="btn small ghost" data-act="cancel-asg">Keep</button></div>` : ''}
  <section class="join-banner" style="margin-bottom:20px">
    <div><span class="qlabel">Go to</span><div class="join-url">${esc(cfg.joinAddress)}</div></div>
    <div><span class="qlabel">Code</span><div class="join-code">${esc(a.code)}</div></div>
    <div><span class="qlabel">Or scan</span><div class="join-qr">${qrSVG(link)}</div></div>
  </section>
  <p class="hint">Direct link: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a> ${a.open ? '' : '· <b>Closed:</b> pupils can’t open this code until you reopen it.'}</p>
  <div class="main-head" style="margin-top:24px"><div><h2 style="font-size:24px">Results</h2><p>${ui.attempts == null ? 'Loading…' : `${ps.length} ${ps.length === 1 ? 'pupil' : 'pupils'}, ${ui.attempts.length} ${ui.attempts.length === 1 ? 'play' : 'plays'}. Click a name to see the questions he keeps getting wrong.`}</p></div>
    <div class="head-acts"><button class="btn small" data-act="refresh-results">Refresh</button><button class="btn small primary" data-act="asg-csv" ${ps.length ? '' : 'disabled'}>⇩ Pupil weaknesses (CSV)</button></div></div>
  ${ps.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pupil</th><th>Plays</th><th>Best</th><th>Correct</th><th>Accuracy</th><th>To practise</th><th>Last played</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : ui.attempts ? '<div class="empty"><h2>No plays yet</h2><p>Results appear here as pupils play. Click Refresh to check.</p></div>' : ''}`;
}
const LB_fmtKg = kg => (Math.round(kg * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';
async function loadResults() {
  ui.attempts = null; render();
  const { data, error } = await sb.from('attempts').select('id,set_id,pupil,score,answered,correct,best_streak,log,finished,started_at,updated_at').eq('assignment_id', view.id).order('started_at');
  ui.attempts = error ? [] : data;
  if (error) toast('Couldn’t load the results. Check your connection.', true);
  if (view.name === 'assignment') render();
}
function assignmentCSV(a) {
  const cols = ['Last played', 'Assignment', 'Set', 'Subject', 'Pupil', 'Question', 'Correct answer', 'Times asked', 'Times right', 'Times wrong', 'Result', 'Last attempt', 'Weakness', 'Their wrong answers'];
  const lastBy = new Map(); (ui.attempts || []).forEach(t => { const k = t.pupil.toLowerCase(); if (!lastBy.has(k) || t.updated_at > lastBy.get(k)) lastBy.set(k, t.updated_at); });
  const rows = [];
  pupilSummaries(a).forEach(p => [...p.per.values()].forEach(r => {
    const q = qFor(r.set_id, r.qid), s = getSet(r.set_id); if (!q) return;
    rows.push([String(lastBy.get(p.name.toLowerCase()) || '').slice(0, 10), a.title, s.title || 'Untitled set', THEME.label(THEME.subjectFor(s)), p.name, LB.qText(q), LB.ansText(q.answers[q.correct]),
      r.seen, r.right, r.wrong, r.wrong === 0 ? 'Right' : r.right === 0 ? 'Wrong' : 'Mixed', r.last ? 'Right' : 'Wrong', r.wrong > 0 ? 'Yes' : 'No', [...new Set(r.wrongs)].map(i => LB.ansText(q.answers[i])).join(' | ')]);
  }));
  const cell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + [cols.join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n');
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  el.download = `${cfg.name} - ${(a.title || 'assignment').replace(/[\\/:*?"<>|]/g, '')} - by pupil and question.csv`;
  document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 2000);
}
/* Printable poster (one per page) or slips (eight per page) with the QR code, code and address,
   in the look of the set's subject (Latin, French, Geography, History), or Ludgrove navy for anything else */
function asgSubject(a) {
  if (a.set_id) return THEME.subjectFor(getSet(a.set_id) || {});
  const tally = {}; sets.filter(s => s.folder_id === a.folder_id && mine(s)).forEach(s => { const k = THEME.subjectFor(s); if (k) tally[k] = (tally[k] || 0) + 1; });
  return Object.keys(tally).sort((x, y) => tally[y] - tally[x])[0] || null;
}
const PRINT_LOOK = {
  latin: { face: '"Cinzel", Georgia, serif', body: '"EB Garamond", Georgia, serif', ink: '#2a1a12', accent: '#8f1d1d', soft: '#b8892b',
    css: `.c{border:2px solid #b8892b;box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 4px #b8892b;border-radius:1mm}.c.big{border:2px solid #b8892b;padding:12mm}h1{letter-spacing:.04em}.stripe{height:4mm;background:repeating-linear-gradient(90deg,#b8892b 0 9mm,#fff 9mm 11mm,#8f1d1d 11mm 20mm,#fff 20mm 22mm)}` },
  french: { face: '"Playfair Display", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#14213d', accent: '#0055a4', soft: '#e1352b',
    css: `.c{border:none;border-radius:5mm;box-shadow:0 0 0 1.5px #c9cfdc;overflow:hidden;padding-top:7mm;position:relative}.c::before{content:"";position:absolute;left:0;right:0;top:0;height:2.5mm;background:linear-gradient(90deg,#0055a4 0 33.3%,#fff 33.3% 66.6%,#e1352b 66.6%)}.c.big{box-shadow:none}h1{font-weight:900}.stripe{height:4mm;background:linear-gradient(90deg,#0055a4 0 33.3%,#fff 33.3% 66.6%,#e1352b 66.6%)}` },
  geography: { face: '"Bitter", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#14271f', accent: '#1f5f4a', soft: '#c98a2b',
    css: `.c{border:1.5px solid #1f5f4a;box-shadow:inset 0 0 0 2.5px #fff,inset 0 0 0 3.5px #9fbcae;border-radius:2mm}.c.big{padding:12mm}h1{font-weight:800}.stripe{height:3mm;background:repeating-linear-gradient(90deg,#14271f 0 12mm,#fff 12mm 24mm);box-shadow:0 0 0 .4mm #14271f}` },
  history: { face: '"Alegreya", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#2a1f17', accent: '#5b2a4a', soft: '#b8892b',
    css: `.c{border:1.5px solid #b8892b;box-shadow:inset 0 0 0 2.5px #fff,inset 0 0 0 3.5px #c9a5b9;border-radius:1.5mm}.c.big{padding:12mm}h1{font-weight:800}.stripe{height:3mm;background:repeating-linear-gradient(90deg,#2a1f17 0 .5mm,#b8892b .5mm 12mm)}` },
  none: { face: '"Libre Baskerville", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#0b1b3f', accent: '#002664', soft: '#9aa3bb',
    css: `.c{border:1.5px dashed #9aa3bb;border-radius:4mm}.c.big{border:none}.stripe{height:3mm;background:#002664}` }
};
function printCard(a, slips) {
  const link = pupilLink(a), title = esc(a.title || asgTarget(a).title || '');
  const subj = asgSubject(a), L = PRINT_LOOK[subj] || PRINT_LOOK.none;
  const base = location.href.replace(/[^/]*([?#].*)?$/, '');
  const crest = !subj && cfg.crest ? `<img class="crest" src="${esc(base + cfg.crest)}" alt="">` : '';
  const one = big => `<div class="c ${big ? 'big' : ''}">${big ? '<div class="stripe"></div>' : ''}${crest && big ? crest : ''}<div class="logo">${esc(cfg.school || '')} · ${esc(cfg.name)}${subj ? ' · ' + esc(THEME.label(subj)) : ''}</div><h1>${title}</h1>
    <div class="qr">${qrSVG(link, big ? 8 : 3)}</div>
    <ol><li>Go to <b>${esc(cfg.joinAddress)}</b></li><li>Type the code <b class="code">${esc(a.code)}</b></li><li>Type your first name and the first letter of your surname</li></ol>
    ${a.due_at ? `<p class="due">Due ${esc(new Date(a.due_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>` : ''}</div>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Your browser blocked the print window. Allow pop-ups for this site and try again.', true);
  w.document.write(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${title} – ${esc(a.code)}</title><link rel="stylesheet" href="${esc(base)}assets/fonts.css"><style>
    @page{size:A4;margin:12mm} *{box-sizing:border-box} body{margin:0;font-family:${L.body};color:${L.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm} .c{padding:5mm;break-inside:avoid;text-align:center}
    .c.big{padding:10mm 4mm;margin-top:6mm} .logo{font:700 10px/1.4 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:${L.accent}}
    .stripe{margin:-10mm -4mm 8mm} .crest{display:block;width:22mm;height:22mm;margin:0 auto 4mm;padding:3mm;background:#002664;border-radius:3mm}
    h1{font-family:${L.face};font-size:18px;margin:2mm 0 3mm;color:${L.ink}} .big h1{font-size:36px;margin:4mm 0 8mm} .qr svg{width:32mm;height:32mm} .big .qr svg{width:90mm;height:90mm}
    ol{text-align:left;margin:3mm auto 0;padding-left:5mm;max-width:80mm;font-size:12px;line-height:1.6} .big ol{font-size:22px;max-width:150mm;margin-top:10mm} ol b{color:${L.accent}}
    .code{font-family:"Courier New",monospace;font-size:1.3em;letter-spacing:.12em} .due{font-size:12px;margin:2mm 0 0;color:${L.accent}} .big .due{font-size:20px}
    ${L.css}
  </style></head><body>${slips ? `<div class="grid">${Array.from({ length: 8 }, () => one(false)).join('')}</div>` : one(true)}<script>window.onload=()=>{(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>window.print(),250))}<\/script></body></html>`);
  w.document.close();
}

/* ---------- worksheets ---------- */
/* English into Latin for a usual vocab set; the other way if that leaves more single words to write */
const wsDir = s => { const n = d => WS.build(s, { kind: 'choice', dir: d, count: 'all', seed: 1 }).total || 0; return n('ab') > n('ba') ? 'ab' : 'ba'; };
const wsSeed = () => 1 + Math.floor(Math.random() * 2147483646);
const WS_ICONS = { match: '⇄', cross: '▦', gap: '＿', search: '🔍', anagram: '🔀', choice: 'a b c' };
function wsLook(s) {
  const subj = THEME.subjectFor(s);
  return { subj, look: PRINT_LOOK[subj] || PRINT_LOOK.none, brand: [cfg.school, cfg.name, subj && THEME.label(subj)].filter(Boolean).join(' · ') };
}
function renderWorksheet() {
  const s = getSet(view.setId);
  if (!s) { view = { name: 'library', folder: 'mine' }; return renderLibrary(); }
  const o = ui.ws, T = WS.TEMPLATES[o.kind];
  const res = ui.wsRes = WS.build(s, { ...o, count: o.count || T.count });
  const counts = [...new Set([5, 10, T.count, 15, 20, 30])].sort((a, b) => a - b).filter(n => n < res.ok).concat(['all']);
  const cur = o.count || (res.ok <= T.count ? 'all' : T.count);
  const why = T.words ? 'their answers are pictures, contain numbers or maths, or are too long for a grid' : T.text ? 'their answers are pictures' : 'they have no wrong answers to choose from';
  const single = WS.build(s, { ...o, kind: 'choice', count: 'all' }), multi = (s.questions || []).filter(LB.validQ).length - (single.total || 0);
  const notes = [];
  if (res.empty) {
    notes.push('Nothing in this set suits this sheet this way round. Worksheets use only single words for pupils to write.');
    if (multi > 0) notes.push(`${multi} ${multi === 1 ? 'question has' : 'questions have'} more than one word to write.`);
    if (res.total) notes.push(`${res.total} ${res.total === 1 ? 'is' : 'are'} left out because ${why}.`);
    notes.push('Try the other way round, or another kind of sheet.');
  } else {
    if (res.used < res.ok && !res.missed) notes.push(`Uses ${res.used} of the ${res.ok} questions that suit this sheet, picked at random. New layout picks again.`);
    if (multi > 0) notes.push(`${multi} ${multi === 1 ? 'question is' : 'questions are'} left out because the word to write is more than one word.`);
    if (res.left) notes.push(`${res.left} ${res.left === 1 ? 'question is' : 'questions are'} left out because ${why}.`);
    if (res.missed) notes.push(`${res.missed} ${res.missed === 1 ? 'answer' : 'answers'} wouldn’t fit the grid. Press New layout to try another arrangement.`);
  }
  return `
  <div class="toolbar"><button class="btn ghost small" data-act="ws-back">← Back to the set</button></div>
  <div class="main-head"><div><span class="qlabel">Worksheets</span><h1>${esc(s.title || 'Untitled set')}</h1></div>
    <div class="head-acts"><button class="btn" data-act="ws-seed" ${res.empty ? 'disabled' : ''}>↻ New layout</button><button class="btn primary" data-act="ws-print" ${res.empty ? 'disabled' : ''}>🖨 Print</button></div></div>
  <div class="ws-wrap">
    <aside class="ws-side">
      <div class="ws-kinds" role="radiogroup" aria-label="Kind of worksheet">${Object.entries(WS.TEMPLATES).map(([k, t]) => `<button class="ws-kind ${k === o.kind ? 'on' : ''}" role="radio" aria-checked="${k === o.kind}" data-act="ws-kind" data-kind="${k}"><span class="ws-ic" aria-hidden="true">${WS_ICONS[k]}</span><b>${esc(t.name)}</b><span>${esc(t.about)}</span></button>`).join('')}</div>
      <div class="field"><label for="ws-count">Questions</label><select id="ws-count" data-ws="count">${counts.map(n => `<option value="${n}" ${String(n) === String(cur) ? 'selected' : ''}>${n === 'all' ? `All that suit (${res.ok})` : n}</option>`).join('')}</select></div>
      <div class="field"><label for="ws-dir">Which way round</label><select id="ws-dir" data-ws="dir">${['ba', 'ab'].map(d => { const ex = WS.example(s, d); return `<option value="${d}" ${o.dir === d ? 'selected' : ''}>${ex ? `Clue “${esc(ex[0])}”, pupils write “${esc(ex[1])}”` : d === 'ba' ? 'Answers as clues, questions to write' : 'Questions as clues, answers to write'}</option>`; }).join('')}</select></div>
      ${o.kind === 'gap' ? `<label class="tog-row"><input type="checkbox" data-ws="bank" ${o.bank ? 'checked' : ''}> Word bank at the top</label>` : ''}
      ${o.kind === 'search' ? `<label class="tog-row"><input type="checkbox" data-ws="backwards" ${o.backwards ? 'checked' : ''}> Words can run backwards (harder)</label>` : ''}
      <label class="tog-row"><input type="checkbox" data-ws="key" ${o.key ? 'checked' : ''}> Answers on a separate page</label>
      ${notes.length ? `<div class="ws-notes">${notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
    </aside>
    <div class="ws-preview">${res.empty ? '<p class="hint" style="padding:24px">Choose another kind of sheet.</p>' : '<iframe id="ws-frame" title="Worksheet preview"></iframe>'}</div>
  </div>`;
}
/* Maths is typeset here, then copied into the sheet with the shapes it uses */
async function wsDoc() {
  const s = getSet(view.setId), res = ui.wsRes, { look, brand } = wsLook(s);
  let body = res.body, key = ui.ws.key ? res.key : '', defs = '';
  const MJ = window.MathJax;
  if (/\$[^$]+\$/.test(body + key) && MJ && MJ.startup && MJ.startup.promise) {
    const tmp = document.createElement('div'); tmp.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    tmp.innerHTML = `<div>${body}</div><div>${key}</div>`; document.body.appendChild(tmp);
    try { await MJ.startup.promise; await MJ.typesetPromise([tmp]); tmp.querySelectorAll('mjx-assistive-mml').forEach(x => x.remove()); body = tmp.children[0].innerHTML; key = tmp.children[1].innerHTML; const g = document.getElementById('MJX-SVG-global-cache'); if (g) defs = `<svg style="display:none">${g.innerHTML}</svg>`; } catch (e) {}
    tmp.remove();
  }
  const base = location.href.replace(/[^/]*([?#].*)?$/, '');
  return WS.page({ kind: ui.ws.kind, title: s.title || 'Untitled set', brand, look, base, body, key, defs });
}
let wsTurn = 0;
async function wsPreview() {
  const turn = ++wsTurn, f = document.getElementById('ws-frame');
  if (!f || !ui.wsRes || ui.wsRes.empty) return;
  const html = await wsDoc();
  if (turn !== wsTurn || !document.body.contains(f)) return;
  f.onload = () => { try { f.style.height = (f.contentDocument.documentElement.scrollHeight + 4) + 'px'; } catch (e) {} };
  f.srcdoc = html;
}
function wsPrint() {
  const f = document.getElementById('ws-frame');
  if (!f || !f.contentWindow) return;
  const s = getSet(view.setId), was = document.title;
  document.title = `${s.title || 'Untitled set'} – ${WS.TEMPLATES[ui.ws.kind].name}`;
  try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => { document.title = was; }, 1000); }
}

/* ---------- view a set (read-only, with answers) ---------- */
function renderView() {
  const s = getSet(view.setId);
  if (!s) { view = { name: 'library', folder: 'mine' }; return renderLibrary(); }
  const own = mine(s), ok = s.questions.filter(validQ).length;
  const show = ui.showAnswers !== false;
  return `
  <div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>
  <div class="main-head"><div>
      <span class="qlabel">${own ? esc(folderName(s.folder_id)) : 'by ' + esc(ownerLabel(s))} · ${s.questions.length} ${s.questions.length === 1 ? 'question' : 'questions'}</span>
      <h1>${esc(s.title || 'Untitled set')}</h1>${tagsHTML(s)}
    </div>
    <div class="head-acts">
      ${ok ? `<a class="btn primary" href="host.html?set=${encodeURIComponent(s.id)}">Host live game</a>` : ''}
      <button class="btn" data-act="play" data-id="${s.id}" ${ok ? '' : 'disabled'}>▶ Play solo</button>
      ${own ? `<button class="btn" data-act="edit" data-id="${s.id}">Edit</button>` : `<button class="btn" data-act="dup" data-id="${s.id}">Copy to my sets</button>`}
      ${ok ? `<button class="btn" data-act="worksheet" data-id="${s.id}">🖨 Worksheets</button>` : ''}
      <button class="btn ghost" data-act="export" data-id="${s.id}">Export to Excel</button>
    </div></div>
  <div class="toolbar"><label class="tog-row"><input type="checkbox" id="show-answers" ${show ? 'checked' : ''}> Show answers</label></div>
  <ol class="view-list">${s.questions.map((q, i) => `<li class="view-q ${validQ(q) ? '' : 'warn'}">
      <span class="q-num">Q${i + 1}</span>
      <div class="view-body"><div class="pv-q">${q.image ? `<img class="q-thumb big" src="${esc(LB.safeSrc(q.image))}" alt="">` : ''}${esc(q.q) || (q.image ? '' : '<span class="hint">No question text</span>')}</div>
        <div class="view-ans">${q.answers.map((a, j) => String(a).trim() ? `<div class="va ${show && j === q.correct ? 'c' : ''}"><span class="tag t${j}">${j + 1}</span><span>${LB.ansHTML(a)}</span>${show && j === q.correct ? '<b class="tick">✓</b>' : ''}</div>` : '').join('')}</div></div>
    </li>`).join('')}</ol>`;
}

/* ---------- export a set in the import layout ---------- */
async function exportSet(s) {
  try { await window.APP.loadXLSX(); } catch (e) { return toast('Couldn’t load the spreadsheet tool. Check your connection and try again.', true); }
  const rows = [['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct #']];
  s.questions.filter(validQ).forEach(q => {
    const kept = q.answers.map((a, j) => [String(a), j]).filter(([a]) => a.trim());
    const ans = kept.map(k => k[0]); while (ans.length < 4) ans.push('');
    rows.push([q.q || q.image || '', ...ans, kept.findIndex(k => k[1] === q.correct) + 1]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, `${window.APP.name} - ${(s.title || 'Untitled set').replace(/[\\/:*?"<>|]/g, '')}.xlsx`);
}

/* ---------- editor ---------- */
function renderEditor() {
  const s = getSet(view.setId);
  if (!s || !mine(s)) { view = { name: 'library', folder: 'mine' }; return renderLibrary(); }
  const opts = `<option value="">Unfiled</option>` + folders.map(f => `<option value="${f.id}" ${s.folder_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const ok = s.questions.filter(validQ).length;
  return `
  <div class="toolbar"><button class="btn ghost small" data-act="back">← All sets</button></div>
  <div class="ed-top">
    <div class="field"><label for="set-title">Set name</label><input id="set-title" class="title-in" data-field="title" value="${esc(s.title)}" placeholder="Untitled set" maxlength="80"></div>
    <div class="ed-row">
      <div class="field"><label for="set-subject">Subject</label><select id="set-subject" data-field="subject">
        <option value="">${(() => { const d = THEME.detect(s); return d ? `${esc(THEME.label(d))} (worked out)` : 'Work it out'; })()}</option>
        ${THEME.list().map(k => `<option value="${k}" ${s.subject === k ? 'selected' : ''}>${esc(THEME.label(k))}</option>`).join('')}
        <option value="none" ${s.subject === 'none' ? 'selected' : ''}>None</option></select></div>
      <div class="field"><label for="set-folder">Folder</label><select id="set-folder" data-field="folder">${opts}</select></div>
      ${hasTags ? `<div class="field"><label for="set-tags">Tags</label><input id="set-tags" class="in" data-field="tags" value="${esc((s.tags || []).join(', '))}" placeholder="e.g. Year 7, fractions"></div>` : ''}
      <button class="btn" data-act="play" data-id="${s.id}" ${ok ? '' : 'disabled'}>▶ Play solo</button>
      ${ok ? `<a class="btn primary" href="host.html?set=${encodeURIComponent(s.id)}" data-act="host-link">Host live game</a>` : ''}
    </div>
  </div>
  <div class="toolbar">
    <button class="btn" data-act="toggle-import">${ui.importOpen ? 'Close import' : '⇩ Import questions'}</button>
    ${ok >= 2 ? (ui.confirmSwap
      ? `<span class="confirm">Turn every question round, so each right answer becomes the question? <button class="btn small primary" data-act="swap">Swap</button><button class="btn small ghost" data-act="no-swap">Cancel</button></span>`
      : `<button class="btn" data-act="ask-swap" title="Each right answer becomes the question, and each question becomes its answer">⇄ Swap questions and answers</button>`) : ''}
    ${ok ? `<button class="btn" data-act="worksheet" data-id="${s.id}" title="Print a match up, crossword, gap fill, word search, anagrams or multiple choice sheet">🖨 Worksheets</button>` : ''}
    <span class="sp"></span>
    <span class="hint">Maths: wrap it in dollar signs, e.g. <code>$\\frac{3}{4}$</code>, <code>$x^2$</code>, <code>$\\sqrt{50}$</code></span>
  </div>
  ${ui.importOpen ? renderImport() : ''}
  <div class="qs" id="qs">${s.questions.map((q, i) => renderQ(q, i, s.questions.length)).join('')}
    <button class="add-q" data-act="add-q">+ Add question</button>
  </div>`;
}
function renderQ(q, i, total) {
  const bad = !validQ(q), dup = hasDupes(q);
  const rows = q.answers.map((a, j) => `
    <div class="ans-row ${q.correct === j ? 'correct' : ''}">
      <label class="pick" for="c-${q.id}-${j}" title="Mark as correct answer"><input type="radio" id="c-${q.id}-${j}" name="cor-${q.id}" data-field="correct" data-i="${j}" ${q.correct === j ? 'checked' : ''}><span class="tag t${j}">${j + 1}</span></label>
      ${LB.isImg(a)
        ? `<div class="ans-pic">${LB.ansHTML(a)}<button class="btn ghost small" data-act="ans-pic-clear" data-i="${j}">Use words instead</button></div>`
        : `<div class="ans-in"><label class="sr" for="a-${q.id}-${j}">Answer ${j + 1}</label><input type="text" id="a-${q.id}-${j}" data-field="ans" data-i="${j}" value="${esc(a)}" placeholder="Answer ${j + 1}"><button class="btn ghost small pic-btn" data-act="ans-pic" data-i="${j}" title="Use a picture for answer ${j + 1}" aria-label="Use a picture for answer ${j + 1}">🖼</button></div>`}
      ${q.answers.length > 2 ? `<button class="btn ghost small" data-act="rm-ans" data-i="${j}" aria-label="Remove answer ${j + 1}">✕</button>` : '<span></span>'}
    </div>`).join('');
  return `<article class="q ${bad ? 'warn' : ''}" data-qid="${q.id}">
    <div class="q-edit">
      <div class="q-head"><span class="q-num">Q${i + 1}</span>${bad ? '<span class="q-warn">Needs a question (or a picture) and at least 2 answers</span>' : dup ? '<span class="q-warn">Two answers are the same: pupils will only see one</span>' : ''}<span class="sp"></span>
        <button class="btn ghost small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="btn ghost small" data-act="down" ${i === total - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="btn ghost small danger" data-act="rm-q" aria-label="Delete question">Delete</button></div>
      <label class="sr" for="qt-${q.id}">Question text</label>
      <textarea id="qt-${q.id}" data-field="q" rows="2" placeholder="${q.image ? 'Words to go with the picture (optional)' : 'Type the question'}">${esc(q.q)}</textarea>
      <div class="q-pic">${q.image ? `<img class="q-thumb big" src="${esc(LB.safeSrc(q.image))}" alt="Question picture"><button class="btn ghost small" data-act="q-pic-clear">Remove picture</button>` : `<button class="btn ghost small" data-act="q-pic">🖼 Add a picture</button>`}</div>
      ${rows}
      ${q.answers.length < 4 ? `<button class="btn ghost small" data-act="add-ans" style="align-self:flex-start">+ Add answer</button>` : ''}
    </div>
    <div class="q-prev">${previewHTML(q)}</div>
  </article>`;
}
function previewHTML(q) {
  return `<span class="lab">Pupil sees</span><div class="pv-q">${q.image ? `<img class="q-thumb big" src="${esc(LB.safeSrc(q.image))}" alt="">` : ''}${esc(q.q) || (q.image ? '' : '<span style="color:var(--muted)">Question text</span>')}</div>
    <div class="pv-ans">${q.answers.map((a, j) => `<div class="t${j} ${q.correct === j ? 'c' : ''}"><span>${LB.isImg(a) ? LB.ansHTML(a) : esc(a) || '…'}</span></div>`).join('')}</div>`;
}
function refreshQ(q) {
  const card = app.querySelector(`[data-qid="${q.id}"]`); if (!card) return;
  const pv = card.querySelector('.q-prev'); pv.innerHTML = previewHTML(q);
  clearTimeout(pv._t); pv._t = setTimeout(() => typeset(pv), 200);
  card.classList.toggle('warn', !validQ(q));
  const w = card.querySelector('.q-warn');
  const msg = !validQ(q) ? 'Needs a question and at least 2 answers' : hasDupes(q) ? 'Two answers are the same: pupils will only see one' : '';
  if (w && (!msg || w.textContent !== msg)) w.remove();
  if (msg && !card.querySelector('.q-warn')) card.querySelector('.q-num').insertAdjacentHTML('afterend', `<span class="q-warn">${msg}</span>`);
  card.querySelectorAll('.ans-row').forEach((r, j) => r.classList.toggle('correct', q.correct === j));
}

/* ---------- import ---------- */
const EXAMPLE_ROWS = [
  ['What is $\\frac{1}{2}$ of 18?', '9', '6', '36', '', '1'],
  ['$7 \\times 8 =$', '54', '56', '', '', '2'],
  ['Which is a prime number?', '21', '27', '29', '33', '3']
];
function renderImport() {
  const tab = ui.importTab || 'paste';
  const r = ui.importResult;
  return `<section class="import" aria-label="Import questions">
    <div class="tabs"><button class="${tab === 'paste' ? 'on' : ''}" data-act="imp-tab" data-tab="paste">Paste from Excel</button><button class="${tab === 'quizlet' ? 'on' : ''}" data-act="imp-tab" data-tab="quizlet">Paste from Quizlet</button><button class="${tab === 'file' ? 'on' : ''}" data-act="imp-tab" data-tab="file">Upload a file</button></div>
    ${tab === 'quizlet' ? `
      <p class="hint" style="margin:0">In Quizlet, open the set, choose <b>⋯ → Export</b>, leave the settings as they are (Tab between term and definition, New line between rows), click <b>Copy text</b> and paste it here. Each card becomes a question; the wrong answers come from other cards in the set.</p>
      <div class="ed-row">
        <div class="field"><label for="ql-dir">Questions show</label><select id="ql-dir">
          ${[['term', 'Term → pick the definition'], ['def', 'Swapped: definition → pick the term'], ['both', 'Both ways (two questions per card)']].map(([v, l]) => `<option value="${v}" ${(ui.qlDir || 'term') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
        <div class="field"><label for="ql-n">Answers per question</label><select id="ql-n">
          ${[4, 3, 2].map(n => `<option value="${n}" ${(ui.qlN || 4) === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select></div>
      </div>
      <label class="sr" for="import-quizlet">Pasted Quizlet set</label>
      <textarea id="import-quizlet" placeholder="puella&#9;girl&#10;rex&#9;king">${esc(ui.qlText || '')}</textarea>
      <div class="ed-row"><button class="btn primary" data-act="imp-quizlet">Check cards</button></div>`
    : tab === 'paste' ? `
      <p class="hint" style="margin:0">Copy rows from Excel and paste them here. One question per row: the question, then 2–4 answers, then the number of the correct answer.</p>
      <div class="fmt"><table><tr><th>Question</th><th>Answer 1</th><th>Answer 2</th><th>Answer 3</th><th>Answer 4</th><th>Correct #</th></tr>
        ${EXAMPLE_ROWS.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>
      <div class="ed-row"><button class="btn small ghost" data-act="copy-example">Copy these example rows</button><span class="hint" id="copy-msg"></span></div>
      <label class="sr" for="import-paste">Pasted rows</label>
      <textarea id="import-paste" placeholder="Paste your rows here">${esc(ui.importText || '')}</textarea>
      <div class="ed-row"><button class="btn primary" data-act="imp-check">Check rows</button></div>`
    : `
      <p class="hint" style="margin:0">Upload an .xlsx or .csv in the simple layout, or an untouched Blooket spreadsheet import template. It recognises the Blooket layout automatically.</p>
      <label class="sr" for="import-file">Spreadsheet file</label>
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv">`}
    ${r ? `<div class="result">
      <strong>${r.questions.length ? `Found ${r.questions.length} ${r.questions.length === 1 ? 'question' : 'questions'}${r.mode === 'blooket' ? ' (Blooket template)' : r.mode === 'quizlet' ? ` from ${r.cards} Quizlet cards` : ''}.` : 'No questions found.'}</strong>
      ${r.warnings.length ? `<ul>${r.warnings.slice(0, 12).map(w => `<li>${esc(w)}</li>`).join('')}${r.warnings.length > 12 ? `<li>…and ${r.warnings.length - 12} more</li>` : ''}</ul>` : ''}
      ${r.mode === 'quizlet' && r.questions.length ? `<div class="hint">First question: <b>${esc(LB.qText(r.questions[0]))}</b> with answers ${r.questions[0].answers.map((a, j) => j === r.questions[0].correct ? `<b>${LB.ansHTML(a)}</b> ✓` : LB.ansHTML(a)).join(', ')}</div>` : ''}
      ${r.questions.length ? `<div class="ed-row"><button class="btn primary small" data-act="imp-add">Add to the end of this set</button><button class="btn small" data-act="imp-replace">Replace all questions</button></div>` : ''}
    </div>` : ''}
  </section>`;
}
const cell = v => (v == null ? '' : String(v).trim());
function rowsToQuestions(rows) {
  const questions = [], warnings = [];
  rows = rows.map(r => (r || []).map(cell));
  const hIdx = rows.findIndex(r => r.some(c => /^question text$/i.test(c)));
  if (hIdx >= 0) {
    rows.slice(hIdx + 1).forEach((r, k) => {
      const rowNo = hIdx + k + 2, text = r[1] || '';
      if (!text) return;
      const pairs = [2, 3, 4, 5].map((c, pos) => [pos + 1, r[c] || '']).filter(p => p[1]);
      const nums = (r[7] || '').split(/[,;\s]+/).map(Number).filter(n => n >= 1 && n <= 4);
      if (pairs.length < 2) { warnings.push(`Row ${rowNo}: skipped, needs at least 2 answers.`); return; }
      const ci = pairs.findIndex(p => p[0] === nums[0]);
      if (ci < 0) { warnings.push(`Row ${rowNo}: skipped, the correct answer number is missing or points to a blank answer.`); return; }
      if (nums.length > 1) warnings.push(`Row ${rowNo}: listed several correct answers; kept answer ${nums[0]} only.`);
      questions.push(qIn(text, mkQ(text, pairs.map(p => ansIn(p[1])), ci)));
    });
    return { questions, warnings, mode: 'blooket' };
  }
  rows.forEach((r, k) => {
    const rowNo = k + 1;
    let last = r.length - 1; while (last >= 0 && !r[last]) last--;
    if (last < 0) return;
    const text = r[0], corr = r[last];
    if (!/^[1-4]$/.test(corr)) { if (k === 0) return; warnings.push(`Row ${rowNo}: skipped, the last cell should be the correct answer number (1–4).`); return; }
    const pairs = r.slice(1, last).map((a, pos) => [pos + 1, a]).filter(p => p[1]);
    if (!text) { warnings.push(`Row ${rowNo}: skipped, no question text.`); return; }
    if (pairs.length < 2) { warnings.push(`Row ${rowNo}: skipped, needs at least 2 answers.`); return; }
    if (pairs.length > 4) { warnings.push(`Row ${rowNo}: skipped, more than 4 answers.`); return; }
    const ci = pairs.findIndex(p => p[0] === Number(corr));
    if (ci < 0) { warnings.push(`Row ${rowNo}: skipped, correct answer ${corr} is blank.`); return; }
    const d = dedupeAnswers(pairs.map(p => ansIn(p[1])), ci);
    if (d.dropped) warnings.push(`Row ${rowNo}: the same answer appeared twice; the copy was removed.`);
    if (d.answers.length < 2) { warnings.push(`Row ${rowNo}: skipped, needs at least 2 different answers.`); return; }
    questions.push(qIn(text, mkQ(text, d.answers, d.correct)));
  });
  return { questions, warnings, mode: 'simple' };
}
/* Quizlet export: one card per line, term and definition separated by a tab (Quizlet's default).
   Also copes with the other separators Quizlet offers: comma, " - ", and ";" between cards. */
function parseQuizlet(text, dir, n) {
  const warnings = [];
  let lines = text.replace(/\r/g, '').split('\n');
  if (lines.filter(l => l.trim()).length === 1 && /;/.test(lines[0]) && !/\t/.test(lines[0])) lines = lines[0].split(';');
  const cards = [];
  lines.forEach((line, k) => {
    if (!line.trim()) return;
    let i = line.indexOf('\t'), w = 1;
    if (i < 0) { i = line.indexOf(' - '); w = 3; }
    if (i < 0) { i = line.indexOf(','); w = 1; }
    if (i < 0) { warnings.push(`Line ${k + 1}: skipped, no tab between the term and the definition.`); return; }
    const term = line.slice(0, i).trim(), def = line.slice(i + w).trim();
    if (!term || !def) { warnings.push(`Line ${k + 1}: skipped, the term or definition is blank.`); return; }
    cards.push({ term: ansIn(term), def: ansIn(def) });
  });
  if (cards.length < 2) return { questions: [], warnings: warnings.concat(['A Quizlet set needs at least 2 cards to make wrong answers from.']), mode: 'quizlet', cards: cards.length };
  // A form can belong to several cards (domini: genitive singular, nominative plural, vocative plural).
  // Cards that share a term (or a definition) become ONE question whose right answer lists every meaning,
  // and nothing that is also right can appear as a wrong answer.
  const key = x => x.trim().toLowerCase();
  const group = (from, to) => {
    const m = new Map();
    cards.forEach(c => { const k = key(c[from]); const g = m.get(k) || { show: c[from], all: [] }; if (!g.all.some(x => key(x) === key(c[to]))) g.all.push(c[to]); m.set(k, g); });
    return [...m.values()];
  };
  const make = (g, pool) => {
    const right = g.all.join(' / '), bad = new Set(g.all.map(key));
    const wrong = shuffle(pool.filter(x => !bad.has(key(x)) && key(x) !== key(right)).filter((x, i, a) => a.findIndex(y => key(y) === key(x)) === i)).slice(0, n - 1);
    const answers = shuffle([right, ...wrong]);
    return LB.isImg(g.show) ? Object.assign(mkQ('', answers, answers.indexOf(right)), { image: LB.imgOf(g.show) }) : mkQ(g.show, answers, answers.indexOf(right));
  };
  const questions = [], byTerm = group('term', 'def'), byDef = group('def', 'term');
  // Wrong answers for "show the term" are other definitions; a group's combined answer is offered whole
  const defPool = byDef.map(g => g.show), termPool = byTerm.map(g => g.show);
  if (dir !== 'def') byTerm.forEach(g => questions.push(make(g, defPool)));
  if (dir !== 'term') byDef.forEach(g => questions.push(make(g, termPool)));
  const merged = (dir !== 'def' ? byTerm : []).concat(dir !== 'term' ? byDef : []).filter(g => g.all.length > 1);
  if (merged.length) warnings.push(`${merged.length} ${merged.length === 1 ? 'card has' : 'cards have'} more than one right answer, so ${merged.length === 1 ? 'its answers are' : 'their answers are'} combined (e.g. ${merged[0].show}: ${merged[0].all.join(' / ')}). No wrong answer is ever another right one.`);
  const distinct = Math.min(defPool.length, termPool.length);
  if (distinct < n) warnings.push(`Only ${distinct} different answers, so some questions have fewer than ${n} answers.`);
  return { questions, warnings, mode: 'quizlet', cards: cards.length };
}
/* Swap questions and answers for a whole set. Each right answer becomes the question; the old question becomes
   its right answer; wrong answers come from the other questions. Questions that share a right answer are
   combined, as on Quizlet import, so no wrong answer is ever another right one. A picture question becomes a picture answer. */
function swapSet(set) {
  const cards = set.questions.filter(validQ).map(q => ({ term: q.image ? 'img:' + q.image : q.q.trim(), def: String(q.answers[q.correct]).trim(), n: q.answers.filter(a => String(a).trim()).length }));
  if (cards.length < 2) return { questions: [] };
  const n = Math.max(2, Math.min(4, Math.max(...cards.map(c => c.n))));
  const key = x => x.trim().toLowerCase();
  const m = new Map();
  cards.forEach(c => { const k = key(c.def); const g = m.get(k) || { show: c.def, all: [] }; if (!g.all.some(x => key(x) === key(c.term))) g.all.push(c.term); m.set(k, g); });
  const groups = [...m.values()], pool = groups.map(g => g.all.length === 1 ? g.all[0] : g.all.join(' / '));
  const questions = groups.map((g, gi) => {
    const right = pool[gi], bad = new Set(g.all.map(key));
    const wrong = shuffle(pool.filter((x, i) => i !== gi && !bad.has(key(x)))).slice(0, n - 1);
    const answers = shuffle([right, ...wrong]);
    const q = mkQ(LB.isImg(g.show) ? '' : g.show, answers, answers.indexOf(right));
    if (LB.isImg(g.show)) q.image = LB.imgOf(g.show);
    return q;
  });
  return { questions, merged: cards.length - groups.length };
}

/* Pictures: shrink on this laptop (longest side 640px), then store in Supabase Storage (bucket set-images) */
const IMG_BUCKET = 'set-images';
function pickPicture(set, q, where) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('That file is not a picture.', true);
    toast('Adding the picture…');
    try {
      const url = await uploadPicture(f);
      if (where === 'q') q.image = url; else q.answers[where] = 'img:' + url;
      queueSave(set); render();
    } catch (err) {
      console.error(err);
      toast(/bucket|not found|policy|row-level/i.test(String(err && err.message)) ? 'Pictures aren’t switched on yet: run supabase/pictures.sql in Supabase (see the README).' : 'Couldn’t add the picture. Check your connection and try again.', true);
    }
  };
  inp.click();
}
async function shrink(file, max = 640) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    if (/svg/.test(file.type) && file.size < 300000) return { blob: file, ext: 'svg', type: 'image/svg+xml' };
    const k = Math.min(1, max / Math.max(im.naturalWidth || max, im.naturalHeight || max));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((im.naturalWidth || max) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || max) * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.86));
    if (blob && blob.type === 'image/webp') return { blob, ext: 'webp', type: 'image/webp' };
    const png = await new Promise(ok => c.toBlob(ok, 'image/png'));
    return { blob: png, ext: 'png', type: 'image/png' };
  } finally { URL.revokeObjectURL(url); }
}
async function uploadPicture(file) {
  const { blob, ext, type } = await shrink(file);
  if (blob.size > 2_000_000) throw new Error('too big');
  const path = `${me.id}/${uid()}${uid()}.${ext}`;
  const { error } = await sb.storage.from(IMG_BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
}

/* Remove an answer that repeats another (ignoring case and spaces), keeping the right one */
function dedupeAnswers(answers, correct) {
  const k = x => String(x).trim().toLowerCase(), right = k(answers[correct]), seen = new Set([right]);
  const out = answers.filter((a, i) => i === correct || (k(a) && !seen.has(k(a)) && seen.add(k(a))));
  return { answers: out, correct: out.indexOf(answers[correct]), dropped: out.length < answers.filter(a => k(a)).length };
}
function parsePaste(text) {
  const unq = c => { const m = c.match(/^"([\s\S]*)"$/); return m ? m[1].replace(/""/g, '"') : c; };
  return rowsToQuestions(text.replace(/\r/g, '').split('\n').map(l => l.split('\t').map(unq)));
}

/* ---------- play (solo preview of the pupil screen) ---------- */
function startGame(setId) {
  const s = getSet(setId);
  const qs = s.questions.filter(validQ).map(q => { const d = dedupeAnswers(q.answers.filter((a, i) => i === q.correct || String(a).trim()), q.answers.filter((a, i) => i === q.correct || String(a).trim()).indexOf(q.answers[q.correct])); return { ...q, answers: d.answers, correct: d.correct }; });
  game = { set: s, qs, order: [], cur: null, phase: 'setup', runner: RUNNER.pick(THEME.subjectFor(s)), minutes: ui.lastMinutes ?? 10, score: 0, streak: 0, best: 0, answered: 0, correct: 0, stats: {}, endAt: null, last: null, lastGain: 0 };
  qs.forEach(q => (game.stats[q.id] = { seen: 0, right: 0, wrong: {} }));
  view = { ...view, name: 'play', setId };
  render();
  THEME.takeover(THEME.subjectFor(s), () => { if (view.name === 'play') render(); });
}
function nextQ() {
  if (!game.order.length) {
    game.order = shuffle(game.qs.map((_, i) => i));
    if (game.qs.length > 1 && game.order[0] === game.last) game.order.push(game.order.shift());
  }
  const i = game.order.shift(); game.last = i; game.cur = game.qs[i];
  game.phase = 'question'; game.pick = null;
  renderPlayBody();
}
function answer(j) {
  if (game.phase !== 'question' || !game.cur || j >= game.cur.answers.length) return;
  const q = game.cur, st = game.stats[q.id];
  game.pick = j; game.answered++; st.seen++;
  if (j === q.correct) {
    game.streak++; game.best = Math.max(game.best, game.streak); game.correct++; st.right++;
    game.lastGain = Math.round(BASE * multFor(game.streak)); game.score += game.lastGain;
  } else {
    game.lostStreak = game.streak; game.streak = 0; game.lastGain = 0;
    st.wrong[j] = (st.wrong[j] || 0) + 1;
    game.lockUntil = Date.now() + 2000;
    setTimeout(() => {
      if (game && game.phase === 'feedback') {
        const b = document.getElementById('go');
        if (b) { b.disabled = false; b.classList.remove('locking'); b.querySelector('.lbl').textContent = 'Next question'; b.focus(); }
      }
    }, 2000);
  }
  game.phase = 'feedback';
  renderPlayBody();
  if (j === q.correct) RUNNER.boost(); else RUNNER.trip();
}
function endGame() { if (!game) return; stopTimer(); game.phase = 'over'; renderPlayBody(); }
function stopTimer() { if (game && game.timer) { clearInterval(game.timer); game.timer = null; } }
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function tick() {
  if (!game || !game.endAt) return;
  const left = game.endAt - Date.now();
  const el = document.getElementById('hud-time'); if (el) el.textContent = fmtTime(left);
  if (left <= 0) endGame();
}
function hud() {
  const nextM = multFor(game.streak + 1), curM = multFor(Math.max(1, game.streak));
  const flames = [1, 3, 5, 8].map(t => `<i class="${game.streak >= t ? 'on' : ''}"></i>`).join('');
  return `<div class="hud">
    <div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${game.endAt ? fmtTime(game.endAt - Date.now()) : '∞'}</div></div>
    <div class="stat"><div class="k">Points</div><div class="v">${game.score.toLocaleString('en-GB')}</div></div>
    <div class="stat"><div class="k">Streak</div><div class="v">${game.streak}<span class="flames" aria-hidden="true">${flames}</span></div></div>
    <div class="stat mult"><div class="k">${game.phase === 'question' ? 'Next correct' : 'Multiplier'}</div><div class="v">${fmtMult(game.phase === 'question' ? nextM : curM)}</div></div>
    <button class="btn" data-act="end-game" style="height:auto">End game</button>
  </div>`;
}
function renderPlay() {
  return `<div class="play"><div class="toolbar"><button class="btn ghost small" data-act="leave-play">← Back</button><span class="sp"></span><span class="chip">Pupil view preview</span></div><div id="play-body">${playBodyHTML()}</div></div>`;
}
function renderPlayBody() {
  const b = document.getElementById('play-body'); if (!b) return;
  b.innerHTML = playBodyHTML(); typeset(b);
  if (game && ['ready', 'question', 'feedback'].includes(game.phase)) RUNNER.show(THEME.current, game.runner); else RUNNER.hide();
  const f = b.querySelector('[data-autofocus]'); if (f) f.focus();
}
function answersHTML(q, done) {
  return `<div class="answers ${LB.hasImgAnswers(q) ? 'pics' : ''}">${q.answers.map((a, j) => {
    let cls = `ans a${j}`;
    if (done) cls += j === q.correct ? ' right' : j === game.pick ? ' wrong' : ' dim';
    return `<button class="${cls}" data-act="answer" data-i="${j}" ${done ? 'disabled' : ''}><span class="key">${THEME.keyLabel(j)}</span><span>${LB.ansHTML(a)}</span></button>`;
  }).join('')}</div>`;
}
function playBodyHTML() {
  const g = game;
  if (g.phase === 'setup') {
    return `<div class="stage center pop"><div class="setup">
      <span class="qlabel">${esc(g.set.title || 'Untitled set')} · ${g.qs.length} questions, shuffled and repeated</span>
      <h1 style="font-size:clamp(30px,5vw,44px)">Ready to play?</h1>
      <p class="hint" style="max-width:52ch;margin:0">Every correct answer scores ${BASE} points, multiplied by your streak. A wrong answer resets the streak and pauses you for 2 seconds.</p>
      <div class="tiers">${TIERS.map(t => `<div class="tier"><b>${fmtMult(t.m)}</b><span>${t.label}</span></div>`).join('')}</div>
      <div class="ed-row" style="justify-content:center">
        <div class="field"><label for="game-length">Game length</label><select id="game-length">${[3, 5, 10, 15, 20, 0].map(m => `<option value="${m}" ${g.minutes === m ? 'selected' : ''}>${m ? m + ' minutes' : 'No time limit'}</option>`).join('')}</select></div>
        <button class="btn primary big-go" data-act="begin" data-autofocus>Start</button>
      </div></div></div>`;
  }
  if (g.phase === 'ready') {
    return hud() + `<div class="stage center pop"><span class="qlabel">Question ${g.answered + 1}</span><button class="btn primary big-go" data-act="show-q" data-autofocus>Show question</button><span class="hint">or press Enter</span></div>`;
  }
  if (g.phase === 'question') {
    return hud() + `<div class="stage pop"><span class="qlabel">Question ${g.answered + 1}</span>${LB.qHTML(g.cur)}${answersHTML(g.cur, false)}<span class="hint">Click an answer, or press 1–${g.cur.answers.length}</span></div>`;
  }
  if (g.phase === 'feedback') {
    const right = g.pick === g.cur.correct;
    const locked = !right && Date.now() < g.lockUntil;
    const verdict = right
      ? `<div class="verdict good pop"><div><h3>Correct! +${g.lastGain}</h3><p>Streak ${g.streak} · ${fmtMult(multFor(g.streak))}</p></div>`
      : `<div class="verdict bad pop"><div><h3>Not quite</h3><p>The answer is highlighted.${g.lostStreak > 1 ? ` Streak of ${g.lostStreak} lost.` : ''}</p></div>`;
    return hud() + `<div class="stage"><span class="qlabel">Question ${g.answered}</span>${LB.qHTML(g.cur)}${answersHTML(g.cur, true)}
      ${verdict}<button class="btn primary go ${locked ? 'locking' : ''}" id="go" data-act="next" ${locked ? 'disabled' : 'data-autofocus'}><span class="lbl">${locked ? 'Wait a moment…' : 'Next question'}</span><span class="bar"></span></button></div></div>`;
  }
  if (g.phase === 'over') {
    const acc = g.answered ? Math.round(100 * g.correct / g.answered) : 0;
    const rows = g.qs.map(q => {
      const st = g.stats[q.id], pct = st.seen ? Math.round(100 * st.right / st.seen) : null;
      const topWrong = Object.entries(st.wrong).sort((a, b) => b[1] - a[1])[0];
      return `<tr><td>${q.image ? `<img class="q-thumb" src="${esc(LB.safeSrc(q.image))}" alt="">` : ''}${esc(q.q)}</td><td class="num">${st.seen}</td><td class="num">${pct == null ? '–' : pct + '%'}</td><td>${pct == null ? '' : `<div class="meter"><i style="width:${pct}%"></i></div>`}</td><td>${topWrong ? LB.ansHTML(q.answers[topWrong[0]]) : '<span style="color:var(--muted)">–</span>'}</td></tr>`;
    }).join('');
    return `<div class="stage pop">
      <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap"><div><span class="qlabel">Game over · ${esc(g.set.title || 'Untitled set')}</span><div class="hero-n">${g.score.toLocaleString('en-GB')}</div><span class="hint">points</span></div>
        <div class="ed-row"><button class="btn primary" data-act="again">Play again</button><button class="btn" data-act="leave-play">Back</button></div></div>
      <div class="summary">
        <div class="stat"><div class="k">Answered</div><div class="v">${g.answered}</div></div>
        <div class="stat"><div class="k">Correct</div><div class="v">${g.correct}</div></div>
        <div class="stat"><div class="k">Accuracy</div><div class="v">${acc}%</div></div>
        <div class="stat"><div class="k">Best streak</div><div class="v">${g.best}</div></div>
      </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Question</th><th>Seen</th><th>Correct</th><th></th><th>Most common wrong answer</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }
  return '';
}

/* ---------- database actions ---------- */
async function createFolder(name) {
  const { data, error } = await sb.from('folders').insert({ name }).select('id,name,created_at').single();
  if (error) return fail('Couldn’t create the folder', error);
  folders.push(data); folders.sort((a, b) => a.name.localeCompare(b.name));
  view.folder = data.id; ui = {}; render();
}
async function renameFolder(id, name) {
  const { error } = await sb.from('folders').update({ name }).eq('id', id);
  if (error) return fail('Couldn’t rename the folder', error);
  folders.find(f => f.id === id).name = name; ui = {}; render();
}
async function deleteFolder(id) {
  const { error } = await sb.from('folders').delete().eq('id', id);
  if (error) return fail('Couldn’t delete the folder', error);
  folders = folders.filter(f => f.id !== id);
  sets.forEach(s => { if (s.folder_id === id) s.folder_id = null; });
  view.folder = 'mine'; ui = {}; render();
}
async function insertSet(row) {
  if (!hasTags) delete row.tags;
  let { data, error } = await sb.from('sets').insert(row).select('*').single();
  if (noTagsColumn(error)) { hasTags = false; delete row.tags; ({ data, error } = await sb.from('sets').insert(row).select('*').single()); }
  if (error) { fail('Couldn’t save the new set', error); return null; }
  data.tags = Array.isArray(data.tags) ? data.tags : [];
  sets.unshift(data);
  return data;
}
async function deleteSet(id) {
  clearTimeout(pending.get(id)); pending.delete(id);
  const { error } = await sb.from('sets').delete().eq('id', id);
  if (error) return fail('Couldn’t delete the set', error);
  sets = sets.filter(s => s.id !== id); ui = {}; render();
}

/* ---------- events ---------- */
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const act = t.dataset.act, id = t.dataset.id;
  const set = view.setId ? getSet(view.setId) : null;
  const card = t.closest('[data-qid]');
  const q = card && set ? set.questions.find(x => x.id === card.dataset.qid) : null;
  switch (act) {
    case 'help': if (TOURS[view.name]) LB.tour.start(TOURS[view.name]()); break;
    case 'host-link': e.preventDefault(); await flushAll(); location.href = t.href; break;
    case 'sign-out': await flushAll(); await sb.auth.signOut(); break;
    case 'forgot': renderForgot(); break;
    case 'to-signin': renderSignIn(); break;
    case 'account': await flushAll(); view = { name: 'account' }; ui = {}; render(); break;
    case 'admin': await flushAll(); view = { name: 'admin' }; ui = {}; loadTeachers(); break;
    case 'admin-cancel': ui.removing = null; render(); break;
    case 'admin-ask-remove': ui.removing = t.dataset.id; render(); break;
    case 'admin-remove': {
      t.disabled = true;
      const r = await adminCall({ action: 'remove', id: t.dataset.id });
      ui.removing = null;
      if (r.error) { ui.adminErr = r.error; render(); } else { ui.adminNote = 'Teacher removed.'; loadTeachers(); }
      break;
    }
    case 'admin-pw': {
      const pw = tempPassword();
      t.disabled = true;
      const r = await adminCall({ action: 'set_password', id: t.dataset.id, password: pw });
      if (r.error) { ui.adminErr = r.error; ui.adminNote = ''; }
      else { ui.adminErr = ''; ui.adminNote = `New password for <b>${esc(t.dataset.email)}</b>: <code class="mono">${esc(pw)}</code>. Pass it on; they can change it under Password.`; }
      render(); break;
    }
    case 'folder': view.folder = id; ui = {}; render(); break;
    case 'new-folder': ui = { newFolder: true }; render(); break;
    case 'rename-folder': ui = { renaming: view.folder }; render(); break;
    case 'ask-del-folder': ui = { confirmFolder: view.folder }; render(); break;
    case 'del-folder': t.disabled = true; await deleteFolder(view.folder); break;
    case 'cancel': ui = { search: ui.search }; render(); break;
    case 'new-set': {
      t.disabled = true;
      const fid = !['mine', 'unfiled', 'school'].includes(view.folder) ? view.folder : null;
      let subject = null; try { subject = localStorage.getItem(cfg.storagePrefix + '.lastSubject') || null; } catch (err) {}
      const s = await insertSet({ title: '', folder_id: fid, questions: [mkQ()], subject: THEME.def(subject) || subject === 'none' ? subject : null });
      t.disabled = false;
      if (!s) return;
      view = { name: 'edit', setId: s.id, folder: view.folder }; ui = {}; render();
      const el = document.getElementById('set-title'); if (el) el.focus();
      break;
    }
    case 'edit': view = { name: 'edit', setId: id, folder: view.folder }; ui = {}; render(); break;
    case 'view': view = { name: 'view', setId: id, folder: view.folder }; ui = { search: ui.search }; render(); window.scrollTo(0, 0); break;
    case 'export': exportSet(getSet(id)); break;
    case 'worksheet': await flushAll(); view = { name: 'worksheet', setId: id, from: view.name, folder: view.folder }; ui = { ws: { kind: 'match', count: '', dir: wsDir(getSet(id)), key: true, bank: true, backwards: false, seed: wsSeed() } }; render(); break;
    case 'ws-back': view = { name: view.from || 'library', setId: view.setId, folder: view.folder || 'mine' }; ui = {}; render(); break;
    case 'ws-kind': ui.ws.kind = t.dataset.kind; ui.ws.count = ''; render(); break;
    case 'ws-seed': ui.ws.seed = wsSeed(); render(); break;
    case 'ws-print': wsPrint(); break;
    case 'tag': {
      const vs = view.name === 'view' ? getSet(view.setId) : null;
      const folder = vs ? (mine(vs) ? 'mine' : 'school') : (view.folder === 'school' ? 'school' : 'mine');
      view = { name: 'library', folder }; ui = { search: t.dataset.tag }; render(); break;
    }
    case 'clear-search': ui = {}; render(); break;
    case 'dup': {
      t.disabled = true;
      const s = getSet(id);
      const copy = await insertSet({
        title: mine(s) ? (s.title || 'Untitled set') + ' (copy)' : (s.title || 'Untitled set'),
        folder_id: mine(s) ? s.folder_id : null,
        questions: s.questions.map(x => ({ ...x, id: uid(), answers: [...x.answers] })),
        tags: [...(s.tags || [])], subject: s.subject || null
      });
      if (copy) { toast(mine(s) ? 'Duplicated' : 'Copied to My sets'); render(); }
      else t.disabled = false;
      break;
    }
    case 'ask-del-set': ui = { confirmSet: id, search: ui.search }; render(); break;
    case 'del-set': t.disabled = true; await deleteSet(id); break;
    case 'play': {
      const back = { ...view };
      ui = { lastMinutes: ui.lastMinutes, search: ui.search };
      startGame(id); view.returnTo = back;
      break;
    }
    case 'back': view = { name: 'library', folder: view.folder || 'mine' }; ui = { search: ui.search }; render(); break;
    case 'assignments': await flushAll(); view = { name: 'assignments', folder: view.folder }; ui = {}; render(); break;
    case 'assignment': view = { name: 'assignment', id, folder: view.folder }; ui = {}; loadResults(); break;
    case 'assign-new': await flushAll(); view = { name: 'assign-new', setId: t.dataset.id || null, folderId: t.dataset.folder || null, folder: view.folder }; ui = {}; render(); break;
    case 'refresh-results': loadResults(); break;
    case 'pupil-row': ui.openPupil = ui.openPupil === t.dataset.name ? null : t.dataset.name; render(); break;
    case 'asg-csv': assignmentCSV(assignments.find(x => x.id === view.id)); break;
    case 'print-card': printCard(assignments.find(x => x.id === id), false); break;
    case 'print-slips': printCard(assignments.find(x => x.id === id), true); break;
    case 'toggle-open': {
      const a = assignments.find(x => x.id === id); t.disabled = true;
      const { error } = await sb.from('assignments').update({ open: !a.open }).eq('id', id);
      if (error) fail('Couldn’t change the code', error); else { a.open = !a.open; toast(a.open ? 'Reopened' : 'Closed. Pupils can’t open it now.'); }
      render(); break;
    }
    case 'ask-del-asg': ui.confirmAsg = true; render(); break;
    case 'cancel-asg': ui.confirmAsg = false; render(); break;
    case 'del-asg': {
      t.disabled = true;
      const { error } = await sb.from('assignments').delete().eq('id', id);
      if (error) { fail('Couldn’t delete it', error); break; }
      assignments = assignments.filter(x => x.id !== id); view = { name: 'assignments' }; ui = {}; render(); toast('Deleted'); break;
    }
    case 'add-q':
      set.questions.push(mkQ()); queueSave(set); render();
      { const qs = app.querySelectorAll('.q textarea'), last = qs[qs.length - 1]; if (last) { last.focus(); last.scrollIntoView({ block: 'center' }); } }
      break;
    case 'rm-q': set.questions = set.questions.filter(x => x !== q); queueSave(set); render(); break;
    case 'up': case 'down': {
      const i = set.questions.indexOf(q), j = act === 'up' ? i - 1 : i + 1;
      [set.questions[i], set.questions[j]] = [set.questions[j], set.questions[i]];
      queueSave(set); render(); break;
    }
    case 'add-ans':
      q.answers.push(''); queueSave(set); render();
      { const el = document.getElementById(`a-${q.id}-${q.answers.length - 1}`); if (el) el.focus(); }
      break;
    case 'ask-swap': ui.confirmSwap = true; render(); break;
    case 'no-swap': ui.confirmSwap = false; render(); break;
    case 'swap': {
      ui.confirmSwap = false;
      const r = swapSet(set);
      if (!r.questions.length) { toast('Nothing to swap: the set needs at least 2 finished questions.', true); render(); break; }
      set.questions = r.questions; queueSave(set); render();
      toast(`Swapped: ${r.questions.length} ${r.questions.length === 1 ? 'question' : 'questions'}${r.merged ? `. ${r.merged} shared a right answer, so their questions are now one answer` : ''}`);
      break;
    }
    case 'q-pic': case 'ans-pic': pickPicture(set, q, act === 'q-pic' ? 'q' : +t.dataset.i); break;
    case 'q-pic-clear': delete q.image; queueSave(set); render(); break;
    case 'ans-pic-clear': q.answers[+t.dataset.i] = ''; queueSave(set); render(); { const el = document.getElementById(`a-${q.id}-${t.dataset.i}`); if (el) el.focus(); } break;
    case 'rm-ans': {
      const j = +t.dataset.i; q.answers.splice(j, 1);
      if (q.correct === j) q.correct = 0; else if (q.correct > j) q.correct--;
      queueSave(set); render(); break;
    }
    case 'toggle-import': if (!ui.importOpen) window.APP.loadXLSX().catch(() => {}); ui.importOpen = !ui.importOpen; ui.importResult = null; render(); break;
    case 'imp-tab': ui.importTab = t.dataset.tab; ui.importResult = null; render(); break;
    case 'copy-example': {
      const txt = EXAMPLE_ROWS.map(r => r.join('\t')).join('\n'), msg = document.getElementById('copy-msg');
      const fallback = () => { const ta = document.getElementById('import-paste'); ta.value = txt; ta.select(); ui.importText = txt; if (msg) msg.textContent = 'Copying is blocked here, so the rows are in the box below instead.'; };
      try { navigator.clipboard.writeText(txt).then(() => { if (msg) msg.textContent = 'Copied. Paste into Excel to start your own.'; }, fallback); } catch (err) { fallback(); }
      break;
    }
    case 'imp-quizlet':
      ui.qlText = document.getElementById('import-quizlet').value;
      ui.qlDir = document.getElementById('ql-dir').value; ui.qlN = +document.getElementById('ql-n').value;
      ui.importResult = parseQuizlet(ui.qlText, ui.qlDir, ui.qlN); render(); break;
    case 'imp-check': ui.importText = document.getElementById('import-paste').value; ui.importResult = parsePaste(ui.importText); render(); break;
    case 'imp-add': case 'imp-replace': {
      const blankOnly = set.questions.length === 1 && !set.questions[0].q.trim() && !set.questions[0].answers.some(a => a.trim());
      set.questions = act === 'imp-replace' || blankOnly ? ui.importResult.questions : set.questions.concat(ui.importResult.questions);
      const n = ui.importResult.questions.length;
      ui = {}; queueSave(set); render();
      { const d = !set.subject && THEME.detect(set); toast(`Added ${n} ${n === 1 ? 'question' : 'questions'}${d ? `. Subject worked out: ${THEME.label(d)}` : ''}`); }
      break;
    }
    case 'begin': {
      game.minutes = +document.getElementById('game-length').value; ui.lastMinutes = game.minutes;
      game.endAt = game.minutes ? Date.now() + game.minutes * 60000 : null;
      game.timer = setInterval(tick, 250); game.phase = 'ready'; renderPlayBody(); break;
    }
    case 'show-q': nextQ(); break;
    case 'answer': answer(+t.dataset.i); break;
    case 'next': if (Date.now() >= (game.lockUntil || 0)) nextQ(); break;
    case 'end-game': endGame(); break;
    case 'again': { const back = view.returnTo; startGame(game.set.id); view.returnTo = back; break; }
    case 'leave-play': stopTimer(); game = null; RUNNER.hide(); view = view.returnTo || { name: 'library', folder: 'mine' }; delete view.returnTo; ui = { search: ui.search }; render(); THEME.takeover(null, render); break;
  }
});

app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'signin') return onSignIn(e);
  if (e.target.id === 'forgot') return onForgot(e);
  if (e.target.id === 'pw-form') return onPassword(e);
  if (e.target.id === 'add-teacher') return onAddTeacher(e);
  if (e.target.id === 'assign-form') return createAssignment();
  const form = e.target.dataset.form;
  if (form === 'new-folder') {
    const name = document.getElementById('new-folder-name').value.trim();
    if (name) createFolder(name); else { ui = {}; render(); }
  }
  if (form === 'rename-folder') {
    const name = document.getElementById('rename-folder').value.trim();
    if (name) renameFolder(view.folder, name); else { ui = {}; render(); }
  }
});

app.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') {
    ui.search = t.value;
    const grid = document.getElementById('set-grid'), list = setsFor(view.folder);
    if (grid && list.length) { grid.innerHTML = list.map(cardHTML).join(''); typeset(grid); }
    else { const pos = t.selectionStart; render(); const s = document.getElementById('search'); s.focus(); s.setSelectionRange(pos, pos); }
    return;
  }
  const field = t.dataset.field;
  if (view.name !== 'edit' || !field) return;
  const set = getSet(view.setId);
  if (field === 'title') { set.title = t.value; queueSave(set); return; }
  if (field === 'tags') {
    const seen = new Set();
    set.tags = t.value.split(',').map(x => x.trim().replace(/^#/, '')).filter(x => x && x.length <= 30 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 12);
    queueSave(set); return;
  }
  const card = t.closest('[data-qid]'); if (!card) return;
  const q = set.questions.find(x => x.id === card.dataset.qid);
  if (field === 'q') q.q = t.value;
  if (field === 'ans') {
    q.answers[+t.dataset.i] = t.value;
    if (LB.isImg(ansIn(t.value))) { q.answers[+t.dataset.i] = ansIn(t.value); queueSave(set); render(); return; }   // pasted an image address
  }
  queueSave(set); refreshQ(q);
});

app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ws && ui.ws) { ui.ws[t.dataset.ws] = t.type === 'checkbox' ? t.checked : t.value; render(); return; }
  if (t.id === 'import-file' && t.files[0]) {
    const file = t.files[0];
    window.APP.loadXLSX().then(() => readSheet(file), () => toast('Couldn’t load the spreadsheet tool. Check your connection and try again.', true));
    return;
  }
  function readSheet(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
        ui.importResult = rowsToQuestions(rows);
      } catch (err) {
        ui.importResult = { questions: [], warnings: ['That file could not be read. Save it as .xlsx or .csv and try again.'] };
      }
      render();
    };
    reader.readAsArrayBuffer(file);
  }
  if (t.id === 'show-answers') { ui.showAnswers = t.checked; render(); return; }
  if (view.name !== 'edit') return;
  const set = getSet(view.setId), field = t.dataset.field;
  if (field === 'folder') { set.folder_id = t.value || null; queueSave(set); }
  if (field === 'subject') { set.subject = t.value || null; try { localStorage.setItem(cfg.storagePrefix + '.lastSubject', set.subject || ''); } catch (err) {} queueSave(set); }
  if (field === 'correct') {
    const q = set.questions.find(x => x.id === t.closest('[data-qid]').dataset.qid);
    q.correct = +t.dataset.i; queueSave(set); refreshQ(q);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !LB.tour.open() && TOURS[view.name]) { e.preventDefault(); LB.tour.start(TOURS[view.name]()); return; }
  if (view.name !== 'play' || !game) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (game.phase === 'question' && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && (game.phase === 'ready' || game.phase === 'feedback')) {
    if (tag === 'BUTTON') return; // the focused button handles it
    e.preventDefault();
    if (game.phase === 'ready' || Date.now() >= (game.lockUntil || 0)) nextQ();
  }
});

async function onAddTeacher(e) {
  const email = document.getElementById('new-email').value.trim(), pw = document.getElementById('new-pw').value;
  const btn = document.getElementById('add-btn'); btn.disabled = true; btn.textContent = 'Adding…';
  const r = await adminCall({ action: 'create', email, password: pw });
  if (r.error) { ui.adminErr = r.error; ui.adminNote = ''; render(); return; }
  ui.adminErr = ''; ui.adminNote = `Added <b>${esc(email)}</b> with starting password <code class="mono">${esc(pw)}</code>. Send them both, plus the link ${esc(location.origin)}.`;
  ui.newPw = tempPassword(); loadTeachers();
}

/* ---------- boot ---------- */
let booted = false;
sb.auth.onAuthStateChange((event, session) => {
  const user = session && session.user;
  if (user && (event === 'PASSWORD_RECOVERY' || cameForReset) && view.name !== 'account') {
    me = user; ui = {}; view = { name: 'account', recovery: true };
    setTimeout(() => { loadLibrary().then(() => { view = { name: 'account', recovery: true }; render(); }); }, 0);
  } else if (user && (!me || me.id !== user.id)) {
    me = user; view = { name: 'library', folder: 'mine' }; ui = {};
    setTimeout(loadLibrary, 0); // run outside the auth callback
  } else if (!user) {
    me = null; folders = []; sets = []; game = null;
    renderSignIn(booted && event === 'SIGNED_OUT' ? 'You’ve signed out.' : '');
  }
  booted = true;
});
})();
