/* Printable worksheets made from a set's questions: match up, crossword, gap fill, word search, anagrams and multiple choice.
   WS.build(set, opts) returns { body, key, used, left, note } as HTML; WS.page(...) wraps it in a printable A4 document. */
(function () {
  'use strict';
  const L = window.LB;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* A seeded random number generator, so the preview and the printed sheet match until "New layout" is pressed */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const TEMPLATES = {
    match:    { name: 'Match up',        about: 'Two columns. Pupils write the letter of the matching answer.', count: 15, pics: true,  instr: 'Write the letter of the matching answer in each box.' },
    cross:    { name: 'Crossword',       about: 'The questions are the clues and the answers go in the grid.',   count: 15, pics: true,  words: true, instr: 'Use the clues to fill in the crossword.' },
    gap:      { name: 'Gap fill',        about: 'Each question with a gap to write the answer, with a word bank if you want one. A gap in the question, such as ___ or …, is kept where it is.', count: 30, pics: true, text: true, instr: 'Write the missing word in each gap.' },
    search:   { name: 'Word search',     about: 'The answers are hidden in the grid, with the questions as clues.', count: 12, pics: true, words: true, instr: 'Find each answer in the grid. Write it next to its clue.' },
    anagram:  { name: 'Anagrams',        about: 'Each answer with its letters jumbled.',                             count: 20, pics: true,  text: true, instr: 'Unscramble the letters to write the answer.' },
    choice:   { name: 'Multiple choice', about: 'Each question with its answers, labelled a to d.',                  count: 30, pics: true,  instr: 'Circle the correct answer.' }
  };

  /* ---------- the questions, either way round ---------- */
  const side = (text, img) => ({ text: String(text || '').trim(), img: L.safeSrc(img || '') });
  function items(set, dir) {
    const valid = (set.questions || []).filter(L.validQ);
    const out = valid.map(q => {
      const a = q.answers[q.correct];
      const prompt = side(q.q, q.image), answer = L.isImg(a) ? side('', L.imgOf(a)) : side(a, '');
      const others = q.answers.filter((x, j) => j !== q.correct && String(x).trim()).map(x => L.isImg(x) ? side('', L.imgOf(x)) : side(x, ''));
      return { prompt, answer, others };
    });
    const turned = dir !== 'ba' ? out
      // Turned round: the right answer becomes the question; wrong answers come from other questions
      : out.map((it, i) => ({ prompt: it.answer, answer: it.prompt, others: out.filter((x, j) => j !== i).map(x => x.prompt) })).filter(it => it.prompt.text || it.prompt.img);
    // Pupils write single words only. A dictionary entry keeps its headword: "rēx, rēgis" becomes "rēx".
    return turned.map(it => ({ ...it, answer: headword(it.answer), others: it.others.map(headword) }))
      .filter(it => it.answer.img || (it.answer.text && !/\s/.test(it.answer.text)));
  }
  const headword = x => x.img ? x : { ...x, text: x.text.split(/[,;]/)[0].trim() };
  /* An example pair, so the teacher can see which way round the sheet goes */
  function example(set, dir) { const it = items(set, dir).find(x => x.prompt.text && x.answer.text && !hasMaths(x.prompt.text + x.answer.text)); return it ? [it.prompt.text, it.answer.text] : null; }
  const hasMaths = s => /\$[^$]+\$/.test(s);
  const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  /* Letters for a grid: accents and macrons dropped, everything else but letters removed */
  const gridWord = s => plain(s).toUpperCase().replace(/ß/g, 'SS').replace(/Æ/g, 'AE').replace(/Œ/g, 'OE').replace(/[^A-Z]/g, '');
  const wordOK = s => s && !hasMaths(s) && /^[\p{L}][\p{L}\s'’\-]*$/u.test(s.trim());
  const lengths = s => '(' + s.trim().split(/[\s]+/).map(w => gridWord(w).length).filter(Boolean).join(',') + ')';

  const sideHTML = (x, cls = '') => `${x.img ? `<img class="pic ${cls}" src="${esc(x.img)}" alt="">` : ''}${x.text ? `<span class="t">${esc(x.text)}</span>` : ''}`;

  /* ---------- match up ---------- */
  function match(list, o, r) {
    const right = shuffle(list.map((it, i) => ({ it, i })), r);
    const letter = k => String.fromCharCode(65 + k);
    const keyOf = {}; right.forEach((x, k) => { keyOf[x.i] = letter(k); });
    const rows = list.map((it, i) => `<tr><td class="n">${i + 1}</td><td class="l">${sideHTML(it.prompt)}</td><td class="box"><span></span></td><td class="gap"></td><td class="n">${letter(i)}</td><td class="r">${sideHTML(right[i].it.answer)}</td></tr>`).join('');
    return {
      body: `<table class="match">${rows}</table>`,
      key: `<table class="key-list">${list.map((it, i) => `<tr><td class="n">${i + 1}</td><td>${keyOf[i]}</td><td>${sideHTML(it.answer)}</td></tr>`).join('')}</table>`
    };
  }

  /* ---------- crossword ---------- */
  function layout(words, r) {
    // words: [{w, i}] sorted longest first. Greedy placement, best of many tries.
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const order = attempt === 0 ? words.slice() : [words[0], ...shuffle(words.slice(1), r)].sort((a, b) => (attempt % 2 ? 0 : b.w.length - a.w.length));
      const cells = new Map(), placed = [];
      const at = (x, y) => cells.get(x + ',' + y);
      const fits = (w, x, y, d) => {
        const dx = d ? 0 : 1, dy = d ? 1 : 0; let cross = 0;
        if (at(x - dx, y - dy) || at(x + dx * w.length, y + dy * w.length)) return -1;
        for (let k = 0; k < w.length; k++) {
          const cx = x + dx * k, cy = y + dy * k, c = at(cx, cy);
          if (c) { if (c.ch !== w[k] || c.dirs.includes(d)) return -1; cross++; }
          else if (at(cx + dy, cy + dx) || at(cx - dy, cy - dx)) return -1;   // no touching side by side
        }
        return cross;
      };
      const put = (item, x, y, d) => {
        const dx = d ? 0 : 1, dy = d ? 1 : 0;
        for (let k = 0; k < item.w.length; k++) { const key = (x + dx * k) + ',' + (y + dy * k); const c = cells.get(key) || { ch: item.w[k], dirs: [] }; c.dirs.push(d); cells.set(key, c); }
        placed.push({ ...item, x, y, d });
      };
      put(order[0], 0, 0, 0);
      const rest = order.slice(1);
      for (let pass = 0; pass < 2; pass++) {
        for (const item of rest) {
          if (placed.some(p => p.i === item.i)) continue;
          let opts = [];
          for (const [key, c] of cells) {
            const [cx, cy] = key.split(',').map(Number);
            for (let k = 0; k < item.w.length; k++) {
              if (item.w[k] !== c.ch) continue;
              for (const d of [0, 1]) {
                if (c.dirs.includes(d)) continue;
                const x = d ? cx : cx - k, y = d ? cy - k : cy;
                const s = fits(item.w, x, y, d);
                if (s > 0) opts.push({ x, y, d, s });
              }
            }
          }
          if (!opts.length) continue;
          const top = Math.max(...opts.map(p => p.s)); opts = opts.filter(p => p.s === top);
          const pick = opts[Math.floor(r() * opts.length)]; put(item, pick.x, pick.y, pick.d);
        }
      }
      const xs = [...cells.keys()].map(k => +k.split(',')[0]), ys = [...cells.keys()].map(k => +k.split(',')[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
      const score = placed.length * 1000 - Math.max(w, h) * 10 - Math.abs(w - h);
      if (!best || score > best.score) best = { score, placed, cells, minX: Math.min(...xs), minY: Math.min(...ys), w, h };
    }
    return best;
  }
  function cross(list, o, r) {
    const words = list.map((it, i) => ({ w: gridWord(it.answer.text), i })).sort((a, b) => b.w.length - a.w.length);
    const g = layout(words, r);
    const placed = g.placed.map(p => ({ ...p, x: p.x - g.minX, y: p.y - g.minY }));
    // Number the starting squares in reading order
    const starts = {}; let n = 0;
    placed.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach(p => { const k = p.x + ',' + p.y; if (!starts[k]) starts[k] = ++n; p.num = starts[k]; });
    const grid = Array.from({ length: g.h }, () => Array(g.w).fill(null));
    placed.forEach(p => { for (let k = 0; k < p.w.length; k++) grid[p.y + (p.d ? k : 0)][p.x + (p.d ? 0 : k)] = p.w[k]; });
    const size = Math.min(9, Math.floor(180 / Math.max(g.w, 1)), Math.floor(150 / Math.max(g.h, 1)));
    const table = fill => `<table class="xw" style="--cell:${size}mm">${grid.map((row, y) => `<tr>${row.map((ch, x) => ch
      ? `<td class="on">${starts[x + ',' + y] ? `<i>${starts[x + ',' + y]}</i>` : ''}${fill ? `<b>${ch}</b>` : ''}</td>` : '<td></td>').join('')}</tr>`).join('')}</table>`;
    const clues = d => placed.filter(p => p.d === d).sort((a, b) => a.num - b.num)
      .map(p => `<li><b>${p.num}</b> ${sideHTML(list[p.i].prompt, 'clue')} <span class="len">${lengths(list[p.i].answer.text)}</span></li>`).join('');
    const both = `<div class="clues"><div><h3>Across</h3><ul>${clues(0)}</ul></div><div><h3>Down</h3><ul>${clues(1)}</ul></div></div>`;
    return { body: table(false) + both, key: table(true), used: placed.length, missed: list.length - placed.length };
  }

  /* ---------- gap fill ---------- */
  const GAP = /_{2,}|\.{3,}|…/;
  function gap(list, o, r) {
    const line = '<span class="blank"></span>';
    const row = it => {
      const t = it.prompt.text;
      const q = GAP.test(t) ? esc(t).replace(GAP, line) : `${esc(t)} ${line}`;
      return `<li>${it.prompt.img ? `<img class="pic" src="${esc(it.prompt.img)}" alt="">` : ''}<span class="t">${q}</span></li>`;
    };
    const bank = o.bank ? `<div class="bank">${shuffle(list.map(it => it.answer.text), r).map(w => `<span>${esc(w)}</span>`).join('')}</div>` : '';
    return {
      body: bank + `<ol class="gaps">${list.map(row).join('')}</ol>`,
      key: `<ol class="key-ol">${list.map(it => `<li>${esc(it.answer.text)}</li>`).join('')}</ol>`
    };
  }

  /* ---------- word search ---------- */
  function search(list, o, r) {
    const words = list.map((it, i) => ({ w: gridWord(it.answer.text), i }));
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]].concat(o.backwards ? [[-1, 0], [0, -1], [-1, -1], [-1, 1]] : []);
    const longest = Math.max(...words.map(w => w.w.length)), letters = words.reduce((s, w) => s + w.w.length, 0);
    const N = Math.min(15, Math.max(10, longest + 1, Math.ceil(Math.sqrt(letters * 2.2))));
    let best = null;
    for (let attempt = 0; attempt < 30 && !(best && best.placed.length === words.length); attempt++) {
      const grid = Array.from({ length: N }, () => Array(N).fill(''));
      const placed = [];
      for (const item of words.slice().sort((a, b) => b.w.length - a.w.length)) {
        let done = false;
        for (let t = 0; t < 200 && !done; t++) {
          const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
          const x0 = Math.floor(r() * N), y0 = Math.floor(r() * N);
          const x1 = x0 + dx * (item.w.length - 1), y1 = y0 + dy * (item.w.length - 1);
          if (x1 < 0 || x1 >= N || y1 < 0 || y1 >= N) continue;
          let ok = true;
          for (let k = 0; k < item.w.length && ok; k++) { const c = grid[y0 + dy * k][x0 + dx * k]; if (c && c !== item.w[k]) ok = false; }
          if (!ok) continue;
          for (let k = 0; k < item.w.length; k++) grid[y0 + dy * k][x0 + dx * k] = item.w[k];
          placed.push({ ...item, x: x0, y: y0, dx, dy }); done = true;
        }
      }
      if (!best || placed.length > best.placed.length) best = { grid, placed };
    }
    const hit = new Set(); best.placed.forEach(p => { for (let k = 0; k < p.w.length; k++) hit.add((p.x + p.dx * k) + ',' + (p.y + p.dy * k)); });
    const AZ = 'ABCDEFGHIJKLMNOPRSTUVEAEIOTNRS';   // a little extra weight on common letters
    const full = best.grid.map(row => row.map(c => c || AZ[Math.floor(r() * AZ.length)]));
    const size = Math.min(9, Math.floor(130 / N));
    const table = mark => `<table class="ws" style="--cell:${size}mm">${full.map((row, y) => `<tr>${row.map((c, x) => `<td class="${mark && hit.has(x + ',' + y) ? 'hit' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
    const inGrid = new Set(best.placed.map(p => p.i));
    const kept = list.filter((it, i) => inGrid.has(i));
    return {
      body: table(false) + `<ol class="gaps clues-ws">${kept.map(it => `<li>${sideHTML(it.prompt, 'clue')} <span class="blank short"></span></li>`).join('')}</ol>`,
      key: table(true) + `<ol class="key-ol">${kept.map(it => `<li>${esc(it.answer.text)}</li>`).join('')}</ol>`,
      used: kept.length, missed: list.length - kept.length
    };
  }

  /* ---------- anagrams ---------- */
  function jumble(s, r) {
    return s.split(/(\s+)/).map(part => {
      if (/^\s+$/.test(part) || part.length < 2) return part;
      const ch = [...part.toLowerCase()];
      let out = ch;
      for (let t = 0; t < 12; t++) { out = shuffle(ch, r); if (out.join('') !== ch.join('')) break; }
      return out.join('');
    }).join('   ');
  }
  function anagram(list, o, r) {
    return {
      body: `<ol class="gaps anag">${list.map(it => `<li>${sideHTML(it.prompt)}<span class="jum">${esc(jumble(it.answer.text, r)).replace(/ {3}/g, '<span class="sep"></span>')}</span><span class="blank"></span></li>`).join('')}</ol>`,
      key: `<ol class="key-ol">${list.map(it => `<li>${esc(it.answer.text)}</li>`).join('')}</ol>`
    };
  }

  /* ---------- multiple choice ---------- */
  function choice(list, o, r) {
    const keys = [];
    const qs = list.map((it, i) => {
      const opts = shuffle([{ x: it.answer, ok: true }, ...shuffle(it.others, r).slice(0, 3).map(x => ({ x, ok: false }))], r);
      keys.push('abcd'[opts.findIndex(p => p.ok)]);
      return `<li><div class="cq">${sideHTML(it.prompt)}</div><div class="opts">${opts.map((p, k) => `<span class="opt"><b>${'abcd'[k]}</b> ${sideHTML(p.x, 'small')}</span>`).join('')}</div></li>`;
    });
    return {
      body: `<ol class="mc">${qs.join('')}</ol>`,
      key: `<table class="key-list">${list.map((it, i) => `<tr><td class="n">${i + 1}</td><td>${keys[i]}</td><td>${sideHTML(it.answer)}</td></tr>`).join('')}</table>`
    };
  }

  const MAKERS = { match, cross, gap, search, anagram, choice };

  /* Which questions suit a template, and how many are left out */
  function eligible(all, kind) {
    const T = TEMPLATES[kind];
    return all.filter(it => {
      if (T.words) return !it.answer.img && wordOK(it.answer.text) && gridWord(it.answer.text).length >= 2 && gridWord(it.answer.text).length <= (kind === 'search' ? 14 : 18);
      if (T.text) return !it.answer.img && it.answer.text;
      if (kind === 'choice') return it.others.length >= 1;
      return true;
    });
  }

  function build(set, o) {
    const T = TEMPLATES[o.kind], r = rng(o.seed || 1);
    let all = items(set, o.dir);
    // The same answer twice would make a match or a grid ambiguous
    if (o.kind !== 'choice' && o.kind !== 'gap' && o.kind !== 'anagram') { const seen = new Set(); all = all.filter(it => { const k = (it.answer.text || it.answer.img).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }
    const ok = eligible(all, o.kind);
    const want = o.count === 'all' ? ok.length : Math.min(ok.length, +o.count || T.count);
    const idx = shuffle(ok.map((_, i) => i), r).slice(0, want).sort((a, b) => a - b);
    const list = idx.map(i => ok[i]);
    if (!list.length) return { empty: true, total: all.length, ok: 0 };
    const res = MAKERS[o.kind](list, o, r);
    return { ...res, used: res.used ?? list.length, missed: res.missed || 0, ok: ok.length, total: all.length, left: all.length - ok.length };
  }

  /* Each subject's look on paper (also used for the assignment posters and slips) */
  const LOOK = {
    latin: { face: '"Cinzel", Georgia, serif', body: '"EB Garamond", Georgia, serif', ink: '#2a1a12', accent: '#8f1d1d', soft: '#b8892b',
      css: `.c{border:2px solid #b8892b;box-shadow:inset 0 0 0 3px #fff,inset 0 0 0 4px #b8892b;border-radius:1mm}.c.big{border:2px solid #b8892b;padding:12mm}h1{letter-spacing:.04em}.stripe{height:4mm;background:repeating-linear-gradient(90deg,#b8892b 0 9mm,#fff 9mm 11mm,#8f1d1d 11mm 20mm,#fff 20mm 22mm)}` },
    french: { face: '"Playfair Display", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#14213d', accent: '#0055a4', soft: '#e1352b',
      css: `.c{border:none;border-radius:5mm;box-shadow:0 0 0 1.5px #c9cfdc;overflow:hidden;padding-top:7mm;position:relative}.c::before{content:"";position:absolute;left:0;right:0;top:0;height:2.5mm;background:linear-gradient(90deg,#0055a4 0 33.3%,#fff 33.3% 66.6%,#e1352b 66.6%)}.c.big{box-shadow:none}h1{font-weight:900}.stripe{height:4mm;background:linear-gradient(90deg,#0055a4 0 33.3%,#fff 33.3% 66.6%,#e1352b 66.6%)}` },
    geography: { face: '"Bitter", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#14271f', accent: '#1f5f4a', soft: '#c98a2b',
      css: `.c{border:1.5px solid #1f5f4a;box-shadow:inset 0 0 0 2.5px #fff,inset 0 0 0 3.5px #9fbcae;border-radius:2mm}.c.big{padding:12mm}h1{font-weight:800}.stripe{height:3mm;background:repeating-linear-gradient(90deg,#14271f 0 12mm,#fff 12mm 24mm);box-shadow:0 0 0 .4mm #14271f}` },
    history: { face: '"Alegreya", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#2a1f17', accent: '#5b2a4a', soft: '#b8892b',
      css: `.c{border:1.5px solid #b8892b;box-shadow:inset 0 0 0 2.5px #fff,inset 0 0 0 3.5px #c9a5b9;border-radius:1.5mm}.c.big{padding:12mm}h1{font-weight:800}.stripe{height:3mm;background:repeating-linear-gradient(90deg,#2a1f17 0 .5mm,#b8892b .5mm 12mm)}` },
    none: { face: '"Libre Baskerville", Georgia, serif', body: '"Atkinson Hyperlegible", Arial, sans-serif', ink: '#0b1b3f', accent: '#002664', soft: '#9aa3bb',
      css: `.c{border:1.5px dashed #9aa3bb;border-radius:4mm}.c.big{border:none}.stripe{height:3mm;background:#002664}` }
  };

  /* Maths is typeset in the page, then copied into the sheet with the shapes it uses */
  async function typeset(...parts) {
    const MJ = window.MathJax;
    if (!parts.some(p => /\$[^$]+\$/.test(p)) || !MJ || !MJ.startup || !MJ.startup.promise) return [...parts, ''];
    const tmp = document.createElement('div'); tmp.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px';
    tmp.innerHTML = parts.map(p => `<div>${p}</div>`).join(''); document.body.appendChild(tmp);
    let out = [...parts, ''];
    try {
      await MJ.startup.promise; await MJ.typesetPromise([tmp]);
      tmp.querySelectorAll('mjx-assistive-mml').forEach(x => x.remove());
      const g = document.getElementById('MJX-SVG-global-cache');
      out = [...[...tmp.children].map(c => c.innerHTML), g ? `<svg style="display:none">${g.innerHTML}</svg>` : ''];
    } catch (e) {}
    tmp.remove();
    return out;
  }

  /* ---------- the printable page ---------- */
  const CSS = (look, base) => `
    @page{size:A4;margin:12mm}*{box-sizing:border-box}
    html{background:#fff}body{margin:0;font-family:${look.body};color:${look.ink};font-size:14px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .sheet{max-width:186mm;margin:0 auto}
    .stripe{margin:0 0 5mm}.logo{font:700 9px/1.4 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:${look.accent}}
    h1{font-family:${look.face};font-size:24px;margin:1mm 0 1mm;color:${look.ink}}
    .kind{font:700 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${look.soft}}
    .who{display:flex;gap:8mm;margin:4mm 0 3mm;font-size:12px}.who span{flex:1;border-bottom:1px solid ${look.ink};padding-bottom:1mm}.who span.d{flex:.45}
    .instr{font-weight:700;margin:3mm 0 5mm;font-size:14px}
    .pic{max-height:20mm;max-width:40mm;vertical-align:middle;margin-right:2mm;border-radius:1mm}.pic.clue{max-height:12mm;max-width:24mm}.pic.small{max-height:12mm;max-width:24mm}
    table{border-collapse:collapse}
    .match{width:100%}.match td{padding:2.2mm 1.5mm;vertical-align:middle;border-bottom:1px solid #e3e0d8}.match .n{font-weight:700;color:${look.accent};width:7mm}
    .match .l,.match .r{width:44%}.match .box{width:11mm}.match .box span{box-sizing:border-box;display:block;width:9mm;height:9mm;border:1.5px solid ${look.ink};border-radius:1mm;background:#fff}.match .gap{width:6mm;border-bottom:0}
    .xw{margin:0 auto 6mm;border-collapse:separate;border-spacing:0}.xw td{width:var(--cell);height:var(--cell);padding:0;position:relative}.xw td.on{outline:1pt solid ${look.ink};outline-offset:-.5pt;background:#fff}
    .xw i{position:absolute;left:.5mm;top:0;font:700 7px/1 Arial,sans-serif;font-style:normal}.xw b{display:flex;align-items:center;justify-content:center;height:100%;font:700 calc(var(--cell)*.55)/1 Arial,sans-serif;color:${look.accent}}
    .clues{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.clues h3{font-family:${look.face};margin:0 0 2mm;font-size:16px;color:${look.accent}}
    .clues ul{list-style:none;margin:0;padding:0}.clues li{margin:0 0 1.8mm;break-inside:avoid}.clues li b{display:inline-block;min-width:6mm;color:${look.accent}}.len{color:#777;font-size:11px;white-space:nowrap}
    .bank{display:flex;flex-wrap:wrap;gap:2mm 3mm;border:1.5px solid ${look.soft};border-radius:2mm;padding:3mm 4mm;margin:0 0 5mm}.bank span{padding:0 1mm}
    .gaps{margin:0;padding-left:7mm}.gaps li{margin:0 0 4.5mm;break-inside:avoid}.gaps li::marker{font-weight:700;color:${look.accent}}
    .blank{display:inline-block;min-width:42mm;border-bottom:1px solid ${look.ink};height:1.2em;vertical-align:baseline;margin:0 1mm}.blank.short{min-width:34mm;float:right}
    .gaps .t{vertical-align:middle}
    .ws{margin:0 auto 6mm}.ws{border-collapse:separate;border-spacing:0}.ws td{width:var(--cell);height:var(--cell);text-align:center;font:700 calc(var(--cell)*.55)/1 "Courier New",monospace;outline:.6pt solid #cfcabd;outline-offset:-.3pt}.ws td.hit{background:${look.accent};color:#fff}
    .clues-ws{columns:2;column-gap:8mm}.clues-ws li{overflow:hidden}
    .anag li{display:grid;grid-template-columns:1fr auto;grid-template-areas:"q q" "j b";gap:1.5mm 4mm;align-items:end}.anag li>.t,.anag li>.pic{grid-area:q}
    .jum{grid-area:j;font:700 15px/1 "Courier New",monospace;letter-spacing:.35em;text-transform:uppercase;color:${look.accent}}.jum .sep{display:inline-block;width:4mm}.anag .blank{grid-area:b;min-width:55mm}
    .mc{margin:0;padding-left:7mm}.mc li{margin:0 0 4.5mm;break-inside:avoid}.mc li::marker{font-weight:700;color:${look.accent}}
    .opts{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 6mm;margin-top:1.5mm}.opt b{display:inline-block;width:5mm;color:${look.accent}}
    .key{break-before:page;padding-top:2mm}.key h2{font-family:${look.face};font-size:20px;margin:0 0 4mm;color:${look.accent}}
    .key-ol{columns:2;column-gap:10mm;margin:0;padding-left:7mm}.key-ol li{margin:0 0 1.5mm}
    .key-list td{padding:1mm 3mm 1mm 0;vertical-align:middle}.key-list .n{font-weight:700;color:${look.accent}}
    mjx-container{display:inline-block}
    @media screen{body{padding:10mm 0}.key{margin-top:14mm;border-top:2px dashed #ccc;padding-top:10mm}}
    ${look.css || ''}`;

  function page(o) {
    const T = TEMPLATES[o.kind];
    return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(o.title)} – ${esc(T.name)}</title><link rel="stylesheet" href="${esc(o.base)}assets/fonts.css"><style>${CSS(o.look, o.base)}</style></head><body>${o.defs || ''}
      <div class="sheet"><div class="stripe"></div><div class="logo">${esc(o.brand)}</div><h1>${esc(o.title)}</h1><div class="kind">${esc(T.name)}</div>
      <div class="who"><span>Name</span><span class="d">Date</span></div>
      <p class="instr">${esc(T.instr)}</p>
      ${o.body}
      ${o.key ? `<section class="key"><div class="logo">${esc(o.brand)}</div><h2>${esc(o.title)}: answers</h2>${o.key}</section>` : ''}</div></body></html>`;
  }

  /* ---------- weakness sheets: one page per pupil with the questions he got wrong ----------
     pupils: [{ name, items: [{ prompt:{text,img}, answer:{text,img}, options:[{text,img}] | null }] }] */
  function weakBody(pupils, setTitle) {
    const item = it => {
      const t = it.prompt.text;
      const pic = it.prompt.img ? `<img class="pic" src="${esc(it.prompt.img)}" alt="">` : '';
      if (it.options) return `<li class="mcq"><div class="cq">${pic}<span class="t">${esc(t)}</span></div><div class="opts">${it.options.map((o, k) => `<span class="opt"><b>${'abcd'[k]}</b> ${sideHTML(o, 'small')}</span>`).join('')}</div></li>`;
      const q = GAP.test(t) ? esc(t).replace(GAP, '<span class="blank"></span>') : `${esc(t)}<span class="line"></span>`;
      return `<li>${pic}<span class="t">${q}</span></li>`;
    };
    return pupils.map((p, i) => `<section class="pupil${i ? ' next' : ''}"><div class="stripe"></div><div class="logo">${esc(p.brand)}</div>
      <h1>${esc(p.name)}</h1><div class="kind">${esc(setTitle)} · Questions to practise</div>
      <div class="who"><span class="d">Date</span></div>
      <p class="instr">${p.items.some(x => x.options) ? 'Write the correct answer to each question, or circle it where there are choices.' : 'Write the correct answer to each question.'}</p>
      <ol class="gaps weak">${p.items.map(item).join('')}</ol></section>`).join('');
  }
  function weakKey(pupils) {
    return pupils.map(p => `<div class="kp"><h3>${esc(p.name)}</h3><ol class="key-ol">${p.items.map(it => `<li>${it.options ? '<b>' + 'abcd'[it.options.indexOf(it.answer)] + '</b> ' : ''}${sideHTML(it.answer, 'small')}</li>`).join('')}</ol></div>`).join('');
  }
  function weakPage(o) {
    return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(o.title)} – weakness sheets</title><link rel="stylesheet" href="${esc(o.base)}assets/fonts.css"><style>${CSS(o.look)}
      .pupil.next{break-before:page}.weak li{margin-bottom:7mm}.weak .line{display:block;border-bottom:1px solid ${o.look.ink};height:8mm;margin-top:1mm}
      .who span.d{flex:0 0 60mm}.kp{break-inside:avoid;margin-bottom:5mm}.kp h3{font-family:${o.look.face};color:${o.look.accent};margin:0 0 1.5mm;font-size:15px}
      @media screen{.pupil.next{margin-top:14mm;border-top:2px dashed #ccc;padding-top:10mm}}</style></head><body>${o.defs || ''}
      <div class="sheet">${o.body}${o.key ? `<section class="key"><div class="logo">${esc(o.brand)}</div><h2>${esc(o.title)}: answers</h2>${o.key}</section>` : ''}</div></body></html>`;
  }

  window.WS = { TEMPLATES, build, page, example, weakBody, weakKey, weakPage, LOOK, typeset, _gridWord: gridWord, _layout: layout };
})();
