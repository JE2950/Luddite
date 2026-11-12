/* Subject themes: which look is showing, and the pixel takeover that swaps one look for another.
   The look itself is CSS (style.css, "Subject themes"), switched by data-subject on <html>. */
(function () {
'use strict';
const C = window.APP, root = document.documentElement;
const def = s => (s && C.subjects && C.subjects[s]) || null;

const T = window.THEME = {
  current: null,
  def,
  label: s => (def(s) ? def(s).label : ''),
  list: () => Object.keys(C.subjects || {}),
  modes: () => Object.assign({}, C.modes, (def(T.current) || {}).modes),
  keyLabel: j => { const k = (def(T.current) || {}).keys; return k && k[j] ? k[j] : String(j + 1); },
  fishNames: s => (def(s) || {}).fish || null,
  music: (s, key) => { const m = (def(s) || {}).music; return typeof m === 'string' ? m : (m && m[key]) || null; },

  /* Which subject a set belongs to. A subject chosen in the editor wins ('none' means no subject);
     with nothing chosen, the title, tags and questions decide. */
  subjectFor(set) {
    if (!set) return null;
    if (set.subject === 'none') return null;
    if (def(set.subject)) return set.subject;
    return T.detect(set);
  },
  detect(set) {
    const head = [set.title || '', ...(set.tags || [])].join(' ').toLowerCase();
    if (/\blatin|\blatina|\bce latin|\bvocab(ulary)? latin/.test(head)) return 'latin';
    if (/\bfrench|fran[cç]ais/.test(head)) return 'french';
    const qs = (set.questions || []).slice(0, 300);
    const text = qs.map(q => [q.q, ...(q.answers || [])].join(' ')).join(' \n ');
    if (!text.trim()) return null;
    const low = text.toLowerCase();
    let la = 0, fr = 0;
    const count = re => (low.match(re) || []).length;
    // Latin: dictionary entries (amo, -are, -avi, -atum / puella, -ae f), macrons, Latin-only words and endings
    la += 3 * count(/,\s*-(are|ere|ire|avi|evi|ivi|atum|itum|ui|i|ae|is|us|a|um|orum|arum|ibus)\b/g);
    la += 2 * count(/[āēīōūȳ]/g);
    la += count(/\b(est|sunt|erat|erant|non|cum|sed|ego|nos|vos|puer|puella|rex|regina|dominus|servus|bellum|urbs|deus|amicus|quod|quia|ubi|iam|tum|nunc|semper|saepe|valde|etiam|neque|atque|ab|ex|per|ob|sub|inter|contra|propter)\b/g);
    la += count(/\b\w+(amus|atis|ant|ebat|ebant|abat|abant|avit|averunt|orum|arum|ibus)\b/g);
    // French: accents, elisions and common words
    fr += 2 * count(/[éèêàçùâîôûëïœ]/g);
    fr += 2 * count(/\b(l|d|j|qu|c|n|s|m|t)['’][a-zéèêàâîôûh]/g);
    fr += count(/\b(le|la|les|un|une|des|du|je|tu|il|elle|nous|vous|ils|elles|sont|avec|pour|dans|mon|ma|mes|ton|ta|tes|son|sa|ses|très|aussi|mais|où|qui|quoi|chez|sur|sous|ce|cette|ces|au|aux|pas|bonjour|merci|oui|non)\b/g);
    const n = Math.max(1, qs.length);
    if (la >= 3 && la >= 2 * fr && la / n >= 0.3) return 'latin';
    if (fr >= 3 && fr >= 2 * la && fr / n >= 0.3) return 'french';
    return null;
  },

  /* Switch look straight away, no animation */
  apply(s) {
    s = def(s) ? s : null;
    T.current = s;
    if (s) root.dataset.subject = s; else delete root.dataset.subject;
  },

  /* Pixel takeover: squares in the new look's colours sweep across the screen, the look changes
     underneath, then the squares clear. `mid` runs at the moment the look changes. */
  takeover(s, mid) {
    s = def(s) ? s : null;
    if (s === T.current && !T._busy) { if (mid) mid(); return Promise.resolve(); }
    if (T._busy) { T._next = { s, mid }; return T._busy; }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    const ctx = !still && cv.getContext && cv.getContext('2d');
    if (!ctx) { T.apply(s); if (mid) mid(); return Promise.resolve(); }

    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    cv.className = 'takeover'; cv.setAttribute('aria-hidden', 'true');
    const size = Math.max(22, Math.round(Math.max(W, H) / 34));
    const cols = Math.ceil(W / size), rows = Math.ceil(H / size);
    const pal = (def(s) || C).pixels || ['#002664', '#ffffff'];
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      cells.push({ x, y, d: 0.6 * (x / cols) + 0.4 * Math.random(), c: pal[Math.floor(Math.random() * pal.length)] });
    }
    const banner = def(s) ? def(s).banner || def(s).label : C.name;
    const IN = 620, HOLD = 420, OUT = 620, POP = 0.14;
    document.body.appendChild(cv);

    T._busy = new Promise(done => {
      let t0 = null, swapped = false;
      const swap = () => { if (swapped) return; swapped = true; T.apply(s); try { if (mid) mid(); } catch (e) { console.error(e); } };
      const finish = () => {
        swap(); cv.remove(); T._busy = null; done();
        const n = T._next; T._next = null;
        if (n && n.s !== T.current) T.takeover(n.s, n.mid); else if (n && n.mid) n.mid();
      };
      const safety = setTimeout(finish, IN + HOLD + OUT + 1500); // a hidden tab pauses animation frames
      const frame = now => {
        if (t0 == null) t0 = now;
        const t = now - t0;
        ctx.clearRect(0, 0, W, H);
        if (t >= IN) swap();
        const covering = t < IN, p = covering ? t / IN : (t - IN - HOLD) / OUT;
        for (const c of cells) {
          // k: how much of this square shows (0 to 1). Squares pop in left to right, then pop out the same way.
          const k = covering ? (p * (1 + POP) - c.d) / POP : 1 - (p * (1 + POP) - c.d) / POP;
          if (k <= 0) continue;
          const e = size * Math.min(1, k), o = (size - e) / 2;
          ctx.fillStyle = c.c;
          ctx.fillRect(c.x * size + o, c.y * size + o, e + 0.5, e + 0.5);
        }
        if (t > IN * 0.7 && t < IN + HOLD + OUT * 0.25) {
          const fs = Math.max(26, Math.min(W / (banner.length * 0.9), 92));
          ctx.font = `700 ${fs}px ${getComputedStyle(root).getPropertyValue('--display') || 'serif'}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(banner).width;
          ctx.fillStyle = pal[3] || '#000';
          ctx.fillRect(Math.round((W - tw) / 2 / size - 1) * size, Math.round((H / 2 - fs) / size) * size, Math.ceil(tw / size + 2) * size, Math.ceil(fs * 2 / size) * size);
          ctx.fillStyle = pal[2] || '#fff';
          ctx.fillText(banner, W / 2, Math.round((H / 2 - fs) / size) * size + Math.ceil(fs * 2 / size) * size / 2);
        }
        if (t < IN + HOLD + OUT) requestAnimationFrame(frame); else { clearTimeout(safety); finish(); }
      };
      requestAnimationFrame(frame);
    });
    return T._busy;
  }
};
})();
