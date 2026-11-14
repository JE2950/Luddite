/* Ludus game styles: the same questions played as an arcade game instead of answer buttons.
   Every style plays one question at a time. The game shows the question and its answers as targets;
   when a pupil reaches, flies into or whacks an answer, the game calls onPick(index). Whoever runs the game
   marks it (the teacher's board in a live game, the pupil's own device in homework) and calls result().
   The game never knows the right answer until result() tells it, so a live game keeps answers off devices.

   const g = GAMES.mount(element, 'maze', { onPick(i) {} });
   g.question({ q, image, answers });   g.result({ right, correctIndex, choice, gain, lockMs, note });
   g.pause(true|false);  g.destroy(); */
(function () {
  'use strict';
  const L = window.LB;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STYLES = {
    quiz:  { name: 'Quiz',         about: 'Answer buttons, as now.' },
    maze:  { name: 'Maze chase',   about: 'Run to the corner with the right answer. Don’t get caught by the ghosts.' },
    plane: { name: 'Airplane',     about: 'Steer up and down to fly into the right answer.' },
    mole:  { name: 'Whack-a-mole', about: 'Moles pop up holding answers. Whack the right one.' },
    type:    { name: 'Type the answer', about: 'Type the answer. Spelling counts; accents and capitals don’t.', words: true },
    anagram: { name: 'Anagram',         about: 'Put the jumbled letters in order to spell the answer.', words: true },
    hangman: { name: 'Hangman',         about: 'Guess the answer one letter at a time. Six wrong letters and it’s over.', words: true }
  };
  const ARCADE = ['maze', 'plane', 'mole'], WORD = ['type', 'anagram', 'hangman'];
  /* Drawn pictures for the games (assets/games). A page can supply them itself in window.GAME_ART. */
  const IMG = {};
  const art = name => {
    if (!IMG[name]) { const im = new Image(); im.src = (window.GAME_ART && window.GAME_ART[name]) || 'assets/games/' + name + '.webp'; IMG[name] = im; }
    return IMG[name].complete && IMG[name].naturalWidth ? IMG[name] : null;
  };
  const flyer = () => ({ latin: 'chariot', french: 'balloon' })[window.THEME && THEME.current] || 'biplane';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const palette = () => ({ ink: css('--ink') || '#1d2433', paper: css('--paper') || '#f3efe6', surface: css('--surface') || '#fff', sunk: css('--sunk') || '#e8e2d6',
    line: css('--line') || '#d6cebf', accent: css('--accent') || '#002664', good: css('--good') || '#16936b', bad: css('--bad') || '#c7392b',
    a: [css('--a1') || '#c7392b', css('--a2') || '#1f6fb5', css('--a3') || '#16936b', css('--a4') || '#c98a2b'] });

  function mount(el, style, opts) {
    if (WORD.includes(style)) return mountWord(el, style, opts);
    const make = { maze: Maze, plane: Plane, mole: Mole }[style];
    if (!make) return null;
    el.innerHTML = `<div class="arc arc-${style}">
      <div class="arc-q" aria-live="polite"></div>
      <div class="arc-field"><canvas></canvas><div class="arc-toks"></div><div class="arc-msg" aria-live="assertive"></div></div>
      <div class="arc-ctrl"></div>
      <p class="arc-help hint"></p></div>`;
    const root = el.firstElementChild, field = root.querySelector('.arc-field'), cv = field.querySelector('canvas'), ctx = cv.getContext('2d');
    const toksEl = field.querySelector('.arc-toks'), msg = field.querySelector('.arc-msg'), qEl = root.querySelector('.arc-q');
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, paused = false, dead = false;
    const S = { q: null, waiting: false, toks: [], pal: palette() };
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = field.clientWidth;
      // Fit the game in the window below where it starts, leaving room for the controls underneath
      const top = field.getBoundingClientRect().top + window.scrollY, below = root.querySelector('.arc-ctrl').offsetHeight + root.querySelector('.arc-help').offsetHeight + 40;
      const avail = window.innerHeight - Math.min(top, window.innerHeight * 0.5) - below;
      H = Math.round(Math.max(240, Math.min(avail, W * (style === 'mole' ? 0.72 : 0.62), 560)));
      field.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      game.resize && game.resize(W, H);
    }
    const api = {
      root, field, ctx, msg, get W() { return W; }, get H() { return H; }, S,
      pick(i) { if (S.waiting || paused || !S.q) return; S.waiting = true; S.picked = i; S.toks.forEach((t, j) => t.el.classList.toggle('picked', j === i)); opts.onPick(i); },
      ctrl(html) { root.querySelector('.arc-ctrl').innerHTML = html; },
      help(t) { root.querySelector('.arc-help').textContent = t; }
    };
    const game = make(api);
    function frame(t) {
      if (dead) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      if (!paused) game.step(paused || S.frozen ? 0 : dt, t / 1000);
      game.draw(t / 1000);
      S.toks.forEach(k => { if (k.x != null) k.el.style.transform = `translate(${Math.round(k.x - k.el.offsetWidth / 2)}px,${Math.round(k.y - k.el.offsetHeight / 2)}px)`; k.el.style.opacity = k.hide ? 0 : 1; });
      raf = requestAnimationFrame(frame);
    }
    const onKey = e => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || dead) return;
      if (game.key && game.key(e)) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    const ro = new ResizeObserver(size); ro.observe(field);
    size(); raf = requestAnimationFrame(frame);
    api.help(game.help);
    return {
      question(q) {
        S.q = q; S.waiting = false; S.picked = null; S.frozen = false; msg.className = 'arc-msg'; msg.innerHTML = '';
        qEl.innerHTML = L.qHTML(q);
        toksEl.innerHTML = q.answers.map((a, j) => `<button class="arc-tok a${j}" data-i="${j}" tabindex="-1"><span class="key">${THEME.keyLabel(j)}</span><span class="t">${L.ansHTML(a)}</span></button>`).join('');
        S.toks = [...toksEl.children].map((b, j) => ({ el: b, j, x: null, y: null, hide: false }));
        S.toks.forEach(t => t.el.addEventListener('click', () => game.tap ? game.tap(t.j) : null));
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([qEl, toksEl]).catch(() => {});
        game.round(q);
      },
      result(r) {
        S.frozen = true;
        S.toks.forEach((t, j) => { t.el.classList.toggle('right', j === r.correctIndex); t.el.classList.toggle('wrong', !r.right && j === r.choice); });
        msg.className = 'arc-msg show ' + (r.right ? 'good' : 'bad');
        msg.innerHTML = r.right ? `<b>${esc(r.note || 'Correct!')}</b>` : `<b>${esc(r.note || 'Not quite')}</b><span>It was ${S.q ? L.ansHTML(S.q.answers[r.correctIndex]) : ''}</span>`;
        game.result && game.result(r);
      },
      pause(on) { paused = !!on; },
      destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); el.innerHTML = ''; }
    };
  }

  /* ---------- Maze chase ---------- */
  const MAZE = [
    '###############',
    '#A....#.#....B#',
    '#.###.....###.#',
    '#.#...###...#.#',
    '#.#.#.....#.#.#',
    '#.....#P#.....#',
    '#.#.#.....#.#.#',
    '#.#...###...#.#',
    '#.###.....###.#',
    '#C....#.#....D#',
    '###############'];
  function Maze(api) {
    const cols = MAZE[0].length, rows = MAZE.length;
    const wall = (x, y) => !MAZE[y] || MAZE[y][x] === undefined || MAZE[y][x] === '#';
    const zones = [[1, 1], [13, 1], [1, 9], [13, 9]];
    const start = [7, 5], ghostStart = [[7, 1], [7, 9]];
    let cell = 30, ox = 0, oy = 0;
    const me = { x: 7, y: 5, dir: [0, 0], want: [0, 0] }, ghosts = [{ x: 7, y: 1, dir: [0, 1] }, { x: 7, y: 9, dir: [0, -1] }];
    let caughtUntil = 0, n = 4, speedUp = 0;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function reset() {
      Object.assign(me, { x: start[0], y: start[1], dir: [0, 0], want: [0, 0] });
      ghosts.forEach((g, i) => Object.assign(g, { x: ghostStart[i][0], y: ghostStart[i][1], dir: [0, i ? -1 : 1], wait: 1.2 }));
    }
    let side = 0;   // width of the answer columns beside the maze
    function place() {
      api.S.toks.forEach((t, j) => {
        const z = zones[j]; if (!z) { t.hide = true; return; }
        const right = z[0] > 7, bottom = z[1] > 5;
        t.el.style.maxWidth = (side - 12) + 'px';
        const w = Math.min(t.el.offsetWidth || side, side - 12);
        t.x = right ? ox + cols * cell + 6 + w / 2 : ox - 6 - w / 2;
        t.y = oy + (z[1] + 0.5) * cell + (bottom ? -4 : 4);
      });
    }
    // Distances to the pupil, worked out across the maze for the ghosts
    function bfs(tx, ty) {
      const d = Array.from({ length: rows }, () => Array(cols).fill(1e9)); d[ty][tx] = 0; const q = [[tx, ty]];
      while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!wall(nx, ny) && d[ny][nx] > d[y][x] + 1) { d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); } } }
      return d;
    }
    // Each actor moves from the centre of one square to the next and only chooses a new direction on arriving.
    function moveActor(o, sp, choose) {
      let left = sp;
      if (!o.dir[0] && !o.dir[1]) { o.x = Math.round(o.x); o.y = Math.round(o.y); choose(o); if (!o.dir[0] && !o.dir[1]) return; }
      while (left > 1e-9) {
        const tx = o.dir[0] > 0 ? Math.floor(o.x + 1e-6) + 1 : o.dir[0] < 0 ? Math.ceil(o.x - 1e-6) - 1 : o.x;
        const ty = o.dir[1] > 0 ? Math.floor(o.y + 1e-6) + 1 : o.dir[1] < 0 ? Math.ceil(o.y - 1e-6) - 1 : o.y;
        const dist = Math.abs(tx - o.x) + Math.abs(ty - o.y);
        if (left < dist) { o.x += o.dir[0] * left; o.y += o.dir[1] * left; return; }
        o.x = tx; o.y = ty; left -= dist;
        choose(o);
        if (!o.dir[0] && !o.dir[1]) return;
      }
    }
    const g = {
      help: 'Arrow keys or WASD to move. On a tablet, swipe on the maze or use the arrows. Reach the corner with the right answer.',
      resize(W, H) {
        side = Math.min(220, Math.max(110, W * 0.24));
        cell = Math.floor(Math.min((W - 2 * side) / cols, (H - 12) / rows));
        ox = Math.round((W - cell * cols) / 2); oy = Math.round((H - cell * rows) / 2); place();
      },
      round(q) { n = q.answers.length; reset(); place(); speedUp = Math.min(0.6, speedUp + 0.03); },
      result() {},
      key(e) {
        const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] }[e.key];
        if (!k) return false; if (e.type === 'keydown') me.want = k; return true;
      },
      step(dt, t) {
        if (!dt || api.S.waiting) return;
        if (caughtUntil > t) return;
        if (caughtUntil && caughtUntil <= t) { caughtUntil = 0; api.msg.className = 'arc-msg'; reset(); }
        if (me.want[0] === -me.dir[0] && me.want[1] === -me.dir[1] && (me.want[0] || me.want[1])) me.dir = me.want;   // turning back works at once
        moveActor(me, dt * 4.6, o => {
          if (o.want[0] || o.want[1]) { if (!wall(o.x + o.want[0], o.y + o.want[1])) o.dir = o.want; }
          if (wall(o.x + o.dir[0], o.y + o.dir[1])) o.dir = [0, 0];
        });
        // Reached an answer corner
        const zi = zones.findIndex(z => Math.abs(me.x - z[0]) < 0.35 && Math.abs(me.y - z[1]) < 0.35);
        if (zi >= 0 && zi < n) { api.pick(zi); return; }
        const d = bfs(Math.round(me.x), Math.round(me.y));
        ghosts.forEach((gh, i) => {
          if (gh.wait > 0) { gh.wait -= dt; return; }
          moveActor(gh, dt * (3.0 + speedUp + i * 0.25), o => {
            const opts = DIRS.filter(([dx, dy]) => !wall(o.x + dx, o.y + dy) && !(dx === -o.dir[0] && dy === -o.dir[1]));
            const all = opts.length ? opts : DIRS.filter(([dx, dy]) => !wall(o.x + dx, o.y + dy));
            all.sort((a, b) => d[o.y + a[1]][o.x + a[0]] - d[o.y + b[1]][o.x + b[0]]);
            o.dir = Math.random() < (i ? 0.35 : 0.2) ? all[Math.floor(Math.random() * all.length)] : all[0];
          });
          if (Math.hypot(gh.x - me.x, gh.y - me.y) < 0.6) {
            caughtUntil = t + 1.2;
            api.msg.className = 'arc-msg show bad'; api.msg.innerHTML = '<b>Caught!</b><span>Back to the middle.</span>';
          }
        });
      },
      draw(t) {
        const c = api.ctx, P = api.S.pal;
        c.clearRect(0, 0, api.W, api.H);
        c.fillStyle = P.surface; c.fillRect(ox, oy, cell * cols, cell * rows);
        zones.forEach((z, j) => { if (j < n) { c.fillStyle = P.a[j]; c.globalAlpha = 0.28 + 0.12 * Math.sin(t * 3 + j); c.fillRect(ox + z[0] * cell, oy + z[1] * cell, cell, cell); c.globalAlpha = 1; } });
        c.fillStyle = P.accent;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (wall(x, y)) {
          const r = Math.max(2, cell * 0.22);
          c.beginPath(); c.roundRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2, r); c.fill();
        }
        // each answer's number in its corner, and a line out to its label
        zones.forEach((z, j) => { if (j < n) { c.fillStyle = P.a[j]; c.font = `700 ${Math.round(cell * 0.5)}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(THEME.keyLabel(j), ox + z[0] * cell + cell / 2, oy + z[1] * cell + cell / 2); } });
        // the pupil
        const px = ox + (me.x + 0.5) * cell, py = oy + (me.y + 0.5) * cell, mouth = 0.25 + 0.2 * Math.abs(Math.sin(t * 10));
        const ang = Math.atan2(me.dir[1], me.dir[0] || (me.dir[1] ? 0 : 1));
        c.fillStyle = P.a[3]; c.beginPath(); c.moveTo(px, py); c.arc(px, py, cell * 0.4, ang + mouth, ang + Math.PI * 2 - mouth); c.closePath(); c.fill();
        // the ghosts
        ghosts.forEach((gh, i) => {
          const gx = ox + (gh.x + 0.5) * cell, gy = oy + (gh.y + 0.5) * cell, r = cell * 0.4;
          c.fillStyle = i ? '#7b4bb5' : P.bad;
          c.beginPath(); c.arc(gx, gy - r * 0.15, r, Math.PI, 0); c.lineTo(gx + r, gy + r * 0.8);
          for (let k = 0; k < 4; k++) c.lineTo(gx + r - (k + 0.5) * r / 2, gy + r * (k % 2 ? 0.8 : 0.5));
          c.lineTo(gx - r, gy + r * 0.8); c.closePath(); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(gx - r * 0.35, gy - r * 0.2, r * 0.25, 0, 7); c.arc(gx + r * 0.35, gy - r * 0.2, r * 0.25, 0, 7); c.fill();
          c.fillStyle = '#111'; c.beginPath(); c.arc(gx - r * 0.3, gy - r * 0.15, r * 0.11, 0, 7); c.arc(gx + r * 0.4, gy - r * 0.15, r * 0.11, 0, 7); c.fill();
        });
      }
    };
    // Swipes and the on-screen arrows
    let sx = 0, sy = 0;
    api.field.addEventListener('touchstart', e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; }, { passive: true });
    api.field.addEventListener('touchmove', e => { const p = e.touches[0], dx = p.clientX - sx, dy = p.clientY - sy; if (Math.hypot(dx, dy) > 24) { me.want = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; sx = p.clientX; sy = p.clientY; } e.preventDefault(); }, { passive: false });
    api.ctrl(`<div class="dpad"><button data-d="0,-1" aria-label="Up">▲</button><button data-d="-1,0" aria-label="Left">◀</button><button data-d="1,0" aria-label="Right">▶</button><button data-d="0,1" aria-label="Down">▼</button></div>`);
    api.root.querySelectorAll('.dpad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); me.want = b.dataset.d.split(',').map(Number); }));
    return g;
  }

  /* ---------- Airplane (a sun chariot for Latin, a balloon for French, a biplane otherwise) ---------- */
  function Plane(api) {
    let lanes = 4, laneY = [], items = [], speed = 0, n = 4, clouds = [];
    const me = { x: 0, y: 0, tx: 0, ty: 0 };
    const wave = () => {
      const order = L.shuffle([...Array(n).keys()]);
      items = order.map((j, k) => ({ j, lane: k, x: api.W + 60 + Math.random() * api.W * 0.35 }));
    };
    const size = () => Math.max(80, Math.min(api.H * 0.34, 170));
    const laneOf = y => { let b = 0; laneY.forEach((ly, k) => { if (Math.abs(ly - y) < Math.abs(laneY[b] - y)) b = k; }); return b; };
    const g = {
      help: 'Drag your finger or move the mouse to fly, or use the arrow keys. Fly into the right answer.',
      resize(W, H) {
        laneY = [...Array(lanes).keys()].map(k => H * (k + 0.5) / lanes);
        if (!me.x) { me.x = me.tx = W * 0.14; me.y = me.ty = laneY[Math.min(1, lanes - 1)]; }
        me.tx = Math.min(me.tx, W * 0.5); me.ty = Math.max(20, Math.min(H - 20, me.ty));
        clouds = Array.from({ length: 6 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random() * 0.6 }));
      },
      round(q) { n = q.answers.length; lanes = n; g.resize(api.W, api.H); speed = Math.min(api.W / 3.2, api.W / 5.5 + (speed ? 6 : 0)); wave(); },
      key(e) {
        const up = ['ArrowUp', 'w', 'W'].includes(e.key), down = ['ArrowDown', 's', 'S'].includes(e.key), lr = ['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key);
        if (e.type !== 'keydown') return up || down || lr;
        if (up || down) { me.ty = laneY[Math.max(0, Math.min(lanes - 1, laneOf(me.ty) + (up ? -1 : 1)))]; return true; }
        if (lr) { me.tx = Math.max(api.W * 0.08, Math.min(api.W * 0.5, me.tx + (/Left|a|A/.test(e.key) ? -60 : 60))); return true; }
        return false;
      },
      step(dt) {
        if (!dt) return;
        const k = Math.min(1, dt * 9);
        me.x += (me.tx - me.x) * k; me.y += (me.ty - me.y) * k;
        clouds.forEach(c => { c.x -= dt * speed * 0.3 * c.s; if (c.x < -80) { c.x = api.W + 40; c.y = Math.random() * api.H; } });
        if (api.S.waiting) return;
        const half = size() * 0.36;
        items.forEach(it => {
          it.x -= dt * speed;
          const t = api.S.toks[it.j]; if (!t) return;
          t.x = it.x; t.y = laneY[it.lane];
          const w = t.el.offsetWidth, h = t.el.offsetHeight;
          if (Math.abs(it.x - me.x) < w / 2 + half && Math.abs(laneY[it.lane] - me.y) < h / 2 + half * 0.6) api.pick(it.j);
        });
        if (items.length && items.every(it => it.x < -api.W * 0.25)) wave();
      },
      draw(t) {
        const c = api.ctx, P = api.S.pal, sub = window.THEME && THEME.current;
        const sky = c.createLinearGradient(0, 0, 0, api.H);
        sky.addColorStop(0, sub === 'latin' ? '#d9c8f0' : '#bfe0f5'); sky.addColorStop(1, sub === 'latin' ? '#f6f0fb' : '#eef7fc');
        c.fillStyle = sky; c.fillRect(0, 0, api.W, api.H);
        c.fillStyle = 'rgba(255,255,255,.85)';
        clouds.forEach(cl => { c.beginPath(); c.ellipse(cl.x, cl.y, 46 * cl.s, 16 * cl.s, 0, 0, 7); c.ellipse(cl.x + 22 * cl.s, cl.y - 9 * cl.s, 26 * cl.s, 14 * cl.s, 0, 0, 7); c.fill(); });
        c.strokeStyle = 'rgba(0,0,0,.06)'; c.setLineDash([6, 10]);
        laneY.forEach(ly => { c.beginPath(); c.moveTo(0, ly); c.lineTo(api.W, ly); c.stroke(); }); c.setLineDash([]);
        const im = art(flyer()), sz = size(), bob = Math.sin(t * 4) * 3;
        c.save(); c.translate(me.x, me.y + bob); c.rotate(Math.max(-0.25, Math.min(0.25, (me.ty - me.y) * 0.006)));
        if (im) { const s2 = sz / Math.max(im.width, im.height); c.drawImage(im, -im.width * s2 / 2, -im.height * s2 / 2, im.width * s2, im.height * s2); }
        else { c.fillStyle = P.accent; c.beginPath(); c.ellipse(0, 0, 34, 9, 0, 0, 7); c.fill(); }
        c.restore();
      }
    };
    api.ctrl('');
    // Follow the finger (while touching) or the mouse (while over the sky)
    const follow = e => {
      if (e.target.closest && e.target.closest('.arc-tok') && e.type === 'pointerdown') return;
      const r = api.field.getBoundingClientRect();
      me.tx = Math.max(api.W * 0.06, Math.min(api.W * 0.5, e.clientX - r.left)); me.ty = Math.max(20, Math.min(api.H - 20, e.clientY - r.top));
    };
    api.field.addEventListener('pointerdown', e => { follow(e); try { api.field.setPointerCapture(e.pointerId); } catch (x) {} });
    api.field.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons || e.pressure) follow(e); });
    return g;
  }

  /* ---------- Whack-a-mole ---------- */
  function Mole(api) {
    let holes = [], moles = [], n = 4, nextPop = 0, whack = null, clock = 0;
    const g = {
      help: 'Click or tap the mole holding the right answer, or press its number while it’s up.',
      resize(W, H) {
        const cols = 3, rows = 3, cw = W / cols, ch = (H - 10) / rows;
        holes = []; const rr = Math.min(cw * 0.3, H * 0.1); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) holes.push({ x: cw * (c + 0.5), y: H * (0.36 + 0.29 * r), r: rr });
      },
      round(q) { n = q.answers.length; moles = []; nextPop = clock + 0.3; whack = null; api.S.toks.forEach(t => { t.hide = true; t.x = -999; t.y = -999; }); },
      tap(j) { if (moles.some(m => m.j === j && m.up > 0.5)) { const m = moles.find(m => m.j === j); whack = { x: holes[m.h].x, y: holes[m.h].y, t: performance.now() / 1000 }; api.pick(j); } },
      key(e) {
        if (e.type !== 'keydown' || !/^[1-6]$/.test(e.key)) return false;
        g.tap(+e.key - 1); return true;
      },
      step(dt) {
        clock += dt;
        if (!dt) return;
        // pop a new mole now and then: at most three up, never the same answer twice at once
        if (!api.S.waiting && clock >= nextPop && moles.length < Math.min(3, n)) {
          const freeH = holes.map((_, i) => i).filter(i => !moles.some(m => m.h === i));
          const freeJ = [...Array(n).keys()].filter(j => !moles.some(m => m.j === j));
          if (freeH.length && freeJ.length) moles.push({ h: freeH[Math.floor(Math.random() * freeH.length)], j: freeJ[Math.floor(Math.random() * freeJ.length)], t: 0, life: 2.4 + Math.random() * 1.2, up: 0 });
          nextPop = clock + 0.45 + Math.random() * 0.6;
        }
        moles.forEach(m => {
          if (!api.S.waiting || m.j !== api.S.picked) m.t += dt;
          const rise = Math.min(1, m.t / 0.25), fall = Math.min(1, Math.max(0, (m.life - m.t) / 0.25));
          m.up = Math.min(rise, fall);
        });
        moles = moles.filter(m => m.t < m.life || (api.S.waiting && m.j === api.S.picked));
        api.S.toks.forEach(t => { const m = moles.find(m => m.j === t.j); if (m && m.up > 0.4) { const h = holes[m.h]; t.hide = false; t.x = h.x; t.y = h.y - h.r * (0.9 + 1.4 * m.up); } else t.hide = true; });
      },
      draw(now) {
        const c = api.ctx, mole = art('mole'), hammer = art('hammer');
        c.fillStyle = '#9cc27a'; c.fillRect(0, 0, api.W, api.H);
        c.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % api.W, (i * 53) % api.H, 3, 8);
        holes.forEach((h, i) => {
          c.fillStyle = '#5b3d22'; c.beginPath(); c.ellipse(h.x, h.y, h.r * 1.05, h.r * 0.36, 0, 0, 7); c.fill();
          const m = moles.find(m => m.h === i);
          if (m && m.up > 0) {
            const w = h.r * 2.5, ht = mole ? w * mole.height / mole.width : w * 0.76;
            const top = h.y + h.r * 0.25 - ht * (0.15 + 0.85 * m.up);
            c.save(); c.beginPath(); c.rect(h.x - w, h.y - ht * 2, w * 2, ht * 2 + h.r * 0.3); c.clip();
            if (mole) c.drawImage(mole, h.x - w / 2, top, w, ht);
            else { c.fillStyle = '#8a5a35'; c.beginPath(); c.ellipse(h.x, top + ht * 0.5, w * 0.3, ht * 0.45, 0, 0, 7); c.fill(); }
            c.restore();
          }
        });
        if (whack && now - whack.t < 0.45) {
          const k = Math.min(1, (now - whack.t) / 0.18), sz = holes[0] ? holes[0].r * 2.6 : 90;
          c.save(); c.translate(whack.x + sz * 0.35, whack.y - sz * 0.55); c.rotate(-0.2 - 0.9 * (1 - k));
          if (hammer) c.drawImage(hammer, -sz / 2, -sz / 2, sz, sz * hammer.height / hammer.width);
          c.restore();
        }
      }
    };
    api.field.addEventListener('pointerdown', e => {
      const r = api.field.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const m = moles.find(m => { const h = holes[m.h]; return m.up > 0.5 && Math.abs(x - h.x) < h.r * 0.9 && y > h.y - h.r * 2.2 && y < h.y + h.r * 0.3; });
      if (m) g.tap(m.j);
    });
    api.ctrl('');
    return g;
  }

  /* ---------- Word games: Type the answer, Anagram, Hangman ----------
     opts.onType(text) sends a typed answer; opts.onLetter(letter) a Hangman guess, answered by letter({ shape, misses, hit }). */
  function mountWord(el, style, opts) {
    el.innerHTML = `<div class="arc wordg wordg-${style}"><div class="arc-q" aria-live="polite"></div>
      <div class="word-area"><div class="word-play"></div><div class="arc-msg" aria-live="assertive"></div></div><p class="arc-help hint"></p></div>`;
    const root = el.firstElementChild, qEl = root.querySelector('.arc-q'), play = root.querySelector('.word-play'), msg = root.querySelector('.arc-msg');
    let S = { q: null, waiting: false, dead: false };
    const help = { type: 'Type the answer and press Enter.', anagram: 'Click the letters in order, or type them. Backspace takes the last one back.', hangman: 'Click a letter or type it. Six wrong letters and the question is lost.' }[style];
    root.querySelector('.arc-help').textContent = help;
    const send = text => { if (S.waiting || !S.q) return; S.waiting = true; play.classList.add('sent'); opts.onType(text); };
    let anag = null;
    function draw() {
      const q = S.q;
      if (style === 'type') {
        play.innerHTML = `<form class="type-form" autocomplete="off"><input class="in word-in" id="word-in" maxlength="80" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Your answer" placeholder="Type the answer"><button class="btn primary">Check</button></form>`;
        const f = play.querySelector('form'), inp = play.querySelector('input');
        f.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (v) { inp.disabled = true; send(v); } });
        setTimeout(() => inp.focus(), 30);
      } else if (style === 'anagram') {
        const lengths = q.lengths && q.lengths.length ? q.lengths : [q.letters.length];
        anag = { tiles: q.letters.map((c, i) => ({ c, i, used: false })), slots: [] };
        lengths.forEach((n, w) => { for (let k = 0; k < n; k++) anag.slots.push({ w, tile: null }); });
        renderAnag();
      } else if (style === 'hangman') renderHang(q.shape, q.misses || []);
    }
    function renderAnag() {
      const words = []; anag.slots.forEach((s2, k) => { (words[s2.w] = words[s2.w] || []).push([s2, k]); });
      play.innerHTML = `<div class="ana-slots">${words.map(ws => `<span class="ana-word">${ws.map(([s2, k]) => `<button class="ana-slot ${s2.tile ? 'full' : ''}" data-slot="${k}" aria-label="${s2.tile ? 'Take back ' + esc(s2.tile.c) : 'Empty'}">${s2.tile ? esc(s2.tile.c) : ''}</button>`).join('')}</span>`).join('')}</div>
        <div class="ana-tiles">${anag.tiles.map((t, k) => `<button class="ana-tile" data-tile="${k}" ${t.used ? 'disabled' : ''}>${esc(t.c)}</button>`).join('')}</div>
        <button class="btn ghost small ana-clear">Clear</button>`;
    }
    function anagPut(k) {
      const t = anag.tiles[k], slot = anag.slots.find(s2 => !s2.tile); if (!t || t.used || !slot || S.waiting) return;
      t.used = true; slot.tile = t; renderAnag();
      if (anag.slots.every(s2 => s2.tile)) {
        const words = []; anag.slots.forEach(s2 => { words[s2.w] = (words[s2.w] || '') + s2.tile.c; });
        send(words.join(' '));
      }
    }
    function anagBack(k) { const s2 = k == null ? [...anag.slots].reverse().find(x => x.tile) : anag.slots[k]; if (!s2 || !s2.tile || S.waiting) return; s2.tile.used = false; s2.tile = null; renderAnag(); }
    const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    function renderHang(shape, misses) {
      const m = misses.length;
      const parts = ['<line x1="20" y1="150" x2="120" y2="150"/>', '<line x1="45" y1="150" x2="45" y2="15"/><line x1="45" y1="15" x2="105" y2="15"/><line x1="105" y1="15" x2="105" y2="35"/>', '<circle cx="105" cy="48" r="13"/>', '<line x1="105" y1="61" x2="105" y2="100"/>', '<line x1="105" y1="72" x2="88" y2="88"/><line x1="105" y1="72" x2="122" y2="88"/>', '<line x1="105" y1="100" x2="90" y2="128"/><line x1="105" y1="100" x2="120" y2="128"/>'];
      const tried = new Set([...misses, ...shape.filter(c => /\p{L}/u.test(c)).map(c => L.foldLetter(c))]);
      play.innerHTML = `<div class="hang-top"><svg class="hang-pic" viewBox="0 0 140 160" aria-label="${m} of 6 wrong letters">${parts.slice(0, m).join('')}</svg>
        <div><div class="hang-shape">${shape.map(c => c === ' ' ? '<span class="hang-gap"></span>' : `<span class="hang-c ${c === '_' ? 'blank' : ''}">${c === '_' ? '' : esc(c)}</span>`).join('')}</div>
        <p class="hint" style="margin:6px 0 0">${m ? `Wrong: ${misses.map(esc).join(' ')} · ${6 - m} left` : '6 wrong letters allowed'}</p></div></div>
        <div class="hang-keys">${ROWS.map(r => `<div>${[...r].map(c => `<button class="hang-key ${misses.includes(c) ? 'miss' : tried.has(c) ? 'hit' : ''}" data-key="${c}" ${tried.has(c) ? 'disabled' : ''}>${c}</button>`).join('')}</div>`).join('')}</div>`;
    }
    play.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.tile != null) anagPut(+b.dataset.tile);
      else if (b.dataset.slot != null) anagBack(+b.dataset.slot);
      else if (b.classList.contains('ana-clear')) { anag.slots.forEach(s2 => { if (s2.tile) { s2.tile.used = false; s2.tile = null; } }); renderAnag(); }
      else if (b.dataset.key && !S.waiting) { b.disabled = true; opts.onLetter(b.dataset.key); }
    });
    const onKey = e => {
      if (S.dead || !S.q || S.waiting || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName; if (tag === 'INPUT') return;
      if (style === 'anagram') {
        if (e.key === 'Backspace') { e.preventDefault(); anagBack(); return; }
        const k = anag && anag.tiles.findIndex(t => !t.used && L.foldLetter(t.c) === L.foldLetter(e.key));
        if (e.key.length === 1 && k >= 0) { e.preventDefault(); anagPut(k); }
      } else if (style === 'hangman' && /^\p{L}$/u.test(e.key)) {
        const c = L.foldLetter(e.key), b = play.querySelector(`[data-key="${c}"]`);
        if (b && !b.disabled) { e.preventDefault(); b.disabled = true; opts.onLetter(c); }
      }
    };
    document.addEventListener('keydown', onKey);
    return {
      question(q) {
        S = { q, waiting: false, dead: false }; play.classList.remove('sent'); msg.className = 'arc-msg'; msg.innerHTML = '';
        qEl.innerHTML = L.qHTML(q);
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([qEl]).catch(() => {});
        draw();
      },
      letter(r) { if (S.q && r) { S.q.shape = r.shape; S.q.misses = r.misses; renderHang(r.shape, r.misses); } },
      result(r) {
        S.waiting = true;
        if (style === 'hangman' && r.answer) renderHang([...String(r.answer).trim()], (S.q && S.q.misses) || []);
        msg.className = 'arc-msg show ' + (r.right ? 'good' : 'bad');
        const ans = esc(String(r.answer || '').trim());
        msg.innerHTML = r.right ? `<b>${esc(r.note || 'Correct!')}</b>${r.typed && r.exact === false ? `<span>Answer: <b class="plain">${ans}</b></span>` : ''}` : `<b>${esc(r.note || 'Not quite')}</b><span>It was <b class="plain">${ans}</b></span>`;
      },
      pause() {},
      destroy() { S.dead = true; document.removeEventListener('keydown', onKey); el.innerHTML = ''; }
    };
  }

  window.GAMES = { STYLES, ARCADE, WORD, mount, isArcade: s => ARCADE.includes(s), isWord: s => WORD.includes(s), isGame: s => ARCADE.includes(s) || WORD.includes(s) };
})();
