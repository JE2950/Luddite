/* Quiz app — pupil page: join with a code and a name, then answer at your own pace.
   No account and nothing saved online. The teacher's screen marks every answer. */
(function () {
'use strict';
if (!window.APP.configured) return; // config.js shows the setup message

const { esc, fmtTime, multFor, fmtMult, typeset } = LB;
const sb = LB.client();
const app = document.getElementById('app');
const SESSION = window.APP.storagePrefix + '.pupil', TOKEN = window.APP.storagePrefix + '.token';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
let token = store.get(TOKEN);
if (!token) { token = LB.rid(16); store.set(TOKEN, token); }

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
  let settled = false, t = null;
  const lobby = await subscribe(LB.lobbyChannel(code), {
    joined: m => {
      if (m.token !== token || settled) return;
      settled = true; clearTimeout(t); sb.removeChannel(lobby);
      if (!m.ok) { S.screen = 'join'; S.msg = m.msg; return render(); }
      S.pid = m.pid; S.name = m.name;
      store.set(SESSION, { code, pid: m.pid, name: m.name, at: Date.now() });
      connect();
    }
  });
  if (!lobby) { S.screen = 'join'; S.msg = 'Couldn’t connect. Check the internet connection and try again.'; return render(); }
  lobby.send({ type: 'broadcast', event: 'join', payload: { token, name } }).catch(() => {});
  t = setTimeout(() => {
    if (settled) return; settled = true; sb.removeChannel(lobby);
    S.screen = 'join'; S.msg = `No game found with code ${code}. Check the code on the board.`; render();
  }, 7000);
}

async function connect() {
  S.screen = S.screen === 'join' ? 'connecting' : S.screen; render();
  if (ch) { sb.removeChannel(ch); ch = null; }
  ch = await subscribe(LB.pupilChannel(S.code, S.pid), {
    state: onState, result: onResult,
    kicked: m => leave(m.cancelled ? 'Your teacher closed the game.' : 'Your teacher has removed you from this game.'),
    replaced: () => leave('You joined this game on another device.')
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
}

/* ---------- messages from the teacher's screen ---------- */
function onState(st) {
  if (S.awaitingState) { S.awaitingState = false; stopRetry(); clearTimeout(waitT); }
  Object.assign(S, { title: st.title, name: st.name, score: st.score, streak: st.streak, answered: st.answered, correct: st.correct, mode: st.mode, kg: st.kg || 0, lure: st.lure || 1 });
  S.frenzyUntil = st.frenzyIn ? Date.now() + st.frenzyIn : 0;
  S.paused = !!st.paused;
  S.endAt = st.endIn != null ? Date.now() + st.endIn : null;
  if (st.phase === 'lobby') { S.screen = 'lobby'; return render(); }
  if (st.phase === 'ended') { stopRetry(); clearInterval(tickT); S.final = st.final; S.screen = 'ended'; store.del(SESSION); return render(); }
  // playing
  startTick();
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
  if (!S.q || r.seq !== S.q.seq || S.screen !== 'checking') return;
  stopRetry();
  S.result = r;
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
  return fishing() && S.frenzyUntil > Date.now() ? `<div class="frenzy-banner" role="status"><b>${esc(window.APP.modes.event)}!</b><span>Every catch weighs double for <span id="frenzy-left">${Math.ceil((S.frenzyUntil - Date.now()) / 1000)}</span>s</span></div>` : '';
}
function hud() {
  if (fishing()) return `${frenzyBar()}<div class="hud pupil-hud fish-hud">
    <div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${S.endAt ? fmtTime(S.endAt - Date.now()) : '∞'}</div></div>
    <div class="stat"><div class="k">Total catch</div><div class="v">${LB.fmtKg(S.kg)}</div></div>
    <div class="stat mult"><div class="k">Lure level</div><div class="v">${S.lure}${lurePips(S.lure)}</div></div>
  </div>`;
  const showNext = S.screen === 'question' || S.screen === 'ready';
  const m = showNext ? multFor(S.streak + 1) : multFor(Math.max(1, S.streak));
  return `<div class="hud pupil-hud">
    <div class="stat"><div class="k">Time left</div><div class="v" id="hud-time">${S.endAt ? fmtTime(S.endAt - Date.now()) : '∞'}</div></div>
    <div class="stat"><div class="k">Points</div><div class="v">${S.score.toLocaleString('en-GB')}</div></div>
    <div class="stat"><div class="k">Streak</div><div class="v">${S.streak}${LB.flames(S.streak)}</div></div>
    <div class="stat mult"><div class="k">${showNext ? 'Next correct' : 'Multiplier'}</div><div class="v">${fmtMult(m)}</div></div>
  </div>`;
}
function answersHTML(done) {
  const q = S.q, r = S.result;
  return `<div class="answers">${q.answers.map((a, j) => {
    let cls = `ans a${j}`;
    if (done && r) cls += j === r.correctIndex ? ' right' : j === r.choice ? ' wrong' : ' dim';
    else if (S.screen === 'checking') cls += j === S.choice ? ' picked' : ' dim';
    return `<button class="${cls}" data-act="answer" data-i="${j}" ${S.screen !== 'question' ? 'disabled' : ''}><span class="key">${j + 1}</span><span>${esc(a)}</span></button>`;
  }).join('')}</div>`;
}
function joinHTML() {
  return `<div class="gate"><form class="gate-card" id="join">
    ${LB.mark}
    <h1 style="font-size:24px">Join a game</h1>
    <div class="field"><label for="code">Game code</label><input class="in code-in" id="code" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000" value="${esc(S.code)}"></div>
    <div class="field"><label for="name">Your name</label><input class="in" id="name" autocomplete="off" maxlength="20" placeholder="First name" value="${esc(S.name)}"></div>
    <p class="err" id="join-msg" role="alert">${esc(S.msg || '')}</p>
    <button class="btn primary">Join</button>
    <p class="foot"><a href="${window.APP.teacherUrl}">Teacher sign-in</a></p>
  </form></div>`;
}
const GAME_SCREENS = ['ready', 'question', 'checking', 'casting', 'feedback'];
function render() {
  clearInterval(app._lock);
  let h = '';
  if (S.paused && GAME_SCREENS.includes(S.screen)) {
    app.innerHTML = `<div class="wrap play">${hud()}<div class="stage center pop"><div class="paused-card"><div class="bars" aria-hidden="true"><i></i><i></i></div>
      <h1 style="font-size:clamp(30px,6vw,48px)">Paused</h1><p class="hint" style="margin:0">Eyes on the board. The game carries on when your teacher is ready.</p></div></div></div>`;
    document.body.classList.toggle('water', fishing());
    return;
  }
  switch (S.screen) {
    case 'join': h = joinHTML(); break;
    case 'connecting': h = `<div class="gate"><div class="gate-card center">${LB.mark}<h1 style="font-size:24px">Joining…</h1><p>Finding game ${esc(S.code)}</p></div></div>`; break;
    case 'lost': h = `<div class="gate"><div class="gate-card">${LB.mark}<h1 style="font-size:24px">Can’t reach your game</h1><p>Check the internet connection, then try again. If the game has finished, join a new one.</p>
      <button class="btn primary" data-act="reconnect">Try again</button><button class="btn" data-act="leave">Join a different game</button></div></div>`; break;
    case 'lobby': h = `<div class="gate"><div class="gate-card center">${LB.mark}<span class="qlabel">${esc(S.title || '')}</span><h1 style="font-size:30px">You’re in, ${esc(S.name)}!</h1>
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
      h = `<div class="wrap play">${hud()}<div class="stage pop"><span class="qlabel">Question ${S.answered + 1}</span><div class="qtext">${esc(S.q.q)}</div>${answersHTML(false)}
        <span class="hint">${S.screen === 'checking' ? 'Checking…' : `Click an answer, or press 1–${S.q.answers.length}`}</span></div></div>`; break;
    case 'casting':
      h = `<div class="wrap play">${hud()}<div class="stage center cast-stage"><div class="cast" aria-label="Casting"><span class="line"></span><span class="bob"></span><span class="ripple"></span></div><span class="qlabel">Casting…</span></div></div>`; break;
    case 'feedback': {
      const r = S.result, locked = Date.now() < S.lockUntil;
      if (r.fish) {
        const f = r.fish, t = LB.FISH_TIERS[f.tier];
        h = `<div class="wrap play">${hud()}<div class="stage center catch ${f.tier >= 3 ? 'sparkle' : ''}" style="--tier:${t.colour}">
          ${f.tier >= 3 ? `<div class="burst" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join('')}</div>` : ''}
          <span class="tier-chip">${t.name}</span>
          <div class="catch-fish">${LB.fishSVG(f.tier, f.shape, 220)}</div>
          <h2 class="catch-name">You caught ${/^[AEIOU]/.test(f.name) ? 'an' : 'a'} ${esc(f.name)}!</h2>
          <div class="catch-kg">${LB.fmtKg(f.kg)}${f.doubled ? ` <span class="x2">×2 ${esc(window.APP.modes.event)}</span>` : ''}</div>
          <p class="hint" style="margin:0">Streak ${r.streak} · next cast with lure level ${r.lure}</p>
          <button class="btn primary go" id="go" data-act="next" data-autofocus><span class="lbl">Next question</span><span class="bar"></span></button>
        </div></div>`;
        break;
      }
      const verdict = r.right
        ? `<div class="verdict good pop"><div><h3>Correct! +${r.gain}</h3><p>Streak ${r.streak} · ${fmtMult(multFor(r.streak))}</p></div>`
        : `<div class="verdict bad pop"><div><h3>${fishing() ? 'The fish got away' : 'Not quite'}</h3><p>The right answer is highlighted.${r.lost > 1 ? ` Streak of ${r.lost} lost.` : ''}${fishing() ? ' Lure back to level 1.' : ''}</p></div>`;
      h = `<div class="wrap play">${hud()}<div class="stage"><span class="qlabel">Question ${S.answered}</span><div class="qtext">${esc(S.q.q)}</div>${answersHTML(true)}
        ${verdict}<button class="btn primary go ${locked ? 'locking' : ''}" id="go" data-act="next" ${locked ? 'disabled' : 'data-autofocus'}><span class="lbl">${locked ? 'Wait a moment…' : 'Next question'}</span><span class="bar"></span></button></div></div></div>`;
      break;
    }
    case 'timeup': h = `<div class="wrap play">${hud()}<div class="stage center pop"><h1 style="font-size:clamp(32px,6vw,52px)">Time’s up!</h1><p class="hint">Look at the board for the results.</p></div></div>`; break;
    case 'ended': {
      const f = S.final || {};
      const acc = f.answered ? Math.round(100 * f.correct / f.answered) : 0;
      h = `<div class="wrap play"><div class="stage center pop">
        <span class="qlabel">Game over · ${esc(S.title || '')}</span>
        ${f.rank ? `<h1 style="font-size:clamp(32px,6vw,56px)">You came ${ordinal(f.rank)}</h1><p class="hint" style="margin:0">out of ${f.of} ${f.rankBy === 'points' ? '' : `(ranked by ${f.rankBy === 'correct' ? 'correct answers' : 'accuracy'})`}</p>` : '<h1>Game over</h1>'}
        <div class="summary" style="max-width:640px">
          ${f.mode === 'fishing'
            ? `<div class="stat"><div class="k">Total catch</div><div class="v">${LB.fmtKg(f.kg || 0)}</div></div>`
            : `<div class="stat"><div class="k">Points</div><div class="v">${(f.score || 0).toLocaleString('en-GB')}</div></div>`}
          <div class="stat"><div class="k">Correct</div><div class="v">${f.correct || 0}/${f.answered || 0}</div></div>
          <div class="stat"><div class="k">Accuracy</div><div class="v">${acc}%</div></div>
          <div class="stat"><div class="k">Best streak</div><div class="v">${f.best || 0}</div></div>
        </div>
        ${f.mode === 'fishing' && f.biggest ? `<p class="hint" style="margin:0">Your biggest catch: <strong style="color:${LB.FISH_TIERS[f.biggest.tier].colour}">${LB.FISH_TIERS[f.biggest.tier].name} ${esc(f.biggest.name)}</strong>, ${LB.fmtKg(f.biggest.kg)}</p>` : ''}
        ${(f.review || []).length ? `<div class="review"><h2 class="side-h" style="margin-top:8px">Questions to look at again</h2><ol>${f.review.map(r => `<li><div class="rq">${esc(r.q)}</div><div class="ra"><span class="yours">You said: ${esc(r.yours)}</span><span class="right">Answer: ${esc(r.answer)}</span></div></li>`).join('')}</ol></div>`
          : (f.answered ? '<p class="hint" style="margin:0">You didn’t get any questions wrong. Brilliant!</p>' : '')}
        <button class="btn" data-act="leave">Join another game</button></div></div>`;
      break;
    }
  }
  app.innerHTML = h;
  document.body.classList.toggle('water', fishing() && ['ready', 'question', 'checking', 'casting', 'feedback', 'timeup'].includes(S.screen));
  typeset(app);
  const f = app.querySelector('[data-autofocus]') || (S.screen === 'join' && document.getElementById(S.code ? 'name' : 'code'));
  if (f) f.focus();
}

/* ---------- events ---------- */
app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id !== 'join') return;
  const code = document.getElementById('code').value.replace(/\D/g, '');
  const raw = document.getElementById('name').value;
  S.code = code; S.name = raw;
  const msg = document.getElementById('join-msg');
  if (code.length !== 6) { msg.textContent = 'The game code has 6 digits.'; return; }
  const chk = LB.checkName(raw);
  if (!chk.ok) { msg.textContent = chk.msg; return; }
  join(code, chk.name);
});
app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (act === 'answer') answer(+t.dataset.i);
  if (act === 'show' || act === 'next') nextQuestion();
  if (act === 'leave') leave('');
  if (act === 'reconnect') { S.screen = 'connecting'; connect(); }
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (S.screen === 'question' && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && (S.screen === 'ready' || S.screen === 'feedback') && tag !== 'BUTTON') { e.preventDefault(); nextQuestion(); }
});

/* ---------- start: rejoin automatically after a refresh ---------- */
const saved = store.get(SESSION);
if (saved && Date.now() - saved.at < 3 * 3600e3) {
  Object.assign(S, { code: saved.code, pid: saved.pid, name: saved.name, screen: 'connecting' });
  connect();
} else render();
})();
