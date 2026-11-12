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

/* Realtime channel names. Pupil traffic uses one private channel per pupil so it is not copied to the whole class. */
L.lobbyChannel = code => `lmb-${code}`;
L.pupilChannel = (code, pid) => `lmb-${code}-${pid}`;

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
L.rollFish = lure => {
  const odds = L.LURE_ODDS[Math.min(4, Math.max(1, lure))];
  let r = Math.random() * 100, t = 0;
  while (t < 4 && r >= odds[t]) { r -= odds[t]; t++; }
  const tier = L.FISH_TIERS[t];
  const [name, shape] = tier.fish[Math.floor(Math.random() * tier.fish.length)];
  const kg = Math.round((tier.min + (tier.max - tier.min) * Math.pow(Math.random(), 1.5)) * 10) / 10;
  return { name, shape, tier: t, tierName: tier.name, kg };
};
L.FRENZY_MS = 30000;
L.fmtKg = kg => (Math.round(kg * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';

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
