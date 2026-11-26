/* Quiz app — pupil page: join with a code and a name, then answer at your own pace.
   No account and nothing saved online. The teacher's screen marks every answer. */
(function () {
'use strict';
if (!window.APP.configured) return; // config.js shows the setup message

const { esc, fmtTime, multFor, fmtMult, typeset } = LB;
const sb = LB.client();
const app = document.getElementById('app');
const SESSION = window.APP.storagePrefix + '.pupil', KEYS = window.APP.storagePrefix + '.keys';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
// This browser's key pair. The public half identifies this pupil to the teacher's tab; the private half never leaves this laptop.
let keys = store.get(KEYS);
async function myKeys() {
  if (!keys || !keys.pub || !keys.priv) { keys = await LB.kx.newPair(); store.set(KEYS, keys); }
  return keys;
}

let S = { screen: 'join', code: '', name: '', score: 0, streak: 0, answered: 0, correct: 0 };
let ch = null, retryT = null, tickT = null, waitT = null;

/* ---------- realtime ---------- */
function subscribe(name, handlers) {
  return new Promise(resolve => {
    const c = sb.channel(name, { config: { broadcast: { self: false } } });
    Object.entries(handlers).forEach(([ev, fn]) => c.on('broadcast', { event: ev }, ({ payload }) => fn(payload || {})));
    let done = false;
    c.subscribe(status => {
      if (status === 'SUBSCRIBED' && !done) { done = true; resolve(c); }
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !done) { done = true; resolve(null); }
    });
  });
}
const send = (event, payload) => ch && ch.send({ type: 'broadcast', event, payload }).catch(() => {});
function retry(fn, ms = 3000) { clearInterval(retryT); fn(); retryT = setInterval(fn, ms); }
function stopRetry() { clearInterval(retryT); retryT = null; }

async function join(code, name) {
  S = { ...S, screen: 'connecting', code, name, msg: '' }; render();
  let settled = false, t = null, k;
  try { if (!LB.kx.ok) throw 0; k = await myKeys(); }
  catch (e) { S.screen = 'join'; S.msg = 'This browser can’t join. Open the page with https:// at the start of the address, or try another browser.'; return render(); }
  const lobby = await subscribe(LB.lobbyChannel(code), {
    joined: async m => {
      if (m.to !== k.pub || settled) return;
      if (!m.ok) { settled = true; clearTimeout(t); sb.removeChannel(lobby); S.screen = 'join'; S.msg = String(m.msg || 'Couldn’t join.'); return render(); }
      let chan;
      try { if (!LB.kx.validPub(m.hpub)) throw 0; chan = await LB.kx.secret(k.priv, m.hpub, code); } catch (e) { return; }
      if (settled) return;
      settled = true; clearTimeout(t); sb.removeChannel(lobby);
      // A Le Petit Bistro game: hand the pupil's channel to the bistro page
      if (m.game === 'bistro') { store.set(window.APP.storagePrefix + '.bistro', { code, chan, name: m.name, at: Date.now() }); location.href = 'bistro/#play'; return; }
      S.chan = chan; S.name = m.name;
      store.set(SESSION, { code, chan, name: m.name, at: Date.now() });
      connect();
    }
  });
  if (!lobby) { S.screen = 'join'; S.msg = 'Couldn’t connect. Check the internet connection and try again.'; return render(); }
  lobby.send({ type: 'broadcast', event: 'join', payload: { pub: k.pub, name } }).catch(() => {});
  t = setTimeout(() => {
    if (settled) return; settled = true; sb.removeChannel(lobby);
    S.screen = 'join'; S.msg = `No game found with code ${code}. Check the code on the board.`; render();
  }, 7000);
}

async function connect() {
  S.screen = S.screen === 'join' ? 'connecting' : S.screen; render();
  if (ch) { sb.removeChannel(ch); ch = null; }
  ch = await subscribe(LB.pupilChannel(S.code, S.chan), {
    state: onState, result: onResult, mresult: onMatchResult, letter: r => { if (arc && S.q && r.seq === S.q.seq && arc.letter) { S.q.shape = r.shape; S.q.misses = r.misses; arc.letter(r); } },
    kicked: m => leave(m.cancelled ? 'Your teacher closed the game.' : 'Your teacher has removed you from this game.'),
    replaced: () => leave('You joined this game on another laptop.')
  });
  if (!ch) { S.screen = 'lost'; return render(); }
  S.awaitingState = true;
  retry(() => send('hello', {}));
  clearTimeout(waitT);
  waitT = setTimeout(() => { if (S.awaitingState) { stopRetry(); S.screen = 'lost'; render(); } }, 15000);
}
function leave(msg) {
  stopRetry(); clearInterval(tickT); clearTimeout(waitT);
  if (ch) { sb.removeChannel(ch); ch = null; }
  store.del(SESSION);
  S = { screen: 'join', code: '', name: S.name || '', msg: msg || '', score: 0, streak: 0, answered: 0, correct: 0 };
  render();
  THEME.takeover(null, render);   // back to the home look
}

/* ---------- messages from the teacher's screen ---------- */
function onState(st) {
  if (S.awaitingState) { S.awaitingState = false; stopRetry(); clearTimeout(waitT); }
  if ((st.subject || null) !== THEME.current) THEME.takeover(st.subject, render);   // the subject's look takes over
  S.subject = st.subject || null;
  if (st.runner) S.runner = st.runner;
  S.team = st.team || null;
  Object.assign(S, { title: st.title, name: st.name, score: st.score, streak: st.streak, answered: st.answered, correct: st.correct, mode: st.mode, kg: st.kg || 0, lure: st.lure || 1, style: st.style || 'quiz' });
  S.frenzyUntil = st.frenzyIn ? Date.now() + st.frenzyIn : 0;
  S.paused = !!st.paused;
  S.endAt = st.endIn != null ? Date.now() + st.endIn : null;
  if (st.phase === 'lobby') { S.screen = 'lobby'; return render(); }
  if (st.phase === 'ended') { stopRetry(); clearInterval(tickT); S.final = st.final; S.screen = 'ended'; store.del(SESSION); return render(); }
  // playing
  startTick();
  if (st.cls) {
    if (st.cls.answered || st.cls.phase !== 'question') stopRetry();
    const fresh = !S.cls || S.cls.n !== st.cls.n;
    if (fresh) { S.bet = null; S.sentChoice = null; }
    S.cls = st.cls; S.clsEndAt = Date.now() + (st.cls.endIn || 0); S.screen = 'class';
    if (st.cls.phase === 'reveal' && st.cls.last && !st.cls.last.none && S.revealedN !== st.cls.n) { S.revealedN = st.cls.n; if (st.cls.last.right) RUNNER.boost(); else RUNNER.trip(); }
    return render();
  }
  if (arcade()) {
    const sameA = S.q && st.q && S.q.seq === st.q.seq;
    if (S.screen === 'arcade' && sameA) { if (st.q.shape && arc && arc.letter && !S.arcWait) { S.q = st.q; arc.letter({ shape: st.q.shape, misses: st.q.misses || [] }); } return render(); }
    if (S.screen === 'arcade' && S.arcWait) return render();   // a result is on screen; the next question follows it
    S.q = st.q; S.result = null; S.screen = 'arcade'; S.lockUntil = Date.now() + (st.lockMs || 0);
    render(); arcRound(); return;
  }
  const sameQ = S.q && st.q && S.q.seq === st.q.seq;
  if (sameQ && (S.screen === 'question' || S.screen === 'checking')) return render();
  if (S.screen === 'casting') return;
  if (S.screen === 'feedback' && S.nextQ && st.q && S.nextQ.seq === st.q.seq) return render();
  S.q = st.q; S.result = null;
  S.lockUntil = Date.now() + (st.lockMs || 0);
  S.screen = 'ready';
  render();
}
function onResult(r) {
  if (arcade() && S.screen === 'arcade') return arcResult(r);
  if (!S.q || r.seq !== S.q.seq || S.screen !== 'checking') return;
  stopRetry();
  S.result = r;
  if (r.right) RUNNER.boost(); else RUNNER.trip();
  Object.assign(S, { score: r.score, streak: r.streak, answered: r.answered, correct: r.correct, kg: r.kg || 0, lure: r.lure || 1 });
  S.nextQ = r.next;
  S.lockUntil = Date.now() + r.lockMs;
  // Fishing mode: a right answer plays a quick cast before the catch card
  if (r.fish && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    S.screen = 'casting'; render();
    setTimeout(() => { if (S.screen === 'casting') { S.screen = 'feedback'; render(); } }, 1000);
    return;
  }
  S.screen = 'feedback';
  render();
  if (r.lockMs) setTimeout(() => {
    const b = document.getElementById('go');
    if (b && S.screen === 'feedback') { b.disabled = false; b.classList.remove('locking'); b.querySelector('.lbl').textContent = 'Next question'; b.focus(); }
  }, r.lockMs);
}

/* ---------- arcade styles (games.js): the same questions as a maze, a plane or moles ---------- */
const arcade = () => window.GAMES && GAMES.isGame(S.style);
let arc = null, arcT = 0;
function arcMount() {
  const el = document.getElementById('arcade');
  if (!el) return;
  if (arc && el.firstElementChild) return;
  if (arc) arc.destroy();
  arc = GAMES.mount(el, S.style, {
    onPick: j => { if (S.paused || !S.q) return; S.choice = j; const seq = S.q.seq; retry(() => send('answer', { seq, choice: j })); },
    onType: text => { if (S.paused || !S.q) return; const seq = S.q.seq; retry(() => send('type', { seq, text })); },
    onLetter: ch => { if (S.paused || !S.q) return; send('letter', { seq: S.q.seq, ch }); },
    onMatch: (item, ans) => { if (S.paused || !S.q) return; const seq = S.q.seq; retry(() => send('match', { seq, item, ans })); }
  });
}
function arcRound() {
  clearTimeout(arcT);
  arcMount();
  if (!arc || !S.q) return;
  const wait = Math.max(0, (S.lockUntil || 0) - Date.now());
  arcT = setTimeout(() => { S.arcWait = false; if (arc && S.q) arc.question(S.q); }, wait);
}
function arcResult(r) {
  if (!S.q || r.seq !== S.q.seq || S.arcWait) return;
  stopRetry();
  S.result = r; S.arcWait = true;
  if (r.right) RUNNER.boost(); else RUNNER.trip();
  Object.assign(S, { score: r.score, streak: r.streak, answered: r.answered, correct: r.correct, kg: r.kg || 0, lure: r.lure || 1 });
  const note = r.right ? (r.fish ? `${r.fish.icon ? 'You found' : 'You caught'} ${LB.catchPhrase(r.fish, S.subject)}! ${LB.fmtCatch(r.fish.kg, S.subject)}` : `Correct! +${r.gain}`) : (fishing() ? LB.missText(S.subject) : 'Not quite');
  if (arc) arc.result({ ...r, note });
  updateHud();
  S.q = r.next; S.lockUntil = Date.now() + Math.max(r.lockMs || 0, r.right ? 900 : 1800);
  arcRound();
}
/* Matching games: each pair is marked on its own; a finished board brings the next one */
function onMatchResult(r) {
  if (!arc || !S.q || r.seq !== S.q.seq) return;
  stopRetry();
  if (r.score != null) { Object.assign(S, { score: r.score, streak: r.streak, answered: r.answered, correct: r.correct, kg: r.kg || 0, lure: r.lure || 1 }); if (r.right) RUNNER.boost(); else RUNNER.trip(); }
  arc.matchResult(r); updateHud();
  if (r.next) { const nx = r.next; S.arcWait = true; setTimeout(() => { S.q = nx; S.arcWait = false; if (arc) arc.question(nx); }, 1100); }
}
function updateHud() { const h = document.getElementById('hud-slot'); if (h) h.innerHTML = hud(); }

function clsPick(j) {
  const c = S.cls;
  if (!c || c.phase !== 'question' || c.answered || S.sentChoice != null || S.paused || j >= c.q.answers.length) return;
  S.sentChoice = j; render();
  const seq = c.n, bet = S.bet;
  retry(() => send('answer', { seq, choice: j, bet }));
}

/* ---------- actions ---------- */
function answer(j) {
  if (S.paused) return;
  if (S.screen !== 'question' || !S.q || j >= S.q.answers.length) return;
  S.choice = j; S.screen = 'checking'; render();
  const seq = S.q.seq;
  retry(() => send('answer', { seq, choice: j }));
}
function nextQuestion() {
  if (S.paused) return;
  if (Date.now() < (S.lockUntil || 0)) return;
  if (S.screen === 'feedback') { S.q = S.nextQ; S.result = null; }
  if (!S.q) return;
  S.screen = 'question'; render();
}
function startTick() {
  if (tickT) return;
  tickT = setInterval(() => {
    if (S.paused) return;
    const el = document.getElementById('hud-time');
    const cl = document.getElementById('cls-left');
    if (cl && S.cls) { const left = Math.ceil((S.clsEndAt - Date.now()) / 1000); if (left > 0) cl.textContent = left; else if (S.screen === 'class' && !S.cls.answered && S.cls.phase === 'question') render(); }
    const fz = document.getElementById('frenzy-left');
    if (fz) { const f = Math.ceil((S.frenzyUntil - Date.now()) / 1000); if (f > 0) fz.textContent = f; else { S.frenzyUntil = 0; render(); } }
    if (!S.endAt) return;
    const left = S.endAt - Date.now();
    if (el) el.textContent = fmtTime(left);
    if (left <= 0 && !['ended', 'timeup'].includes(S.screen)) { stopRetry(); S.screen = 'timeup'; render(); }
  }, 250);
}

/* ---------- rendering ---------- */
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const fishing = () => S.mode === 'fishing';
const lurePips = n => `<span class="flames lure" aria-hidden="true">${[1, 2, 3, 4].map(i => `<i class="${n >= i ? 'on' : ''}"></i>`).join('')}</span>`;
function frenzyBar() {
  return fishing() && S.frenzyUntil > Date.now() ? `<div class="frenzy-banner" role="status"><b>${esc(THEME.modes().event)}!</b><span>Every catch weighs double for <span id="frenzy-left">${Math.ceil((S.frenzyUntil - Date.now()) / 1000)}</span>s</span></div>` : '';
}
const teamLine = () => (S.team ? `<div class="team-strip" style="--team:${esc(S.team.colour)}">Team <b>${esc(S.team.name)}</b></div>` : '');
function hud() {
  if (fishing()) return `${frenzyBar()}${teamLine()}<div class="hud pupil-hud fish-hud">
    <div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${S.endAt ? fmtTime(S.endAt - Date.now()) : '∞'}</div></div>
    <div class="stat"><div class="k">Total ${LB.catchNoun(S.subject)}</div><div class="v">${LB.fmtCatch(S.kg, S.subject)}</div></div>
    <div class="stat mult"><div class="k">Lure level</div><div class="v">${S.lure}${lurePips(S.lure)}</div></div>
  </div>`;
  const showNext = S.screen === 'question' || S.screen === 'ready' || S.screen === 'arcade';
  const m = showNext ? multFor(S.streak + 1) : multFor(Math.max(1, S.streak));
  return `${teamLine()}<div class="hud pupil-hud">
    <div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${S.endAt ? fmtTime(S.endAt - Date.now()) : '∞'}</div></div>
    <div class="stat"><div class="k">Points</div><div class="v">${S.score.toLocaleString('en-GB')}</div></div>
    <div class="stat"><div class="k">Streak</div><div class="v">${S.streak}${LB.flames(S.streak)}</div></div>
    <div class="stat mult"><div class="k">${showNext ? 'Next correct' : 'Multiplier'}</div><div class="v">${fmtMult(m)}</div></div>
  </div>`;
}
function answersHTML(done) {
  const q = S.q, r = S.result;
  return `<div class="answers ${LB.hasImgAnswers(q) ? 'pics' : ''}">${q.answers.map((a, j) => {
    let cls = `ans a${j}`;
    if (done && r) cls += j === r.correctIndex ? ' right' : j === r.choice ? ' wrong' : ' dim';
    else if (S.screen === 'checking') cls += j === S.choice ? ' picked' : ' dim';
    return `<button class="${cls}" data-act="answer" data-i="${j}" ${S.screen !== 'question' ? 'disabled' : ''}><span class="key">${THEME.keyLabel(j)}</span><span>${LB.ansHTML(a)}</span></button>`;
  }).join('')}</div>`;
}
function joinHTML() {
  return `<div class="gate"><form class="gate-card" id="join">
    ${LB.mark}
    ${window.APP.schoolLine()}
    <h1 style="font-size:24px">Join a game</h1>
    <div class="field"><label for="code">Game code</label><input class="in code-in" id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6" placeholder="Code" value="${esc(S.code)}"></div>
    <div class="field"><label for="name">Your name</label><input class="in" id="name" autocomplete="off" maxlength="20" placeholder="First name" value="${esc(S.name)}"></div>
    <p class="err" id="join-msg" role="alert">${esc(S.msg || '')}</p>
    <button class="btn primary">Join</button>
    <p class="foot"><a href="${window.APP.teacherUrl}">Teacher sign-in</a></p>
  </form></div>`;
}
const GAME_SCREENS = ['ready', 'question', 'checking', 'casting', 'feedback', 'arcade', 'class'];
/* Gameshow quiz and Win or lose: the teacher sets the pace; this screen follows the board */
function classHTML() {
  const c = S.cls, gs = c.mode === 'gameshow';
  const head = `<span class="qlabel">Question ${c.n} of ${c.of}${c.bonus ? ' · <b class="cls-bonus">Bonus: double points</b>' : ''}${c.double ? ' · <b class="cls-bonus">×2 on</b>' : ''}</span>`;
  const score = `<div class="hud pupil-hud cls-hud"><div class="stat"><div class="k">Points</div><div class="v">${(S.score || 0).toLocaleString('en-GB')}</div></div><div class="stat"><div class="k">Streak</div><div class="v">${S.streak || 0}${LB.flames(S.streak || 0)}</div></div>${c.phase === 'question' && !c.answered ? `<div class="stat"><div class="k">Time</div><div class="v" id="cls-left">${Math.max(0, Math.ceil((S.clsEndAt - Date.now()) / 1000))}</div></div>` : ''}</div>`;
  if (c.phase === 'reveal') {
    const L = c.last || {}, right = c.q.answers[L.correctIndex];
    const verdict = L.none ? `<div class="verdict bad pop"><div><h3>No answer</h3><p>The answer was ${LB.ansHTML(right)}.</p></div></div>`
      : L.right ? `<div class="verdict good pop"><div><h3>Correct! +${L.gain}</h3><p>${c.mode === 'winlose' ? `You bet ${L.bet} and won it.` : `Streak ${S.streak}`}</p></div></div>`
      : `<div class="verdict bad pop"><div><h3>Not quite${L.gain < 0 ? ` · ${L.gain}` : ''}</h3><p>The answer was ${LB.ansHTML(right)}.${c.mode === 'winlose' && L.bet ? ` You bet ${L.bet}.` : ''}</p></div></div>`;
    return `<div class="wrap play">${score}<div class="stage pop">${head}${LB.qHTML(c.q)}${verdict}<p class="hint" style="margin:0;text-align:center">Look at the board. The next question comes when your teacher is ready.</p></div></div>`;
  }
  if (c.answered) return `<div class="wrap play">${score}<div class="stage center pop">${head}<h2 style="margin:0">Answer locked in</h2><p class="hint">${LB.ansHTML(c.q.answers[c.answered.shown])}${c.answered.bet ? ` · bet ${c.answered.bet}` : ''}</p><p class="hint">Look at the board.</p></div></div>`;
  const left = S.clsEndAt - Date.now();
  if (left <= 0) return `<div class="wrap play">${score}<div class="stage center pop">${head}<h2 style="margin:0">Time’s up</h2><p class="hint">Look at the board.</p></div></div>`;
  if (c.mode === 'winlose' && !S.bet) return `<div class="wrap play">${score}<div class="stage pop">${head}${LB.qHTML(c.q)}<h2 style="margin:0;text-align:center">How many points do you bet?</h2>
    <div class="bets">${c.bets.map((b, k) => `<button class="btn big-go bet" data-act="cls-bet" data-bet="${b}"><span class="key">${k + 1}</span>${b}</button>`).join('')}</div></div></div>`;
  const life = gs && c.life ? `<div class="lifelines"><button class="btn small" data-act="cls-life" data-kind="fifty" ${c.life.fifty ? '' : 'disabled'}>50:50</button><button class="btn small" data-act="cls-life" data-kind="time" ${c.life.time ? '' : 'disabled'}>+10 s</button><button class="btn small" data-act="cls-life" data-kind="double" ${c.life.double ? '' : 'disabled'}>Double</button></div>` : '';
  return `<div class="wrap play">${score}<div class="stage pop">${head}${LB.qHTML(c.q)}
    <div class="answers ${LB.hasImgAnswers(c.q) ? 'pics' : ''}">${c.q.answers.map((a, j) => c.hide.includes(j) ? `<button class="ans a${j} gone" disabled aria-hidden="true"></button>` : `<button class="ans a${j} ${S.sentChoice === j ? 'picked' : ''}" data-act="cls-answer" data-i="${j}" ${S.sentChoice != null ? 'disabled' : ''}><span class="key">${THEME.keyLabel(j)}</span><span>${LB.ansHTML(a)}</span></button>`).join('')}</div>
    ${life}${S.bet ? `<p class="hint" style="margin:0;text-align:center">Bet: ${S.bet}</p>` : ''}</div></div>`;
}
function render() {
  clearInterval(app._lock);
  let h = '';
  if (S.screen === 'arcade' && !S.paused) {
    if (arc && document.getElementById('arcade')) { updateHud(); return; }
    app.innerHTML = `<div class="wrap play arcade-wrap"><div id="hud-slot">${hud()}</div><div class="stage arcade-stage" id="arcade"></div></div>`;
    document.body.classList.toggle('water', false);
    if (S.mode === 'classic') RUNNER.show(THEME.current, S.runner); else RUNNER.hide();
    arc = null; arcMount();
    if (S.q && !S.arcWait) arcRound();
    return;
  }
  if (arc && S.screen !== 'arcade') { arc.destroy(); arc = null; }
  if (arc && S.paused) { arc.destroy(); arc = null; }
  if (S.paused && GAME_SCREENS.includes(S.screen)) {
    app.innerHTML = `<div class="wrap play">${hud()}<div class="stage center pop"><div class="paused-card"><div class="bars" aria-hidden="true"><i></i><i></i></div>
      <h1 style="font-size:clamp(30px,6vw,48px)">Paused</h1><p class="hint" style="margin:0">Eyes on the board. The game carries on when your teacher is ready.</p></div></div></div>`;
    document.body.classList.toggle('water', fishing());
    return;
  }
  switch (S.screen) {
    case 'join': h = joinHTML(); break;
    case 'class': h = classHTML(); break;
    case 'connecting': h = `<div class="gate"><div class="gate-card center">${LB.mark}<h1 style="font-size:24px">Joining…</h1><p>Finding game ${esc(S.code)}</p></div></div>`; break;
    case 'lost': h = `<div class="gate"><div class="gate-card">${LB.mark}<h1 style="font-size:24px">Can’t reach your game</h1><p>Check the internet connection, then try again. If the game has finished, join a new one.</p>
      <button class="btn primary" data-act="reconnect">Try again</button><button class="btn" data-act="leave">Join a different game</button></div></div>`; break;
    case 'lobby': h = `<div class="gate"><div class="gate-card center">${LB.mark}<span class="qlabel">${esc(S.title || '')}</span><h1 style="font-size:30px">You’re in, ${esc(S.name)}!</h1>${S.team ? `<p class="team-badge" style="--team:${esc(S.team.colour)}">Team <b>${esc(S.team.name)}</b></p>` : ''}
      <p>Look at the board. The game starts when your teacher is ready.</p><div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <button class="btn ghost small" data-act="leave">Leave game</button></div></div>`; break;
    case 'ready': {
      const locked = Date.now() < (S.lockUntil || 0);
      h = `<div class="wrap play">${hud()}<div class="stage center pop"><span class="qlabel">Question ${S.answered + 1}</span>
        <button class="btn primary big-go" data-act="show" ${locked ? 'disabled' : 'data-autofocus'}>Show question</button><span class="hint">or press Enter</span></div></div>`;
      if (locked) app._lock = setTimeout(render, S.lockUntil - Date.now() + 20);
      break;
    }
    case 'question': case 'checking':
      h = `<div class="wrap play">${hud()}<div class="stage pop"><span class="qlabel">Question ${S.answered + 1}</span>${LB.qHTML(S.q)}${answersHTML(false)}
        <span class="hint">${S.screen === 'checking' ? 'Checking…' : `Click an answer, or press 1–${S.q.answers.length}`}</span></div></div>`; break;
    case 'casting':
      h = `<div class="wrap play">${hud()}<div class="stage center cast-stage"><div class="rod" role="img" aria-label="Casting"></div><span class="qlabel">Casting…</span></div></div>`; break;
    case 'feedback': {
      const r = S.result, locked = Date.now() < S.lockUntil;
      if (r.fish) {
        const f = r.fish, t = LB.FISH_TIERS[f.tier];
        h = `<div class="wrap play">${hud()}<div class="stage center catch ${f.tier >= 3 ? 'sparkle' : ''}" style="--tier:${t.colour}">
          ${f.tier >= 3 ? `<div class="burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join('')}</div>` : ''}
          <span class="tier-chip">${t.name}</span>
          <div class="catch-fish">${LB.catchSVG(f, 220)}</div>
          <h2 class="catch-name">${f.icon ? 'You found' : 'You caught'} ${esc(LB.catchPhrase(f, S.subject))}!</h2>
          <div class="catch-kg">${LB.fmtCatch(f.kg, S.subject)}${f.doubled ? ` <span class="x2">×2 ${esc(THEME.modes().event)}</span>` : ''}</div>
          <p class="hint" style="margin:0">Streak ${r.streak} · next cast with lure level ${r.lure}</p>
          <button class="btn primary go" id="go" data-act="next" data-autofocus><span class="lbl">Next question</span><span class="bar"></span></button>
        </div></div>`;
        break;
      }
      const verdict = r.right
        ? `<div class="verdict good pop"><div><h3>Correct! +${r.gain}</h3><p>Streak ${r.streak} · ${fmtMult(multFor(r.streak))}</p></div>`
        : `<div class="verdict bad pop"><div><h3>${fishing() ? LB.missText(S.subject) : 'Not quite'}</h3><p>The right answer is highlighted.${r.lost > 1 ? ` Streak of ${r.lost} lost.` : ''}${fishing() ? ' Lure back to level 1.' : ''}</p></div>`;
      h = `<div class="wrap play">${hud()}<div class="stage"><span class="qlabel">Question ${S.answered}</span>${LB.qHTML(S.q)}${answersHTML(true)}
        ${verdict}<button class="btn primary go ${locked ? 'locking' : ''}" id="go" data-act="next" ${locked ? 'disabled' : 'data-autofocus'}><span class="lbl">${locked ? 'Wait a moment…' : 'Next question'}</span><span class="bar"></span></button></div></div></div>`;
      break;
    }
    case 'timeup': h = `<div class="wrap play">${hud()}<div class="stage center pop"><h1 style="font-size:clamp(32px,6vw,52px)">Time’s up!</h1><p class="hint">Look at the board for the results.</p></div></div>`; break;
    case 'ended': {
      const f = S.final || {};
      const acc = f.answered ? Math.round(100 * f.correct / f.answered) : 0;
      h = `<div class="wrap play"><div class="stage center pop">
        <span class="qlabel">Game over · ${esc(S.title || '')}</span>
        ${f.team ? `<p class="team-badge" style="--team:${esc(f.team.colour)}">Team <b>${esc(f.team.name)}</b> came ${ordinal(f.team.place)} of ${f.team.of} with ${esc(f.team.total)}</p>` : ''}
        ${f.rank ? `<h1 style="font-size:clamp(32px,6vw,56px)">You came ${ordinal(f.rank)}</h1><p class="hint" style="margin:0">out of ${f.of} ${f.rankBy === 'points' ? '' : `(ranked by ${f.rankBy === 'correct' ? 'correct answers' : `accuracy, for pupils with ${LB.MIN_FOR_ACCURACY} or more answers`})`}</p>` : '<h1>Game over</h1>'}
        <div class="summary" style="max-width:640px">
          ${f.mode === 'fishing'
            ? `<div class="stat"><div class="k">Total ${LB.catchNoun(S.subject)}</div><div class="v">${LB.fmtCatch(f.kg || 0, S.subject)}</div></div>`
            : `<div class="stat"><div class="k">Points</div><div class="v">${(f.score || 0).toLocaleString('en-GB')}</div></div>`}
          <div class="stat"><div class="k">Correct</div><div class="v">${f.correct || 0}/${f.answered || 0}</div></div>
          <div class="stat"><div class="k">Accuracy</div><div class="v">${acc}%</div></div>
          <div class="stat"><div class="k">Best streak</div><div class="v">${f.best || 0}</div></div>
        </div>
        ${f.mode === 'fishing' && f.biggest ? `<p class="hint" style="margin:0">${LB.catchUnit() ? "Your best treasure" : "Your biggest catch"}: <strong style="color:${LB.FISH_TIERS[f.biggest.tier].colour}">${LB.FISH_TIERS[f.biggest.tier].name} ${esc(f.biggest.name)}</strong>, ${LB.fmtCatch(f.biggest.kg, S.subject)}</p>` : ''}
        ${(f.review || []).length ? `<div class="review"><h2 class="side-h" style="margin-top:8px">Questions to look at again</h2><ol>${f.review.map(r => `<li><div class="rq">${esc(r.q)}</div><div class="ra"><span class="yours">You said: ${esc(r.yours)}</span><span class="right">Answer: ${esc(r.answer)}</span></div></li>`).join('')}</ol></div>`
          : (f.answered ? '<p class="hint" style="margin:0">You didn’t get any questions wrong. Brilliant!</p>' : '')}
        <button class="btn" data-act="leave">Join another game</button></div></div>`;
      break;
    }
  }
  app.innerHTML = h;
  document.body.classList.toggle('water', fishing() && ['ready', 'question', 'checking', 'casting', 'feedback', 'timeup'].includes(S.screen));
  // Classic mode: the runner strip sits above the question
  if (S.mode === 'classic' && [...GAME_SCREENS, 'timeup'].includes(S.screen)) RUNNER.show(THEME.current, S.runner); else RUNNER.hide();
  typeset(app);
  const f = app.querySelector('[data-autofocus]') || (S.screen === 'join' && document.getElementById(S.code ? 'name' : 'code'));
  if (f) f.focus();
}

/* ---------- events ---------- */
app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id !== 'join') return;
  const typed = document.getElementById('code').value.replace(/\s/g, '').toUpperCase();
  const raw = document.getElementById('name').value;
  const msg = document.getElementById('join-msg');
  // A 5-character code with letters is an assignment or revision folder, played on your own
  if (window.ASSIGN && ASSIGN.isCode(typed)) { S.screen = 'assign'; return ASSIGN.start(typed, raw); }
  const code = typed.replace(/\D/g, '');
  S.code = code; S.name = raw;
  if (code.length !== 6) { msg.textContent = 'Check the code: live games have 6 numbers, assignments have 5 letters and numbers.'; return; }
  const chk = LB.checkName(raw);
  if (!chk.ok) { msg.textContent = chk.msg; return; }
  join(code, chk.name);
});
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (act === 'answer') answer(+t.dataset.i);
  if (act === 'cls-answer') clsPick(+t.dataset.i);
  if (act === 'cls-bet') { S.bet = +t.dataset.bet; render(); }
  if (act === 'cls-life') send('life', { kind: t.dataset.kind });
  if (act === 'show' || act === 'next') nextQuestion();
  if (act === 'leave') leave('');
  if (act === 'reconnect') { S.screen = 'connecting'; connect(); }
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (S.screen === 'class' && S.cls && S.cls.phase === 'question' && /^[1-6]$/.test(e.key)) {
    e.preventDefault();
    if (S.cls.mode === 'winlose' && !S.bet) { const b = S.cls.bets[+e.key - 1]; if (b) { S.bet = b; render(); } }
    else if (!S.cls.hide.includes(+e.key - 1)) clsPick(+e.key - 1);
    return;
  }
  if (S.screen === 'question' && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && (S.screen === 'ready' || S.screen === 'feedback') && tag !== 'BUTTON') { e.preventDefault(); nextQuestion(); }
});

/* ---------- start: rejoin automatically after a refresh ---------- */
// A QR code from the host screen opens this page with ?code=123456: fill it in and go to the name box
{ const c = (new URLSearchParams(location.search).get('code') || '').replace(/\D/g, '').slice(0, 6); if (c.length === 6) S.code = c; }
// A QR code or link for an assignment opens it straight away (?a=CODE)
const assignCode = (new URLSearchParams(location.search).get('a') || '').toUpperCase();
if (location.search) history.replaceState(null, '', location.pathname);
const saved = assignCode ? null : store.get(SESSION);
if (assignCode && window.ASSIGN && ASSIGN.isCode(assignCode)) { S.screen = 'assign'; ASSIGN.start(assignCode, ''); } else
if (saved && saved.chan && Date.now() - saved.at < 3 * 3600e3) {
  Object.assign(S, { code: saved.code, chan: saved.chan, name: saved.name, screen: 'connecting' });
  connect();
} else render();
})();
