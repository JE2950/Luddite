/* ============================================================
   YOUR SETTINGS: the only file you need to edit.
   Change the values between the quote marks, save, and upload.
   ============================================================ */
window.APP = {
  // The name shown on every page, in tab titles and on downloaded files.
  name: 'Quiz Arena',

  // From Supabase: Project Settings → Data API (Project URL) and → API Keys (Publishable key).
  // The publishable key is meant to be public; the database rules decide what it can do.
  supabaseUrl: 'PASTE-YOUR-SUPABASE-PROJECT-URL-HERE',
  supabaseKey: 'PASTE-YOUR-SUPABASE-PUBLISHABLE-KEY-HERE',

  // Optional: your own web address. Leave both as '' if you're using the free netlify.app address.
  // Example: domain: 'myquiz.com', playHost: 'play.myquiz.com'
  // (teachers then use myquiz.com, pupils use play.myquiz.com)
  domain: '',
  playHost: '',

  // Names of the game modes and the double-weight event in the fishing mode.
  modes: {
    classic: 'Classic',
    fishing: 'Marine Mania',
    event: 'Marine Mayhem'
  },

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
  document.title = document.title.replace('Quiz Arena', C.name);
  // The logo: two overlapping dots and the name
  C.logo = () => `<div class="mark" role="img" aria-label="${String(C.name).replace(/"/g, '&quot;')}"><span class="oo" aria-hidden="true"><i></i><i></i></span><span class="mark-name">${String(C.name).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span></div>`;
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
