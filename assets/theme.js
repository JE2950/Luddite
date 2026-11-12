/* Subject themes: which look is showing, and the pixel takeover that swaps one look for another.
   The look itself is CSS (style.css, "Subject themes"), switched by data-subject on <html>. */
(function () {
'use strict';
const C = window.APP, root = document.documentElement;
const def = s => (s && C.subjects && C.subjects[s]) || null;

/* The pieces that glide between looks. The first visible match for each gets the name. */
const MORPH = [['lx-mark', '.mark'], ['lx-title', 'main h1, .stage h1, .gate-card h1, .main-head h1, h1'], ['lx-panel', '.stage, .gate-card, .setup, .join-banner, .lib section, .panel-form'],
  ['lx-cta', '.big-go, .btn.primary'], ['lx-hud', '.hud, .host-bar, .top']];
function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }
function untag() { document.querySelectorAll('[data-morph]').forEach(el => { el.style.viewTransitionName = ''; delete el.dataset.morph; }); }
function tag() {
  untag();
  const used = new Set();
  MORPH.forEach(([name, sel]) => {
    const el = [...document.querySelectorAll(sel)].find(e => !used.has(e) && visible(e));
    if (el) { used.add(el); el.style.viewTransitionName = name; el.dataset.morph = name; }
  });
}
const GEO_PLACES = new RegExp('\\b(' + ['afghanistan','albania','algeria','andorra','angola','argentina','armenia','australia','austria','azerbaijan','bahamas','bangladesh','barbados','belarus','belgium','belize','benin','bhutan','bolivia','bosnia','botswana','brazil','bulgaria','burkina faso','burundi','cambodia','cameroon','canada','chad','chile','china','colombia','congo','costa rica','croatia','cuba','cyprus','czechia','czech republic','denmark','djibouti','dominican republic','ecuador','egypt','el salvador','england','eritrea','estonia','eswatini','ethiopia','fiji','finland','france','gabon','gambia','georgia','germany','ghana','greece','greenland','guatemala','guinea','guyana','haiti','honduras','hungary','iceland','india','indonesia','iran','iraq','ireland','israel','italy','jamaica','japan','jordan','kazakhstan','kenya','kosovo','kuwait','laos','latvia','lebanon','lesotho','liberia','libya','liechtenstein','lithuania','luxembourg','madagascar','malawi','malaysia','maldives','mali','malta','mauritania','mauritius','mexico','moldova','monaco','mongolia','montenegro','morocco','mozambique','myanmar','namibia','nepal','netherlands','new zealand','nicaragua','niger','nigeria','north korea','norway','oman','pakistan','panama','papua new guinea','paraguay','peru','philippines','poland','portugal','qatar','romania','russia','rwanda','saudi arabia','scotland','senegal','serbia','sierra leone','singapore','slovakia','slovenia','somalia','south africa','south korea','spain','sri lanka','sudan','suriname','sweden','switzerland','syria','taiwan','tajikistan','tanzania','thailand','togo','tonga','tunisia','turkey','turkmenistan','uganda','ukraine','united kingdom','united states','uruguay','uzbekistan','vanuatu','vatican','venezuela','vietnam','wales','yemen','zambia','zimbabwe','africa','asia','europe','antarctica','oceania','north america','south america','london','paris','berlin','madrid','rome','lisbon','dublin','edinburgh','cardiff','belfast','amsterdam','brussels','vienna','prague','warsaw','budapest','athens','oslo','stockholm','helsinki','copenhagen','reykjavik','moscow','kyiv','ankara','cairo','nairobi','pretoria','cape town','lagos','abuja','accra','addis ababa','tokyo','beijing','seoul','delhi','new delhi','mumbai','bangkok','jakarta','manila','canberra','sydney','wellington','ottawa','washington','new york','mexico city','buenos aires','brasilia','rio de janeiro','lima','santiago','bogota','caracas','havana','amazon','nile','thames','severn','danube','rhine','ganges','yangtze','mississippi','everest','alps','andes','himalayas','sahara','pennines','snowdon','ben nevis'].join('|') + ')\\b', 'g');
const T = window.THEME = {
  current: null,
  def,
  label: s => (def(s) ? def(s).label : ''),
  list: () => Object.keys(C.subjects || {}),
  modes: () => Object.assign({}, C.modes, (def(T.current) || {}).modes),
  keyLabel: j => { const k = (def(T.current) || {}).keys; return k && k[j] ? k[j] : String(j + 1); },
  treasure: s => (def(s) || {}).treasure || null,
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
    if (/\bgeog|\bflags?\b|capital cities|\bcountries\b|\bmap skills|\bcontinents?\b|\brivers?\b|\bmountains?\b/.test(head)) return 'geography';
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
    // Geography: countries, capitals, landforms, map and physical/human geography words, and flag pictures
    let ge = 0;
    ge += count(GEO_PLACES);
    ge += count(/\b(capital|country|countries|continent|river|mountain|volcano|volcanic|glacier|glaciation|erosion|deposition|weathering|meander|delta|estuary|ox-bow|oxbow|tectonic|plate|earthquake|tsunami|climate|weather|rainfall|precipitation|latitude|longitude|equator|tropic|hemisphere|population|migration|urban|rural|settlement|biome|rainforest|desert|tundra|savanna|grid reference|contour|scale|compass|ordnance survey|flag|ocean|sea|lake|island|peninsula|coast|coastal|cliff|stack|arch|spit|longshore drift|source|mouth|tributary|confluence|watershed|drainage basin|hydrograph|flood|deforestation|sustainab\w*|fair trade|development|gdp|aid|tourism|national park|ecosystem)\b/g);
    ge += 2 * qs.filter(q => q.image || (q.answerImages && q.answerImages.some(Boolean))).length;
    const n = Math.max(1, qs.length);
    if (la >= 3 && la >= 2 * fr && la >= 2 * ge && la / n >= 0.3) return 'latin';
    if (fr >= 3 && fr >= 2 * la && fr >= ge && fr / n >= 0.3) return 'french';   // French vocab for countries is still French
    if (ge >= 3 && ge >= 2 * la && ge >= 2 * fr && ge / n >= 0.3) return 'geography';
    return null;
  },

  /* Switch look straight away, no animation */
  apply(s) {
    s = def(s) ? s : null;
    T.current = s;
    if (s) root.dataset.subject = s; else delete root.dataset.subject;
  },

  /* Takeover, like PowerPoint's Morph: a wave sweeps across the screen from left to right, carrying the
     new look with it, while the logo, the main heading, the main panel and the main button glide and
     reshape from where they were to where they now sit. Browsers without view transitions get a soft fade instead. `mid` redraws the page in the new look. */
  takeover(s, mid) {
    s = def(s) ? s : null;
    if (s === T.current && !T._busy) { if (mid) mid(); return Promise.resolve(); }
    if (T._busy) { T._next = { s, mid }; return T._busy; }
    const swap = () => { T.apply(s); try { if (mid) mid(); } catch (e) { console.error(e); } tag(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !document.body) { swap(); return Promise.resolve(); }

    const wait = ms => new Promise(r => setTimeout(r, ms));
    // Load the new look's fonts first, so text doesn't change shape partway through
    const face = s === 'latin' ? 'Cinzel' : s === 'french' ? '"Playfair Display"' : s === 'geography' ? 'Bitter' : '"Libre Baskerville"';
    const fonts = document.fonts ? Promise.all([document.fonts.load(`700 48px ${face}`), document.fonts.load(`700 32px ${face}`)]) : null;
    const fontReady = Promise.race([fonts, wait(700)]).catch(() => {});

    T._busy = (async () => {
      await fontReady;
      if (document.startViewTransition) {
        tag();
        document.documentElement.classList.add('vt-morph');
        const wave = document.createElement('div');
        wave.className = 'lx-wave to-' + (s || 'home'); wave.setAttribute('aria-hidden', 'true');
        const vt = document.startViewTransition(() => { swap(); document.body.appendChild(wave); });
        vt.finished.then(() => wave.remove(), () => wave.remove());
        try { await vt.finished; } catch (e) { if (T.current !== s) swap(); }
        document.documentElement.classList.remove('vt-morph');
        untag();
      } else {
        const veil = document.createElement('div');
        veil.className = 'takeover-veil to-' + (s || 'home');
        document.body.appendChild(veil);
        veil.getBoundingClientRect(); veil.classList.add('is-in');
        await wait(460); swap();
        await wait(120); veil.classList.remove('is-in');
        await wait(560); veil.remove();
        await wait(180);
      }
      T._busy = null;
      const n = T._next; T._next = null;
      if (n && n.s !== T.current) return T.takeover(n.s, n.mid);
      if (n && n.mid) n.mid();
    })();
    return T._busy;
  }
};
})();
