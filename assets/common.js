/* Quiz app — helpers shared by the host screen and the pupil page */
(function () {
'use strict';

const L = window.LB = {};

L.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Pictures. A picture answer is stored as "img:" + its web address, so it travels like any other answer.
   A question's picture is q.image. Only https and data: addresses are shown. */
L.isImg = a => /^img:/i.test(String(a || ''));
L.safeSrc = u => (/^(https:\/\/|data:image\/|blob:)/i.test(String(u || '').trim()) ? String(u).trim() : '');
L.imgOf = a => L.safeSrc(String(a).slice(4));
L.ansHTML = a => L.isImg(a) ? `<img class="ans-img" src="${L.esc(L.imgOf(a))}" alt="Picture answer" draggable="false">` : L.esc(a);
L.ansText = a => (L.isImg(a) ? '[picture]' : String(a ?? ''));
L.qText = q => (q && String(q.q || '').trim()) || (q && q.image ? '[picture]' : '');
L.qHTML = q => `${q.image && L.safeSrc(q.image) ? `<img class="q-img" src="${L.esc(L.safeSrc(q.image))}" alt="Picture for this question" draggable="false">` : ''}${String(q.q || '').trim() ? `<div class="qtext">${L.esc(q.q)}</div>` : ''}`;
L.hasImgAnswers = q => (q.answers || []).some(L.isImg);
L.validQ = q => !!(q && (String(q.q || '').trim() || L.safeSrc(q.image)) && (q.answers || []).filter(a => String(a).trim()).length >= 2 && String((q.answers || [])[q.correct] ?? '').trim());
/* An image web address pasted where an answer goes becomes a picture answer */
L.asAnswer = a => { const t = String(a ?? '').trim(); return /^https:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t) ? 'img:' + t : t; };
L.rid = (n = 10) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
L.shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
L.fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
Object.defineProperty(L, 'mark', { get: () => window.APP.logo() });

/* Streak scoring: 100 points per correct answer, multiplied by the streak tier */
L.BASE = 100;
L.TIERS = [
  { from: 1, m: 1, label: '1–2 in a row' },
  { from: 3, m: 1.5, label: '3–4 in a row' },
  { from: 5, m: 2, label: '5–7 in a row' },
  { from: 8, m: 3, label: '8+ in a row' }
];
L.multFor = streak => { let m = 1; for (const t of L.TIERS) if (streak >= t.from) m = t.m; return m; };
L.fmtMult = m => '×' + (Number.isInteger(m) ? m : m.toFixed(1));
L.flames = streak => `<span class="flames" aria-hidden="true">${[1, 3, 5, 8].map(t => `<i class="${streak >= t ? 'on' : ''}"></i>`).join('')}</span>`;
L.WRONG_LOCK_MS = 2000;

/* Realtime channel names. Everyone can listen to the lobby channel, so nothing secret is sent on it.
   Each pupil then gets a channel whose name only that pupil's browser and the teacher's tab can work out
   (see L.kx), so one pupil cannot read or answer for another. */
L.lobbyChannel = code => `lmb-${code}`;
L.pupilChannel = (code, secret) => `lmb-${code}-${secret}`;

/* Key exchange (ECDH, P-256). The pupil and the teacher's tab each make a key pair and swap the public
   halves over the lobby. Both then derive the same secret; anyone listening sees only the public halves. */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const EC = { name: 'ECDH', namedCurve: 'P-256' };
L.kx = {
  ok: !!(window.crypto && crypto.subtle),
  async newPair() {
    const k = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
    return { pub: b64(await crypto.subtle.exportKey('raw', k.publicKey)), priv: await crypto.subtle.exportKey('jwk', k.privateKey) };
  },
  validPub: p => typeof p === 'string' && /^[A-Za-z0-9+/]{86,88}={0,2}$/.test(p),
  async secret(privJwk, otherPub, code) {
    const priv = await crypto.subtle.importKey('jwk', privJwk, EC, false, ['deriveBits']);
    const pub = await crypto.subtle.importKey('raw', unb64(otherPub), EC, false, []);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
    const tag = new TextEncoder().encode('quiz-channel:' + code);
    const both = new Uint8Array(bits.length + tag.length); both.set(bits); both.set(tag, bits.length);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', both));
    return Array.from(hash.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  }
};

/* Ranking by accuracy only counts pupils who have answered at least this many questions */
L.MIN_FOR_ACCURACY = 10;

L.client = () => {
  const cfg = window.APP;
  return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });
};


/* ---------- Fishing mode ---------- */
// Five rarity tiers. Real UK fish for the everyday tiers, silly legends at the top.
L.FISH_TIERS = [
  { name: 'Common',    min: 1,   max: 5,   colour: '#7f97b2', fish: [['Minnow', 'small'], ['Perch', 'round'], ['Roach', 'round'], ['Mackerel', 'long']] },
  { name: 'Uncommon',  min: 5,   max: 15,  colour: '#2fa36f', fish: [['Brown Trout', 'long'], ['Bream', 'round'], ['Sea Bass', 'round']] },
  { name: 'Rare',      min: 15,  max: 40,  colour: '#2c74e0', fish: [['Pike', 'pike'], ['Atlantic Salmon', 'long'], ['Mirror Carp', 'round']] },
  { name: 'Epic',      min: 40,  max: 100, colour: '#8a55d4', fish: [['Sturgeon', 'pike'], ['Bluefin Tuna', 'round'], ['Wels Catfish', 'long']] },
  { name: 'Legendary', min: 100, max: 250, colour: '#f2a900', fish: [['Golden Guppy', 'small'], ['Sir Flounderpants', 'round'], ['Captain Codswallop', 'long']] }
];
// Lure level follows the streak tiers (1–2, 3–4, 5–7, 8+). Odds (%) per tier, Common → Legendary.
// Moderate boost: Rare-or-better goes from 15% at lure 1 to 31% at lure 4.
L.LURE_ODDS = [null, [60, 25, 10, 4, 1], [52, 28, 13, 5.5, 1.5], [45, 30, 16, 7, 2], [38, 31, 19, 9, 3]];
L.lureFor = streak => (streak >= 8 ? 4 : streak >= 5 ? 3 : streak >= 3 ? 2 : 1);
L.rollFish = (lure, subject) => {
  const odds = L.LURE_ODDS[Math.min(4, Math.max(1, lure))];
  let r = Math.random() * 100, t = 0;
  while (t < 4 && r >= odds[t]) { r -= odds[t]; t++; }
  const tier = L.FISH_TIERS[t];
  const kg = Math.round((tier.min + (tier.max - tier.min) * Math.pow(Math.random(), 1.5)) * 10) / 10;
  // Subject sets bring up that subject's treasures instead of fish
  const tr = window.THEME && window.THEME.treasure(subject);
  if (tr && tr.items[t] && tr.items[t].length) {
    const [name, icon] = tr.items[t][Math.floor(Math.random() * tr.items[t].length)];
    return { name, icon, subject, tier: t, tierName: tier.name, kg };
  }
  const [name, shape] = tier.fish[Math.floor(Math.random() * tier.fish.length)];
  return { name, shape, tier: t, tierName: tier.name, kg };
};
L.FRENZY_MS = 30000;
L.fmtKg = kg => (Math.round(kg * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';
/* What a catch is worth: kg of fish, or (for subject sets) denarii or francs. Internally the number is the same. */
L.catchUnit = subject => { const tr = window.THEME && window.THEME.treasure(subject || (window.THEME && window.THEME.current)); return tr ? tr.unit : null; };
L.fmtCatch = (v, subject) => {
  const tr = window.THEME && window.THEME.treasure(subject || (window.THEME && window.THEME.current));
  if (!tr) return L.fmtKg(v);
  const n = Math.round(v * 10).toLocaleString('en-GB');
  return tr.symbol ? tr.symbol + n : n + ' ' + tr.unit;      // £120, or 120 denarii
};
/* "You found a Greek vase!", "...the Golden Fleece!", "...Napoleon’s hat!" */
L.catchPhrase = c => {
  const n = c.name;
  if (/^(Neptune|Napoleon|The )/.test(n)) return n;
  if (/^(Golden Fleece|Shield of|Sword of)/.test(n)) return 'the ' + n;
  const word = /^(Greek|Roman|French|Trojan)\b/.test(n) ? n : n[0].toLowerCase() + n.slice(1);
  return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;
};
L.catchNoun = subject => (L.catchUnit(subject) ? 'treasure' : 'catch');
L.catchLabel = subject => { const u = L.catchUnit(subject); return u ? u[0].toUpperCase() + u.slice(1) : 'Total kg'; };   // a column heading
L.missText = subject => (L.catchUnit(subject) ? 'Nothing found' : 'The fish got away');
/* The picture for a catch. A drawn picture in assets/catches (named subject-item.webp, or fish-name.webp) is used
   when there is one; otherwise the simple drawing. Add a file's name to CATCH_ART when you add the file. */
L.CATCH_ART = new Set(["fish-atlantic-salmon", "fish-bream", "fish-brown-trout", "fish-mackerel", "fish-minnow", "fish-mirror-carp", "fish-perch", "fish-pike", "fish-roach", "fish-sea-bass", "french-accordion", "french-bottle-of-perfume", "french-copy-of-les-miserables", "french-garlic-bulb", "french-old-beret", "french-painters-palette", "french-petanque-boule", "french-snail-shell", "french-stale-baguette", "geography-ammonite-fossil", "geography-broken-compass", "geography-explorers-telescope", "geography-gold-nugget", "geography-message-in-a-bottle", "geography-old-penny", "geography-old-postcard", "geography-quartz-crystal", "geography-school-globe", "geography-soggy-map", "latin-bronze-coin", "latin-chipped-pot", "latin-greek-vase", "latin-legionary-helmet", "latin-model-trojan-horse", "latin-oil-lamp", "latin-old-sandal", "latin-rusty-sword", "latin-silver-ring", "latin-wax-tablet"]);
L.slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
L.catchArt = (name, subject, size) => {
  const key = (subject ? subject : 'fish') + '-' + L.slug(name);
  return L.CATCH_ART.has(key) ? `<img class="catch-art" src="assets/catches/${key}.webp" width="${size}" height="${size}" alt="" draggable="false">` : '';
};
L.catchSVG = (c, size = 120) => (c && c.icon
  ? L.catchArt(c.name, c.subject, size) || L.itemSVG(c.icon, c.tier, size)
  : L.catchArt(c && c.name, null, size) || L.fishSVG(c.tier, c.shape, size));

/* A simple drawn fish, coloured by rarity */
L.fishSVG = (tier, shape, size = 120) => {
  const c = L.FISH_TIERS[tier].colour;
  const body = { small: [34, 18], round: [40, 26], long: [50, 18], pike: [56, 15] }[shape] || [40, 24];
  const [rx, ry] = body, cx = 70, cy = 50;
  const tailX = cx + rx - 4;
  return `<svg class="fish" viewBox="0 0 160 100" width="${size}" height="${size * 0.625}" aria-hidden="true">
    <path d="M${tailX} ${cy} L${tailX + 26} ${cy - ry * 0.9} Q${tailX + 18} ${cy} ${tailX + 26} ${cy + ry * 0.9} Z" fill="${c}" opacity=".85"/>
    <path d="M${cx - 6} ${cy - ry + 2} Q${cx + 8} ${cy - ry - 14} ${cx + 20} ${cy - ry + 3} Z" fill="${c}" opacity=".75"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/>
    <ellipse cx="${cx + 4}" cy="${cy + ry * 0.35}" rx="${rx * 0.7}" ry="${ry * 0.45}" fill="#fff" opacity=".22"/>
    <path d="M${cx - rx * 0.45} ${cy - ry * 0.7} Q${cx - rx * 0.25} ${cy} ${cx - rx * 0.45} ${cy + ry * 0.7}" stroke="#000" stroke-opacity=".18" stroke-width="2.5" fill="none"/>
    <circle cx="${cx - rx * 0.62}" cy="${cy - ry * 0.2}" r="${Math.max(3.5, ry * 0.2)}" fill="#fff"/>
    <circle cx="${cx - rx * 0.65}" cy="${cy - ry * 0.2}" r="${Math.max(2, ry * 0.11)}" fill="#18203a"/>
    ${tier === 4 ? `<path d="M${cx - 12} ${cy - ry - 4} l5 -10 l5 7 l5 -9 l5 9 l5 -7 l5 10 z" fill="#ffd34d" stroke="#c98a00" stroke-width="1.5"/>` : ''}
  </svg>`;
};


/* ---------- Guided tour (the "?" button), after the Ludgrove Division Screen's tour ----------
   LB.tour.start(steps) runs one. Tours only ever start from the ? button or the ? key.
   A step: { sel, title, text }. A step whose element isn't on screen sits in the middle with no spotlight. */
L.tour = (() => {
  let steps = [], i = 0, el = null;
  const q = s => (s ? [...document.querySelectorAll(s)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) : null);
  function build() {
    if (el) return el;
    el = document.createElement('div'); el.className = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tour-title');
    el.innerHTML = `<div class="tour-spot"></div><div class="tour-card"><div class="tour-step"></div><h4 id="tour-title"></h4><p class="tour-text"></p>
      <div class="tour-row"><button class="btn" data-tour="back">Back</button><button class="btn primary" data-tour="next">Next</button><button class="btn" data-tour="end">Close</button></div></div>`;
    el.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; const a = b.dataset.tour; if (a === 'back') step(-1); else if (a === 'next') step(1); else stop(); });
    document.addEventListener('keydown', e => {
      if (!el || !el.classList.contains('on')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); step(-1); }
    }, true);
    addEventListener('resize', () => { if (el.classList.contains('on')) place(); });
    document.body.appendChild(el);
    return el;
  }
  function show() {
    const st = steps[i];
    el.querySelector('.tour-step').textContent = `Step ${i + 1} of ${steps.length}`;
    el.querySelector('#tour-title').textContent = st.title;
    el.querySelector('.tour-text').textContent = st.text;
    el.querySelector('[data-tour="back"]').disabled = i === 0;
    el.querySelector('[data-tour="next"]').textContent = i === steps.length - 1 ? 'Finish' : 'Next';
    const t = q(st.sel); if (t) t.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    setTimeout(place, 90);
    el.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }
  function place() {
    const st = steps[i], t = q(st.sel), spot = el.querySelector('.tour-spot'), card = el.querySelector('.tour-card');
    const vw = innerWidth, vh = innerHeight, cw = card.offsetWidth, ch = card.offsetHeight;
    if (!t) { spot.classList.add('hide'); card.style.left = Math.round((vw - cw) / 2) + 'px'; card.style.top = Math.round((vh - ch) / 2) + 'px'; return; }
    spot.classList.remove('hide');
    const r = t.getBoundingClientRect(), pad = 8;
    Object.assign(spot.style, { left: Math.round(r.left - pad) + 'px', top: Math.round(r.top - pad) + 'px', width: Math.round(r.width + pad * 2) + 'px', height: Math.round(r.height + pad * 2) + 'px' });
    let top = r.bottom + 18;
    if (top + ch > vh - 12) top = Math.max(12, r.top - ch - 18);
    if (top + ch > vh - 12) top = Math.max(12, (vh - ch) / 2);
    const left = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(top) + 'px';
  }
  function step(d) { const n = i + d; if (n < 0) return; if (n >= steps.length) return stop(); i = n; show(); }
  function stop() { if (el) el.classList.remove('on'); document.documentElement.classList.remove('touring'); }
  function start(list) { steps = (list || []).filter(Boolean); if (!steps.length) return; i = 0; build().classList.add('on'); document.documentElement.classList.add('touring'); show(); }
  return { start, stop, open: () => !!(el && el.classList.contains('on')) };
})();
L.helpButton = (title = 'Guided tour (?)') => `<button class="help-btn" data-act="help" title="${L.esc(title)}" aria-label="Guided tour"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.2-2.8 4"/><path d="M12 17.4h.01"/></svg></button>`;

/* Treasure drawings (viewBox 100 x 70). Each sits on a soft glow in its tier's colour. */
const IT = {
  sword: '<path d="M18 52 L70 14 L76 18 L26 58 Z" fill="#a9763f"/><path d="M30 50 l-8 -10 M34 47 l-6 -12" stroke="#7a4a24" stroke-width="3"/><rect x="12" y="50" width="16" height="6" rx="2" transform="rotate(-37 20 53)" fill="#5b3a1e"/><circle cx="10" cy="60" r="4" fill="#5b3a1e"/><circle cx="52" cy="30" r="3" fill="#7a3a1a" opacity=".6"/>',
  pot: '<path d="M30 20 h40 l-4 8 q12 8 10 22 q-4 14 -26 14 q-22 0 -26 -14 q-2 -14 10 -22 z" fill="#c4703a"/><path d="M58 22 l8 14 l-10 -4 l4 10" stroke="#fbeed6" stroke-width="2" fill="none"/>',
  sandal: '<path d="M14 50 q0 -12 20 -12 h40 q14 0 14 8 q0 8 -14 8 h-50 q-10 0 -10 -4z" fill="#8a5a34"/><path d="M40 38 q6 -14 14 0 M50 38 q4 -10 12 0" stroke="#5b3a1e" stroke-width="4" fill="none"/>',
  coin: '<circle cx="50" cy="35" r="24" fill="#b07a3a"/><circle cx="50" cy="35" r="18" fill="none" stroke="#e3b06a" stroke-width="2"/><path d="M42 26 q8 -6 14 2 q-4 6 2 12 q-8 6 -16 -2z" fill="#e3b06a"/>',
  lamp: '<path d="M18 40 q0 -14 26 -14 q26 0 30 10 l12 -4 q-2 10 -14 10 q-6 10 -28 10 q-26 0 -26 -12z" fill="#c4823a"/><path d="M86 28 q4 -10 -2 -18 q-2 8 -6 10z" fill="#f2b705"/><circle cx="40" cy="36" r="4" fill="#7a4a24"/>',
  vase: '<path d="M38 8 h24 v6 q-6 2 -4 8 q18 8 16 26 q-2 18 -24 18 q-22 0 -24 -18 q-2 -18 16 -26 q2 -6 -4 -8z" fill="#c4572e"/><path d="M28 40 h44 M30 48 h40" stroke="#1d1d1d" stroke-width="3"/><path d="M38 30 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6" stroke="#1d1d1d" stroke-width="2" fill="none"/>',
  tablet: '<rect x="22" y="12" width="56" height="46" rx="4" fill="#8a5a34"/><rect x="28" y="18" width="44" height="34" fill="#d9a441"/><path d="M33 26 h30 M33 33 h24 M33 40 h28" stroke="#6b4a1e" stroke-width="2"/>',
  helmet: '<path d="M22 48 q0 -36 28 -36 q28 0 28 36 h-10 v-12 h-36 v12z" fill="#9aa1a8"/><path d="M40 12 q10 -14 22 0" fill="#b5372e"/><rect x="30" y="40" width="40" height="5" fill="#b8892b"/>',
  horse: '<rect x="20" y="54" width="60" height="6" rx="2" fill="#7a4a24"/><circle cx="28" cy="62" r="5" fill="#5b3a1e"/><circle cx="72" cy="62" r="5" fill="#5b3a1e"/><path d="M30 52 v-14 h34 v14 M34 38 v14 M60 38 v14" stroke="#a9763f" stroke-width="5"/><path d="M28 30 h40 q4 0 4 6 h-44 z M64 30 l6 -18 h8 l-2 12 z" fill="#c4904f"/>',
  ring: '<ellipse cx="50" cy="44" rx="22" ry="16" fill="none" stroke="#c9ced4" stroke-width="7"/><path d="M42 26 l8 -12 l8 12 l-8 6 z" fill="#5fb0e0"/>',
  wreath: '<path d="M20 50 q-6 -30 30 -38 M80 50 q6 -30 -30 -38" stroke="#b8892b" stroke-width="4" fill="none"/>' + [0,1,2,3,4].map(i => `<ellipse cx="${24+i*4}" cy="${44-i*7}" rx="7" ry="3" fill="#e0b84a" transform="rotate(-50 ${24+i*4} ${44-i*7})"/><ellipse cx="${76-i*4}" cy="${44-i*7}" rx="7" ry="3" fill="#e0b84a" transform="rotate(50 ${76-i*4} ${44-i*7})"/>`).join(''),
  bust: '<rect x="34" y="56" width="32" height="8" fill="#d9d4ca"/><path d="M26 56 q2 -16 24 -16 q22 0 24 16z" fill="#ece8e0"/><circle cx="50" cy="26" r="13" fill="#f2efe8"/><path d="M38 22 q12 -14 24 0" stroke="#cfc9bd" stroke-width="4" fill="none"/>',
  eagle: '<path d="M50 20 q-30 -10 -42 14 q18 -6 30 6 q-4 10 0 18 l12 -10 l12 10 q4 -8 0 -18 q12 -12 30 -6 q-12 -24 -42 -14z" fill="#e0b84a"/><circle cx="50" cy="18" r="6" fill="#e0b84a"/><rect x="47" y="50" width="6" height="14" fill="#b8892b"/>',
  fleece: '<path d="M20 40 q-4 -18 14 -20 q6 -10 16 -4 q10 -8 18 2 q14 0 12 16 q8 10 -4 18 q-4 10 -16 6 q-10 6 -18 -2 q-14 4 -16 -8 q-10 -2 -6 -8z" fill="#f2c94c"/><circle cx="36" cy="34" r="4" fill="#e0b13a"/><circle cx="56" cy="30" r="4" fill="#e0b13a"/><circle cx="62" cy="46" r="4" fill="#e0b13a"/>',
  trident: '<rect x="47" y="24" width="6" height="42" fill="#c9a24a"/><path d="M30 10 v16 q0 8 20 8 q20 0 20 -8 v-16 l-4 6 v10 q-6 4 -12 4 v-20 l-4 -6 l-4 6 v20 q-6 0 -12 -4 v-10z" fill="#e0b84a"/>',
  shield: '<circle cx="50" cy="35" r="28" fill="#c9a24a"/><circle cx="50" cy="35" r="20" fill="#e0b84a"/><circle cx="50" cy="35" r="10" fill="#b8892b"/><circle cx="50" cy="35" r="27" fill="none" stroke="#8a6a2a" stroke-width="2"/>',
  garlic: '<path d="M50 10 q4 8 2 14 q22 4 22 22 q0 18 -24 18 q-24 0 -24 -18 q0 -18 22 -22 q-2 -6 2 -14z" fill="#f6f1e2"/><path d="M40 32 q-4 14 4 28 M60 32 q4 14 -4 28 M50 26 v36" stroke="#d9cfb6" stroke-width="2" fill="none"/>',
  baguette: '<rect x="8" y="28" width="84" height="16" rx="8" transform="rotate(-12 50 36)" fill="#d19a4f"/><path d="M24 36 l8 -8 M40 33 l8 -8 M56 30 l8 -8 M72 27 l8 -8" stroke="#a96f2c" stroke-width="3" transform="rotate(-6 50 36)"/>',
  beret: '<ellipse cx="50" cy="42" rx="34" ry="12" fill="#1d1d22"/><path d="M18 40 q2 -20 32 -20 q30 0 32 20z" fill="#2a2a30"/><rect x="48" y="12" width="4" height="9" fill="#1d1d22"/>',
  snail: '<path d="M14 56 h60 q10 0 10 -6 l-6 -2" fill="none" stroke="#9c7b52" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="38" r="18" fill="#c9965c"/><path d="M48 38 m-10 0 a10 10 0 1 1 10 10 a6 6 0 1 1 -6 -6" stroke="#8a5a34" stroke-width="3" fill="none"/>',
  perfume: '<rect x="44" y="8" width="12" height="8" fill="#b8892b"/><path d="M34 18 h32 l6 12 v24 q0 8 -8 8 h-28 q-8 0 -8 -8 v-24z" fill="#c9a0dc"/><rect x="40" y="34" width="20" height="12" fill="#fff" opacity=".7"/>',
  book: '<rect x="26" y="8" width="48" height="56" rx="3" fill="#14213d"/><rect x="26" y="8" width="7" height="56" fill="#0a1328"/><path d="M40 20 h26 M40 26 h20" stroke="#e0b84a" stroke-width="2"/><circle cx="54" cy="44" r="8" fill="#e1352b"/>',
  boule: '<circle cx="50" cy="38" r="24" fill="#a9b0b8"/><path d="M28 30 q22 10 44 0 M28 46 q22 10 44 0" stroke="#7d848c" stroke-width="2" fill="none"/><circle cx="42" cy="28" r="5" fill="#d8dde2"/>',
  bicorne: '<path d="M8 46 q42 -40 84 0 q-42 -8 -84 0z" fill="#1d1d22"/><circle cx="62" cy="30" r="6" fill="#0055a4"/><circle cx="62" cy="30" r="4" fill="#fff"/><circle cx="62" cy="30" r="2" fill="#e1352b"/>',
  accordion: '<rect x="16" y="18" width="16" height="38" rx="3" fill="#b5372e"/><rect x="68" y="18" width="16" height="38" rx="3" fill="#b5372e"/>' + [0,1,2,3,4].map(i => `<path d="M${32+i*7.2} 18 l3.6 4 l-3.6 4 l3.6 4 l-3.6 4 l3.6 4 l-3.6 4 l3.6 4 l-3.6 4 l3.6 2" stroke="#1d1d22" stroke-width="2" fill="none"/>`).join('') + '<circle cx="24" cy="28" r="2" fill="#fff"/><circle cx="24" cy="36" r="2" fill="#fff"/><circle cx="24" cy="44" r="2" fill="#fff"/>',
  palette: '<path d="M50 10 q36 0 38 26 q0 14 -14 14 q-8 0 -8 8 q0 8 -16 8 q-32 0 -36 -26 q-2 -30 36 -30z" fill="#d9a46a"/><circle cx="32" cy="30" r="5" fill="#e1352b"/><circle cx="48" cy="22" r="5" fill="#f2b705"/><circle cx="66" cy="26" r="5" fill="#0055a4"/><circle cx="72" cy="40" r="5" fill="#2e8b6e"/><circle cx="36" cy="46" r="6" fill="#fbf7ee"/>',
  eiffel: '<path d="M50 4 l4 16 q4 22 22 46 h-10 q-8 -12 -16 -12 q-8 0 -16 12 h-10 q18 -24 22 -46z" fill="#7a5a3a"/><rect x="36" y="34" width="28" height="4" fill="#5b3a1e"/><rect x="42" y="22" width="16" height="3" fill="#5b3a1e"/>',
  croissant: '<path d="M14 46 q6 -30 36 -30 q30 0 36 30 q-8 -6 -14 -4 q-4 -12 -22 -12 q-18 0 -22 12 q-6 -2 -14 4z" fill="#e0b84a"/><path d="M34 22 l6 16 M50 16 v20 M66 22 l-6 16" stroke="#b8892b" stroke-width="3"/>',
  crown: '<path d="M18 54 l-4 -34 l18 14 l18 -24 l18 24 l18 -14 l-4 34z" fill="#e0b84a"/><rect x="18" y="54" width="64" height="8" fill="#b8892b"/><circle cx="50" cy="40" r="5" fill="#e1352b"/><circle cx="32" cy="44" r="4" fill="#0055a4"/><circle cx="68" cy="44" r="4" fill="#0055a4"/>',
  map: '<path d="M14 14 l22 6 l28 -6 l22 6 v40 l-22 -6 l-28 6 l-22 -6z" fill="#e8d9a8"/><path d="M36 20 v40 M64 14 v40" stroke="#c9b27a" stroke-width="2"/><path d="M22 46 q10 -14 22 -6 t22 -12" stroke="#a3402e" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/><path d="M64 24 l8 8 M72 24 l-8 8" stroke="#a3402e" stroke-width="3"/><path d="M14 54 q8 4 14 -2 q6 6 14 2" stroke="#7fa7c4" stroke-width="3" fill="none" opacity=".7"/>',
  compass: '<circle cx="50" cy="36" r="26" fill="#8a6a3a"/><circle cx="50" cy="36" r="21" fill="#f2ead2"/><path d="M50 18 l5 18 l-5 18 l-5 -18z" fill="#c7392b"/><path d="M50 36 l5 0 l-5 18 l-5 -18z" fill="#3a3f4a"/><path d="M34 22 l30 28" stroke="#fff" stroke-width="2" opacity=".8"/><path d="M30 46 l10 -6 l-4 10" stroke="#5b4a2a" stroke-width="1.5" fill="none"/>',
  postcard: '<rect x="14" y="14" width="72" height="46" rx="3" fill="#f6efd9" transform="rotate(-6 50 37)"/><rect x="62" y="18" width="16" height="18" fill="#2f7fb5" transform="rotate(-6 50 37)"/><path d="M22 30 h30 M22 38 h26 M22 46 h30" stroke="#8a7a5a" stroke-width="2" transform="rotate(-6 50 37)"/><circle cx="66" cy="34" r="7" fill="none" stroke="#a3402e" stroke-width="1.5" transform="rotate(-6 50 37)"/>',
  fossil: '<circle cx="50" cy="36" r="26" fill="#a8a29a"/><path d="M50 36 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16 a20 20 0 1 1 -20 -20" stroke="#6f6a62" stroke-width="2.5" fill="none"/>',
  globe: '<rect x="44" y="58" width="12" height="6" fill="#6b4a2a"/><rect x="34" y="62" width="32" height="5" rx="2" fill="#6b4a2a"/><path d="M24 34 a26 26 0 0 1 52 0" stroke="#b8892b" stroke-width="3" fill="none" transform="rotate(20 50 34)"/><circle cx="50" cy="34" r="22" fill="#2f7fb5"/><path d="M36 22 q8 -4 12 4 q-2 8 6 10 q2 10 -6 14 q-6 -6 -10 -2 q-6 -10 -2 -16z M58 18 q10 4 12 14 q-6 2 -10 -4z" fill="#5fa04a"/>',
  bottle: '<path d="M30 30 h34 q12 0 12 10 v6 q0 10 -12 10 h-34 q-12 0 -12 -10 v-6 q0 -10 12 -10z" fill="#9ad0c4" opacity=".8" transform="rotate(-14 50 43)"/><rect x="76" y="34" width="12" height="10" rx="2" fill="#8a5a34" transform="rotate(-14 50 43)"/><rect x="30" y="38" width="32" height="10" rx="2" fill="#f2ead2" transform="rotate(-14 50 43)"/><path d="M34 41 h22 M34 45 h18" stroke="#a89a7a" stroke-width="1.5" transform="rotate(-14 50 43)"/>',
  telescope: '<path d="M14 46 l58 -26 l6 12 l-58 26z" fill="#c9a24a"/><path d="M70 18 l12 -5 l7 15 l-12 5z" fill="#b8892b"/><path d="M30 39 l4 9 M52 29 l4 9" stroke="#8a6a2a" stroke-width="3"/><path d="M40 56 l-10 12 M44 54 l4 14" stroke="#5b3a1e" stroke-width="3"/>',
  nugget: '<path d="M22 46 q-4 -18 12 -24 q8 -10 22 -6 q16 -2 22 12 q8 12 -2 22 q-10 10 -28 8 q-20 0 -26 -12z" fill="#e0b84a"/><path d="M36 30 q6 -4 12 0 M56 40 q6 -2 10 4 M40 48 q4 2 8 0" stroke="#fff3c4" stroke-width="3" fill="none"/><path d="M60 22 q8 4 10 12" stroke="#b8892b" stroke-width="2" fill="none"/>',
  crystal: '<path d="M30 62 l-6 -24 l8 -18 l8 18 l-2 24z" fill="#b89ad9"/><path d="M42 62 l-2 -30 l10 -24 l10 24 l-2 30z" fill="#9d7cc9"/><path d="M58 62 l2 -22 l10 -14 l6 16 l-6 20z" fill="#c4aee3"/><path d="M50 8 l0 54 M32 20 l0 42" stroke="#fff" stroke-width="1.5" opacity=".6"/><rect x="20" y="60" width="62" height="6" rx="3" fill="#8a7a6a"/>',
  chest: '<path d="M18 30 q0 -16 32 -16 q32 0 32 16z" fill="#8a5a34"/><rect x="18" y="30" width="64" height="32" fill="#a9763f"/><path d="M18 30 h64 M18 44 h64" stroke="#5b3a1e" stroke-width="3"/><rect x="44" y="34" width="12" height="14" rx="2" fill="#e0b84a"/><path d="M30 26 l4 -8 l6 6 l6 -8 l6 8 l6 -6 l4 8" fill="#ffd34d"/><rect x="22" y="30" width="5" height="32" fill="#b8892b"/><rect x="73" y="30" width="5" height="32" fill="#b8892b"/>',
  meteorite: '<path d="M8 10 l30 18 M14 6 l26 18 M4 18 l30 14" stroke="#f2b705" stroke-width="3" opacity=".6"/><path d="M36 30 q4 -12 18 -10 q16 -2 20 12 q6 14 -6 22 q-12 8 -24 2 q-14 -6 -8 -26z" fill="#4a4540"/><circle cx="52" cy="34" r="4" fill="#2a2622"/><circle cx="64" cy="46" r="3" fill="#2a2622"/><path d="M44 46 q6 4 12 0" stroke="#e07a2a" stroke-width="2" fill="none"/>',
  gcompass: '<circle cx="50" cy="36" r="27" fill="#c9a24a"/><circle cx="50" cy="36" r="22" fill="#fff6d6"/><path d="M50 16 l6 20 l-6 20 l-6 -20z" fill="#c7392b"/><path d="M50 36 l6 0 l-6 20 l-6 -20z" fill="#b8892b"/><path d="M50 14 v4 M50 54 v4 M28 36 h4 M68 36 h4" stroke="#8a6a2a" stroke-width="2"/><circle cx="50" cy="7" r="4" fill="none" stroke="#c9a24a" stroke-width="3"/>',
  idol: '<rect x="30" y="58" width="40" height="8" fill="#8a6a2a"/><path d="M36 58 v-22 q0 -24 14 -24 q14 0 14 24 v22z" fill="#e0b84a"/><circle cx="44" cy="30" r="3" fill="#2fa36b"/><circle cx="56" cy="30" r="3" fill="#2fa36b"/><path d="M44 42 h12 M40 50 h20" stroke="#b8892b" stroke-width="3"/><path d="M36 22 l-6 -6 M64 22 l6 -6" stroke="#e0b84a" stroke-width="4"/>',
  diamond: '<path d="M24 26 l12 -14 h28 l12 14 l-26 36z" fill="#bfe6f6"/><path d="M24 26 h52 M36 12 l6 14 l8 36 M64 12 l-6 14 l-8 36 M42 26 l8 -14 l8 14" stroke="#7fc0dc" stroke-width="1.8" fill="none"/><path d="M38 18 l4 6" stroke="#fff" stroke-width="2"/>',
  gglobe: '<rect x="36" y="60" width="28" height="6" rx="2" fill="#8a6a2a"/><rect x="47" y="54" width="6" height="8" fill="#b8892b"/><path d="M22 30 a28 28 0 0 1 56 0" stroke="#b8892b" stroke-width="3" fill="none" transform="rotate(20 50 30)"/><circle cx="50" cy="30" r="22" fill="#e0b84a"/><path d="M36 18 q8 -4 12 4 q-2 8 6 10 q2 10 -6 14 q-6 -6 -10 -2 q-6 -10 -2 -16z M58 14 q10 4 12 14 q-6 2 -10 -4z" fill="#c9962a"/>',
  cheese: '<path d="M12 50 l52 -34 l26 20 v18 h-78z" fill="#f2c94c"/><path d="M12 50 h78 v14 h-78z" fill="#e0b13a"/><circle cx="40" cy="56" r="4" fill="#c9962a"/><circle cx="62" cy="40" r="5" fill="#e0b13a"/><circle cx="74" cy="56" r="3" fill="#c9962a"/>'
};
L.itemSVG = (icon, tier, size = 120) => {
  const c = L.FISH_TIERS[tier].colour;
  return `<svg class="fish item" viewBox="0 0 100 70" width="${size}" height="${size * 0.7}" aria-hidden="true"><ellipse cx="50" cy="40" rx="46" ry="28" fill="${c}" opacity=".18"/>${IT[icon] || IT.coin}${tier === 4 ? '<path d="M84 8 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2z M14 14 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5z" fill="#ffd34d"/>' : ''}</svg>`;
};

/* Maths rendering */
L.typeset = el => {
  const MJ = window.MathJax;
  if (!el || !MJ || !MJ.startup || !MJ.startup.promise) return;
  MJ.startup.promise
    .then(() => { try { MJ.typesetClear && MJ.typesetClear([el]); } catch (e) {} return MJ.typesetPromise([el]); })
    .catch(() => {});
};

/* Name checks. Normalises look-alike characters, then checks a block list. */
// STRONG words are blocked anywhere in the name; WORDS only as whole words (so Hancock, Cassie and Dickens are fine).
const STRONG = ['fuck', 'fck', 'shit', 'cunt', 'wank', 'bitch', 'twat', 'nigg', 'fagg', 'faggot', 'slut', 'whore', 'penis', 'vagina', 'bollock', 'bastard', 'dildo', 'retard', 'spastic', 'paedo', 'nazi', 'hitler', 'porn', 'pussy', 'boner', 'jizz', 'testic', 'scrot', 'tosser', 'bellend', 'knob', 'horny', 'sexy', 'killyourself'];
const WORDS = ['ass', 'arse', 'arsehole', 'asshole', 'dick', 'cock', 'tit', 'tits', 'titty', 'boob', 'boobs', 'piss', 'crap', 'bum', 'bumhole', 'poo', 'poop', 'sex', 'willy', 'prick', 'nob', 'damn', 'wtf', 'stfu', 'ugly', 'stupid', 'idiot', 'loser', 'nonce', 'skank', 'thot', 'hoe', 'pedo', 'rape', 'anal', 'anus', 'cum', 'shag', 'kys', 'clit'];
const ALLOW = ['kshitij', 'scunthorpe', 'penistone'];
const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '€': 'e' };
L.checkName = raw => {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, msg: 'Type your name.' };
  if (name.length > 20) return { ok: false, msg: 'Keep your name to 20 characters or fewer.' };
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) return { ok: false, msg: 'Use letters, numbers, spaces, hyphens or apostrophes only.' };
  const flat = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mapped = flat.replace(/[0-9!|@$+€]/g, c => LEET[c] || c).split(/([^a-z]+)/).map(w => ALLOW.includes(w) ? '' : w).join('');
  const joined = mapped.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const joinedRaw = mapped.replace(/[^a-z]/g, '');
  const words = mapped.split(/[^a-z]+/).filter(Boolean);
  const hit = STRONG.some(w => joined.includes(w.replace(/(.)\1+/g, '$1')) || joinedRaw.includes(w))
    || words.some(w => WORDS.includes(w) || WORDS.includes(w.replace(/(.)\1+/g, '$1')));
  if (hit) return { ok: false, msg: 'Please choose a different name.' };
  return { ok: true, name };
};
})();
