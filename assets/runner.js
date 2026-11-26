/* The runner: a cartoon character running on the spot while a track and background scroll behind.
   A right answer gives a burst of speed; a wrong answer trips him over and he gets back up.
   Latin: a man or woman in a toga, a gladiator, or (now and then) a charioteer.
   French: a mime in a beret, a chef with a frying pan, or a peasant in a garlic necklace.
   Geography: explorers, a mountaineer, a polar explorer, a jungle explorer or a geologist; now and then a Land Rover or a camel.
   History: a Norman knight, a Viking, a Tudor lady, a Cavalier, a suffragette or a First World War Tommy; now and then a knight on horseback or a penny-farthing.
   Sets with no subject get an athlete in Ludgrove navy.
   RUNNER.pick(subject) chooses a character; RUNNER.strip(subject, kind) shows one on its own;
   RUNNER.race(container) draws several lanes for the host screen. Pictures come from assets/runners. */
(function () {
'use strict';
const TAU = Math.PI * 2;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const CAST = {
  latin: ['toga-m', 'toga-f', 'gladiator'],
  french: ['mime', 'chef', 'peasant'],
  geography: ['explorer-m', 'explorer-f', 'mountaineer', 'polar', 'jungle', 'geologist'],
  history: ['knight', 'viking', 'tudor-lady', 'cavalier', 'suffragette', 'tommy'],
  none: ['athlete']
};
const RARE = { latin: ['chariot'], geography: ['landrover', 'camel'], history: ['horse-knight', 'penny-farthing'] };     // turn up now and then
const BIG = new Set(['chariot', 'landrover', 'camel', 'horse-knight', 'penny-farthing']);
function pick(subject) {
  const rare = RARE[subject];
  if (rare && Math.random() < 0.12) return rare[Math.floor(Math.random() * rare.length)];
  const list = CAST[subject] || CAST.none;
  return list[Math.floor(Math.random() * list.length)];
}
/* Deals runners like cards, so a class gets an even spread: every character comes out before any repeats, in a random order.
   The bag is a plain array kept with the game, so it survives a refresh. Rare ones still turn up now and then. */
function deal(subject, bag) {
  const rare = RARE[subject];
  if (rare && Math.random() < 0.12) return rare[Math.floor(Math.random() * rare.length)];
  if (!bag.length) {
    const list = (CAST[subject] || CAST.none).slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    if (list.length > 1 && list[list.length - 1] === bag.last) list.unshift(list.pop());   // no repeat across the join between bags
    bag.push(...list);
  }
  const k = bag.pop(); bag.last = k; return k;
}

/* ---------- backgrounds ----------
   Seen almost from above: the ground fills the picture, and only a band along the top edge shows the setting
   (temples, a Paris street, mountains, trees). `band` is that band's height in pixels. */
const SKY = {
  latin: ['#f6d7a7', '#fbeed6'], french: ['#bfd9f2', '#eef5fb'], geography: ['#bfe0ef', '#eef7f4'], history: ['#d9cfe0', '#f4efe4'], none: ['#dfe7f3', '#f4f6fa']
};
const GROUND = {
  latin: ['#dcb984', '#cfa86f'], french: ['#a9abb0', '#97999f'], geography: ['#9cc27a', '#8bb46a'], history: ['#a9b07a', '#979e69'], none: ['#c0614f', '#ad5444']
};
function scene(ctx, w, h, subject, x, band) {
  subject = SKY[subject] ? subject : 'none';
  if (band == null) band = Math.min(h * 0.34, 64);
  const gr = GROUND[subject];
  // the ground, seen from above
  ctx.fillStyle = gr[0]; ctx.fillRect(0, band, w, h - band);
  groundTexture(ctx, w, h, subject, x, band);
  // the setting along the top edge
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, band); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, band); g.addColorStop(0, SKY[subject][0]); g.addColorStop(1, SKY[subject][1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, band);
  const base = band, hh = band;
  if (subject === 'latin') {
    ctx.fillStyle = '#e8c48f'; hills(ctx, w, base - hh * 0.36, hh * 0.3, x * 0.12, 260);
    for (let i = -1; i < w / 220 + 2; i++) {
      const bx = i * 220 - ((x * 0.35) % 220);
      if (((i + Math.floor(x * 0.35 / 220)) % 3 + 3) % 3 === 0) temple(ctx, bx + 30, base, hh * 0.86);
      else cypress(ctx, bx + 90, base, hh * 0.92), cypress(ctx, bx + 128, base, hh * 0.7);
    }
  } else if (subject === 'french') {
    ctx.fillStyle = '#c9dbea';
    for (let i = -1; i < w / 520 + 2; i++) { const bx = i * 520 - ((x * 0.08) % 520); eiffel(ctx, bx + 300, base, hh * 1.05); }
    for (let i = -1; i < w / 120 + 2; i++) {
      const k = i + Math.floor(x * 0.35 / 120), bx = i * 120 - ((x * 0.35) % 120);
      house(ctx, bx, base, 110, hh * (0.62 + ((k * 37) % 5) * 0.05), k);
    }
  } else if (subject === 'geography') {
    for (let i = -1; i < w / 340 + 2; i++) { const bx = i * 340 - ((x * 0.1) % 340); mountain(ctx, bx + 120, base, hh * 0.95, 150); mountain(ctx, bx + 250, base, hh * 0.7, 110); }
    for (let i = -1; i < w / 90 + 2; i++) { const k = i + Math.floor(x * 0.35 / 90), bx = i * 90 - ((x * 0.35) % 90); if (((k % 4) + 4) % 4 !== 3) pine(ctx, bx + 20, base, hh * (0.42 + ((k * 13) % 3) * 0.1)); }
  } else if (subject === 'history') {   // a castle on the hill, a church spire and timber-framed houses
    ctx.fillStyle = '#c9c1a8'; hills(ctx, w, base - hh * 0.42, hh * 0.3, x * 0.1, 320);
    for (let i = -1; i < w / 600 + 2; i++) { const bx = i * 600 - ((x * 0.1) % 600); castle(ctx, bx + 380, base - hh * 0.2, hh * 0.78); }
    for (let i = -1; i < w / 130 + 2; i++) {
      const k = i + Math.floor(x * 0.35 / 130), bx = i * 130 - ((x * 0.35) % 130), m = ((k % 5) + 5) % 5;
      if (m === 2) spire(ctx, bx + 60, base, hh * 0.95); else if (m === 4) oak(ctx, bx + 60, base, hh * 0.62); else tudor(ctx, bx + 26, base, 70, hh * (0.82 + ((k * 7) % 3) * 0.06));
    }
  } else {
    ctx.fillStyle = '#cfd8e6'; hills(ctx, w, base - hh * 0.4, hh * 0.3, x * 0.15, 300);
    for (let i = -1; i < w / 260 + 2; i++) { const bx = i * 260 - ((x * 0.35) % 260); tree(ctx, bx + 60, base, hh * 0.8); }
  }
  ctx.restore();
  // the edge where the setting meets the ground
  ctx.fillStyle = gr[1]; ctx.fillRect(0, band, w, 4);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, band + 4, w, 2);
}
function groundTexture(ctx, w, h, subject, x, band) {
  ctx.save();
  if (subject === 'latin') {          // raked arena sand
    ctx.strokeStyle = 'rgba(150,110,60,.18)'; ctx.lineWidth = 2;
    for (let y = band + 14; y < h; y += 16) { ctx.beginPath(); for (let px = -20; px <= w + 20; px += 20) ctx.lineTo(px - (x % 40), y + Math.sin((px + y) / 30) * 2); ctx.stroke(); }
  } else if (subject === 'french') {  // cobbles
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    for (let r = 0, y = band + 9; y < h + 10; r++, y += 13) for (let i = -1; i < w / 24 + 2; i++) {
      ctx.beginPath(); ctx.ellipse(i * 24 - (x % 24) + (r % 2) * 12, y, 9, 4.5, 0, 0, TAU); ctx.fill();
    }
  } else if (subject === 'geography') {   // a map: grass with grid squares and the odd contour
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
    for (let gx = -(x % 60); gx < w; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, band); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = band + 30; gy < h; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(60,90,40,.22)'; ctx.lineWidth = 1.5;
    for (let i = -1; i < w / 300 + 2; i++) { const cx = i * 300 - (x % 300) + 150; for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.ellipse(cx, band + (h - band) * 0.55, 26 * r, 9 * r, 0, 0, TAU); ctx.stroke(); } }
  } else if (subject === 'history') {   // a medieval field in strips, with a cart track
    ctx.strokeStyle = 'rgba(80,70,30,.16)'; ctx.lineWidth = 2;
    for (let y = band + 12; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    for (let i = -1; i < w / 160 + 2; i++) { const gx = i * 160 - (x % 160); ctx.beginPath(); ctx.moveTo(gx, band); ctx.lineTo(gx + 10, h); ctx.stroke(); }
  } else {                            // running track
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (let i = -1; i < w / 6 + 2; i++) for (let y = band + 6; y < h; y += 9) ctx.fillRect(i * 6 - (x % 6) + ((y / 9) % 2) * 3, y, 1.5, 1.5);
  }
  ctx.restore();
}
function castle(ctx, x, base, hh) {
  ctx.fillStyle = '#b3aa95';
  const tw = hh * 0.34, ww = hh * 1.3;
  ctx.fillRect(x - ww / 2, base - hh * 0.62, ww, hh * 0.62);                       // curtain wall
  for (const dx of [-ww / 2 - tw / 2, ww / 2 - tw / 2]) ctx.fillRect(x + dx, base - hh * 0.86, tw, hh * 0.86);   // towers
  ctx.fillRect(x - tw * 0.7, base - hh, tw * 1.4, hh);                              // keep
  const merlons = (x0, y, wd) => { for (let mx = x0; mx < x0 + wd - 2; mx += 8) ctx.fillRect(mx, y - 5, 5, 5); };
  merlons(x - ww / 2, base - hh * 0.62, ww); merlons(x - ww / 2 - tw / 2, base - hh * 0.86, tw); merlons(x + ww / 2 - tw / 2, base - hh * 0.86, tw); merlons(x - tw * 0.7, base - hh, tw * 1.4);
  ctx.fillStyle = '#5b2a4a'; ctx.fillRect(x - 1, base - hh - 22, 2, 18); ctx.beginPath(); ctx.moveTo(x + 1, base - hh - 22); ctx.lineTo(x + 14, base - hh - 18); ctx.lineTo(x + 1, base - hh - 14); ctx.fill();
  ctx.fillStyle = '#7d7462'; ctx.beginPath(); ctx.arc(x, base - hh * 0.16, hh * 0.12, Math.PI, 0); ctx.fillRect(x - hh * 0.12, base - hh * 0.16, hh * 0.24, hh * 0.16); ctx.fill();
}
function spire(ctx, x, base, hh) {
  ctx.fillStyle = '#d8cdb3'; ctx.fillRect(x - hh * 0.12, base - hh * 0.55, hh * 0.24, hh * 0.55);
  ctx.fillStyle = '#9b8f78'; ctx.beginPath(); ctx.moveTo(x - hh * 0.14, base - hh * 0.55); ctx.lineTo(x, base - hh); ctx.lineTo(x + hh * 0.14, base - hh * 0.55); ctx.fill();
  ctx.fillStyle = '#d8cdb3'; ctx.fillRect(x - hh * 0.4, base - hh * 0.3, hh * 0.3, hh * 0.3);
}
function oak(ctx, x, base, hh) {
  ctx.fillStyle = '#5b4a2a'; ctx.fillRect(x - 3, base - hh * 0.45, 6, hh * 0.45);
  ctx.fillStyle = '#6f8a4a'; for (const [dx, dy, r] of [[0, -0.7, 0.3], [-0.22, -0.55, 0.24], [0.22, -0.55, 0.24]]) { ctx.beginPath(); ctx.arc(x + dx * hh, base + dy * hh, r * hh, 0, TAU); ctx.fill(); }
}
function tudor(ctx, x, base, wd, hh) {
  ctx.fillStyle = '#f1e8d3'; ctx.fillRect(x, base - hh * 0.7, wd, hh * 0.7);
  ctx.fillStyle = '#6b5a4a'; ctx.beginPath(); ctx.moveTo(x - 4, base - hh * 0.7); ctx.lineTo(x + wd / 2, base - hh); ctx.lineTo(x + wd + 4, base - hh * 0.7); ctx.fill();
  ctx.fillStyle = '#3d2e22';
  for (let bx = x; bx <= x + wd - 3; bx += wd / 3) ctx.fillRect(bx, base - hh * 0.7, 3, hh * 0.7);
  ctx.fillRect(x, base - hh * 0.4, wd, 3);
  ctx.fillStyle = '#5a6f8a'; ctx.fillRect(x + wd * 0.12, base - hh * 0.62, wd * 0.16, hh * 0.16); ctx.fillRect(x + wd * 0.72, base - hh * 0.62, wd * 0.16, hh * 0.16);
  ctx.fillStyle = '#3d2e22'; ctx.fillRect(x + wd * 0.42, base - hh * 0.3, wd * 0.16, hh * 0.3);
}
function mountain(ctx, x, base, hh, wd) {
  ctx.fillStyle = '#8fa5a0'; ctx.beginPath(); ctx.moveTo(x - wd, base); ctx.lineTo(x, base - hh); ctx.lineTo(x + wd, base); ctx.fill();
  ctx.fillStyle = '#f4f8f8'; ctx.beginPath(); ctx.moveTo(x - wd * 0.28, base - hh * 0.72); ctx.lineTo(x, base - hh); ctx.lineTo(x + wd * 0.28, base - hh * 0.72); ctx.lineTo(x + wd * 0.1, base - hh * 0.78); ctx.lineTo(x - wd * 0.06, base - hh * 0.7); ctx.fill();
}
function pine(ctx, x, base, hh) {
  ctx.fillStyle = '#3f6b45'; ctx.beginPath(); ctx.moveTo(x, base - hh); ctx.lineTo(x + hh * 0.3, base - hh * 0.1); ctx.lineTo(x - hh * 0.3, base - hh * 0.1); ctx.fill();
  ctx.fillStyle = '#5b4a2a'; ctx.fillRect(x - 2, base - hh * 0.12, 4, hh * 0.12);
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
const DRAWN = new Set(['toga-m', 'toga-f', 'gladiator', 'mime', 'chef', 'peasant', 'athlete', 'chariot']);
function drawRunner(ctx, kind, x, ground, scale, p, trip, dust) {
  const sp = sprites(kind);
  if (!sp && !DRAWN.has(kind)) kind = 'athlete';     // until the picture has loaded
  ctx.save(); ctx.translate(x, ground); ctx.scale(scale, scale);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(BIG.has(kind) ? 10 : 0, 2, BIG.has(kind) ? 70 : 24, 5, 0, 0, TAU); ctx.fill();
  if (trip > 0) {
    // fall forward (0-.25), lie (.25-.65), get up (.65-1)
    const f = trip < 0.25 ? trip / 0.25 : trip < 0.65 ? 1 : 1 - (trip - 0.65) / 0.35;
    const ease = f * f * (3 - 2 * f);
    ctx.translate(ease * 30, 0);
    if (sp) { if (!(sp.fall && trip > 0.25 && trip < 0.65)) ctx.rotate(ease * (BIG.has(kind) ? 0.35 : 1.45)); drawSprite(ctx, sp, 0.4, trip, BIG.has(kind)); }
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
  if (sp) drawSprite(ctx, sp, p, 0, BIG.has(kind));
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
const phone = () => matchMedia('(max-width: 640px)').matches;
function show(subject, kind) {
  subject = subject || 'none';
  if (phone()) { hide(); return; }      // on a phone the answers need the room
  if (strip && strip.subject === subject && strip.ln.kind === kind) { strip.el.hidden = false; return; }
  hide();
  const el = stripEl(); el.hidden = false; el.dataset.subject = subject;
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  strip = { el, cv, ctx, subject, ln: lane(kind || pick(subject)), x: 0, last: performance.now(), raf: 0 };
  sprites(strip.ln.kind);
  const frame = now => {
    if (!strip || strip.cv !== cv) return;
    const s = strip, dt = Math.min(0.05, (now - s.last) / 1000); s.last = now;
    const dpr = Math.min(2, devicePixelRatio || 1), w = el.clientWidth, h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const band = Math.round(h * 0.36), ground = h * 0.9, scale = h / 150, rx = Math.min(w * 0.3, 260);
    const trip = s.ln.step(dt, now, rx, ground, scale);
    s.x += dt * 140 * s.ln.speed;
    scene(ctx, w, h, s.subject, s.x, band);
    if (now < s.ln.boostUntil) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const yy = h * (0.25 + i * 0.1); const xx = (rx - 40 - ((now / 3 + i * 53) % 120)); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 40, yy); ctx.stroke(); } }
    drawRunner(ctx, s.ln.kind, rx, ground, scale, s.ln.phase, trip, s.ln.dust);
    if (!still()) s.raf = requestAnimationFrame(frame);
  };
  strip.raf = requestAnimationFrame(frame);
}
function hide() { if (strip) { cancelAnimationFrame(strip.raf); strip.el.hidden = true; strip = null; } else { const el = document.getElementById('runner-strip'); if (el) el.hidden = true; } }

/* ---------- the host's race: one lane per pupil, positions follow the scores ----------
   Lanes are strips of ground seen from above, with the setting along the top edge only.
   R.full = true makes the lanes share out the container's height (present mode). */
function race(container) {
  const cv = document.createElement('canvas'); container.appendChild(cv);
  const ctx = cv.getContext('2d');
  const R = { lanes: new Map(), subject: 'none', x: 0, last: performance.now(), raf: 0, entries: [], full: false };
  R.set = (subject, entries) => {   // entries: [{ id, name, kind, value }], best first
    R.subject = subject || 'none'; R.entries = entries;
    entries.forEach(e => { if (!R.lanes.has(e.id)) { sprites(e.kind); R.lanes.set(e.id, Object.assign(lane(e.kind), { pos: 0 })); } });
  };
  R.boost = id => { const l = R.lanes.get(id); if (l) l.boost(); };
  R.trip = id => { const l = R.lanes.get(id); if (l) l.trip(); };
  R.stop = () => { cancelAnimationFrame(R.raf); cv.remove(); };
  const frame = now => {
    const dt = Math.min(0.05, (now - R.last) / 1000); R.last = now;
    const dpr = Math.min(2, devicePixelRatio || 1), w = container.clientWidth, n = Math.max(1, R.entries.length);
    const band = R.full ? Math.round(Math.min(110, Math.max(56, container.clientHeight * 0.12))) : 46;
    const laneH = R.full ? Math.max(58, Math.min(170, Math.floor((container.clientHeight - band - 10) / n))) : 62;
    const h = R.full ? container.clientHeight : band + n * laneH + 10;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.x += dt * 90;
    scene(ctx, w, h, R.subject, R.x, band);
    const scale = 0.62 * laneH / 100;                      // a runner stands about two thirds of a lane tall
    const fs = Math.round(Math.max(14, Math.min(26, laneH * 0.24)));
    ctx.font = `700 ${fs}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const labels = R.entries.map((e, i) => `${i + 1}. ${e.name}`);
    const labelW = Math.max(60, ...labels.map(t => ctx.measureText(t).width)) + 20;
    const top = Math.max(1, ...R.entries.map(e => e.value));
    const start = labelW + 40 * scale + 16, finish = w - 60 * scale - 30;
    // lane lines and the finish line
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([14, 10]); ctx.lineDashOffset = R.x % 24;
    for (let i = 1; i < n; i++) { const y = band + i * laneH + 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let y = band + 6, k = 0; y < band + n * laneH + 6; y += 10, k++) { ctx.fillStyle = k % 2 ? '#1b1b22' : '#ffffff'; ctx.fillRect(finish + 40 * scale, y, 10, 10); ctx.fillStyle = k % 2 ? '#ffffff' : '#1b1b22'; ctx.fillRect(finish + 40 * scale + 10, y, 10, 10); }
    R.entries.forEach((e, i) => {
      const l = R.lanes.get(e.id); if (!l) return;
      const ground = band + 6 + (i + 1) * laneH - laneH * 0.16;
      const target = start + (finish - start) * Math.max(0, e.value) / top;
      if (!l.pos) l.pos = start;
      l.pos += (target - l.pos) * Math.min(1, dt * 2.5);
      const trip = l.step(dt, now, l.pos, ground, scale);
      // the name, in a box that fits it
      const tw = ctx.measureText(labels[i]).width + 16, bh = fs + 10, by = band + 6 + i * laneH + (laneH - bh) / 2;
      ctx.fillStyle = 'rgba(255,255,255,.9)'; roundRect(ctx, 8, by, tw, bh, 6); ctx.fill();
      ctx.fillStyle = '#1b1b22'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(labels[i], 16, by + bh / 2 + 1);
      drawRunner(ctx, l.kind, l.pos, ground, scale, l.phase, trip, l.dust);
    });
    if (!still()) R.raf = requestAnimationFrame(frame);
  };
  R.raf = requestAnimationFrame(frame);
  return R;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

window.RUNNER = { pick, deal, show, hide, boost: () => strip && strip.ln.boost(), trip: () => strip && strip.ln.trip(), race, kinds: CAST, drawRunner };
})();
