/* The runner: a cartoon character running on the spot while a track and background scroll behind.
   A right answer gives a burst of speed; a wrong answer trips him over and he gets back up.
   Latin: a man or woman in a toga, a gladiator, or (now and then) a charioteer.
   French: a mime in a beret, a chef with a frying pan, or a peasant in a garlic necklace.
   Sets with no subject get an athlete in Ludgrove navy.
   RUNNER.pick(subject) chooses a character; RUNNER.strip(subject, kind) shows one on its own;
   RUNNER.race(container) draws several lanes for the host screen. Everything is drawn here: no image files. */
(function () {
'use strict';
const TAU = Math.PI * 2;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const CAST = {
  latin: ['toga-m', 'toga-f', 'gladiator'],
  french: ['mime', 'chef', 'peasant'],
  none: ['athlete']
};
function pick(subject) {
  if (subject === 'latin' && Math.random() < 0.12) return 'chariot';
  const list = CAST[subject] || CAST.none;
  return list[Math.floor(Math.random() * list.length)];
}

/* ---------- backgrounds ---------- */
const SKY = {
  latin: ['#f6d7a7', '#fbeed6'], french: ['#bfd9f2', '#eef5fb'], none: ['#dfe7f3', '#f4f6fa']
};
function scene(ctx, w, h, subject, x) {
  const sk = SKY[subject] || SKY.none;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, sk[0]); g.addColorStop(1, sk[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const ground = h * 0.78;
  // far layer
  ctx.save();
  if (subject === 'latin') {
    ctx.fillStyle = '#e8c48f';
    hills(ctx, w, ground - h * 0.12, h * 0.16, x * 0.12, 260);
    // temples and cypresses
    for (let i = -1; i < w / 220 + 2; i++) {
      const bx = i * 220 - ((x * 0.35) % 220);
      if (((i + Math.floor(x * 0.35 / 220)) % 3 + 3) % 3 === 0) temple(ctx, bx + 30, ground, h * 0.42);
      else cypress(ctx, bx + 90, ground, h * 0.5), cypress(ctx, bx + 128, ground, h * 0.38);
    }
  } else if (subject === 'french') {
    ctx.fillStyle = '#c9dbea';
    for (let i = -1; i < w / 520 + 2; i++) { const bx = i * 520 - ((x * 0.08) % 520); eiffel(ctx, bx + 300, ground, h * 0.72); }
    for (let i = -1; i < w / 120 + 2; i++) {
      const k = i + Math.floor(x * 0.35 / 120), bx = i * 120 - ((x * 0.35) % 120);
      house(ctx, bx, ground, 110, h * (0.34 + ((k * 37) % 5) * 0.03), k);
    }
  } else {
    ctx.fillStyle = '#cfd8e6';
    hills(ctx, w, ground - h * 0.1, h * 0.14, x * 0.15, 300);
    for (let i = -1; i < w / 260 + 2; i++) { const bx = i * 260 - ((x * 0.35) % 260); tree(ctx, bx + 60, ground, h * 0.36); }
  }
  ctx.restore();
  // track
  const tg = subject === 'latin' ? ['#d9b27a', '#c99e63'] : subject === 'french' ? ['#a7a9ad', '#8e9196'] : ['#b55a4a', '#9e4b3d'];
  ctx.fillStyle = tg[0]; ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = tg[1]; ctx.fillRect(0, ground, w, 3);
  if (subject === 'french') {   // cobbles
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let r = 0; r < 3; r++) for (let i = -1; i < w / 22 + 2; i++) {
      const cx = i * 22 - (x % 22) + (r % 2) * 11, cy = ground + 8 + r * ((h - ground - 8) / 3);
      ctx.beginPath(); ctx.ellipse(cx, cy, 8, 3, 0, 0, TAU); ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = -1; i < w / 60 + 2; i++) ctx.fillRect(i * 60 - (x % 60), ground + (h - ground) * 0.5, 30, 3);
  }
}
function hills(ctx, w, y, amp, off, wl) {
  ctx.beginPath(); ctx.moveTo(0, y + amp);
  for (let px = 0; px <= w; px += 8) ctx.lineTo(px, y + amp * 0.5 - Math.sin((px + off) / wl * TAU) * amp * 0.5);
  ctx.lineTo(w, y + amp * 2); ctx.lineTo(0, y + amp * 2); ctx.fill();
}
function temple(ctx, x, ground, hh) {
  ctx.fillStyle = '#f3e7d1'; const w = hh * 1.1;
  ctx.beginPath(); ctx.moveTo(x - 6, ground - hh * 0.78); ctx.lineTo(x + w / 2, ground - hh); ctx.lineTo(x + w + 6, ground - hh * 0.78); ctx.fill();
  ctx.fillRect(x - 4, ground - hh * 0.78, w + 8, hh * 0.06);
  for (let c = 0; c < 5; c++) ctx.fillRect(x + c * (w / 4.4), ground - hh * 0.72, w * 0.08, hh * 0.68);
  ctx.fillRect(x - 6, ground - hh * 0.06, w + 12, hh * 0.06);
}
function cypress(ctx, x, ground, hh) {
  ctx.fillStyle = '#6f7d4a';
  ctx.beginPath(); ctx.moveTo(x, ground - hh); ctx.quadraticCurveTo(x + hh * 0.16, ground - hh * 0.4, x + 2, ground);
  ctx.lineTo(x - 2, ground); ctx.quadraticCurveTo(x - hh * 0.16, ground - hh * 0.4, x, ground - hh); ctx.fill();
}
function eiffel(ctx, x, ground, hh) {
  ctx.beginPath();
  ctx.moveTo(x - hh * 0.26, ground); ctx.quadraticCurveTo(x - hh * 0.06, ground - hh * 0.45, x - hh * 0.015, ground - hh);
  ctx.lineTo(x + hh * 0.015, ground - hh); ctx.quadraticCurveTo(x + hh * 0.06, ground - hh * 0.45, x + hh * 0.26, ground);
  ctx.lineTo(x + hh * 0.15, ground); ctx.quadraticCurveTo(x, ground - hh * 0.2, x - hh * 0.15, ground); ctx.fill();
  ctx.fillRect(x - hh * 0.13, ground - hh * 0.3, hh * 0.26, hh * 0.025);
  ctx.fillRect(x - hh * 0.07, ground - hh * 0.58, hh * 0.14, hh * 0.02);
}
function house(ctx, x, ground, w, hh, k) {
  const walls = ['#f2e6d0', '#ece2d2', '#f5ead8', '#e9dcc6'];
  ctx.fillStyle = walls[((k % 4) + 4) % 4]; ctx.fillRect(x + 4, ground - hh, w - 8, hh);
  ctx.fillStyle = '#6b7f99'; ctx.beginPath(); ctx.moveTo(x, ground - hh); ctx.lineTo(x + 12, ground - hh - 18); ctx.lineTo(x + w - 12, ground - hh - 18); ctx.lineTo(x + w, ground - hh); ctx.fill();
  ctx.fillStyle = '#7a8fa9';
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x + 16 + c * 30, ground - hh + 12 + r * (hh * 0.32), 14, hh * 0.18);
  if (((k % 3) + 3) % 3 === 0) {   // café awning
    for (let s = 0; s < 6; s++) { ctx.fillStyle = s % 2 ? '#fff' : '#d6322a'; ctx.fillRect(x + 8 + s * ((w - 16) / 6), ground - hh * 0.32, (w - 16) / 6, 10); }
  }
}
function tree(ctx, x, ground, hh) {
  ctx.fillStyle = '#9aa8bb'; ctx.fillRect(x - 3, ground - hh * 0.4, 6, hh * 0.4);
  ctx.beginPath(); ctx.arc(x, ground - hh * 0.6, hh * 0.28, 0, TAU); ctx.fill();
}

/* ---------- characters ---------- */
/* Each character is drawn standing at (0, 0) = feet on the ground, facing right, about 100 units tall.
   p is the stride phase (radians); a person's legs and arms swing with it. */
const SKIN = '#e9b48a', INK = '#2a1f1a';
function limb(ctx, x1, y1, x2, y2, wdt, col) { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function leg(ctx, hip, ang, len, col, shoe) {
  const kx = Math.sin(ang) * len * 0.5, ky = hip + Math.cos(ang) * len * 0.5;
  const fx = kx + Math.sin(ang - Math.abs(ang) * 0.6 - 0.15) * len * 0.5, fy = ky + Math.cos(ang - 0.2) * len * 0.5;
  limb(ctx, 0, hip, kx, ky, 9, col); limb(ctx, kx, ky, fx, fy, 8, col);
  ctx.fillStyle = shoe; ctx.beginPath(); ctx.ellipse(fx + 4, fy, 7, 3.5, 0, 0, TAU); ctx.fill();
}
function arm(ctx, sh, ang, len, col, hand) {
  const ex = Math.sin(ang) * len * 0.5, ey = sh + Math.cos(ang) * len * 0.5;
  const hx = ex + Math.sin(ang + 1.1) * len * 0.45, hy = ey + Math.cos(ang + 1.1) * len * 0.45;
  limb(ctx, 0, sh, ex, ey, 7, col); limb(ctx, ex, ey, hx, hy, 6, col);
  ctx.fillStyle = hand || SKIN; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, TAU); ctx.fill();
  return [hx, hy];
}
function head(ctx, y, r, skin) { ctx.fillStyle = skin || SKIN; ctx.beginPath(); ctx.arc(4, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(10, y - 2, 1.6, 0, TAU); ctx.fill(); }

function person(ctx, kind, p) {
  const s1 = Math.sin(p), s2 = Math.sin(p + Math.PI);
  const look = {
    'toga-m': { legs: SKIN, shoe: '#7a4a24', arms: SKIN },
    'toga-f': { legs: SKIN, shoe: '#7a4a24', arms: SKIN },
    gladiator: { legs: SKIN, shoe: '#6b4a2a', arms: SKIN },
    mime: { legs: '#1d1d22', shoe: '#111', arms: '#fff' },
    chef: { legs: '#3b3b44', shoe: '#222', arms: '#fff' },
    peasant: { legs: '#6b5236', shoe: '#3d2b1a', arms: '#a07a4e' },
    athlete: { legs: SKIN, shoe: '#fff', arms: SKIN }
  }[kind];
  // back leg and back arm
  leg(ctx, -52, s2 * 0.8, 50, look.legs, look.shoe);
  arm(ctx, -82, s1 * 0.9, 34, look.arms);
  // body
  if (kind === 'toga-m' || kind === 'toga-f') {
    ctx.fillStyle = '#fbf8f1'; ctx.beginPath(); ctx.moveTo(-14, -88); ctx.lineTo(14, -88); ctx.lineTo(18, -38); ctx.lineTo(-16, -36); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = kind === 'toga-m' ? '#8f1d1d' : '#6b2a6e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-12, -86); ctx.lineTo(14, -44); ctx.stroke();
    ctx.strokeStyle = '#e6dfd0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -70); ctx.lineTo(10, -60); ctx.moveTo(-10, -56); ctx.lineTo(12, -48); ctx.stroke();
  } else if (kind === 'gladiator') {
    ctx.fillStyle = SKIN; ctx.fillRect(-11, -88, 22, 40);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(-12, -54, 24, 7);
    ctx.fillStyle = '#b8892b'; ctx.fillRect(-13, -48, 26, 12);
    ctx.fillStyle = '#9aa1a8'; ctx.beginPath(); ctx.ellipse(-8, -84, 10, 6, -0.3, 0, TAU); ctx.fill();   // shoulder guard
  } else if (kind === 'mime') {
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#1d1d22'; ctx.fillRect(-11, -88 + i * 7, 22, 7); }
    ctx.fillStyle = '#d6322a'; ctx.fillRect(-10, -90, 20, 5);
  } else if (kind === 'chef') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-12, -88, 24, 48); ctx.fillStyle = '#d0d0d6'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(4, -80 + i * 10, 1.8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#d6322a'; ctx.fillRect(-11, -90, 22, 5);
  } else if (kind === 'peasant') {
    ctx.fillStyle = '#9c7b52'; ctx.fillRect(-12, -88, 24, 46); ctx.fillStyle = '#5b4026'; ctx.fillRect(-12, -52, 24, 5);
    for (let i = 0; i < 7; i++) {   // garlic necklace
      const a = Math.PI * 0.15 + i * (Math.PI * 0.7 / 6), gx = Math.cos(a) * 13, gy = -90 + Math.sin(a) * 14;
      ctx.fillStyle = '#fbf7ea'; ctx.beginPath(); ctx.ellipse(gx, gy, 5.5, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#b9ab88'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#cbbfa2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy - 4); ctx.lineTo(gx, gy + 3); ctx.stroke();
    }
  } else {   // athlete in Ludgrove navy
    ctx.fillStyle = '#002664'; ctx.fillRect(-11, -88, 22, 38); ctx.fillStyle = '#fff'; ctx.fillRect(-11, -60, 22, 3);
    ctx.fillStyle = '#0a3a86'; ctx.fillRect(-12, -52, 24, 12);
  }
  // front leg
  leg(ctx, -52, s1 * 0.8, 50, look.legs, look.shoe);
  if (kind === 'gladiator') { const k = s1 * 0.8; ctx.fillStyle = '#9aa1a8'; ctx.save(); ctx.translate(Math.sin(k) * 25 + 2, -52 + Math.cos(k) * 25 + 2); ctx.rotate(-k); ctx.fillRect(-4, 0, 8, 20); ctx.restore(); }
  if (kind === 'toga-f') { ctx.fillStyle = '#fbf8f1'; ctx.beginPath(); ctx.moveTo(-16, -40); ctx.lineTo(18, -40); ctx.lineTo(22, -22); ctx.lineTo(-20, -22); ctx.fill(); }
  // head
  head(ctx, -102, 13, kind === 'mime' ? '#fbfbfb' : SKIN);
  if (kind === 'toga-m') { ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(2, -106, 13, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.strokeStyle = '#5c8a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(3, -104, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  if (kind === 'toga-f') { ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.arc(2, -106, 13.5, Math.PI * 0.95, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-11, -104, 6, 0, TAU); ctx.fill(); }
  if (kind === 'gladiator') {
    ctx.fillStyle = '#9aa1a8'; ctx.beginPath(); ctx.arc(4, -104, 14.5, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
    ctx.fillStyle = '#5d646b'; for (let i = 0; i < 4; i++) ctx.fillRect(8, -104 + i * 3.4, 10, 1.6);
    ctx.fillStyle = '#b5372e'; ctx.beginPath(); ctx.moveTo(-12, -116); ctx.quadraticCurveTo(2, -136, 18, -118); ctx.quadraticCurveTo(4, -124, -12, -116); ctx.fill();
  }
  if (kind === 'mime') { ctx.fillStyle = '#1d1d22'; ctx.beginPath(); ctx.ellipse(2, -114, 14, 5, -0.15, 0, TAU); ctx.fill(); ctx.fillRect(1, -121, 3, 4); ctx.fillStyle = '#d6322a'; ctx.beginPath(); ctx.arc(10, -95, 2, 0, TAU); ctx.fill(); }
  if (kind === 'chef') { ctx.fillStyle = '#fff'; ctx.fillRect(-7, -128, 22, 16); ctx.beginPath(); ctx.arc(-3, -130, 7, 0, TAU); ctx.arc(5, -133, 8, 0, TAU); ctx.arc(12, -130, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2a1c'; ctx.fillRect(4, -96, 12, 2.5); }
  if (kind === 'peasant') { ctx.fillStyle = '#4b3a2a'; ctx.beginPath(); ctx.ellipse(3, -113, 15, 5, -0.1, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(3, -113, 11, Math.PI, 0); ctx.fill(); }
  if (kind === 'athlete') { ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(3, -106, 13, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); }
  // front arm, with whatever it carries
  const hand = arm(ctx, -82, s2 * 0.9, 34, look.arms, kind === 'mime' ? '#fff' : SKIN);
  if (kind === 'gladiator') { ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-0.6 + s2 * 0.3); ctx.fillStyle = '#c9ced4'; ctx.fillRect(-1.5, -22, 3, 22); ctx.fillStyle = '#7a4a24'; ctx.fillRect(-5, -2, 10, 3); ctx.restore();
    ctx.fillStyle = '#8f1d1d'; ctx.beginPath(); ctx.ellipse(-16, -64, 9, 18, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#b8892b'; ctx.beginPath(); ctx.arc(-16, -64, 3, 0, TAU); ctx.fill(); }
  if (kind === 'chef') { ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-0.9 + s2 * 0.5); ctx.fillStyle = '#3b3b44'; ctx.fillRect(0, -2.5, 13, 5);
    ctx.beginPath(); ctx.arc(25, 0, 13, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a5a66'; ctx.beginPath(); ctx.arc(25, 0, 9.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(25, 0, 4.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(25, 0, 7, 0, TAU); ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#f2b705'; ctx.beginPath(); ctx.arc(25, 0, 3.5, 0, TAU); ctx.fill(); ctx.restore(); }
}

function chariot(ctx, p) {
  const s = Math.sin(p);
  // horse
  ctx.save(); ctx.translate(48, -46);
  ctx.fillStyle = '#8a5a34';
  const legs = [[18, p], [22, p + Math.PI], [-14, p + 0.6], [-10, p + Math.PI + 0.6]];
  legs.forEach(([lx, ph]) => { const a = Math.sin(ph) * 0.7; limb(ctx, lx, 8, lx + Math.sin(a) * 16, 8 + Math.cos(a) * 18, 5, '#7a4e2c'); limb(ctx, lx + Math.sin(a) * 16, 8 + Math.cos(a) * 18, lx + Math.sin(a) * 16 + 4, 42, 4, '#7a4e2c'); });
  ctx.beginPath(); ctx.ellipse(4, 0, 30, 14, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(30, -6 + s * 2); ctx.rotate(-0.6); ctx.fillRect(-4, -26, 13, 28); ctx.beginPath(); ctx.ellipse(6, -28, 12, 7, 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2614'; ctx.fillRect(-6, -26, 5, 22); ctx.restore();
  ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-26, -4); ctx.quadraticCurveTo(-40, 10 + s * 6, -34, 20); ctx.stroke();
  ctx.restore();
  // pole and car
  limb(ctx, -10, -48, 40, -44, 3, '#5b3a1e');
  ctx.fillStyle = '#8f1d1d'; ctx.beginPath(); ctx.moveTo(-34, -64); ctx.lineTo(-6, -64); ctx.lineTo(0, -34); ctx.lineTo(-38, -34); ctx.fill();
  ctx.fillStyle = '#b8892b'; ctx.fillRect(-36, -66, 32, 4);
  // driver
  ctx.save(); ctx.translate(-20, -40); ctx.scale(0.75, 0.75);
  ctx.fillStyle = '#fbf8f1'; ctx.fillRect(-12, -90, 24, 46); head(ctx, -102, 13); ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(2, -106, 13, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  limb(ctx, 0, -80, 30, -66, 7, SKIN);
  ctx.restore();
  limb(ctx, 2, -100, 60, -70, 1.5, '#3a2614');   // reins
  // wheel
  ctx.save(); ctx.translate(-20, -20); ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
  ctx.rotate(p * 1.5); ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.stroke(); } ctx.restore();
}

/* Pictures: if assets/runners/<character>-run-1.png, -run-2.png and -fall.png exist, they replace the drawn
   character. Transparent PNGs, side-on, facing right, feet at the bottom edge. Missing files just mean the drawn one. */
const SPRITES = {};
function sprites(kind) {
  if (SPRITES[kind] !== undefined) return SPRITES[kind];
  SPRITES[kind] = null;
  const load = name => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = `assets/runners/${kind}-${name}.png`; });
  Promise.all([load('run-1'), load('run-2'), load('fall')]).then(([a, b, f]) => { if (a) SPRITES[kind] = { run: [a, b || a], fall: f }; });
  return null;
}
function drawSprite(ctx, sp, p, trip, big) {
  const H = big ? 104 : 100;   // sprite height in runner units (the drawn runners are about this tall)
  const im = trip > 0.25 && trip < 0.65 && sp.fall ? sp.fall : sp.run[Math.sin(p) > 0 ? 0 : 1];
  const k = H / sp.run[0].height;                 // every frame at the running frame's scale
  const w = im.width * k, h = im.height * k;
  ctx.drawImage(im, -w / 2, -h, w, h);
}

/* Draw one runner. trip: 0 = running; 0..1 = tripping (fall, lie still, get up) */
function drawRunner(ctx, kind, x, ground, scale, p, trip, dust) {
  const sp = sprites(kind);
  ctx.save(); ctx.translate(x, ground); ctx.scale(scale, scale);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(kind === 'chariot' ? 10 : 0, 2, kind === 'chariot' ? 70 : 24, 5, 0, 0, TAU); ctx.fill();
  if (trip > 0) {
    // fall forward (0-.25), lie (.25-.65), get up (.65-1)
    const f = trip < 0.25 ? trip / 0.25 : trip < 0.65 ? 1 : 1 - (trip - 0.65) / 0.35;
    const ease = f * f * (3 - 2 * f);
    ctx.translate(ease * 30, 0);
    if (sp) { if (!(sp.fall && trip > 0.25 && trip < 0.65)) ctx.rotate(ease * (kind === 'chariot' ? 0.35 : 1.45)); drawSprite(ctx, sp, 0.4, trip, kind === 'chariot'); }
    else { ctx.rotate(ease * (kind === 'chariot' ? 0.35 : 1.45)); if (kind === 'chariot') chariot(ctx, 0.4); else person(ctx, kind, 0.4); }
    ctx.restore();
    if (trip > 0.15 && trip < 0.8) {   // stars
      ctx.save(); ctx.translate(x + 40 * scale, ground - 22 * scale);
      for (let i = 0; i < 3; i++) { const a = trip * 14 + i * TAU / 3; ctx.fillStyle = '#f2b705'; star(ctx, Math.cos(a) * 16 * scale, Math.sin(a) * 6 * scale, 4 * scale); }
      ctx.restore();
    }
    return;
  }
  ctx.translate(0, -Math.abs(Math.sin(p)) * 4);
  if (sp) drawSprite(ctx, sp, p, 0, kind === 'chariot');
  else if (kind === 'chariot') chariot(ctx, p); else person(ctx, kind, p);
  ctx.restore();
  dust.forEach(d => { ctx.fillStyle = `rgba(160,140,110,${d.a})`; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); });
}
function star(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); }

/* ---------- a lane: one runner and its motion state ---------- */
function lane(kind) {
  return { kind, phase: 0, speed: 1, boostUntil: 0, tripAt: 0, dust: [],
    boost() { this.boostUntil = performance.now() + 1300; this.tripAt = 0; },
    trip() { this.tripAt = performance.now(); },
    step(dt, now, xFoot, ground, scale) {
      const tripT = this.tripAt ? (now - this.tripAt) / 1400 : 0;
      if (tripT >= 1) this.tripAt = 0;
      const boosting = now < this.boostUntil, target = this.tripAt ? 0 : boosting ? 2.8 : 1;
      this.speed += (target - this.speed) * Math.min(1, dt * (this.tripAt ? 6 : 3));
      if (!this.tripAt) this.phase += dt * 9 * Math.max(0.6, this.speed);
      if (boosting && Math.random() < 0.6) this.dust.push({ x: xFoot - 12 * scale, y: ground - 4 * scale, r: (3 + Math.random() * 4) * scale, a: 0.5, vx: -(60 + Math.random() * 60) });
      this.dust.forEach(d => { d.x += d.vx * dt; d.y -= 10 * dt; d.r += 6 * dt * scale; d.a -= dt * 0.9; });
      this.dust = this.dust.filter(d => d.a > 0);
      return this.tripAt ? Math.min(0.999, tripT) : 0;
    } };
}

/* ---------- the pupil's strip ---------- */
let strip = null;
function stripEl() {
  let el = document.getElementById('runner-strip');
  if (!el) { el = document.createElement('div'); el.id = 'runner-strip'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<canvas></canvas>'; document.body.insertBefore(el, document.getElementById('app')); }
  return el;
}
function show(subject, kind) {
  subject = subject || 'none';
  if (strip && strip.subject === subject && strip.ln.kind === kind) { strip.el.hidden = false; return; }
  hide();
  const el = stripEl(); el.hidden = false; el.dataset.subject = subject;
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  strip = { el, cv, ctx, subject, ln: lane(kind || pick(subject)), x: 0, last: performance.now(), raf: 0 };
  const frame = now => {
    if (!strip || strip.cv !== cv) return;
    const s = strip, dt = Math.min(0.05, (now - s.last) / 1000); s.last = now;
    const dpr = Math.min(2, devicePixelRatio || 1), w = el.clientWidth, h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ground = h * 0.78, scale = h / 150, rx = Math.min(w * 0.3, 260);
    const trip = s.ln.step(dt, now, rx, ground, scale);
    s.x += dt * 140 * s.ln.speed;
    scene(ctx, w, h, s.subject, s.x);
    if (now < s.ln.boostUntil) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const yy = h * (0.25 + i * 0.1); const xx = (rx - 40 - ((now / 3 + i * 53) % 120)); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 40, yy); ctx.stroke(); } }
    drawRunner(ctx, s.ln.kind, rx, ground, scale, s.ln.phase, trip, s.ln.dust);
    if (!still()) s.raf = requestAnimationFrame(frame);
  };
  strip.raf = requestAnimationFrame(frame);
}
function hide() { if (strip) { cancelAnimationFrame(strip.raf); strip.el.hidden = true; strip = null; } else { const el = document.getElementById('runner-strip'); if (el) el.hidden = true; } }

/* ---------- the host's race: one lane per pupil, positions follow the scores ---------- */
function race(container) {
  const cv = document.createElement('canvas'); container.appendChild(cv);
  const ctx = cv.getContext('2d');
  const R = { lanes: new Map(), subject: 'none', x: 0, last: performance.now(), raf: 0, entries: [] };
  R.set = (subject, entries) => {   // entries: [{ id, name, kind, value }], best first
    R.subject = subject || 'none'; R.entries = entries;
    entries.forEach(e => { if (!R.lanes.has(e.id)) R.lanes.set(e.id, Object.assign(lane(e.kind), { pos: 0 })); });
  };
  R.boost = id => { const l = R.lanes.get(id); if (l) l.boost(); };
  R.trip = id => { const l = R.lanes.get(id); if (l) l.trip(); };
  R.stop = () => { cancelAnimationFrame(R.raf); cv.remove(); };
  const frame = now => {
    const dt = Math.min(0.05, (now - R.last) / 1000); R.last = now;
    const dpr = Math.min(2, devicePixelRatio || 1), w = container.clientWidth, n = Math.max(1, R.entries.length), laneH = 58, h = n * laneH + 8;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.x += dt * 90;
    scene(ctx, w, h, R.subject, R.x);
    const top = Math.max(1, ...R.entries.map(e => e.value));
    const start = 120, finish = w - 70;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(finish + 20, 0, 4, h);   // finish line
    R.entries.forEach((e, i) => {
      const l = R.lanes.get(e.id), ground = 8 + (i + 1) * laneH - 6;
      const target = start + (finish - start) * Math.max(0, e.value) / top;
      l.pos += (target - l.pos) * Math.min(1, dt * 2.5); if (!l.pos) l.pos = start;
      const trip = l.step(dt, now, l.pos, ground, 0.42);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, ground, w, 1);
      ctx.font = '700 14px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.85)'; const tw = Math.min(104, ctx.measureText(e.name).width + 12); ctx.fillRect(6, ground - 28, tw, 22);
      ctx.fillStyle = '#1b1b22'; ctx.fillText(`${i + 1}. ${e.name}`.slice(0, 16), 10, ground - 17);
      drawRunner(ctx, l.kind, l.pos, ground, 0.42, l.phase, trip, l.dust);
    });
    if (!still()) R.raf = requestAnimationFrame(frame);
  };
  R.raf = requestAnimationFrame(frame);
  return R;
}

window.RUNNER = { pick, show, hide, boost: () => strip && strip.ln.boost(), trip: () => strip && strip.ln.trip(), race, kinds: CAST, drawRunner };
})();
