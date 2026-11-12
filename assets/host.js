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

const validQ = q => q && String(q.q || '').trim() && q.answers.filter(a => String(a).trim()).length >= 2 && String(q.answers[q.correct] ?? '').trim();

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
    if (g && g.setId === setId && g.phase !== 'setup' && Date.now() - g.savedAt < 3 * 3600e3) return g;
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
  const { data, error } = await sb.from('sets').select('id,title,questions').eq('id', setId).single();
  if (error || !data) return fatal('Couldn’t load that set', 'Check your connection, or go back to the library and try again.');
  // Drop blank answer slots and keep the correct answer pointing at the right one
  const questions = (data.questions || []).filter(validQ).map(q => {
    const kept = q.answers.map((a, j) => [String(a), j]).filter(([a]) => a.trim());
    return { id: q.id, q: q.q, answers: kept.map(k => k[0]), correct: kept.findIndex(k => k[1] === q.correct) };
  });
  if (!questions.length) return fatal('This set has no finished questions', 'Add at least one question with two answers first.');
  G = {
    code: null, setId, title: data.title || 'Untitled set', questions,
    settings: { minutes: 10, rankBy: 'points', mode: 'classic', shuffle: true },
    paused: false, pausedAt: null,
    biggest: null, frenzyUntil: null, nextFrenzyAt: null,
    phase: 'setup', endAt: null, startedAt: null, endedAt: null,
    pupils: {}, blocked: [], qstats: {}
  };
  questions.forEach(q => (G.qstats[q.id] = { seen: 0, right: 0, wrong: {} }));
  ui.resume = stored();
  render();
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
  const ch = await subscribe(LB.pupilChannel(G.code, pid), {
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
function newPupil(name, token) {
  let pid; do { pid = rid(10); } while (G.pupils[pid]);
  return { pid, token, name, score: 0, kg: 0, catches: 0, biggest: null, streak: 0, best: 0, answered: 0, correct: 0, deck: [], last: null, cur: null, perm: null, log: [], seq: 0, lockUntil: 0, lastActive: Date.now(), lastResult: null, joinedAt: Date.now() };
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
const fmtVal = v => (fishing() ? LB.fmtKg(v) : v.toLocaleString('en-GB'));
function qPayload(p) {
  const q = qById(p.cur);
  if (!q) return null;
  const perm = p.perm && p.perm.length === q.answers.length ? p.perm : q.answers.map((_, i) => i);
  return { seq: p.seq, q: q.q, answers: perm.map(i => q.answers[i]) };
}
function stateFor(p) {
  return {
    phase: G.phase, title: G.title, name: p.name,
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
  const reply = body => send(lobby, 'joined', { token: m.token, ...body });
  if (!m.token) return;
  if (G.phase === 'ended') return reply({ ok: false, msg: 'This game has finished.' });
  if (G.blocked.includes(m.token)) return reply({ ok: false, msg: 'Your teacher has removed you from this game.' });
  const chk = LB.checkName(m.name);
  if (!chk.ok) return reply({ ok: false, msg: chk.msg });
  const list = Object.values(G.pupils);
  let p = list.find(x => x.token === m.token);
  if (!p) {
    const same = list.find(x => x.name.toLowerCase() === chk.name.toLowerCase());
    if (same) {
      const recentlyActive = Date.now() - same.lastActive < 30000;
      if (G.phase === 'lobby' || recentlyActive) return reply({ ok: false, msg: `Someone called ${chk.name} is already playing. Add your surname initial.` });
      const old = chans.get(same.pid); if (old) send(old, 'replaced', {});
      same.token = m.token; p = same;               // rejoin on a new device: score kept
    } else {
      p = newPupil(chk.name, m.token);
      G.pupils[p.pid] = p;
      if (G.phase === 'playing') deal(p);
    }
  }
  p.lastActive = Date.now();
  const ch = await pupilChannel(p.pid);
  if (!ch) return reply({ ok: false, msg: 'The game couldn’t connect you. Try again.' });
  reply({ ok: true, pid: p.pid, name: p.name });
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
      catchMade = LB.rollFish(LB.lureFor(p.streak));
      catchMade.doubled = frenzyOn();
      if (catchMade.doubled) catchMade.kg = Math.round(catchMade.kg * 20) / 10;
      p.kg = Math.round((p.kg + catchMade.kg) * 10) / 10; p.catches++;
      if (!p.biggest || catchMade.kg > p.biggest.kg) p.biggest = { name: catchMade.name, tier: catchMade.tier, kg: catchMade.kg };
      if (!G.biggest || catchMade.kg > G.biggest.kg) G.biggest = { who: p.name, name: catchMade.name, tier: catchMade.tier, shape: catchMade.shape, kg: catchMade.kg };
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
  G.blocked.push(p.token);
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

/* ---------- ranking & results ---------- */
const acc = p => (p.answered ? p.correct / p.answered : 0);
function ranked() {
  const by = G.settings.rankBy;
  return Object.values(G.pupils).sort((a, b) => {
    if (by === 'correct') return b.correct - a.correct || val(b) - val(a) || a.name.localeCompare(b.name);
    if (by === 'accuracy') return (b.answered > 0) - (a.answered > 0) || acc(b) - acc(a) || b.answered - a.answered || a.name.localeCompare(b.name);
    return val(b) - val(a) || b.correct - a.correct || a.name.localeCompare(b.name);
  });
}
function reviewFor(p) {
  // Each question the pupil got wrong at least once: their latest wrong answer and the right one
  const seen = new Map();
  (p.log || []).forEach(e => { if (!e.right) seen.set(e.qid, e.choice); });
  return [...seen].slice(-30).map(([qid, choice]) => { const q = qById(qid); return q ? { q: q.q, yours: q.answers[choice], answer: q.answers[q.correct] } : null; }).filter(Boolean);
}
function finalFor(p) {
  const list = ranked();
  return { rank: list.indexOf(p) + 1, of: list.length, score: p.score, kg: p.kg, biggest: p.biggest, mode: G.settings.mode, answered: p.answered, correct: p.correct, best: p.best, rankBy: G.settings.rankBy, review: reviewFor(p) };
}
function questionRows() {
  return G.questions.map(q => {
    const st = G.qstats[q.id];
    const top = Object.entries(st.wrong).sort((a, b) => b[1] - a[1])[0];
    return { q, st, pct: st.seen ? st.right / st.seen : null, topWrong: top ? { text: q.answers[top[0]], n: top[1] } : null };
  });
}
async function download() {
  try { await window.APP.loadXLSX(); } catch (e) { return; }
  const fish = fishing();
  const pupils = [['Rank', 'Name', fish ? 'Total kg' : 'Points', 'Answered', 'Correct', 'Accuracy %', 'Best streak', ...(fish ? ['Fish caught', 'Biggest fish', 'Biggest fish kg'] : [])]];
  ranked().forEach((p, i) => pupils.push([i + 1, p.name, fish ? p.kg : p.score, p.answered, p.correct, p.answered ? Math.round(100 * acc(p)) : '', p.best,
    ...(fish ? [p.catches, p.biggest ? `${p.biggest.name} (${LB.FISH_TIERS[p.biggest.tier].name})` : '', p.biggest ? p.biggest.kg : ''] : [])]));
  const qs = [['Question', 'Times answered', 'Correct %', 'Most common wrong answer', 'Times chosen', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct answer']];
  questionRows().forEach(r => {
    const counts = r.q.answers.map((a, j) => `${a} (${j === r.q.correct ? r.st.right : (r.st.wrong[j] || 0)})`);
    while (counts.length < 4) counts.push('');
    qs.push([r.q.q, r.st.seen, r.pct == null ? '' : Math.round(100 * r.pct), r.topWrong ? r.topWrong.text : '', r.topWrong ? r.topWrong.n : '', ...counts, r.q.answers[r.q.correct]]);
  });
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(pupils); s1['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 30 }, { wch: 15 }];
  const s2 = XLSX.utils.aoa_to_sheet(qs); s2['!cols'] = [{ wch: 50 }, { wch: 14 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, s1, 'Pupils');
  XLSX.utils.book_append_sheet(wb, s2, 'Questions');
  const log = [['Name', 'Question', 'Their answer', 'Correct answer', 'Right?']];
  ranked().forEach(p => (p.log || []).forEach(e => { const q = qById(e.qid); if (q) log.push([p.name, q.q, q.answers[e.choice], q.answers[q.correct], e.right ? 'Yes' : 'No']); }));
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
  want(key) {
    if (key === this.key) return;
    this.key = key;
    const start = () => {
      if (this.el) { this.el.pause(); this.el = null; }
      if (!key) return;
      const a = new Audio(TRACKS[key]); a.loop = true; a.volume = 0; this.el = a;
      a.play().then(() => this.fadeTo(this.target(), 1200)).catch(() => {});
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
    const d = document.getElementById('drawer');
    if (d && ui.pupil) { const sc = d.querySelector('.drawer'); const top = sc ? sc.scrollTop : 0; d.innerHTML = pupilDrawer(); typeset(d); const n2 = d.querySelector('.drawer'); if (n2) n2.scrollTop = top; }
  }, 300);
}
const rankLabels = () => ({ points: fishing() ? 'Total kg' : 'Points', correct: 'Correct answers', accuracy: 'Accuracy' });

function render() {
  if (!G) return;
  if (G.phase === 'setup') app.innerHTML = setupHTML();
  else if (G.phase === 'lobby') app.innerHTML = lobbyHTML();
  else if (G.phase === 'playing') app.innerHTML = playingHTML();
  else app.innerHTML = endedHTML();
  document.body.classList.toggle('water', G.phase === 'playing' && fishing());
  music.want(musicKey());
  typeset(app);
  autoScroll();
}

function fishingRulesHTML() {
  return `<div class="fish-tiers">${LB.FISH_TIERS.map((t, i) => `<div class="fish-tier">${LB.fishSVG(i, t.fish[0][1], 64)}<b style="color:${t.colour}">${t.name}</b><span>${t.min}–${t.max} kg</span></div>`).join('')}</div>
    <p class="hint" style="margin:0;max-width:60ch">Every right answer catches a fish. A streak raises the pupil’s lure level (up to 4), which roughly doubles the chance of Rare or better. A wrong answer catches nothing, resets the streak and pauses the pupil for 2 seconds. About every 3 minutes a 30-second ${esc(window.APP.modes.event)} doubles every catch.</p>`;
}
function readSetup() {
  const m = document.getElementById('minutes'), r = document.getElementById('rankby');
  if (m) G.settings.minutes = +m.value;
  if (r) G.settings.rankBy = r.value;
  const sh = document.getElementById('shuffle'); if (sh) G.settings.shuffle = sh.checked;
}
function setupHTML() {
  const r = ui.resume;
  return `<div class="wrap host">
    <div class="toolbar"><a class="btn ghost small" href="teacher.html">← Library</a><span class="sp"></span>${LB.mark}</div>
    ${r ? `<div class="ro" style="margin-bottom:20px"><strong>Game ${esc(r.code)} is still open on this laptop</strong> (${Object.keys(r.pupils).length} pupils, ${r.phase === 'ended' ? 'finished' : r.phase === 'lobby' ? 'in the lobby' : 'in progress'}).
      <button class="btn small primary" data-act="resume">${r.phase === 'ended' ? 'Show its results' : 'Resume it'}</button><button class="btn small ghost" data-act="discard">Start fresh</button></div>` : ''}
    <div class="stage center"><div class="setup">
      <span class="qlabel">Host a live game</span>
      <h1 style="font-size:clamp(30px,5vw,48px)">${esc(G.title)}</h1>
      <p class="hint" style="margin:0">${G.questions.length} ${G.questions.length === 1 ? 'question' : 'questions'}, shuffled for each pupil and repeated until time is up.</p>
      <div class="modes" role="radiogroup" aria-label="Game mode">
        <button class="mode ${fishing() ? '' : 'on'}" role="radio" aria-checked="${!fishing()}" data-act="mode" data-mode="classic"><b>${esc(window.APP.modes.classic)}</b><span>Points for every right answer, boosted by streaks.</span></button>
        <button class="mode fishing ${fishing() ? 'on' : ''}" role="radio" aria-checked="${fishing()}" data-act="mode" data-mode="fishing"><b>${esc(window.APP.modes.fishing)}</b><span>Right answers catch fish. Streaks bring rarer, heavier fish.</span></button>
      </div>
      <div class="ed-row" style="justify-content:center">
        <div class="field"><label for="minutes">Game length</label><select id="minutes">${[3, 5, 10, 15, 20, 30, 0].map(m => `<option value="${m}" ${G.settings.minutes === m ? 'selected' : ''}>${m ? m + ' minutes' : 'Until I end it'}</option>`).join('')}</select></div>
        <label class="tog-row" style="align-self:flex-end;padding-bottom:8px"><input type="checkbox" id="shuffle" ${G.settings.shuffle ? 'checked' : ''}> Shuffle answer order</label>
        <div class="field"><label for="rankby">Rank pupils by</label><select id="rankby">${Object.entries(rankLabels()).map(([k, v]) => `<option value="${k}" ${G.settings.rankBy === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      ${fishing() ? fishingRulesHTML() : `<div class="tiers">${LB.TIERS.map(t => `<div class="tier"><b>${fmtMult(t.m)}</b><span>${t.label}</span></div>`).join('')}</div>
      <p class="hint" style="margin:0;max-width:56ch">${LB.BASE} points per correct answer, times the streak multiplier. A wrong answer resets the streak and pauses the pupil for 2 seconds.</p>`}
      <p class="err" id="setup-err" style="text-align:center"></p>
      <button class="btn primary big-go" data-act="open">Open the lobby</button>
    </div></div></div>`;
}

function lobbyHTML() {
  const list = Object.values(G.pupils).sort((a, b) => a.joinedAt - b.joinedAt);
  return `<div class="wrap host">
    <div class="toolbar"><button class="btn ghost small" data-act="cancel-lobby">← Cancel</button><span class="sp"></span>${musicHTML()}<span class="chip">${esc(G.title)}</span></div>
    <section class="join-banner">
      <div><span class="qlabel">Go to</span><div class="join-url">${esc(JOIN_URL)}</div></div>
      <div><span class="qlabel">Game code</span><div class="join-code">${esc(G.code)}</div></div>
    </section>
    <div class="main-head" style="margin-top:24px"><div><h1><span id="count">${list.length}</span> ${list.length === 1 ? 'pupil' : 'pupils'} joined</h1><p>Click a name to remove that pupil.</p></div>
      <div class="head-acts"><button class="btn primary big-go" data-act="start" ${list.length ? '' : 'disabled'}>Start game</button></div></div>
    <div class="names">${list.length ? list.map(p => `<button class="name-chip pop" data-act="ask-kick" data-id="${p.pid}" title="Remove ${esc(p.name)}">${esc(p.name)}</button>`).join('') : '<p class="hint">Waiting for pupils to join…</p>'}</div>
    ${kickConfirm()}
  </div>`;
}
function kickConfirm() {
  const p = ui.kick && G.pupils[ui.kick];
  return p ? `<div class="confirm" style="margin-top:16px">Remove ${esc(p.name)} from this game? They won’t be able to rejoin. <button class="btn small danger" data-act="kick" data-id="${p.pid}">Remove</button><button class="btn small ghost" data-act="no-kick">Keep</button></div>` : '';
}

function boardRows() {
  const list = ranked(), by = G.settings.rankBy;
  if (!list.length) return '<p class="hint" style="padding:12px">No pupils yet.</p>';
  return list.map((p, i) => `<div class="lb-row ${i < 3 ? 'top' + (i + 1) : ''}">
    <span class="lb-rank">${i + 1}</span>
    <button class="lb-name" data-act="pupil" data-id="${p.pid}" title="See ${esc(p.name)}’s answers">${esc(p.name)}${p.streak >= 3 ? LB.flames(p.streak) : ''}</button>
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
  const bigHTML = fishing() ? `<h3 class="side-h">Biggest catch so far</h3>${big
    ? `<div class="big-catch">${LB.fishSVG(big.tier, big.shape, 96)}<div><b>${esc(big.who)}</b><span style="color:${LB.FISH_TIERS[big.tier].colour}">${LB.FISH_TIERS[big.tier].name} ${esc(big.name)}</span><span class="lb-num key">${LB.fmtKg(big.kg)}</span></div></div>`
    : '<p class="hint">No fish yet.</p>'}` : '';
  return `${bigHTML}<div class="summary" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="stat"><div class="k">Answers</div><div class="v">${answered}</div></div>
      <div class="stat"><div class="k">Class accuracy</div><div class="v">${answered ? Math.round(100 * correct / answered) + '%' : '–'}</div></div>
    </div>
    <h3 class="side-h">Trickiest questions so far</h3>
    ${rows.length ? `<div class="tricky">${rows.slice(0, 6).map(r => `<div class="tricky-row">
      <div class="tricky-q">${esc(r.q.q)}</div>
      <div class="tricky-m"><div class="meter"><i style="width:${Math.round(100 * r.pct)}%"></i></div><span class="lb-num">${Math.round(100 * r.pct)}% of ${r.st.seen}</span></div>
      ${r.topWrong ? `<div class="hint">Most common wrong answer: <strong>${esc(r.topWrong.text)}</strong> (${r.topWrong.n})</div>` : ''}
    </div>`).join('')}</div>` : '<p class="hint">Stats appear as pupils answer.</p>'}`;
}
function playingHTML() {
  return `<div class="wrap host wide">
    ${G.paused ? `<div class="pause-banner" role="status"><b>Paused</b><span>Eyes on the board. Pupils’ screens are frozen.</span><button class="btn primary" data-act="resume-game">▶ Resume</button></div>` : ''}
    ${frenzyOn() && !G.paused ? `<div class="frenzy-banner" role="status"><b>${esc(window.APP.modes.event)}!</b><span>Every catch weighs double for <span id="frenzy-left">${Math.ceil((G.frenzyUntil - Date.now()) / 1000)}</span>s</span></div>` : ''}
    <div class="host-bar">
      ${LB.mark}
      <div class="host-code"><span class="qlabel">Join at ${esc(JOIN_URL)}</span><b>${esc(G.code)}</b></div>
      <span class="sp"></span>
      ${musicHTML()}
      <div class="stat"><div class="k">Pupils</div><div class="v" id="count">${Object.keys(G.pupils).length}</div></div>
      <div class="stat"><div class="k">Time left</div><div class="v" id="host-time">${G.endAt ? fmtTime(G.endAt - Date.now()) : '∞'}</div></div>
      ${ui.confirmEnd
        ? `<span class="confirm">End the game for everyone? <button class="btn small danger" data-act="end">End game</button><button class="btn small ghost" data-act="no-end">Keep playing</button></span>`
        : `<button class="btn ${G.paused ? 'primary' : ''}" data-act="${G.paused ? 'resume-game' : 'pause'}">${G.paused ? '▶ Resume' : '❚❚ Pause'}</button><button class="btn" data-act="ask-end">End game</button>`}
    </div>
    ${kickConfirm()}
    <div class="host-grid">
      <section style="min-width:0"><h2 class="side-h">Leaderboard · ranked by ${rankLabels()[G.settings.rankBy].toLowerCase()}</h2>${boardHTML()}</section>
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
        <div><div class="plog-q">${esc(q.q)}</div><div class="hint">Answered <strong>${esc(q.answers[e.choice])}</strong>${e.right ? '' : ` · right answer <strong>${esc(q.answers[q.correct])}</strong>`}</div></div></li>`; }).join('')}</ol>`
      : '<p class="hint">No answers yet.</p>'}
    ${G.phase === 'playing' ? `<button class="btn small ghost danger" data-act="ask-kick" data-id="${p.pid}" style="margin-top:12px">Remove from game</button>` : ''}
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
      <div class="head-acts"><button class="btn primary" data-act="download">⇩ Download results</button><button class="btn" data-act="again">Play again</button></div></div>
    ${podium.length ? `<div class="podium">${podium.map((p, i) => `<div class="pod pod${i + 1}"><span class="pod-rank">${i + 1}</span><span class="pod-name">${esc(p.name)}</span><span class="pod-score">${G.settings.rankBy === 'points' ? (fishing() ? LB.fmtKg(p.kg) : p.score.toLocaleString('en-GB') + ' pts') : G.settings.rankBy === 'correct' ? p.correct + ' correct' : Math.round(100 * acc(p)) + '%'}</span></div>`).join('')}</div>` : ''}
    ${fishing() && G.biggest ? `<div class="big-catch wide-catch">${LB.fishSVG(G.biggest.tier, G.biggest.shape, 110)}<div><span class="qlabel">Biggest catch of the game</span><b>${esc(G.biggest.who)}</b><span style="color:${LB.FISH_TIERS[G.biggest.tier].colour}">${LB.FISH_TIERS[G.biggest.tier].name} ${esc(G.biggest.name)} · ${LB.fmtKg(G.biggest.kg)}</span></div></div>` : ''}
    <div class="summary" style="margin-block:20px">
      <div class="stat"><div class="k">Pupils</div><div class="v">${ps.length}</div></div>
      <div class="stat"><div class="k">Answers</div><div class="v">${answered}</div></div>
      <div class="stat"><div class="k">Class accuracy</div><div class="v">${answered ? Math.round(100 * correct / answered) + '%' : '–'}</div></div>
      <div class="stat"><div class="k">Longest streak</div><div class="v">${Math.max(0, ...ps.map(p => p.best))}</div></div>
    </div>
    <div class="host-grid">
      <section style="min-width:0"><h2 class="side-h">Final leaderboard</h2>${boardHTML()}</section>
      <section style="min-width:0"><h2 class="side-h">Questions</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Question</th><th>Seen</th><th>Correct</th><th>Most common wrong answer</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.q.q)}</td><td class="num">${r.st.seen}</td><td class="num">${r.pct == null ? '–' : Math.round(100 * r.pct) + '%'}</td><td>${r.topWrong ? esc(r.topWrong.text) + ` <span class="hint">(${r.topWrong.n})</span>` : '<span class="hint">–</span>'}</td></tr>`).join('')}
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
      Object.assign(G, r);
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
      G.phase = 'setup'; G.pupils = {}; G.code = null;
      try { localStorage.removeItem(STORE); } catch (err) {}
      render();
      break;
    case 'start': startGame(); break;
    case 'ask-kick': ui.kick = t.dataset.id; render(); break;
    case 'no-kick': ui.kick = null; render(); break;
    case 'kick': ui.kick = null; if (ui.pupil === t.dataset.id) ui.pupil = null; kick(t.dataset.id); break;
    case 'ask-end': ui.confirmEnd = true; render(); break;
    case 'pause': setPaused(true); break;
    case 'resume-game': setPaused(false); break;
    case 'pupil': ui.pupil = t.dataset.id; render(); break;
    case 'close-pupil': ui.pupil = null; render(); break;
    case 'no-end': ui.confirmEnd = false; render(); break;
    case 'end': endGame(); break;
    case 'download': download(); break;
    case 'music-mute': music.toggle(); t.textContent = music.muted ? '♪ Off' : '♪ On'; t.setAttribute('aria-pressed', music.muted); { const v = document.getElementById('music-vol'); if (v) v.disabled = music.muted; } break;
    case 'again': try { localStorage.removeItem(STORE); } catch (err) {} location.reload(); break;
  }
});

app.addEventListener('input', e => { if (e.target.id === 'music-vol') music.setVol(+e.target.value); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.pupil) { ui.pupil = null; render(); } });

boot();
})();
