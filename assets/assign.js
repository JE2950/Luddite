/* Assignment mode, pupil side: play a set (or choose from a revision folder) on your own, at your own pace.
   No account: the pupil types the code, his first name and surname initial. Each play is saved online
   (that name, the score and each answer) so the teacher can see progress, and so the pupil sees his best
   and the questions he keeps getting wrong. Marking happens here in the browser. */
(function () {
'use strict';
if (!window.APP.configured) return;

const { esc, fmtTime, multFor, fmtMult, typeset, shuffle } = LB;
const sb = LB.client();
const app = document.getElementById('app');
const ME = window.APP.storagePrefix + '.me';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const isCode = c => /^[A-HJ-NP-Z2-9]{5}$/.test(String(c || '').toUpperCase().trim());

let A = null;        // { code, title, mode, minutes, due_at, kind, sets }
let V = { screen: 'loading' };
let me = store.get(ME) || { first: '', initial: '' };
let history = [];    // this pupil's past plays on this code
let G = null;        // the current play
let tickT = null, saveT = null;

const pupilName = () => `${me.first} ${me.initial}`;
const validQ = q => q && String(q.q || '').trim() && (q.answers || []).filter(a => String(a).trim()).length >= 2 && String((q.answers || [])[q.correct] ?? '').trim();
const cleanSet = s => ({ ...s, questions: (s.questions || []).filter(validQ).map(q => {
  const kept = q.answers.map((a, j) => [String(a), j]).filter(([a]) => a.trim());
  return { id: q.id, q: q.q, answers: kept.map(k => k[0]), correct: kept.findIndex(k => k[1] === q.correct) };
}) });
const fishing = () => A && A.mode === 'fishing';
const modes = () => THEME.modes();

/* ---------- start ---------- */
async function start(code, typedName) {
  code = String(code).toUpperCase().trim();
  V = { screen: 'loading' }; render();
  const { data, error } = await sb.rpc('pupil_open', { p_code: code });
  if (error || !data) {
    V = { screen: 'missing', code, msg: error ? 'Couldn’t reach Ludus. Check the internet connection and try again.' : `No open assignment has the code ${code}. Check the code on the sheet or the board.` };
    return render();
  }
  A = { code, ...data, sets: (data.sets || []).map(cleanSet).filter(s => s.questions.length) };
  // The code's subject: the one all its sets share (a mixed revision folder keeps the Ludgrove look)
  const subs = [...new Set(A.sets.map(s => THEME.subjectFor(s)))];
  A.subject = subs.length === 1 ? subs[0] : null;
  if (typedName && !me.first) { const parts = String(typedName).trim().split(/\s+/); me.first = parts[0] || ''; if (parts[1]) me.initial = parts[1][0].toUpperCase(); }
  V = { screen: 'name' };
  THEME.takeover(A.subject, render);   // the sign-in screen already wears the subject's look
}
async function loadHistory() {
  const { data } = await sb.rpc('pupil_history', { p_code: A.code, p_pupil: pupilName() });
  history = Array.isArray(data) ? data : [];
}

/* What this pupil has done on a set: plays, best, and the questions he got wrong more often than right */
function statsFor(set) {
  const plays = history.filter(h => h.set_id === set.id);
  const per = new Map();
  plays.forEach(p => (p.log || []).forEach(e => { const r = per.get(e.qid) || { right: 0, wrong: 0 }; if (e.right) r.right++; else r.wrong++; per.set(e.qid, r); }));
  const weak = set.questions.filter(q => { const r = per.get(q.id); return r && r.wrong > 0 && r.wrong >= r.right; });
  const answered = plays.reduce((n, p) => n + (p.answered || 0), 0), correct = plays.reduce((n, p) => n + (p.correct || 0), 0);
  const best = plays.reduce((m, p) => Math.max(m, Number(p.score) || 0), 0);
  return { plays: plays.length, best, answered, acc: answered ? Math.round(100 * correct / answered) : null, weak, per };
}

/* ---------- play ---------- */
function begin(set) {
  const st = statsFor(set);
  G = {
    set, id: crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)),
    token: LB.rid(24), score: 0, kg: 0, streak: 0, best: 0, answered: 0, correct: 0, log: [], deck: [], last: null,
    weakIds: new Set(st.weak.map(q => q.id)), endAt: A.minutes ? Date.now() + A.minutes * 60000 : null, lockUntil: 0, phase: 'ready', biggest: null
  };
  V = { screen: 'play' }; render(); startTick(); save(false);
}
function deal() {
  if (!G.deck.length) {
    // Questions he has struggled with before come round twice as often
    const ids = G.set.questions.map(q => q.id);
    G.deck = shuffle(ids.concat(ids.filter(id => G.weakIds.has(id))));
    if (G.deck.length > 1 && G.deck[0] === G.last) G.deck.push(G.deck.shift());
  }
  const id = G.deck.shift(); G.last = id;
  const q = G.set.questions.find(x => x.id === id);
  const perm = shuffle(q.answers.map((_, i) => i));
  G.cur = { q, perm }; G.phase = 'question'; G.pick = null;
}
function answer(shown) {
  if (G.phase !== 'question') return;
  const { q, perm } = G.cur;
  if (!(shown >= 0 && shown < perm.length)) return;
  const choice = perm[shown], right = choice === q.correct;
  G.pick = shown; G.answered++;
  G.log.push({ qid: q.id, choice, right });
  G.fish = null; G.gain = 0;
  if (right) {
    G.streak++; G.best = Math.max(G.best, G.streak); G.correct++;
    if (fishing()) {
      const f = LB.rollFish(LB.lureFor(G.streak), THEME.current);
      G.kg = Math.round((G.kg + f.kg) * 10) / 10; G.fish = f;
      if (!G.biggest || f.kg > G.biggest.kg) G.biggest = f;
    } else { G.gain = Math.round(LB.BASE * multFor(G.streak)); G.score += G.gain; }
    G.weakIds.delete(q.id);
  } else {
    G.lost = G.streak; G.streak = 0; G.lockUntil = Date.now() + LB.WRONG_LOCK_MS;
    setTimeout(() => { if (V.screen === 'play' && G && G.phase === 'feedback') render(); }, LB.WRONG_LOCK_MS + 20);
  }
  G.phase = 'feedback'; render();
  if (G.answered % 5 === 0) save(false);
}
function next() {
  if (!G || Date.now() < G.lockUntil) return;
  deal(); render();
}
function finish() {
  if (!G || G.phase === 'over') return;
  stopTick(); G.phase = 'over'; save(true);
  history.push({ set_id: G.set.id, score: fishing() ? G.kg : G.score, answered: G.answered, correct: G.correct, best_streak: G.best, log: G.log });
  V = { screen: 'over' }; render();
}
function save(finished) {
  if (!G || !G.answered && finished) return;
  clearTimeout(saveT);
  const attempt = { id: G.id, token: G.token, pupil: pupilName(), set_id: G.set.id, score: fishing() ? G.kg : G.score,
    answered: G.answered, correct: G.correct, best_streak: G.best, log: G.log, finished: !!finished };
  const go = (tries) => sb.rpc('pupil_save', { p_code: A.code, p_attempt: attempt }).then(({ data, error }) => {
    if ((error || data === false) && tries > 0) saveT = setTimeout(() => go(tries - 1), 3000);
    if (finished) { V.saved = !(error || data === false); if (V.screen === 'over') { const el = document.getElementById('saved-note'); if (el) el.textContent = V.saved ? 'Saved. Your teacher can see this.' : 'Couldn’t save this play. Check the internet connection.'; } }
  }, () => { if (tries > 0) saveT = setTimeout(() => go(tries - 1), 3000); });
  go(3);
}
function startTick() {
  stopTick();
  tickT = setInterval(() => {
    if (!G || !G.endAt) return;
    const left = G.endAt - Date.now(), el = document.getElementById('hud-time');
    if (el) el.textContent = fmtTime(left);
    if (left <= 0) finish();
  }, 250);
}
function stopTick() { clearInterval(tickT); tickT = null; }

/* ---------- screens ---------- */
const card = inner => `<div class="gate"><div class="gate-card">${LB.mark}${inner}</div></div>`;
const dueLine = () => A.due_at ? `<p class="hint" style="margin:0">Due ${esc(new Date(A.due_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>` : '';
function hud() {
  const time = `<div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${G.endAt ? fmtTime(G.endAt - Date.now()) : '∞'}</div></div>`;
  const end = `<button class="btn" data-a="finish" style="height:auto">Finish</button>`;
  if (fishing()) return `<div class="hud pupil-hud fish-hud" style="grid-template-columns:repeat(3,minmax(0,1fr)) auto">${time}
    <div class="stat"><div class="k">Total catch</div><div class="v">${LB.fmtKg(G.kg)}</div></div>
    <div class="stat mult"><div class="k">Lure level</div><div class="v">${LB.lureFor(G.streak + 1)}</div></div>${end}</div>`;
  const m = G.phase === 'question' ? multFor(G.streak + 1) : multFor(Math.max(1, G.streak));
  return `<div class="hud">${time}
    <div class="stat"><div class="k">Points</div><div class="v">${G.score.toLocaleString('en-GB')}</div></div>
    <div class="stat"><div class="k">Streak</div><div class="v">${G.streak}${LB.flames(G.streak)}</div></div>
    <div class="stat mult"><div class="k">${G.phase === 'question' ? 'Next correct' : 'Multiplier'}</div><div class="v">${fmtMult(m)}</div></div>${end}</div>`;
}
function answersHTML(done) {
  const { q, perm } = G.cur;
  return `<div class="answers">${perm.map((i, j) => {
    let cls = `ans a${j}`;
    if (done) cls += i === q.correct ? ' right' : j === G.pick ? ' wrong' : ' dim';
    return `<button class="${cls}" data-a="answer" data-i="${j}" ${done ? 'disabled' : ''}><span class="key">${THEME.keyLabel(j)}</span><span>${esc(q.answers[i])}</span></button>`;
  }).join('')}</div>`;
}
function setsHTML() {
  return `<div class="pick-list">${A.sets.map(s => {
    const st = statsFor(s), subj = THEME.subjectFor(s);
    return `<button class="pick-set" data-a="pick" data-id="${esc(s.id)}">
      <span class="pick-title">${esc(s.title || 'Untitled set')}</span>
      <span class="pick-meta">${subj ? `<span class="tag-chip subj subj-${subj}">${esc(THEME.label(subj))}</span>` : ''}${s.questions.length} questions${st.plays ? ` · played ${st.plays}× · best ${fishing() ? LB.fmtKg(st.best) : st.best.toLocaleString('en-GB')}` : ''}${st.weak.length ? ` · ${st.weak.length} to practise` : ''}</span>
    </button>`;
  }).join('')}</div>`;
}
function render() {
  let h = '';
  switch (V.screen) {
    case 'loading': h = card(`<h1 style="font-size:24px">Opening…</h1>`); break;
    case 'missing': h = card(`<h1 style="font-size:24px">Code not found</h1><p>${esc(V.msg)}</p><button class="btn primary" data-a="exit">Back</button>`); break;
    case 'name': h = `<div class="gate"><form class="gate-card" id="a-name">${LB.mark}
      <span class="qlabel">${esc(A.title || (A.sets[0] && A.sets[0].title) || '')}</span>
      <h1 style="font-size:24px">Who are you?</h1>${dueLine()}
      <div class="ed-row" style="flex-wrap:nowrap">
        <div class="field" style="flex:1"><label for="a-first">First name</label><input class="in" id="a-first" autocomplete="off" maxlength="20" value="${esc(me.first)}" style="width:100%"></div>
        <div class="field" style="width:96px"><label for="a-init">Surname initial</label><input class="in" id="a-init" autocomplete="off" maxlength="1" value="${esc(me.initial)}" style="width:100%;text-align:center;text-transform:uppercase"></div>
      </div>
      <p class="err" id="a-msg" role="alert"></p>
      <button class="btn primary">Continue</button>
      <button type="button" class="btn ghost small" data-a="exit" style="align-self:center">Use a different code</button></form></div>`; break;
    case 'pick': h = `<div class="wrap play"><div class="toolbar"><span class="chip">${esc(pupilName())}</span><span class="sp"></span><button class="btn ghost small" data-a="exit">Sign out</button></div>
      <div class="stage"><span class="qlabel">${A.kind === 'folder' ? 'Revision' : 'Assignment'}</span><h1 style="font-size:clamp(26px,4vw,38px)">${esc(A.title || 'Choose a set')}</h1>${dueLine()}
      ${A.sets.length ? setsHTML() : '<p class="hint">There are no sets here yet.</p>'}</div></div>`; break;
    case 'intro': {
      const s = V.set, st = statsFor(s);
      h = `<div class="wrap play"><div class="toolbar">${A.sets.length > 1 ? '<button class="btn ghost small" data-a="back">← All sets</button>' : `<span class="chip">${esc(pupilName())}</span>`}<span class="sp"></span><button class="btn ghost small" data-a="exit">Sign out</button></div>
      <div class="stage center pop"><span class="qlabel">${esc(fishing() ? modes().fishing : modes().classic)} · ${s.questions.length} questions${A.minutes ? ` · ${A.minutes} minutes` : ''}</span>
        <h1 style="font-size:clamp(28px,5vw,44px)">${esc(s.title || 'Untitled set')}</h1>
        ${st.plays ? `<div class="summary" style="max-width:560px;grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="stat"><div class="k">Plays</div><div class="v">${st.plays}</div></div>
          <div class="stat"><div class="k">Best</div><div class="v">${fishing() ? LB.fmtKg(st.best) : st.best.toLocaleString('en-GB')}</div></div>
          <div class="stat"><div class="k">Accuracy</div><div class="v">${st.acc == null ? '–' : st.acc + '%'}</div></div></div>` : ''}
        ${st.weak.length ? `<div class="review"><h2 class="side-h">Questions to practise (they come up more often)</h2><ol>${st.weak.slice(0, 8).map(q => `<li><div class="rq">${esc(q.q)}</div><div class="ra"><span class="right">Answer: ${esc(q.answers[q.correct])}</span></div></li>`).join('')}</ol></div>` : ''}
        <button class="btn primary big-go" data-a="go" data-autofocus>Play</button></div></div>`;
      break;
    }
    case 'play': {
      if (G.phase === 'ready') { deal(); }
      const done = G.phase === 'feedback', locked = done && Date.now() < G.lockUntil;
      let verdict = '';
      if (done) {
        const right = G.log[G.log.length - 1].right;
        verdict = right
          ? (G.fish ? `<div class="verdict good pop"><div><h3>${esc(G.fish.name)}! ${LB.fmtKg(G.fish.kg)}</h3><p>${LB.FISH_TIERS[G.fish.tier].name} · streak ${G.streak}</p></div>`
                    : `<div class="verdict good pop"><div><h3>Correct! +${G.gain}</h3><p>Streak ${G.streak} · ${fmtMult(multFor(G.streak))}</p></div>`)
          : `<div class="verdict bad pop"><div><h3>${fishing() ? 'The fish got away' : 'Not quite'}</h3><p>The right answer is highlighted.${G.lost > 1 ? ` Streak of ${G.lost} lost.` : ''}</p></div>`;
        verdict += `<button class="btn primary go ${locked ? 'locking' : ''}" id="go" data-a="next" ${locked ? 'disabled' : 'data-autofocus'}><span class="lbl">${locked ? 'Wait a moment…' : 'Next question'}</span><span class="bar"></span></button></div>`;
      }
      h = `<div class="wrap play">${hud()}<div class="stage pop"><span class="qlabel">Question ${G.answered + (done ? 0 : 1)}</span><div class="qtext">${esc(G.cur.q.q)}</div>${answersHTML(done)}
        ${done ? verdict : `<span class="hint">Click an answer, or press 1–${G.cur.perm.length}</span>`}</div></div>`;
      break;
    }
    case 'over': {
      const acc = G.answered ? Math.round(100 * G.correct / G.answered) : 0;
      const wrong = new Map(); G.log.forEach(e => { if (!e.right) wrong.set(e.qid, e.choice); });
      const review = [...wrong].map(([qid, c]) => { const q = G.set.questions.find(x => x.id === qid); return q ? { q: q.q, yours: q.answers[c], answer: q.answers[q.correct] } : null; }).filter(Boolean);
      h = `<div class="wrap play"><div class="stage center pop">
        <span class="qlabel">Finished · ${esc(G.set.title || '')}</span>
        <div class="hero-n">${fishing() ? LB.fmtKg(G.kg) : G.score.toLocaleString('en-GB')}</div><span class="hint">${fishing() ? 'caught' : 'points'}</span>
        <div class="summary" style="max-width:560px;grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="stat"><div class="k">Correct</div><div class="v">${G.correct}/${G.answered}</div></div>
          <div class="stat"><div class="k">Accuracy</div><div class="v">${acc}%</div></div>
          <div class="stat"><div class="k">Best streak</div><div class="v">${G.best}</div></div></div>
        ${review.length ? `<div class="review"><h2 class="side-h">Questions to look at again</h2><ol>${review.map(r => `<li><div class="rq">${esc(r.q)}</div><div class="ra"><span class="yours">You said: ${esc(r.yours)}</span><span class="right">Answer: ${esc(r.answer)}</span></div></li>`).join('')}</ol></div>` : (G.answered ? '<p class="hint" style="margin:0">No questions wrong.</p>' : '')}
        <p class="hint" id="saved-note" style="margin:0">${G.answered ? 'Saving…' : ''}</p>
        <div class="ed-row" style="justify-content:center"><button class="btn primary" data-a="go" data-autofocus>Play again</button>${A.sets.length > 1 ? '<button class="btn" data-a="back">Choose another set</button>' : ''}</div>
      </div></div>`;
      break;
    }
  }
  app.innerHTML = h;
  document.body.classList.toggle('water', V.screen === 'play' && fishing());
  typeset(app);
  const f = app.querySelector('[data-autofocus]') || (V.screen === 'name' && document.getElementById(me.first ? 'a-init' : 'a-first'));
  if (f) f.focus();
}
function openSet(set) {
  V = { screen: 'intro', set };
  THEME.takeover(THEME.subjectFor(set), render);
}

/* ---------- events ---------- */
app.addEventListener('submit', e => {
  if (e.target.id !== 'a-name') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const first = document.getElementById('a-first').value.replace(/\s+/g, ' ').trim();
  const init = document.getElementById('a-init').value.trim().toUpperCase();
  const msg = document.getElementById('a-msg');
  const chk = LB.checkName(first);
  if (!chk.ok) { msg.textContent = chk.msg; return; }
  if (!/^[\p{L}][\p{L}'\- ]{0,19}$/u.test(first)) { msg.textContent = 'Type your first name only.'; return; }
  if (!/^[A-Z]$/.test(init)) { msg.textContent = 'Type the first letter of your surname.'; return; }
  me = { first: first[0].toUpperCase() + first.slice(1), initial: init }; store.set(ME, me);
  V = { screen: 'loading' }; render();
  loadHistory().then(() => { if (A.sets.length === 1) openSet(A.sets[0]); else { V = { screen: 'pick' }; render(); } });
}, true);
app.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
  const a = t.dataset.a;
  if (a === 'exit') { stopTick(); location.href = location.pathname; }
  if (a === 'pick') openSet(A.sets.find(s => s.id === t.dataset.id));
  if (a === 'back') { stopTick(); G = null; V = { screen: 'pick' }; THEME.takeover(A.subject, render); }
  if (a === 'go') begin(V.set || (G && G.set));
  if (a === 'answer') answer(+t.dataset.i);
  if (a === 'next') next();
  if (a === 'finish') finish();
});
document.addEventListener('keydown', e => {
  if (!A || V.screen !== 'play' || !G) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (G.phase === 'question' && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && G.phase === 'feedback' && tag !== 'BUTTON') { e.preventDefault(); next(); }
});
window.addEventListener('beforeunload', () => { if (G && V.screen === 'play' && G.answered) save(false); });

window.ASSIGN = { isCode, start };
})();
