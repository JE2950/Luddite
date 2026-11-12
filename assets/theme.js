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
  // key is 'lobby', 'classic' or 'fishing'; a subject has a lobby track and one game track
  music: (s, key) => { const m = (def(s) || {}).music; if (!m) return null; if (typeof m === 'string') return m; return key === 'lobby' ? m.lobby || null : m.game || m[key] || null; },

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

  /* Takeover: the subject's name appears, the new look's colours wash over the page from the centre,
     the page changes underneath, the wash clears to reveal it, and the name fades away.
     `mid` runs at the moment the look changes (it redraws the page in the new look). */
  takeover(s, mid) {
    s = def(s) ? s : null;
    if (s === T.current && !T._busy) { if (mid) mid(); return Promise.resolve(); }
    if (T._busy) { T._next = { s, mid }; return T._busy; }
    const swap = () => { T.apply(s); try { if (mid) mid(); } catch (e) { console.error(e); } };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body) { swap(); return Promise.resolve(); }

    const wait = ms => new Promise(r => setTimeout(r, ms));
    const label = def(s) ? def(s).banner || def(s).label : (C.school || C.name);
    const banner = document.createElement('div');
    banner.className = 'takeover-banner to-' + (s || 'home');
    banner.setAttribute('aria-hidden', 'true');
    banner.innerHTML = `<span>${String(label).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`;
    // The banner's font is fixed for its whole life (set in style.css per subject), and loaded before it
    // appears, so the text never changes size mid-animation.
    const face = s === 'latin' ? 'Cinzel' : s === 'french' ? '"Playfair Display"' : '"Libre Baskerville"';
    const fontReady = Promise.race([document.fonts ? document.fonts.load(`700 48px ${face}`, label) : null, wait(600)]).catch(() => {});

    T._busy = (async () => {
      await fontReady;
      document.body.appendChild(banner);
      banner.getBoundingClientRect();
      banner.classList.add('in');
      await wait(300);
      // The new look's background washes in around the name, the page changes underneath, then the wash clears
      const veil = document.createElement('div');
      veil.className = 'takeover-veil to-' + (s || 'home');
      document.body.insertBefore(veil, banner);
      veil.getBoundingClientRect(); veil.classList.add('in');
      await wait(460); swap();
      await wait(120); veil.classList.remove('in');
      await wait(560); veil.remove();
      await wait(180);
      banner.classList.remove('in'); banner.classList.add('out');
      await wait(400);
      banner.remove();
      T._busy = null;
      const n = T._next; T._next = null;
      if (n && n.s !== T.current) return T.takeover(n.s, n.mid);
      if (n && n.mid) n.mid();
    })();
    return T._busy;
  }
};
})();
