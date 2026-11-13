/* Quiz app — host screen: lobby, live leaderboard and stats, results download.
   The teacher's tab is the game: it marks every answer and holds all scores.
   Pupil names and scores live only in this tab (and this laptop's browser storage so a refresh can resume). */
(function () {
'use strict';
if (!window.APP.configured) return; // config.js shows the setup message

const { esc, rid, shuffle, fmtTime, multFor, fmtMult, typeset } = LB;
const cfg = window.APP;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey); // shares the teacher's sign-in
const app = document.getElementById('app');
const STORE = window.APP.storagePrefix + '.hostgame';
const JOIN_URL = window.APP.joinAddress;
const setId = new URLSearchParams(location.search).get('set');

let G = null;                 // the game
let lobby = null;             // lobby channel
const chans = new Map();      // pid -> pupil channel
let ui = { tab: 'board' };
let tickTimer = null;

const validQ = LB.validQ;

/* ---------- persistence (this laptop only) ---------- */
let saveT;
function persist(now) {
  clearTimeout(saveT);
  const go = () => { try { G.savedAt = Date.now(); localStorage.setItem(STORE, JSON.stringify(G)); } catch (e) {} };
  if (now) go(); else saveT = setTimeout(go, 800);
}
function stored() {
  try {
    const g = JSON.parse(localStorage.getItem(STORE) || 'null');
    // A saved game is only for resuming after an accidental close. After 3 hours it is wiped from this laptop.
    if (g && Date.now() - g.savedAt >= 3 * 3600e3) { localStorage.removeItem(STORE); return null; }
    if (g && g.setId === setId && g.phase !== 'setup' && g.kx) return g;
  } catch (e) {}
  return null;
}
window.addEventListener('beforeunload', e => {
  if (G && (G.phase === 'lobby' || G.phase === 'playing')) { persist(true); e.preventDefault(); e.returnValue = ''; }
});

/* ---------- boot ---------- */
async function boot() {
  if (!setId) return fatal('No set chosen', 'Open the teacher library and click Host on a set.');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return fatal('Sign in first', 'Hosting a game needs a teacher account.', true);
  const { data, error } = await sb.from('sets').select('*').eq('id', setId).single();
  if (error || !data) return fatal('Couldn’t load that set', 'Check your connection, or go back to the library and try again.');
  // Drop blank answer slots and keep the correct answer pointing at the right one
  const questions = (data.questions || []).filter(validQ).map(q => {
    const seen = new Set([String(q.answers[q.correct]).trim().toLowerCase()]);
    const kept = q.answers.map((a, j) => [String(a), j]).filter(([a, j]) => a.trim() && (j === q.correct || !seen.has(a.trim().toLowerCase()) && seen.add(a.trim().toLowerCase())));
    return { id: q.id, q: q.q, image: LB.safeSrc(q.image) || undefined, answers: kept.map(k => k[0]), correct: kept.findIndex(k => k[1] === q.correct) };
  });
  if (!questions.length) return fatal('This set has no finished questions', 'Add at least one question with two answers first.');
  G = {
    code: null, setId, title: data.title || 'Untitled set', questions,
    subject: THEME.subjectFor(data), kx: null,
    settings: { minutes: 10, rankBy: 'points', mode: 'classic', shuffle: true, teams: 0 },
    paused: false, pausedAt: null,
    biggest: null, frenzyUntil: null, nextFrenzyAt: null,
    phase: 'setup', endAt: null, startedAt: null, endedAt: null,
    pupils: {}, blocked: [], blockedNames: [], qstats: {}
  };
  questions.forEach(q => (G.qstats[q.id] = { seen: 0, right: 0, wrong: {} }));
  ui.resume = stored();
  render();
  THEME.takeover(G.subject, render);   // the subject's look takes over from the library's
}
function fatal(title, msg, signIn) {
  app.innerHTML = `<div class="gate"><div class="gate-card">${LB.mark}<h1 style="font-size:24px">${esc(title)}</h1><p>${esc(msg)}</p>
    <a class="btn primary" href="teacher.html">${signIn ? 'Go to teacher sign-in' : 'Back to the library'}</a></div></div>`;
}

/* ---------- realtime ---------- */
function subscribe(name, handlers) {
  return new Promise(resolve => {
    const ch = sb.channel(name, { config: { broadcast: { self: false } } });
    Object.entries(handlers).forEach(([ev, fn]) => ch.on('broadcast', { event: ev }, ({ payload }) => fn(payload || {})));
    let done = false;
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED' && !done) { done = true; resolve(ch); }
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !done) { done = true; resolve(null); }
    });
  });
}
const send = (ch, event, payload) => ch && ch.send({ type: 'broadcast', event, payload }).catch(() => {});

async function openLobby() {
  lobby = await subscribe(LB.lobbyChannel(G.code), { join: onJoin });
  return !!lobby;
}
async function pupilChannel(pid) {
  if (chans.has(pid)) return chans.get(pid);
  const ch = await subscribe(LB.pupilChannel(G.code, G.pupils[pid].chan), {
    hello: () => { const p = G.pupils[pid]; if (p) { p.lastActive = Date.now(); send(ch, 'state', stateFor(p)); } },
    answer: m => onAnswer(pid, m)
  });
  if (ch) chans.set(pid, ch);
  return ch;
}
function dropChannel(pid) {
  const ch = chans.get(pid);
  if (ch) { sb.removeChannel(ch); chans.delete(pid); }
}

/* ---------- game logic ---------- */
function newPupil(name, pub, chan) {
  let pid; do { pid = rid(10); } while (G.pupils[pid]);   // pid is this tab's own label for the pupil; it is never sent anywhere
  return { pid, pub, chan, name, runner: RUNNER.pick(G.subject), score: 0, kg: 0, catches: 0, biggest: null, streak: 0, best: 0, answered: 0, correct: 0, deck: [], last: null, cur: null, perm: null, log: [], seq: 0, lockUntil: 0, lastActive: Date.now(), lastResult: null, joinedAt: Date.now() };
}
function deal(p) {
  if (!p.deck.length) {
    p.deck = shuffle(G.questions.map(q => q.id));
    if (p.deck.length > 1 && p.deck[0] === p.last) p.deck.push(p.deck.shift());
  }
  p.cur = p.deck.shift(); p.last = p.cur; p.seq++;
  // Order the answers are shown in for this delivery (original indexes)
  const q = qById(p.cur), idx = q ? q.answers.map((_, i) => i) : [];
  p.perm = G.settings.shuffle ? shuffle(idx) : idx;
}
const qById = id => G.questions.find(q => q.id === id);
const fishing = () => G.settings.mode === 'fishing';
const frenzyOn = () => !!(G.frenzyUntil && Date.now() < G.frenzyUntil);
const val = p => (fishing() ? p.kg : p.score);            // the 'points' measure for the current mode
const fmtVal = v => (fishing() ? LB.fmtCatch(v) : v.toLocaleString('en-GB'));
function qPayload(p) {
  const q = qById(p.cur);
  if (!q) return null;
  const perm = p.perm && p.perm.length === q.answers.length ? p.perm : q.answers.map((_, i) => i);
  return { seq: p.seq, q: q.q, image: q.image, answers: perm.map(i => q.answers[i]) };
}
function stateFor(p) {
  return {
    phase: G.phase, title: G.title, name: p.name, subject: G.subject, runner: p.runner,
    team: teamOf(p) ? { name: teamOf(p)[0], colour: teamOf(p)[1] } : null,
    endIn: G.phase === 'playing' && G.endAt ? G.endAt - (G.paused ? G.pausedAt : Date.now()) : null,
    mode: G.settings.mode, kg: p.kg, lure: LB.lureFor(p.streak + 1),
    frenzyIn: frenzyOn() ? G.frenzyUntil - (G.paused ? G.pausedAt : Date.now()) : 0,
    paused: G.phase === 'playing' && G.paused,
    score: p.score, streak: p.streak, answered: p.answered, correct: p.correct,
    q: G.phase === 'playing' ? qPayload(p) : null,
    lockMs: Math.max(0, p.lockUntil - Date.now()),
    final: G.phase === 'ended' ? finalFor(p) : null
  };
}

async function onJoin(m) {
  if (!LB.kx.validPub(m.pub) || !G.kx) return;
  // Replies go out on the lobby, addressed by the pupil's public key. They carry nothing another pupil could use.
  const reply = body => send(lobby, 'joined', { to: m.pub, hpub: G.kx.pub, ...body });
  if (G.phase === 'ended') return reply({ ok: false, msg: 'This game has finished.' });
  const chk = LB.checkName(m.name);
  if (!chk.ok) return reply({ ok: false, msg: chk.msg });
  if (G.blocked.includes(m.pub) || G.blockedNames.includes(chk.name.toLowerCase())) return reply({ ok: false, msg: 'Your teacher has removed you from this game.' });
  let p = Object.values(G.pupils).find(x => x.pub === m.pub);
  if (!p) {
    let chan;
    try { chan = await LB.kx.secret(G.kx.priv, m.pub, G.code); } catch (e) { return; }
    p = Object.values(G.pupils).find(x => x.pub === m.pub);   // the same join can arrive twice
    const same = !p && Object.values(G.pupils).find(x => x.name.toLowerCase() === chk.name.toLowerCase());
    if (p) { /* already in */ }
    else if (same) {
      // A second laptop using a name already in the game only gets in if the teacher has just allowed it
      if (!(same.allowRejoinUntil > Date.now())) {
        return reply({ ok: false, msg: G.phase === 'lobby'
          ? `Someone called ${chk.name} has already joined. Add your surname initial.`
          : `Someone called ${chk.name} is already playing. If that is you, ask your teacher to let you back in.` });
      }
      const old = chans.get(same.pid); if (old) send(old, 'replaced', {});
      dropChannel(same.pid);
      same.pub = m.pub; same.chan = chan; same.allowRejoinUntil = 0; p = same;   // score kept
    } else {
      p = newPupil(chk.name, m.pub, chan);
      G.pupils[p.pid] = p; placeInTeam(p);
      if (G.phase === 'playing') deal(p);
    }
  }
  p.lastActive = Date.now();
  const ch = await pupilChannel(p.pid);
  if (!ch) return reply({ ok: false, msg: 'The game couldn’t connect you. Try again.' });
  reply({ ok: true, name: p.name });
  persist(); liveRender();
}

function onAnswer(pid, m) {
  const p = G.pupils[pid], ch = chans.get(pid);
  if (!p || !ch) return;
  p.lastActive = Date.now();
  if (G.phase !== 'playing' || G.paused) return send(ch, 'state', stateFor(p));
  if (p.lastResult && m.seq === p.lastResult.seq) return send(ch, 'result', p.lastResult); // resend a lost result
  if (m.seq !== p.seq) return send(ch, 'state', stateFor(p));
  const q = qById(p.cur), st = G.qstats[p.cur];
  const shown = +m.choice;
  if (!q || !(shown >= 0 && shown < q.answers.length)) return;
  const perm = p.perm && p.perm.length === q.answers.length ? p.perm : q.answers.map((_, i) => i);
  const choice = perm[shown];                       // original answer index
  const right = choice === q.correct;
  p.log.push({ qid: q.id, choice, right, at: Date.now() });
  p.answered++; st.seen++;
  let gain = 0, catchMade = null;
  if (right) {
    p.streak++; p.best = Math.max(p.best, p.streak); p.correct++; st.right++;
    if (fishing()) {
      // Cast with the lure earned by the streak so far, then land a fish
      catchMade = LB.rollFish(LB.lureFor(p.streak), G.subject);
      catchMade.doubled = frenzyOn();
      if (catchMade.doubled) catchMade.kg = Math.round(catchMade.kg * 20) / 10;
      p.kg = Math.round((p.kg + catchMade.kg) * 10) / 10; p.catches++;
      if (!p.biggest || catchMade.kg > p.biggest.kg) p.biggest = { name: catchMade.name, tier: catchMade.tier, shape: catchMade.shape, icon: catchMade.icon, kg: catchMade.kg };
      if (!G.biggest || catchMade.kg > G.biggest.kg) G.biggest = { who: p.name, name: catchMade.name, tier: catchMade.tier, shape: catchMade.shape, icon: catchMade.icon, kg: catchMade.kg };
    } else {
      gain = Math.round(LB.BASE * multFor(p.streak)); p.score += gain;
    }
    p.lockUntil = 0;
  } else {
    p.lostStreak = p.streak; p.streak = 0;
    st.wrong[choice] = (st.wrong[choice] || 0) + 1;
    p.lockUntil = Date.now() + LB.WRONG_LOCK_MS;
  }
  const seq = p.seq;
  deal(p);
  p.lastResult = {
    seq, choice: shown, right, correctIndex: perm.indexOf(q.correct), gain, fish: catchMade, kg: p.kg, lure: LB.lureFor(p.streak + 1),
    score: p.score, streak: p.streak, lost: right ? 0 : p.lostStreak, answered: p.answered, correct: p.correct,
    lockMs: right ? 0 : LB.WRONG_LOCK_MS, next: qPayload(p)
  };
  send(ch, 'result', p.lastResult);
  if (!fishing() && race) { updateRace(); const rid = G.settings.teams && p.team != null ? 'team' + p.team : pid; if (right) race.boost(rid); else race.trip(rid); }
  persist(); liveRender();
}

async function startGame() {
  G.phase = 'playing'; G.startedAt = Date.now();
  G.endAt = G.settings.minutes ? Date.now() + G.settings.minutes * 60000 : null;
  G.nextFrenzyAt = fishing() ? Date.now() + 120000 + Math.random() * 60000 : null;
  Object.values(G.pupils).forEach(p => { if (!p.cur) deal(p); send(chans.get(p.pid), 'state', stateFor(p)); });
  startTick(); persist(true); render();
}
function endGame() {
  if (G.phase !== 'playing' && G.phase !== 'lobby') return;
  G.phase = 'ended'; G.endedAt = Date.now(); stopTick();
  window.APP.loadXLSX().catch(() => {});
  Object.values(G.pupils).forEach(p => send(chans.get(p.pid), 'state', stateFor(p)));
  persist(true); ui.confirmEnd = false; render();
}
function kick(pid) {
  const p = G.pupils[pid]; if (!p) return;
  send(chans.get(pid), 'kicked', {});
  G.blocked.push(p.pub); G.blockedNames.push(p.name.toLowerCase());
  setTimeout(() => dropChannel(pid), 500);
  delete G.pupils[pid];
  persist(); render();
}
function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    if (G.phase !== 'playing' || G.paused) return;
    const el = document.getElementById('host-time');
    if (G.endAt) {
      const left = G.endAt - Date.now();
      if (el) el.textContent = fmtTime(left);
      if (left <= 0) return endGame();
    }
    if (fishing()) frenzyTick();
  }, 250);
}
function stopTick() { clearInterval(tickTimer); tickTimer = null; }

/* Pause freezes the timer, any double-weight event and every pupil screen */
function setPaused(on) {
  if (G.phase !== 'playing' || G.paused === on) return;
  if (on) { G.paused = true; G.pausedAt = Date.now(); }
  else {
    const d = Date.now() - G.pausedAt;
    if (G.endAt) G.endAt += d;
    if (G.frenzyUntil) G.frenzyUntil += d;
    if (G.nextFrenzyAt) G.nextFrenzyAt += d;
    Object.values(G.pupils).forEach(p => { if (p.lockUntil > G.pausedAt) p.lockUntil += d; });
    G.paused = false; G.pausedAt = null;
  }
  broadcastState(); persist(true); render();
}

/* Frenzy: about every 3 minutes, 30 seconds of double-weight catches. Never in the first two minutes or the last minute. */
function frenzyTick() {
  const now = Date.now();
  if (G.frenzyUntil && now >= G.frenzyUntil) {
    G.frenzyUntil = null;
    G.nextFrenzyAt = now + 150000 + Math.random() * 60000;
    broadcastState(); persist(); render();
  } else if (!G.frenzyUntil && G.nextFrenzyAt && now >= G.nextFrenzyAt) {
    if (G.endAt && G.endAt - now < LB.FRENZY_MS + 60000) { G.nextFrenzyAt = null; return; }
    G.frenzyUntil = now + LB.FRENZY_MS;
    broadcastState(); persist(); render();
  }
  const fz = document.getElementById('frenzy-left');
  if (fz && G.frenzyUntil) fz.textContent = Math.max(0, Math.ceil((G.frenzyUntil - now) / 1000));
}
function broadcastState() { Object.values(G.pupils).forEach(p => send(chans.get(p.pid), 'state', stateFor(p))); }

/* ---------- teams: pupils' scores add up for their team. Nothing to buy, no power-ups. ---------- */
const teamDefs = () => (window.APP.teams[G.subject] || window.APP.teams.none).slice(0, G.settings.teams || 0);
const teamOf = p => (G.settings.teams && p.team != null ? teamDefs()[p.team] : null);
function placeInTeam(p) {
  if (!G.settings.teams) { p.team = null; return; }
  const counts = teamDefs().map((_, i) => Object.values(G.pupils).filter(x => x !== p && x.team === i).length);
  const least = Math.min(...counts), open = counts.map((c, i) => [c, i]).filter(([c]) => c === least).map(([, i]) => i);
  p.team = open[Math.floor(Math.random() * open.length)];
}
function shuffleTeams() {
  const ps = shuffle(Object.values(G.pupils)), n = G.settings.teams;
  ps.forEach((p, i) => (p.team = n ? i % n : null));
}
function teamTotals() {
  return teamDefs().map(([name, colour], i) => {
    const members = Object.values(G.pupils).filter(p => p.team === i);
    return { i, name, colour, members, total: members.reduce((n, p) => n + val(p), 0), correct: members.reduce((n, p) => n + p.correct, 0), answered: members.reduce((n, p) => n + p.answered, 0) };
  }).sort((a, b) => b.total - a.total || b.correct - a.correct);
}
const teamChip = p => { const t = teamOf(p); return t ? `<span class="team-dot" style="--team:${t[1]}" title="${esc(t[0])}"></span>` : ''; };
function teamsBarHTML() {
  if (!G.settings.teams) return '';
  const ts = teamTotals(), top = Math.max(1, ...ts.map(t => t.total));
  return `<div class="teams-bar">${ts.map((t, k) => `<div class="team-total" style="--team:${t.colour}">
    <div class="team-head"><span class="lb-rank">${k + 1}</span><b>${esc(t.name)}</b><span class="hint">${t.members.length}</span></div>
    <div class="team-num">${fmtVal(t.total)}</div><div class="meter"><i style="width:${Math.round(100 * t.total / top)}%;background:var(--team)"></i></div></div>`).join('')}</div>`;
}

/* ---------- ranking & results ---------- */
const acc = p => (p.answered ? p.correct / p.answered : 0);
const enough = p => (p.answered >= LB.MIN_FOR_ACCURACY ? 1 : 0);
function ranked() {
  const by = G.settings.rankBy;
  return Object.values(G.pupils).sort((a, b) => {
    if (by === 'correct') return b.correct - a.correct || val(b) - val(a) || a.name.localeCompare(b.name);
    // Accuracy: pupils with enough answers rank above those without, so one lucky answer can't win
    if (by === 'accuracy') return enough(b) - enough(a) || acc(b) - acc(a) || b.answered - a.answered || a.name.localeCompare(b.name);
    return val(b) - val(a) || b.correct - a.correct || a.name.localeCompare(b.name);
  });
}
function reviewFor(p) {
  // Each question the pupil got wrong at least once: their latest wrong answer and the right one
  const seen = new Map();
  (p.log || []).forEach(e => { if (!e.right) seen.set(e.qid, e.choice); });
  return [...seen].slice(-30).map(([qid, choice]) => { const q = qById(qid); return q ? { q: LB.qText(q), yours: LB.ansText(q.answers[choice]), answer: LB.ansText(q.answers[q.correct]) } : null; }).filter(Boolean);
}
function finalFor(p) {
  const list = ranked();
  const tt = G.settings.teams ? teamTotals() : [], tp = tt.findIndex(t => t.i === p.team);
  return { team: tp >= 0 ? { name: tt[tp].name, colour: tt[tp].colour, place: tp + 1, of: tt.length, total: fmtVal(tt[tp].total) } : null, rank: list.indexOf(p) + 1, of: list.length, score: p.score, kg: p.kg, biggest: p.biggest, mode: G.settings.mode, answered: p.answered, correct: p.correct, best: p.best, rankBy: G.settings.rankBy, review: reviewFor(p) };
}
function questionRows() {
  return G.questions.map(q => {
    const st = G.qstats[q.id];
    const top = Object.entries(st.wrong).sort((a, b) => b[1] - a[1])[0];
    return { q, st, pct: st.seen ? st.right / st.seen : null, topWrong: top ? { text: LB.ansText(q.answers[top[0]]), raw: q.answers[top[0]], n: top[1] } : null };
  });
}
/* One row per pupil per question they met: how often they saw it, got it right and got it wrong,
   and what they put when wrong. Laid out flat so another program can read it straight in. */
function pupilQuestionRows() {
  const subject = THEME.label(G.subject) || '';
  const d = new Date(G.startedAt || Date.now());
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = [];
  ranked().forEach(p => {
    const by = new Map();
    (p.log || []).forEach(e => {
      const r = by.get(e.qid) || { seen: 0, right: 0, wrong: 0, wrongAnswers: [], last: null };
      r.seen++; if (e.right) r.right++; else { r.wrong++; r.wrongAnswers.push(e.choice); }
      r.last = e.right; by.set(e.qid, r);
    });
    G.questions.forEach(q => {
      const r = by.get(q.id); if (!r) return;
      const wrongs = [...new Set(r.wrongAnswers)].map(i => LB.ansText(q.answers[i]));
      const result = r.wrong === 0 ? 'Right' : r.right === 0 ? 'Wrong' : 'Mixed';
      rows.push({ Date: date, Set: G.title, Subject: subject, Pupil: p.name, Question: LB.qText(q), 'Correct answer': LB.ansText(q.answers[q.correct]),
        'Times asked': r.seen, 'Times right': r.right, 'Times wrong': r.wrong, Result: result,
        'Last attempt': r.last ? 'Right' : 'Wrong', 'Weakness': r.wrong > 0 ? 'Yes' : 'No', 'Their wrong answers': wrongs.join(' | ') });
    });
  });
  return rows;
}
function fileStem() {
  const d = new Date(G.startedAt || Date.now());
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${window.APP.name} - ${G.title.replace(/[\\/:*?"<>|]/g, '')} - ${date}`;
}
function downloadCSV() {
  const rows = pupilQuestionRows();
  const cols = ['Date', 'Set', 'Subject', 'Pupil', 'Question', 'Correct answer', 'Times asked', 'Times right', 'Times wrong', 'Result', 'Last attempt', 'Weakness', 'Their wrong answers'];
  const cell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '\uFEFF' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = fileStem() + ' - by pupil and question.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function download() {
  try { await window.APP.loadXLSX(); } catch (e) { return; }
  const fish = fishing();
  const unit = LB.catchUnit(G.subject), noun = unit ? 'treasure' : 'fish';
  const pupils = [['Rank', 'Name', ...(G.settings.teams ? ['Team'] : []), fish ? LB.catchLabel(G.subject) : 'Points', 'Answered', 'Correct', 'Accuracy %', 'Best streak', ...(fish ? [unit ? 'Treasures found' : 'Fish caught', `Best ${noun}`, `Best ${noun} ${unit || 'kg'}`] : [])]];
  ranked().forEach((p, i) => pupils.push([i + 1, p.name, ...(G.settings.teams ? [teamOf(p) ? teamOf(p)[0] : ''] : []), fish ? (unit ? Math.round(p.kg * 10) : p.kg) : p.score, p.answered, p.correct, p.answered ? Math.round(100 * acc(p)) : '', p.best,
    ...(fish ? [p.catches, p.biggest ? `${p.biggest.name} (${LB.FISH_TIERS[p.biggest.tier].name})` : '', p.biggest ? (unit ? Math.round(p.biggest.kg * 10) : p.biggest.kg) : ''] : [])]));
  const qs = [['Question', 'Times answered', 'Correct %', 'Most common wrong answer', 'Times chosen', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct answer']];
  questionRows().forEach(r => {
    const counts = r.q.answers.map((a, j) => `${LB.ansText(a)} (${j === r.q.correct ? r.st.right : (r.st.wrong[j] || 0)})`);
    while (counts.length < 4) counts.push('');
    qs.push([LB.qText(r.q), r.st.seen, r.pct == null ? '' : Math.round(100 * r.pct), r.topWrong ? r.topWrong.text : '', r.topWrong ? r.topWrong.n : '', ...counts, LB.ansText(r.q.answers[r.q.correct])]);
  });
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(pupils); s1['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 30 }, { wch: 15 }];
  const s2 = XLSX.utils.aoa_to_sheet(qs); s2['!cols'] = [{ wch: 50 }, { wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, s1, 'Pupils');
  if (G.settings.teams) {
    const tsh = XLSX.utils.aoa_to_sheet([['Place', 'Team', fish ? LB.catchLabel(G.subject) : 'Points', 'Pupils', 'Answered', 'Correct', 'Accuracy %'],
      ...teamTotals().map((t, k) => [k + 1, t.name, fish && unit ? Math.round(t.total * 10) : t.total, t.members.map(p => p.name).join(', '), t.answered, t.correct, t.answered ? Math.round(100 * t.correct / t.answered) : ''])]);
    tsh['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 9 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, tsh, 'Teams');
  }
  const pq = XLSX.utils.json_to_sheet(pupilQuestionRows());
  pq['!cols'] = [{ wch: 11 }, { wch: 24 }, { wch: 8 }, { wch: 18 }, { wch: 44 }, { wch: 24 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, pq, 'By pupil and question');
  XLSX.utils.book_append_sheet(wb, s2, 'Questions');
  const log = [['Name', 'Question', 'Their answer', 'Correct answer', 'Right?']];
  ranked().forEach(p => (p.log || []).forEach(e => { const q = qById(e.qid); if (q) log.push([p.name, LB.qText(q), LB.ansText(q.answers[e.choice]), LB.ansText(q.answers[q.correct]), e.right ? 'Yes' : 'No']); }));
  const s3 = XLSX.utils.aoa_to_sheet(log); s3['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, s3, 'Every answer');
  const d = new Date(G.startedAt || Date.now());
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `${window.APP.name} - ${G.title.replace(/[\\/:*?"<>|]/g, '')} - ${date}.xlsx`);
}

/* ---------- music (plays from the host laptop only) ---------- */
const TRACKS = { lobby: 'assets/music/lobby.mp3', classic: 'assets/music/classic.mp3', fishing: 'assets/music/fishing.mp3' };
const pref = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const music = {
  el: null, key: null, vol: pref.get(window.APP.storagePrefix + '.musicVol', 0.5), muted: pref.get(window.APP.storagePrefix + '.musicMuted', false), fadeT: null,
  target() { return this.muted ? 0 : this.vol; },
  fadeTo(v, ms, done) {
    clearInterval(this.fadeT);
    const a = this.el; if (!a) { if (done) done(); return; }
    const from = a.volume, steps = Math.max(1, Math.round(ms / 40)); let i = 0;
    this.fadeT = setInterval(() => { i++; a.volume = Math.min(1, Math.max(0, from + (v - from) * i / steps)); if (i >= steps) { clearInterval(this.fadeT); if (done) done(); } }, 40);
  },
  missing: {},
  want(key) {
    if (key === this.key) return;
    this.key = key;
    // A subject's single track carries on from the lobby into the game without restarting
    const own = key && !this.missing[G.subject] ? THEME.music(G.subject, key) : null;
    if (own && this.el && this.src === own) return;
    const start = () => {
      if (this.el) { this.el.pause(); this.el = null; }
      if (!key) return;
      // The subject's own track if there is one, otherwise the default track
      const own = this.missing[G.subject] ? null : THEME.music(G.subject, key);
      const a = new Audio(own || TRACKS[key]); a.loop = true; a.volume = 0; this.el = a; this.src = own || TRACKS[key];
      const go = () => a.play().then(() => this.fadeTo(this.target(), 1200)).catch(() => {});
      if (own) a.addEventListener('error', () => { this.missing[G.subject] = true; if (this.el === a) { a.src = this.src = TRACKS[key]; go(); } }, { once: true });
      go();
    };
    if (this.el) this.fadeTo(0, 800, start); else start();
  },
  setVol(v) { this.vol = v; pref.set(window.APP.storagePrefix + '.musicVol', v); if (this.el) { clearInterval(this.fadeT); this.el.volume = this.target(); } },
  toggle() { this.muted = !this.muted; pref.set(window.APP.storagePrefix + '.musicMuted', this.muted); if (this.el) this.fadeTo(this.target(), 300); }
};
function musicKey() {
  if (G.phase === 'lobby') return 'lobby';
  if (G.phase === 'playing') return fishing() ? 'fishing' : 'classic';
  return null;
}
function musicHTML() {
  return `<div class="music" role="group" aria-label="Music">
    <button class="btn small ghost" data-act="music-mute" aria-pressed="${music.muted}" title="${music.muted ? 'Turn music on' : 'Mute music'}">${music.muted ? '♪ Off' : '♪ On'}</button>
    <label class="sr" for="music-vol">Music volume</label>
    <input type="range" id="music-vol" min="0" max="1" step="0.05" value="${music.vol}" ${music.muted ? 'disabled' : ''}>
  </div>`;
}

/* ---------- rendering ---------- */
let liveT = null;
function liveRender() {
  if (liveT) return;
  liveT = setTimeout(() => {
    liveT = null;
    if (G.phase === 'lobby') return render();
    if (G.phase !== 'playing') return;
    const b = document.getElementById('board'), s = document.getElementById('stats'), c = document.getElementById('count');
    if (b) { const top = b.scrollTop; b.innerHTML = boardRows(); b.scrollTop = top; }
    if (s) { s.innerHTML = statsHTML(); typeset(s); }
    if (c) c.textContent = Object.keys(G.pupils).length;
    const tl = document.getElementById('teams-live'); if (tl) tl.innerHTML = teamsBarHTML();
    updateRace();
    const d = document.getElementById('drawer');
    if (d && ui.pupil) { const sc = d.querySelector('.drawer'); const top = sc ? sc.scrollTop : 0; d.innerHTML = pupilDrawer(); typeset(d); const n2 = d.querySelector('.drawer'); if (n2) n2.scrollTop = top; }
  }, 300);
}
const rankLabels = () => ({ points: fishing() ? LB.catchLabel(G.subject) : 'Points', correct: 'Correct answers', accuracy: `Accuracy (${LB.MIN_FOR_ACCURACY}+ answers)` });

/* Classic mode: the top pupils race across the top of the projector screen */
let race = null, presenting = false;
/* Present mode: the race on its own, filling the screen, for the board */
function setPresent(on) {
  presenting = !!on && G.phase === 'playing' && !fishing();
  document.body.classList.toggle('presenting', presenting);
  const box = document.getElementById('race');
  if (box) { box.querySelectorAll('.present-exit').forEach(b => b.remove()); }
  if (presenting && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!presenting && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  updateRace();
}
function updateRace() {
  const show = G.phase === 'playing' && !fishing() && Object.keys(G.pupils).length > 0;
  let box = document.getElementById('race');
  if (!show) { if (race) { race.stop(); race = null; } if (box) box.hidden = true; if (presenting) { presenting = false; document.body.classList.remove('presenting'); } return; }
  if (!box) { box = document.createElement('div'); box.id = 'race'; box.className = 'race'; box.setAttribute('aria-hidden', 'true'); document.body.insertBefore(box, app); }
  box.hidden = false;
  if (!race) race = RUNNER.race(box);
  race.full = presenting;
  if (presenting && !box.querySelector('.present-exit')) box.insertAdjacentHTML('beforeend', '<button class="present-exit" data-act="present-off" title="Back to the dashboard (Esc)">Back to dashboard</button>');
  if (G.settings.teams) {   // one runner per team
    G.teamRunners = G.teamRunners || teamDefs().map(() => RUNNER.pick(G.subject));
    race.set(G.subject, teamTotals().map(t => ({ id: 'team' + t.i, name: t.name, kind: G.teamRunners[t.i], value: t.total })));
  } else race.set(G.subject, ranked().slice(0, presenting ? 10 : 6).map(p => ({ id: p.pid, name: p.name, kind: p.runner || 'athlete', value: val(p) })));
}
/* Guided tours for the host screen (the ? button) */
const HOST_TOURS = {
  setup: () => [
    { sel: '.modes', title: 'Choose the game', text: `${THEME.modes().classic}: points for every right answer, more for a streak, and a race on the board. ${THEME.modes().fishing}: right answers bring up ${THEME.treasure(G.subject) ? 'treasures' : 'fish'}, rarer with a streak.` },
    { sel: '#minutes', title: 'How long', text: 'The questions are shuffled for each pupil and repeat until the time is up. Until I end it leaves the game running until you press End game.' },
    { sel: '#teams', title: 'Teams', text: 'Two to four teams. Boys join the smallest team as they arrive, and you can shuffle the teams in the lobby. Team totals add up each boy’s points. There is no shop and nothing to buy.' },
    { sel: '#rankby', title: 'Ranking', text: 'Points, correct answers, or accuracy. Accuracy only ranks boys who have answered at least ten, so one lucky answer can’t win.' },
    { sel: '[data-act="open"]', title: 'Open the lobby', text: 'Shows the address, the game code and a QR code for the board. Music plays from this laptop only.' }
  ],
  lobby: () => [
    { sel: '.join-banner', title: 'Getting the boys in', text: 'They go to the address and type the code and their name, or scan the QR code. Each name appears below as they join.' },
    { sel: '.team-cols, .main-head', title: 'Who has joined', text: 'Click a name to remove that pupil. With teams on, Shuffle teams mixes them again.' },
    { sel: '.music', title: 'Music', text: 'Mute or turn it down here. It only plays from this laptop.' },
    { sel: '[data-act="start"]', title: 'Start', text: 'Starts the game on every screen at once.' }
  ],
  playing: () => [
    { sel: '#race', title: 'The race', text: 'The top six boys, or each team, race across the board. A right answer gives a burst of speed; a wrong one trips the runner over.' },
    { sel: '[data-act="present"]', title: 'Present mode', text: 'Shows only the race, full screen, for the projector. Press P to switch it on or off, and Esc to come back.' },
    { sel: '#board', title: 'Leaderboard', text: 'Click a name to see every answer that boy has given. The cross removes him from the game.' },
    { sel: '#stats', title: 'Trickiest questions', text: 'The questions the class finds hardest, with the most common wrong answer. Useful for stopping the game and teaching that point.' },
    { sel: '[data-act="pause"], [data-act="resume-game"]', title: 'Pause and end', text: 'Pause freezes every pupil’s screen so you have their attention. End game shows the podium and the results to download.' }
  ],
  ended: () => [
    { sel: '.podium', title: 'Results', text: 'The podium, then every pupil. Click a name for his answers.' },
    { sel: '[data-act="download"]', title: 'Download', text: 'The spreadsheet has a sheet by pupil and question, ready to load into another program to target each boy’s weak spots. The CSV holds the same rows.' }
  ]
};
const tourKey = () => (G.phase === 'playing' ? 'playing' : G.phase === 'lobby' ? 'lobby' : G.phase === 'ended' ? 'ended' : 'setup');
function render() {
  if (!G) return;
  if (G.phase === 'setup') app.innerHTML = setupHTML();
  else if (G.phase === 'lobby') app.innerHTML = lobbyHTML();
  else if (G.phase === 'playing') app.innerHTML = playingHTML();
  else app.innerHTML = endedHTML();
  document.body.classList.toggle('water', G.phase === 'playing' && fishing());
  updateRace();
  music.want(musicKey());
  typeset(app);
  autoScroll();
}

function fishingRulesHTML() {
  const tr = THEME.treasure(G.subject);
  const pics = LB.FISH_TIERS.map((t, i) => tr && tr.items[i]
    ? LB.catchArt(tr.items[i][0][0], G.subject, 64) || LB.itemSVG(tr.items[i][0][1], i, 64)
    : LB.catchArt(t.fish[0][0], null, 64) || LB.fishSVG(i, t.fish[0][1], 64));
  const range = t => tr ? `${tr.symbol || ''}${(t.min * 10).toLocaleString('en-GB')}–${tr.symbol || ''}${(t.max * 10).toLocaleString('en-GB')}` : `${t.min}–${t.max} kg`;
  return `<div class="fish-tiers">${LB.FISH_TIERS.map((t, i) => `<div class="fish-tier">${pics[i]}<b style="color:${t.colour}">${t.name}</b><span>${range(t)}</span></div>`).join('')}</div>
    <p class="hint" style="margin:0;max-width:60ch">${tr ? `Every right answer brings up a treasure, worth ${esc(tr.unit)}.` : 'Every right answer catches a fish.'} A streak raises the pupil’s lure level (up to 4), which roughly doubles the chance of Rare or better. A wrong answer ${tr ? 'finds nothing' : 'catches nothing'}, resets the streak and pauses the pupil for 2 seconds. About every 3 minutes a 30-second ${esc(THEME.modes().event)} doubles every ${tr ? 'find' : 'catch'}.</p>`;
}
function readSetup() {
  const m = document.getElementById('minutes'), r = document.getElementById('rankby');
  if (m) G.settings.minutes = +m.value;
  if (r) G.settings.rankBy = r.value;
  const sh = document.getElementById('shuffle'); if (sh) G.settings.shuffle = sh.checked;
  const tm = document.getElementById('teams'); if (tm) G.settings.teams = +tm.value;
}
function setupHTML() {
  const r = ui.resume;
  return `<div class="wrap host">
    <div class="toolbar"><a class="btn ghost small" href="teacher.html">← Library</a><span class="sp"></span>${LB.mark}${LB.helpButton()}</div>
    ${r ? `<div class="ro" style="margin-bottom:20px"><strong>Game ${esc(r.code)} is still open on this laptop</strong> (${Object.keys(r.pupils).length} pupils, ${r.phase === 'ended' ? 'finished' : r.phase === 'lobby' ? 'in the lobby' : 'in progress'}).
      <button class="btn small primary" data-act="resume">${r.phase === 'ended' ? 'Show its results' : 'Resume it'}</button><button class="btn small ghost" data-act="discard">Start fresh</button></div>` : ''}
    <div class="stage center"><div class="setup">
      <span class="qlabel">Host a live game</span>
      <h1 style="font-size:clamp(30px,5vw,48px)">${esc(G.title)}</h1>
      <p class="hint" style="margin:0">${G.questions.length} ${G.questions.length === 1 ? 'question' : 'questions'}, shuffled for each pupil and repeated until time is up.</p>
      <div class="modes" role="radiogroup" aria-label="Game mode">
        <button class="mode ${fishing() ? '' : 'on'}" role="radio" aria-checked="${!fishing()}" data-act="mode" data-mode="classic"><b>${esc(THEME.modes().classic)}</b><span>Points for every right answer, boosted by streaks.</span></button>
        <button class="mode fishing ${fishing() ? 'on' : ''}" role="radio" aria-checked="${fishing()}" data-act="mode" data-mode="fishing"><b>${esc(THEME.modes().fishing)}</b><span>${THEME.treasure(G.subject) ? 'Right answers bring up treasures. Streaks bring rarer, more valuable ones.' : 'Right answers catch fish. Streaks bring rarer, heavier fish.'}</span></button>
      </div>
      <div class="ed-row" style="justify-content:center">
        <div class="field"><label for="minutes">Game length</label><select id="minutes">${[3, 5, 10, 15, 20, 30, 0].map(m => `<option value="${m}" ${G.settings.minutes === m ? 'selected' : ''}>${m ? m + ' minutes' : 'Until I end it'}</option>`).join('')}</select></div>
        <div class="field"><label for="teams">Teams</label><select id="teams">${[0, 2, 3, 4].map(n => `<option value="${n}" ${G.settings.teams === n ? 'selected' : ''}>${n ? n + ' teams' : 'No teams'}</option>`).join('')}</select></div>
        <label class="tog-row" style="align-self:flex-end;padding-bottom:8px"><input type="checkbox" id="shuffle" ${G.settings.shuffle ? 'checked' : ''}> Shuffle answer order</label>
        <div class="field"><label for="rankby">Rank pupils by</label><select id="rankby">${Object.entries(rankLabels()).map(([k, v]) => `<option value="${k}" ${G.settings.rankBy === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      ${fishing() ? fishingRulesHTML() : `<div class="tiers">${LB.TIERS.map(t => `<div class="tier"><b>${fmtMult(t.m)}</b><span>${t.label}</span></div>`).join('')}</div>
      <p class="hint" style="margin:0;max-width:56ch">${LB.BASE} points per correct answer, times the streak multiplier. A wrong answer resets the streak and pauses the pupil for 2 seconds.</p>`}
      <p class="err" id="setup-err" style="text-align:center"></p>
      <button class="btn primary big-go" data-act="open">Open the lobby</button>
    </div></div></div>`;
}

/* Link that opens the join page with this game's code filled in, for the QR code and for pushing to pupils' devices */
const joinLink = () => window.APP.joinUrl + '?code=' + G.code;

/* QR code that opens the join page with this game's code filled in */
function qrHTML() {
  if (!window.qrcode) return '';
  try {
    const q = window.qrcode(0, 'M'); q.addData(joinLink()); q.make();
    return `<div><span class="qlabel">Or scan</span><div class="join-qr" role="img" aria-label="QR code for the join page">${q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div></div>`;
  } catch (e) { return ''; }
}
function lobbyHTML() {
  const list = Object.values(G.pupils).sort((a, b) => a.joinedAt - b.joinedAt);
  return `<div class="wrap host">
    <div class="toolbar"><button class="btn ghost small" data-act="cancel-lobby">← Cancel</button><span class="sp"></span>${musicHTML()}${G.subject ? `<span class="chip subj">${esc(THEME.label(G.subject))}</span>` : ''}<span class="chip">${esc(G.title)}</span>${LB.helpButton()}</div>
    <section class="join-banner">
      <div><span class="qlabel">Go to</span><div class="join-url">${esc(JOIN_URL)}</div></div>
      <div><span class="qlabel">Game code</span><div class="join-code">${esc(G.code)}</div></div>
      ${qrHTML()}
    </section>
    <div class="join-link"><span class="qlabel">Joining link</span><input id="join-link" readonly value="${esc(joinLink())}" aria-label="Joining link for this game"><button class="btn small" data-act="copy-join">Copy link</button><span class="hint" id="join-msg" aria-live="polite"></span></div>
    <div class="main-head" style="margin-top:24px"><div><h1><span id="count">${list.length}</span> ${list.length === 1 ? 'pupil' : 'pupils'} joined</h1><p>Click a name to remove that pupil.</p></div>
      <div class="head-acts"><button class="btn primary big-go" data-act="start" ${list.length ? '' : 'disabled'}>Start game</button></div></div>
    ${G.settings.teams && list.length ? `<div class="ed-row" style="margin-bottom:10px"><button class="btn small" data-act="shuffle-teams">Shuffle teams</button></div>
      <div class="team-cols">${teamDefs().map(([name, colour], i) => `<div class="team-col" style="--team:${colour}"><h3>${esc(name)} <span class="hint">${list.filter(p => p.team === i).length}</span></h3>
        <div class="names">${list.filter(p => p.team === i).map(p => `<button class="name-chip pop" data-act="ask-kick" data-id="${p.pid}" title="Remove ${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div></div>`).join('')}</div>`
    : `<div class="names">${list.length ? list.map(p => `<button class="name-chip pop" data-act="ask-kick" data-id="${p.pid}" title="Remove ${esc(p.name)}">${esc(p.name)}</button>`).join('') : '<p class="hint">Waiting for pupils to join…</p>'}</div>`}
    ${kickConfirm()}
  </div>`;
}
function kickConfirm() {
  const p = ui.kick && G.pupils[ui.kick];
  return p ? `<div class="confirm" style="margin-top:16px">Remove ${esc(p.name)} from this game? That laptop and that name are blocked for the rest of the game. <button class="btn small danger" data-act="kick" data-id="${p.pid}">Remove</button><button class="btn small ghost" data-act="no-kick">Keep</button></div>` : '';
}

function boardRows() {
  const list = ranked(), by = G.settings.rankBy;
  if (!list.length) return '<p class="hint" style="padding:12px">No pupils yet.</p>';
  return list.map((p, i) => `<div class="lb-row ${i < 3 ? 'top' + (i + 1) : ''}">
    <span class="lb-rank">${i + 1}</span>
    <button class="lb-name" data-act="pupil" data-id="${p.pid}" title="See ${esc(p.name)}’s answers">${teamChip(p)}${esc(p.name)}${p.streak >= 3 ? LB.flames(p.streak) : ''}</button>
    <span class="lb-num ${by === 'points' ? 'key' : ''}">${fmtVal(val(p))}</span>
    <span class="lb-num ${by === 'correct' ? 'key' : ''}">${p.correct}/${p.answered}</span>
    <span class="lb-num ${by === 'accuracy' ? 'key' : ''}">${p.answered ? Math.round(100 * acc(p)) + '%' : '–'}</span>
    ${G.phase === 'playing' ? `<button class="lb-x" data-act="ask-kick" data-id="${p.pid}" aria-label="Remove ${esc(p.name)}">✕</button>` : ''}
  </div>`).join('');
}
function boardHTML() {
  return `<div class="lb">
    <div class="lb-row lb-head"><span class="lb-rank">#</span><span class="lb-name">Name</span><span class="lb-num">${fishing() ? 'Catch' : 'Points'}</span><span class="lb-num">Correct</span><span class="lb-num">Accuracy</span>${G.phase === 'playing' ? '<span></span>' : ''}</div>
    <div class="lb-body" id="board">${boardRows()}</div></div>`;
}
function statsHTML() {
  const ps = Object.values(G.pupils);
  const answered = ps.reduce((n, p) => n + p.answered, 0), correct = ps.reduce((n, p) => n + p.correct, 0);
  const rows = questionRows().filter(r => r.st.seen).sort((a, b) => a.pct - b.pct || b.st.seen - a.st.seen);
  const big = G.biggest;
  const bigHTML = fishing() ? `<h3 class="side-h">${LB.catchUnit(G.subject) ? 'Best treasure so far' : 'Biggest catch so far'}</h3>${big
    ? `<div class="big-catch">${LB.catchSVG(big, 96)}<div><b>${esc(big.who)}</b><span style="color:${LB.FISH_TIERS[big.tier].colour}">${LB.FISH_TIERS[big.tier].name} ${esc(big.name)}</span><span class="lb-num key">${LB.fmtCatch(big.kg)}</span></div></div>`
    : '<p class="hint">No fish yet.</p>'}` : '';
  return `${bigHTML}<div class="summary" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="stat"><div class="k">Answers</div><div class="v">${answered}</div></div>
      <div class="stat"><div class="k">Class accuracy</div><div class="v">${answered ? Math.round(100 * correct / answered) + '%' : '–'}</div></div>
    </div>
    <h3 class="side-h">Trickiest questions so far</h3>
    ${rows.length ? `<div class="tricky">${rows.slice(0, 6).map(r => `<div class="tricky-row">
      <div class="tricky-q">${qMini(r.q)}</div>
      <div class="tricky-m"><div class="meter"><i style="width:${Math.round(100 * r.pct)}%"></i></div><span class="lb-num">${Math.round(100 * r.pct)}% of ${r.st.seen}</span></div>
      ${r.topWrong ? `<div class="hint">Most common wrong answer: <strong>${LB.ansHTML(r.topWrong.raw)}</strong> (${r.topWrong.n})</div>` : ''}
    </div>`).join('')}</div>` : '<p class="hint">Stats appear as pupils answer.</p>'}`;
}
/* A question in a list: its picture as a thumbnail, then its words */
const qMini = q => `${q.image && LB.safeSrc(q.image) ? `<img class="q-thumb" src="${esc(LB.safeSrc(q.image))}" alt="">` : ''}${esc(q.q || (q.image ? '' : ''))}`;
function playingHTML() {
  return `<div class="wrap host wide">
    ${G.paused ? `<div class="pause-banner" role="status"><b>Paused</b><span>Eyes on the board. Pupils’ screens are frozen.</span><button class="btn primary" data-act="resume-game">▶ Resume</button></div>` : ''}
    ${frenzyOn() && !G.paused ? `<div class="frenzy-banner" role="status"><b>${esc(THEME.modes().event)}!</b><span>Every catch weighs double for <span id="frenzy-left">${Math.ceil((G.frenzyUntil - Date.now()) / 1000)}</span>s</span></div>` : ''}
    <div class="host-bar">
      ${LB.mark}
      <div class="host-code"><span class="qlabel">Join at ${esc(JOIN_URL)}</span><b>${esc(G.code)}</b></div>
      <span class="sp"></span>
      ${musicHTML()}${LB.helpButton()}
      <div class="stat"><div class="k">Pupils</div><div class="v" id="count">${Object.keys(G.pupils).length}</div></div>
      <div class="stat"><div class="k">Time left</div><div class="v" id="host-time">${G.endAt ? fmtTime(G.endAt - Date.now()) : '∞'}</div></div>
      ${ui.confirmEnd
        ? `<span class="confirm">End the game for everyone? <button class="btn small danger" data-act="end">End game</button><button class="btn small ghost" data-act="no-end">Keep playing</button></span>`
        : `${!fishing() ? '<button class="btn" data-act="present" id="present-btn" title="Show only the race, full screen (P)">Present</button>' : ''}<button class="btn ${G.paused ? 'primary' : ''}" data-act="${G.paused ? 'resume-game' : 'pause'}">${G.paused ? '▶ Resume' : '❚❚ Pause'}</button><button class="btn" data-act="ask-end">End game</button>`}
    </div>
    ${kickConfirm()}
    <div class="host-grid">
      <section style="min-width:0"><div id="teams-live">${teamsBarHTML()}</div><h2 class="side-h">Leaderboard · ranked by ${rankLabels()[G.settings.rankBy].toLowerCase()}</h2>${boardHTML()}</section>
      <aside id="stats" style="min-width:0">${statsHTML()}</aside>
    </div><div id="drawer">${pupilDrawer()}</div></div>`;
}
function pupilDrawer() {
  const p = ui.pupil && G.pupils[ui.pupil];
  if (!p) return '';
  const log = (p.log || []).slice().reverse();
  const acc = p.answered ? Math.round(100 * p.correct / p.answered) : 0;
  return `<aside class="drawer" role="dialog" aria-label="${esc(p.name)}’s answers">
    <div class="drawer-head"><div><span class="qlabel">Pupil</span><h2>${esc(p.name)}</h2></div><button class="btn small ghost" data-act="close-pupil" aria-label="Close">✕</button></div>
    <div class="summary" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="stat"><div class="k">Correct</div><div class="v">${p.correct}/${p.answered}</div></div>
      <div class="stat"><div class="k">Accuracy</div><div class="v">${p.answered ? acc + '%' : '–'}</div></div>
      <div class="stat"><div class="k">${fishing() ? 'Catch' : 'Points'}</div><div class="v">${fmtVal(val(p))}</div></div>
    </div>
    <h3 class="side-h" style="margin-top:16px">Answers, newest first</h3>
    ${log.length ? `<ol class="plog">${log.map(e => { const q = qById(e.qid); if (!q) return ''; return `<li class="${e.right ? 'ok' : 'no'}">
        <span class="mk" aria-label="${e.right ? 'Right' : 'Wrong'}">${e.right ? '✓' : '✗'}</span>
        <div><div class="plog-q">${esc(LB.qText(q))}</div><div class="hint">Answered <strong>${LB.ansHTML(q.answers[e.choice])}</strong>${e.right ? '' : ` · right answer <strong>${LB.ansHTML(q.answers[q.correct])}</strong>`}</div></div></li>`; }).join('')}</ol>`
      : '<p class="hint">No answers yet.</p>'}
    ${G.phase === 'playing' ? `<div class="ed-row" style="margin-top:12px">
      ${p.allowRejoinUntil > Date.now()
        ? `<span class="hint">${esc(p.name)} can now join on another laptop with the same name, for the next 2 minutes.</span>`
        : `<button class="btn small" data-act="allow-rejoin" data-id="${p.pid}">Let ${esc(p.name)} join on another laptop</button>`}
      <button class="btn small ghost danger" data-act="ask-kick" data-id="${p.pid}">Remove from game</button></div>` : ''}
  </aside>`;
}
function endedHTML() {
  const list = ranked(), rows = questionRows();
  const ps = Object.values(G.pupils);
  const answered = ps.reduce((n, p) => n + p.answered, 0), correct = ps.reduce((n, p) => n + p.correct, 0);
  const podium = list.slice(0, 3);
  return `<div class="wrap host wide">
    <div class="toolbar"><a class="btn ghost small" href="teacher.html">← Library</a><span class="sp"></span>${LB.mark}</div>
    <div class="main-head"><div><span class="qlabel">Game over · ${esc(G.title)}</span><h1 style="font-size:clamp(32px,5vw,52px)">Results</h1></div>
      <div class="head-acts"><button class="btn primary" data-act="download">⇩ Download results</button><button class="btn" data-act="download-csv" title="One row per pupil per question, for importing into another program">⇩ Pupil weaknesses (CSV)</button><button class="btn" data-act="again">Play again</button></div></div>
    ${G.settings.teams ? `<h2 class="side-h">Teams</h2>${teamsBarHTML()}<h2 class="side-h" style="margin-top:18px">Pupils</h2>` : ''}
    ${podium.length ? `<div class="podium">${podium.map((p, i) => `<div class="pod pod${i + 1}"><span class="pod-rank">${i + 1}</span><span class="pod-name">${esc(p.name)}</span><span class="pod-score">${G.settings.rankBy === 'points' ? (fishing() ? LB.fmtCatch(p.kg) : p.score.toLocaleString('en-GB') + ' pts') : G.settings.rankBy === 'correct' ? p.correct + ' correct' : Math.round(100 * acc(p)) + '%'}</span></div>`).join('')}</div>` : ''}
    ${fishing() && G.biggest ? `<div class="big-catch wide-catch">${LB.catchSVG(G.biggest, 110)}<div><span class="qlabel">${LB.catchUnit(G.subject) ? 'Best treasure of the game' : 'Biggest catch of the game'}</span><b>${esc(G.biggest.who)}</b><span style="color:${LB.FISH_TIERS[G.biggest.tier].colour}">${LB.FISH_TIERS[G.biggest.tier].name} ${esc(G.biggest.name)} · ${LB.fmtCatch(G.biggest.kg)}</span></div></div>` : ''}
    <div class="summary" style="margin-block:20px">
      <div class="stat"><div class="k">Pupils</div><div class="v">${ps.length}</div></div>
      <div class="stat"><div class="k">Answers</div><div class="v">${answered}</div></div>
      <div class="stat"><div class="k">Class accuracy</div><div class="v">${answered ? Math.round(100 * correct / answered) + '%' : '–'}</div></div>
      <div class="stat"><div class="k">Longest streak</div><div class="v">${Math.max(0, ...ps.map(p => p.best))}</div></div>
    </div>
    <div class="host-grid">
      <section style="min-width:0"><h2 class="side-h">Final leaderboard</h2>${boardHTML()}</section>
      <section style="min-width:0"><h2 class="side-h">Questions</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Question</th><th>Seen</th><th>Correct</th><th>Most common wrong answer</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${qMini(r.q)}</td><td class="num">${r.st.seen}</td><td class="num">${r.pct == null ? '–' : Math.round(100 * r.pct) + '%'}</td><td>${r.topWrong ? LB.ansHTML(r.topWrong.raw) + ` <span class="hint">(${r.topWrong.n})</span>` : '<span class="hint">–</span>'}</td></tr>`).join('')}
      </tbody></table></div></section>
    </div>
    <p class="hint" style="margin-top:20px">Click a name to see that pupil’s answers. Results are kept on this laptop only. Download them before closing if you want a copy.</p>
    <div id="drawer">${pupilDrawer()}</div>
  </div>`;
}

/* Slowly scroll a long leaderboard so everyone appears on the projector */
let scrollTimer = null;
function autoScroll() {
  clearInterval(scrollTimer);
  const b = document.getElementById('board');
  if (!b || G.phase !== 'playing') return;
  let pause = 60, dir = 1;
  scrollTimer = setInterval(() => {
    if (b.scrollHeight <= b.clientHeight + 2 || b.matches(':hover')) return;
    if (pause > 0) { pause--; return; }
    b.scrollTop += dir;
    if (b.scrollTop + b.clientHeight >= b.scrollHeight - 1) { pause = 60; dir = 0; setTimeout(() => { b.scrollTop = 0; dir = 1; }, 2400); }
  }, 40);
}

/* ---------- events ---------- */
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const act = t.dataset.act;
  switch (act) {
    case 'mode': readSetup(); G.settings.mode = t.dataset.mode; render(); break;
    case 'open': {
      readSetup();
      t.disabled = true; t.textContent = 'Opening…';
      G.code = String(Math.floor(100000 + Math.random() * 900000));
      try { if (!LB.kx.ok) throw 0; G.kx = await LB.kx.newPair(); }
      catch (err) { t.disabled = false; t.textContent = 'Open the lobby'; document.getElementById('setup-err').textContent = 'This browser can’t host a game. Open the page with https:// at the start of the address.'; return; }
      if (!(await openLobby())) {
        t.disabled = false; t.textContent = 'Open the lobby';
        document.getElementById('setup-err').textContent = 'Couldn’t open the lobby. Check your connection and try again.';
        return;
      }
      G.phase = 'lobby'; persist(true); render();
      break;
    }
    case 'resume': {
      const r = ui.resume; ui.resume = null;
      Object.assign(G, r, { subject: G.subject });
      G.blockedNames = G.blockedNames || [];
      t.disabled = true;
      if (G.phase !== 'ended') {
        await openLobby();
        await Promise.all(Object.keys(G.pupils).map(pupilChannel));
        Object.values(G.pupils).forEach(p => send(chans.get(p.pid), 'state', stateFor(p)));
        if (G.phase === 'playing') { startTick(); if (G.endAt && G.endAt < Date.now()) endGame(); }
      }
      render();
      break;
    }
    case 'discard': try { localStorage.removeItem(STORE); } catch (err) {} ui.resume = null; render(); break;
    case 'cancel-lobby':
      Object.values(G.pupils).forEach(p => send(chans.get(p.pid), 'kicked', { cancelled: true }));
      setTimeout(() => { chans.forEach((c, pid) => dropChannel(pid)); if (lobby) sb.removeChannel(lobby); lobby = null; }, 400);
      G.phase = 'setup'; G.pupils = {}; G.code = null; G.kx = null; G.blocked = []; G.blockedNames = [];
      try { localStorage.removeItem(STORE); } catch (err) {}
      render();
      break;
    case 'start': startGame(); break;
    case 'copy-join': {
      const box = document.getElementById('join-link'), msg = document.getElementById('join-msg');
      const fallback = () => { box.focus(); box.select(); if (msg) msg.textContent = 'Press Ctrl+C to copy.'; };
      try { navigator.clipboard.writeText(joinLink()).then(() => { if (msg) msg.textContent = 'Copied.'; }, fallback); } catch (err) { fallback(); }
      break;
    }
    case 'shuffle-teams': shuffleTeams(); Object.values(G.pupils).forEach(p => send(chans.get(p.pid), 'state', stateFor(p))); persist(); render(); break;
    case 'ask-kick': ui.kick = t.dataset.id; render(); break;
    case 'no-kick': ui.kick = null; render(); break;
    case 'kick': ui.kick = null; if (ui.pupil === t.dataset.id) ui.pupil = null; kick(t.dataset.id); break;
    case 'ask-end': ui.confirmEnd = true; render(); break;
    case 'pause': setPaused(true); break;
    case 'help': LB.tour.start(HOST_TOURS[tourKey()]()); break;
    case 'present': setPresent(true); break;
    case 'resume-game': setPaused(false); break;
    case 'pupil': ui.pupil = t.dataset.id; render(); break;
    case 'close-pupil': ui.pupil = null; render(); break;
    case 'allow-rejoin': { const p = G.pupils[t.dataset.id]; if (p) { p.allowRejoinUntil = Date.now() + 120000; persist(); render(); } break; }
    case 'no-end': ui.confirmEnd = false; render(); break;
    case 'end': endGame(); break;
    case 'download': download(); break;
    case 'download-csv': downloadCSV(); break;
    case 'music-mute': music.toggle(); t.textContent = music.muted ? '♪ Off' : '♪ On'; t.setAttribute('aria-pressed', music.muted); { const v = document.getElementById('music-vol'); if (v) v.disabled = music.muted; } break;
    case 'again': try { localStorage.removeItem(STORE); } catch (err) {} location.reload(); break;
  }
});

app.addEventListener('input', e => { if (e.target.id === 'music-vol') music.setVol(+e.target.value); });
document.addEventListener('keydown', e => {
  if (LB.tour.open()) return;
  if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && G) { LB.tour.start(HOST_TOURS[tourKey()]()); return; }
  if (e.key === 'Escape' && presenting) { setPresent(false); return; }
  if (e.key === 'Escape' && ui.pupil) { ui.pupil = null; render(); }
  const t = e.target.tagName;
  if ((e.key === 'p' || e.key === 'P') && !/INPUT|TEXTAREA|SELECT/.test(t) && G && G.phase === 'playing' && !fishing()) setPresent(!presenting);
});
document.addEventListener('click', e => { if (e.target.closest('[data-act="present-off"]')) setPresent(false); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presenting) setPresent(false); });

boot();
})();
