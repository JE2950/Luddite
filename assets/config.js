/* ============================================================
   YOUR SETTINGS: the only file you need to edit.
   Change the values between the quote marks, save, and upload.
   ============================================================ */
window.APP = {
  // The name shown on every page, in tab titles and on downloaded files.
  name: 'Ludus',

  // The school name shown above the app name on the home pages, and the crest image.
  // Put the crest at assets/ludgrove-logo.png (a PNG with a transparent background works best).
  // Until that file exists, the pages show the name alone.
  school: 'Ludgrove',
  crest: 'assets/ludgrove-logo.png',

  // From Supabase: Project Settings → Data API (Project URL) and → API Keys (Publishable key).
  // The publishable key is meant to be public; the database rules decide what it can do.
  supabaseUrl: 'https://beymbzxkhowkgqmjpglr.supabase.co',
  supabaseKey: 'sb_publishable_RDhTPrJJqX-f3yUH1JXfvg_2c4ou363',

  // Optional: your own web address. Leave both as '' if you're using the free netlify.app address.
  // Example: domain: 'myquiz.com', playHost: 'play.myquiz.com'
  // (teachers then use myquiz.com, pupils use play.myquiz.com)
  domain: '',
  playHost: '',

  // Names of the game modes and the double-weight event in the fishing mode,
  // used for sets with no subject.
  modes: {
    classic: 'Classic',
    fishing: 'Marine Mania',
    event: 'Marine Mayhem'
  },

  // Subjects. A set tagged with a subject takes on that subject's look, mode names,
  // answer-key labels, fish and music as soon as a game starts.
  //   pixels: the colours of the squares in the takeover animation
  //   music:  put MP3s at these paths; until they exist the default tracks in assets/music play
  subjects: {
    latin: {
      label: 'Latin',
      banner: 'LINGVA LATINA',
      modes: { classic: 'Certamen', fishing: 'Piscatus', event: 'Aestus Neptuni' },
      keys: ['I', 'II', 'III', 'IV'],
      pixels: ['#8f1d1d', '#b8892b', '#f3ede1', '#2a1a12', '#6b2a6e', '#d9c9a3'],
      music: { lobby: 'assets/music/latin/lobby.mp3', classic: 'assets/music/latin/classic.mp3', fishing: 'assets/music/latin/fishing.mp3' },
      fish: [
        ['Sardina', 'Perca', 'Gobius', 'Scomber'],
        ['Mullus', 'Aurata', 'Lupus'],
        ['Murena', 'Salmo', 'Rhombus'],
        ['Acipenser', 'Thunnus', 'Silurus'],
        ['Delphinus Aureus', 'Piscis Neptuni', 'Leviathan']
      ]
    },
    french: {
      label: 'French',
      banner: 'FRANÇAIS',
      modes: { classic: 'Le Concours', fishing: 'La Pêche', event: 'La Grande Marée' },
      pixels: ['#0055a4', '#ffffff', '#e1352b', '#14213d', '#f6f1e6', '#0055a4'],
      music: { lobby: 'assets/music/french/lobby.mp3', classic: 'assets/music/french/classic.mp3', fishing: 'assets/music/french/fishing.mp3' },
      fish: [
        ['Goujon', 'Perche', 'Gardon', 'Maquereau'],
        ['Truite', 'Brème', 'Bar'],
        ['Brochet', 'Saumon', 'Carpe'],
        ['Esturgeon', 'Thon rouge', 'Silure'],
        ['Poisson d’Or', 'Capitaine Cabillaud', 'Poisson d’Avril']
      ]
    }
  },
  // Takeover colours for the Ludgrove pages (used when a game ends and the page returns home).
  pixels: ['#002664', '#ffffff', '#dbe6f6', '#0a3a86', '#f4f6fa', '#002664'],

  // Must match the name you give the Edge Function in Supabase (setup step 6).
  adminFunction: 'quiz-admin'
};

/* ---------- nothing below here needs editing ---------- */
(function (C) {
  C.configured = /^https:\/\/.+/.test(C.supabaseUrl) && !/PASTE/.test(C.supabaseUrl + C.supabaseKey);
  C.storagePrefix = 'quizapp';
  const h = location.hostname;
  C.onDomain = !!C.domain && (h === C.domain || h.endsWith('.' + C.domain));
  C.onPlayHost = !!C.playHost && h === C.playHost;
  // Links between the pupil and teacher sides (relative links when not on a custom domain)
  C.playUrl = C.onDomain && C.playHost ? 'https://' + C.playHost + '/' : './';
  C.teacherUrl = C.onDomain ? 'https://' + C.domain + '/teacher.html' : 'teacher.html';
  // What the host screen tells pupils to type
  C.joinAddress = C.onDomain && C.playHost ? C.playHost : (location.host + location.pathname.replace(/[^/]*$/, '')).replace(/\/$/, '');
  // Page titles follow the app name
  document.title = document.title.replace('Ludus', C.name);
  // The logo: the school crest (when the file exists) and the name
  const hx = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  C.logo = () => `<div class="mark" role="img" aria-label="${hx(C.name)}">${C.crest ? `<img class="crest" src="${hx(C.crest)}" alt="" onerror="this.remove()">` : ''}<span class="mark-name">${hx(C.name)}</span></div>`;
  // The school name, shown small above the headings on the home pages
  C.schoolLine = () => (C.school ? `<span class="school">${hx(C.school)}</span>` : '');
  // Friendly message until the Supabase settings above are filled in
  if (!C.configured) {
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app');
      if (app) app.innerHTML = `<div class="gate"><div class="gate-card">${C.logo()}<h1 style="font-size:24px">Almost there</h1><p>Open <b>assets/config.js</b> and paste in your Supabase Project URL and publishable key, then upload the file again. The setup guide (README) explains where to find them.</p></div></div>`;
    });
  }
  // The spreadsheet tool is large, so it loads only when someone imports or downloads a spreadsheet
  let xlsx = null;
  C.loadXLSX = () => xlsx || (xlsx = new Promise((ok, bad) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement('script');
    s.src = 'assets/vendor/xlsx-0.18.5.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { xlsx = null; bad(new Error('Could not load the spreadsheet tool')); };
    document.head.appendChild(s);
  }));
})(window.APP);
