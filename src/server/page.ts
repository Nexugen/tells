// Benchmark figures shown on the page, written by bench/figures.ts from the saved round reports (bench/rounds/).
import BENCH from '../bench-figures.json' with { type: 'json' };
// Voice figures, written by bench/voice.ts --write.
import VOICE from '../voice-figures.json' with { type: 'json' };
import type { Register } from '../types.ts';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BADGE_MD = '[![Linted with tells](https://tells.nexugen.app/badge.svg)](https://tells.nexugen.app)';
const BADGE_HTML = '<a href="https://tells.nexugen.app"><img src="https://tells.nexugen.app/badge.svg" alt="Linted with tells" height="20"></a>';

const SAMPLE = `Great question! In today's fast-paced world, it's not just a tool, it's a movement.

We leverage robust AI to seamlessly streamline your workflow. No setup. No fees. No problem.

Hope this helps! Let me know if you have any questions.`;

/** Shared CSS for every page. */
export const STYLE = `:root {
  --bg: #fbfaf7; --fg: #1b1b1a; --muted: #6b6a65; --line: #e3e0d8; --panel: #ffffff;
  --tell: #b42318; --tell-bg: #fde7e4; --human: #146c43; --human-bg: #dff3e7; --accent: #1b1b1a; --code: #f2f0ea;
  --shadow: 0 1px 2px rgba(0,0,0,.06);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #131312; --fg: #ecebe6; --muted: #9a998f; --line: #2c2b28; --panel: #1b1b19;
    --tell: #ff8a7a; --tell-bg: #3b1d19; --human: #6fd3a0; --human-bg: #173126; --accent: #ecebe6; --code: #22221f; --shadow: none; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 48px 16px 80px; }
h1, h2 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-weight: 600; letter-spacing: -0.01em; line-height: 1.15; }
h1 { font-size: clamp(40px, 8vw, 64px); margin: 0 0 12px; }
h2 { font-size: 28px; margin: 56px 0 12px; }
p { margin: 0 0 14px; }
.lede { font-size: 20px; color: var(--muted); max-width: 640px; }
a { color: inherit; text-underline-offset: 3px; }
code, pre, textarea, .out { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 14.5px; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 0 0 12px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 16px; }
textarea { width: 100%; min-height: 180px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--bg); color: var(--fg); line-height: 1.55; }
textarea:focus, input:focus, button:focus-visible, select:focus { outline: 2px solid var(--fg); outline-offset: 1px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
select, input, button { font: inherit; font-size: 15px; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; background: var(--bg); color: var(--fg); }
button { background: var(--accent); color: var(--bg); border-color: var(--accent); cursor: pointer; font-weight: 600; }
button[disabled] { opacity: .5; cursor: default; }
button.ghost { background: transparent; color: var(--fg); border-color: var(--line); font-weight: 500; }
input { min-width: 0; flex: 1 1 200px; }
.out { white-space: pre-wrap; word-wrap: break-word; padding: 12px; border: 1px dashed var(--line); border-radius: 8px; min-height: 60px; line-height: 1.7; }
mark { color: inherit; border-radius: 3px; padding: 0 1px; }
mark.t { background: var(--tell-bg); box-shadow: inset 0 -2px 0 var(--tell); }
mark.i { background: transparent; box-shadow: inset 0 -2px 0 var(--tell); }
mark.h { background: var(--human-bg); box-shadow: inset 0 -2px 0 var(--human); }
.legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 14px; color: var(--muted); margin: 8px 0; }
.legend span::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.legend .lt::before { background: var(--tell); } .legend .lh::before { background: var(--human); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 12px 0; }
.stat { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.stat b { display: block; font-size: 22px; font-family: "Iowan Old Style", Georgia, serif; }
.stat span { font-size: 13px; color: var(--muted); }
.stat small { font-size: 13px; color: var(--muted); }
.sev { font-size: 12px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); }
.sev.error, .sev.warning { color: var(--tell, #b42318); border-color: currentColor; }
.sev.info { color: var(--muted); }
ul.list { padding-left: 18px; margin: 8px 0; } ul.list li { margin: 4px 0; }
.t-txt { color: var(--tell); } .h-txt { color: var(--human); }
.muted { color: var(--muted); font-size: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 13px; }
td.n, th.n { text-align: right; white-space: nowrap; }
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0 16px; }
.fig { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 14px 16px; }
.fig b { display: block; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-size: 40px; font-weight: 600; line-height: 1.1; letter-spacing: -0.01em; white-space: nowrap; }
@media (max-width: 420px) { .fig { padding: 12px 14px; } .fig b { font-size: 34px; } }
.fig span { display: block; margin-top: 6px; font-size: 14px; line-height: 1.45; color: var(--muted); }
footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px 20px; justify-content: space-between; }
footer nav { display: flex; gap: 16px; }
.badge-show { display: flex; align-items: center; gap: 12px; margin: 4px 0 16px; }
.badge-show img { display: block; height: 20px; width: auto; }
.snip { margin: 0 0 16px; }
.snip-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.snip-head span { font-size: 14px; color: var(--muted); }
.snip-head button { font-size: 13px; padding: 4px 10px; }
.snip pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
.uses-nav { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px; }
footer nav { flex-wrap: wrap; }
.use h1 { font-size: clamp(32px, 6.5vw, 52px); }
.crumb { font-size: 15px; margin: 0 0 20px; color: var(--muted); }
ol.habits { padding-left: 22px; margin: 8px 0; } ol.habits li { margin: 0 0 14px; } ol.habits b { display: block; } ol.habits .ex { display: block; color: var(--muted); font-style: italic; }
.uses-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 8px 0 0; list-style: none; }
.uses-list a { display: inline-block; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; background: var(--panel); text-decoration: none; font-size: 15px; }
.uses-list a:hover { border-color: var(--fg); }
`;

export interface PageOpts { rewriteOn: boolean; anonTries: number; keyDaily: number }

/** The paste box, register picker, rewrite button and results area. Ids are what pageScript expects. */
export function checkerPanel(opts: PageOpts, c: { sample: string; register: 'auto' | Register; label: string }): string {
  return `<div class="panel" id="try">
  <label for="text" class="muted">${esc(c.label)}</label>
  <textarea id="text" spellcheck="false">${esc(c.sample)}</textarea>
  <div class="row">
    <select id="register" aria-label="Register">
${(['auto', 'casual', 'professional', 'technical', 'marketing'] as const).map((r) => `      <option value="${r}"${r === c.register ? ' selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('\n')}
    </select>
    <button id="rewrite" ${opts.rewriteOn ? '' : 'disabled'}>Rewrite flagged sentences</button>
    <button id="getkey" type="button" class="ghost">Get a free key</button>
  </div>
  <p class="muted" id="keynote" hidden></p>
  <p class="muted" id="rwnote">${opts.rewriteOn ? `${opts.anonTries} free rewrites a day without a key, ${opts.keyDaily} with one.` : 'Rewrite is off right now. Checking still works.'}</p>
  <div class="legend"><span class="lt">AI tell</span><span class="lh">Human signal</span></div>
  <div class="out" id="out" aria-live="polite"></div>
  <div class="stats" id="stats"></div>
  <div id="details"></div>
</div>
`;
}

/** The voice panel: learn a voice from samples, then rewrite the draft in it. */
export function voicePanel(opts: PageOpts): string {
  return `<div class="panel" id="voice">
  <label for="samples" class="muted">Samples of one person's writing, separated by ---</label>
  <textarea id="samples" spellcheck="false" placeholder="first sample&#10;---&#10;second sample&#10;---&#10;..."></textarea>
  <div class="row">
    <button id="buildvoice" type="button">Learn this voice</button>
    <label class="muted"><input type="checkbox" id="polish" checked style="flex:none;min-width:0"> clean up capitals and apostrophes</label>
    <button id="voicerewrite" type="button" class="ghost" disabled>Rewrite the draft in this voice</button>
  </div>
  <p class="muted" id="voicenote">About 1,500 words of samples works best. The profile stays in this page; the server does not keep your samples.</p>
  <div id="voiceout"></div>
</div>
`;
}

/** Pages that check one kind of writing, linked from every footer. */
export const USE_LINKS: { path: string; label: string }[] = [
  { path: '/cover-letter', label: 'Check a cover letter' },
  { path: '/linkedin-post', label: 'Check a LinkedIn post' },
  { path: '/cold-email', label: 'Check a cold email' },
  { path: '/essay', label: 'Check an essay' },
  { path: '/email', label: 'Check an email' },
  { path: '/resume', label: 'Check a resume' },
  { path: '/bio', label: 'Check a bio' },
];

export function siteFooter(withUses = true): string {
  return `<footer>
${withUses ? `  <nav aria-label="Check your writing" class="uses-nav">${USE_LINKS.map((u) => `<a href="${u.path}">${esc(u.label)}</a>`).join('')}</nav>
` : ''}
  <span>tells is open source, made by <a href="https://nexugen.app">Nexugen</a>. MIT licence.</span>
  <nav aria-label="Project links"><a href="https://github.com/Nexugen/tells">GitHub</a><a href="https://www.npmjs.com/package/@nexugen/tells">npm</a></nav>
</footer>`;
}

/** The page's script: live check, rewrite, free key, voice. Works with whatever panels are on the page. */
export function pageScript(opts: PageOpts): string {
  return `<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var text = $('text'), out = $('out'), stats = $('stats'), details = $('details'), reg = $('register');
  var timer = null, seq = 0;
  var key = '';
  try { key = localStorage.getItem('tells-key') || ''; } catch (e) {}
  function showKey() {
    var g = $('getkey'), n = $('keynote');
    if (key) { g.hidden = true; n.hidden = false; n.textContent = 'Your free key is saved in this browser.'; }
  }
  showKey();
  $('getkey').addEventListener('click', function () {
    var g = this, n = $('keynote');
    g.disabled = true;
    fetch('/v1/keys', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        g.disabled = false;
        n.hidden = false;
        if (r.error) { n.textContent = r.error.message; return; }
        key = r.key;
        try { localStorage.setItem('tells-key', key); } catch (e) {}
        n.textContent = 'Done. Your key is saved in this browser and gives you ' + r.dailyRewrites + ' rewrites a day.';
        g.hidden = true;
      })
      .catch(function () { g.disabled = false; n.hidden = false; n.textContent = 'Could not get a key just now. Try again shortly.'; });
  });

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(src, r) {
    var marks = new Array(src.length), tips = new Array(src.length);
    ((r.human && r.human.present) || []).forEach(function (p) {
      p.spans.forEach(function (s) { for (var i = s.start; i < s.end; i++) { marks[i] = 'h'; tips[i] = 'Human signal: ' + p.name; } });
    });
    r.findings.forEach(function (f) {
      for (var i = f.start; i < f.end; i++) { marks[i] = f.severity === 'info' ? 'i' : 't'; tips[i] = f.name + '. ' + f.fix; }
    });
    var html = '', cur = null, tip = null, buf = '';
    function flush() { if (!buf) return; html += cur ? '<mark class="' + cur + '" title="' + esc(tip) + '">' + esc(buf) + '</mark>' : esc(buf); buf = ''; }
    for (var i = 0; i < src.length; i++) {
      var m = marks[i] || null, t = tips[i] || null;
      if (m !== cur || t !== tip) { flush(); cur = m; tip = t; }
      buf += src[i];
    }
    flush();
    out.innerHTML = html || '<span class="muted">Nothing to check.</span>';
    var h = r.human || { present: [], missing: [], tooShort: true };
    var hints = r.findings.filter(function (f) { return f.severity === 'info'; }).length, strong = r.findings.length - hints;
    var low = h.pattern && h.pattern.low;
    var tooShort = h.tooShort, verdict = strong ? 'Has tells' : low ? 'Reads AI-written' : hints ? 'Only hints' : 'No tells';
    var why = tooShort ? 'to judge, under 60 words' : strong ? 'worth a second look' : low ? 'the human-pattern score is low, though no single habit stands out' : hints ? 'each habit alone is common in human writing too' : 'none of the known habits';
    stats.innerHTML =
      '<div class="stat"><b class="t-txt">' + strong + '</b><span>' + (strong === 1 ? 'tell' : 'tells') + ' (warnings and errors)' + (hints ? ', plus ' + hints + (hints === 1 ? ' hint' : ' hints') : '') + '</span></div>' +
      (h.pattern ? '<div class="stat"><b class="' + (h.pattern.low ? 't-txt' : 'h-txt') + '">' + h.pattern.score + '<small> / 100</small></b><span>human-pattern score' + (h.pattern.low ? ', reads machine-like' : h.pattern.score < 50 ? ', unclear' : '') + '</span></div>' : '') +
      '<div class="stat"><b>' + (tooShort ? 'Too short' : verdict) + '</b><span>' + why + '</span></div>' +
      '<div class="stat"><b>' + r.score + '</b><span>weighted tells per 100 words (' + r.grade + ')</span></div>' +
      '<div class="stat"><b class="h-txt">' + h.present.length + '</b><span>human signals present</span></div>' +
      (r.registerGuess ? '<div class="stat"><b>' + r.register[0].toUpperCase() + r.register.slice(1) + '</b><span>register, picked from the text</span></div>' : '');
    var d = '';
    if (r.findings.length) {
      var seen = {};
      d += '<p class="t-txt"><b>Tells</b></p><ul class="list">';
      var LABEL = { error: 'Error', warning: 'Warning', info: 'Hint' };
      r.findings.slice().sort(function (a, b) { return (a.severity === 'info') - (b.severity === 'info'); }).forEach(function (f) { if (seen[f.ruleId]) return; seen[f.ruleId] = 1; d += '<li><span class="sev ' + f.severity + '">' + LABEL[f.severity] + '</span> <b>' + esc(f.name) + '</b>: ' + esc(f.fix) + '</li>'; });
      d += '</ul>';
      if (!strong && hints) d += '<p class="muted">Hints stay hints until a text shows two different kinds of habit, or one plus a low human-pattern score. Pick a register above if Auto guessed wrong.</p>';
    }
    if (h.missing.length) {
      d += '<p class="h-txt"><b>Missing for this register</b></p><ul class="list">';
      h.missing.forEach(function (m) { d += '<li><b>' + esc(m.name) + '</b>. ' + esc(m.message) + ' ' + esc(m.add) + '</li>'; });
      d += '</ul>';
    }
    details.innerHTML = d;
  }

  function check() {
    var mine = ++seq, src = text.value;
    if (!src.trim()) { out.innerHTML = ''; stats.innerHTML = ''; details.innerHTML = ''; return; }
    fetch('/v1/lint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: src, register: reg.value }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (mine !== seq) return; if (r.error) { out.textContent = r.error.message; return; } render(src, r); })
      .catch(function () { out.textContent = 'Could not reach tells. Try again.'; });
  }
  function soon() { clearTimeout(timer); timer = setTimeout(check, 250); }
  text.addEventListener('input', soon);
  reg.addEventListener('change', check);

  $('rewrite').addEventListener('click', function () {
    var btn = this, note = $('rwnote');
    btn.disabled = true; note.textContent = 'Rewriting the flagged sentences.';
    var headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key;
    fetch('/v1/rewrite', { method: 'POST', headers: headers, body: JSON.stringify({ text: text.value, register: reg.value }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        btn.disabled = false;
        if (r.error) {
          note.textContent = r.error.message;
          if (r.error.code === 'try_limit' && !key) { note.textContent += ' Press "Get a free key" to keep going.'; $('getkey').focus(); }
          return;
        }
        text.value = r.text;
        var n = r.changes.length;
        note.textContent = n ? n + (n === 1 ? ' sentence' : ' sentences') + ' changed. Score ' + r.before.score + ' to ' + r.after.score + '.' + (r.suggestions && r.suggestions.length ? ' Fill in the bracketed placeholders with real details.' : '') : 'Nothing needed changing.';
        check();
      })
      .catch(function () { btn.disabled = false; note.textContent = 'Rewrite failed. Try again shortly.'; });
  });
  var voice = null;
  $('buildvoice').addEventListener('click', function () {
    var btn = this, note = $('voicenote');
    var samples = $('samples').value.split(/^\s*---+\s*$/m).map(function (x) { return x.trim(); }).filter(Boolean);
    btn.disabled = true; note.textContent = 'Measuring ' + samples.length + ' samples.';
    fetch('/v1/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ samples: samples }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        btn.disabled = false;
        if (r.error) { note.textContent = r.error.message; return; }
        voice = r;
        $('voicerewrite').disabled = ${opts.rewriteOn ? 'false' : 'true'};
        note.textContent = 'Voice learned from ' + r.samples + ' samples and ' + r.words + ' words.';
        $('voiceout').innerHTML = '<ul class="list">' + r.summary.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
      })
      .catch(function () { btn.disabled = false; note.textContent = 'Could not reach tells. Try again.'; });
  });
  $('voicerewrite').addEventListener('click', function () {
    if (!voice) return;
    var btn = this, note = $('voicenote');
    btn.disabled = true; note.textContent = 'Rewriting the draft in this voice.';
    var headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = 'Bearer ' + key;
    fetch('/v1/rewrite', { method: 'POST', headers: headers, body: JSON.stringify({ text: text.value, register: reg.value, voice: voice, polish: $('polish').checked }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        btn.disabled = false;
        if (r.error) { note.textContent = r.error.message; return; }
        text.value = r.text;
        note.textContent = r.kept ? 'Left the draft as it was: the rewrite did not keep every fact.' : 'Style match ' + r.voice.before.score + ' to ' + r.voice.after.score + ' out of 100. The draft above is updated.';
        check();
      })
      .catch(function () { btn.disabled = false; note.textContent = 'Rewrite failed. Try again shortly.'; });
  });
  Array.prototype.forEach.call(document.querySelectorAll('button.copy'), function (b) {
    b.addEventListener('click', function () {
      var src = $(b.getAttribute('data-for')).textContent;
      var done = function (ok) { b.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });
  check();
})();
</script>`;
}

export const SITE = 'https://tells.nexugen.app';

/** Canonical, description, Open Graph and JSON-LD for one page. */
export function headMeta(m: { title: string; description: string; path: string; name?: string }): string {
  const url = SITE + m.path;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: m.name ?? 'tells',
    url,
    description: m.description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: 'Nexugen', url: 'https://nexugen.app' },
  };
  return `<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="tells">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

/** The landing page served at /. One request, no external assets. */
export function landingPage(opts: PageOpts): string {
  const B = BENCH;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({ title: 'tells', description: 'Find the habits that make text read as AI-written, see the human patterns it has or lacks, and fix only the sentences that need it.', path: '/' })}
<style>
${STYLE}</style>
</head>
<body>
<main>
<h1>tells</h1>
<p class="lede">Find the habits that make text read as AI-written, see which human patterns it has or lacks, and fix only the sentences that need it. Open source, by <a href="https://nexugen.app">Nexugen</a>.</p>

${checkerPanel(opts, { sample: SAMPLE, register: 'auto', label: 'Paste a draft' })}
<h2>Sound like you</h2>
<p>A draft can pass every check and still not sound like the person who will sign it. Paste ten or more things one person wrote (messages, posts, emails), separated by a line with three dashes. tells measures how they write: sentence lengths, punctuation, casing, the small words they lean on, how they open and close, what they never do. Then it can rewrite the draft above in that voice, keeping every fact and adding none.</p>
${voicePanel(opts)}
<p class="muted">From the command line: <code>tells voice build samples/*.txt -o voice.json</code>, then <code>tells rewrite draft.md --voice voice.json</code>. Tested on ${VOICE.authors} public-domain authors: a held-out passage was closest to its own author's profile ${VOICE.attribution} of the time (chance is ${VOICE.chance}), and it outscored other people's writing with an AUC of ${VOICE.aucVsOtherHumans}. <a href="https://github.com/Nexugen/tells/blob/main/bench/VOICE.md">How it is measured</a>.</p>

<h2>Install</h2>
<pre><code>npm i @nexugen/tells</code></pre>
<p>The command it installs is <code>tells</code>. To try it without installing:</p>
<pre><code>npx @nexugen/tells lint draft.md</code></pre>
<p>In a project that has it:</p>
<pre><code>npx tells lint docs/ --ci --fail-on warning
npx tells rewrite draft.md --write</code></pre>
<p>In code:</p>
<pre><code>import { lint, rewrite } from '@nexugen/tells';
const result = lint(draft, { register: 'casual' });
console.log(result.findings, result.human.missing);</code></pre>
<p>In CI, inline on the pull request:</p>
<pre><code>- run: npx @nexugen/tells lint docs/ --format github --ci</code></pre>

<h2>Two sides</h2>
<p>tells looks for two things. <span class="t-txt">Tells</span> are habits to remove: dashes, contrast frames, closing slogans, stock openers, generic examples, a summary line at the end of every paragraph. <span class="h-txt">Human signals</span> are patterns people use far more than models: specific numbers, names and dates, first-hand detail, asides, an opinion with something at stake, uneven rhythm.</p>
<p>The rewrite works toward the signals as well as away from the tells, and it never makes things up. When a detail would help and your draft does not have it, you get a marked gap in square brackets to fill in yourself.</p>

<h2>Benchmark</h2>
<p>We tested it on ${B.humanSamples} human samples written before 2022, from about ${B.sources} sources, and ${B.modelSamples} answers from Claude Haiku, Sonnet and Opus to ${B.prompts} prompts in ${B.genres} genres. A third of the prompts told the model to sound like a person. The human set includes chat, lowercase typing and writing about AI, apps and business, so the score judges style, not subject. The final check used a held-out set that tells had never seen, fetched after tuning stopped and scored once.</p>
<div class="figures">
  <div class="fig"><b>${B.freshHumanFlagged}</b><span>of ${B.freshHuman} human texts in the held-out set got a warning or error</span></div>
  <div class="fig"><b>${B.freshPlainFlagged}</b><span>of plain AI text of 60 words or more flagged, same set</span></div>
  <div class="fig"><b>${B.freshAuc}</b><span>AUC of the human-pattern score, same set</span></div>
  <div class="fig"><b>${B.testFlagged}</b><span>of ${B.testHuman} human texts in the locked test split got a warning or error</span></div>
</div>
<p>How do Claude, GPT and Gemini compare? See <a href="/models">the tells model ranking</a>: the same everyday requests, answered by each model and checked by tells.</p>
<p class="muted">Limits: texts under 60 words are judged by the rules alone, most model answers in the benchmark come from Claude, and answers from prompts that asked the model to write like a person were caught about ${B.adversarialFlagged} of the time. <a href="https://github.com/Nexugen/tells/blob/main/bench/RESULTS.md">Method, data and per-source results</a>.</p>

<h2>API</h2>
<pre><code>curl -s https://tells.nexugen.app/v1/lint -d '{"text":"Great question! It is robust."}'
curl -s -X POST https://tells.nexugen.app/v1/keys</code></pre>
<p class="muted">Lint is free with no key. Endpoints are listed at <a href="/v1">/v1</a>.</p>

<h2>Badge</h2>
<p>If your docs or README pass tells, you can say so.</p>
<div class="badge-show"><img src="/badge.svg" alt="Linted with tells" width="102" height="20"></div>
<div class="snip">
  <div class="snip-head"><span>Markdown</span><button type="button" class="ghost copy" data-for="badge-md">Copy</button></div>
  <pre><code id="badge-md">${esc(BADGE_MD)}</code></pre>
</div>
<div class="snip">
  <div class="snip-head"><span>HTML</span><button type="button" class="ghost copy" data-for="badge-html">Copy</button></div>
  <pre><code id="badge-html">${esc(BADGE_HTML)}</code></pre>
</div>

${siteFooter()}
</main>
${pageScript(opts)}
</body>
</html>`;
}
