/* Quiz app — helpers shared by the host screen and the pupil page */
(function () {
'use strict';

const L = window.LB = {};

L.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
L.fmtCatch = (v, subject) => { const u = L.catchUnit(subject); return u ? Math.round(v * 10).toLocaleString('en-GB') + ' ' + u : L.fmtKg(v); };
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
/* The picture for a catch: a treasure drawing, or the fish */
L.catchSVG = (c, size = 120) => (c && c.icon ? L.itemSVG(c.icon, c.tier, size) : L.fishSVG(c.tier, c.shape, size));

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
