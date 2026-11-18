// Benchmark figures shown on the page. The source of truth is bench/EVAL.md and bench/RESULTS.md (v2, final round fresh-2 and the locked test split).
const BENCH = {
  humanSamples: '10,604', modelSamples: '2,494', prompts: '1,047', genres: 25, sources: 25,
  freshHuman: 881, freshPlainFlagged: '97.6%', freshAuc: '0.998',
  testHuman: '2,006', testFlagged: '0.2%', adversarialFlagged: '86%',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SAMPLE = `Great question! In today's fast-paced world, it's not just a tool, it's a movement.

We leverage robust AI to seamlessly streamline your workflow. No setup. No fees. No problem.

Hope this helps! Let me know if you have any questions.`;

/** The landing page served at /. One request, no external assets. */
export function landingPage(opts: { rewriteOn: boolean; anonTries: number; keyDaily: number }): string {
  const B = BENCH;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tells</title>
<meta name="description" content="Find the habits that make text read as AI-written, see the human patterns it has or lacks, and fix only the sentences that need it.">
<style>
:root {
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
footer { margin-top: 64px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>tells</h1>
<p class="lede">Find the habits that make text read as AI-written, see which human patterns it has or lacks, and fix only the sentences that need it. Open source, by <a href="https://nexugen.app">Nexugen</a>.</p>

<div class="panel" id="try">
  <label for="text" class="muted">Paste a draft</label>
  <textarea id="text" spellcheck="false">${esc(SAMPLE)}</textarea>
  <div class="row">
    <select id="register" aria-label="Register">
      <option value="auto" selected>Auto</option>
      <option value="casual">Casual</option>
      <option value="professional">Professional</option>
      <option value="technical">Technical</option>
      <option value="marketing">Marketing</option>
    </select>
    <button id="rewrite" ${opts.rewriteOn ? '' : 'disabled'}>Rewrite flagged sentences</button>
    <button id="getkey" type="button" class="ghost">Get a free key</button>
  </div>
  <p class="muted" id="keynote" hidden></p>
  <p class="muted" id="rwnote">${opts.rewriteOn ? `${opts.anonTries} free rewrites a day without a key, ${opts.keyDaily} with one.` : 'Rewrite is off right now. Lint still works.'}</p>
  <div class="legend"><span class="lt">AI tell</span><span class="lh">Human signal</span></div>
  <div class="out" id="out" aria-live="polite"></div>
  <div class="stats" id="stats"></div>
  <div id="details"></div>
</div>

<h2>Install</h2>
<pre><code>npm i tells</code></pre>
<p>Or run it without installing:</p>
<pre><code>npx tells lint draft.md
npx tells lint docs/ --ci --fail-on warning
npx tells rewrite draft.md --write</code></pre>
<p>In code:</p>
<pre><code>import { lint, rewrite } from 'tells';
const result = lint(draft, { register: 'casual' });
console.log(result.findings, result.human.missing);</code></pre>
<p>In CI, inline on the pull request:</p>
<pre><code>- run: npx tells lint docs/ --format github --ci</code></pre>

<h2>Two sides</h2>
<p>The linter has two halves. <span class="t-txt">Tells</span> are habits to remove: dashes, contrast frames, closing slogans, stock openers, generic examples, a summary line at the end of every paragraph. <span class="h-txt">Human signals</span> are patterns people use far more than models: specific numbers, names and dates, first-hand detail, asides, an opinion with something at stake, uneven rhythm.</p>
<p>The rewrite works toward the signals as well as away from the tells, and it never makes things up. When a detail would help and your draft does not have it, you get a marked gap in square brackets to fill in yourself.</p>

<h2>Benchmark</h2>
<p>We tested it on ${B.humanSamples} human samples written before 2022, from about ${B.sources} sources, and ${B.modelSamples} answers from Claude Haiku, Sonnet and Opus to ${B.prompts} prompts in ${B.genres} genres. A third of the prompts told the model to sound like a person. The final check used a held-out set that tells had never seen, fetched after tuning stopped and scored once.</p>
<div class="figures">
  <div class="fig"><b>0</b><span>of ${B.freshHuman} human texts in the held-out set got a warning or error</span></div>
  <div class="fig"><b>${B.freshPlainFlagged}</b><span>of plain AI text of 60 words or more flagged, same set</span></div>
  <div class="fig"><b>${B.freshAuc}</b><span>AUC of the human-pattern score, same set</span></div>
  <div class="fig"><b>${B.testFlagged}</b><span>of ${B.testHuman} human texts in the locked test split got a warning or error</span></div>
</div>
<p class="muted">Limits: texts under 60 words are judged by the rules alone, every model tested was a Claude model, and answers from prompts that asked the model to write like a person were caught about ${B.adversarialFlagged} of the time. <a href="https://github.com/Nexugen/tells/blob/main/bench/RESULTS.md">Method, data and per-source results</a>.</p>

<h2>API</h2>
<pre><code>curl -s https://tells.nexugen.app/v1/lint -d '{"text":"Great question! It is robust."}'
curl -s -X POST https://tells.nexugen.app/v1/keys</code></pre>
<p class="muted">Lint is free with no key. Endpoints are listed at <a href="/v1">/v1</a>.</p>

<footer>The code is on <a href="https://github.com/Nexugen/tells">GitHub</a> under the MIT licence, made by <a href="https://nexugen.app">Nexugen</a>.</footer>
</main>
<script>
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
    stats.innerHTML =
      '<div class="stat"><b class="t-txt">' + strong + '</b><span>' + (strong === 1 ? 'tell' : 'tells') + (hints ? ', plus ' + hints + (hints === 1 ? ' minor hint' : ' minor hints') : '') + '</span></div>' +
      '<div class="stat"><b>' + r.score + '</b><span>known tells per 100 words</span></div>' +
      '<div class="stat"><b class="h-txt">' + h.present.length + '</b><span>human signals present</span></div>' +
      '<div class="stat"><b>' + (h.tooShort ? 'Too short' : strong ? 'Has tells' : 'No tells') + '</b><span>' + (h.tooShort ? 'to judge, under 60 words' : strong ? 'worth a second look' : 'none of the known habits') + '</span></div>' +
      (h.pattern ? '<div class="stat"><b class="' + (h.pattern.low ? 't-txt' : 'h-txt') + '">' + h.pattern.score + '</b><span>human-pattern score' + (h.pattern.low ? ', reads machine-like' : '') + '</span></div>' : '') +
      (r.registerGuess ? '<div class="stat"><b>' + r.register[0].toUpperCase() + r.register.slice(1) + '</b><span>register, picked from the text</span></div>' : '');
    var d = '';
    if (r.findings.length) {
      var seen = {};
      d += '<p class="t-txt"><b>Tells</b></p><ul class="list">';
      r.findings.forEach(function (f) { if (seen[f.ruleId]) return; seen[f.ruleId] = 1; d += '<li><b>' + esc(f.name) + '</b>: ' + esc(f.fix) + '</li>'; });
      d += '</ul>';
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
      .catch(function () { out.textContent = 'Could not reach the linter. Try again.'; });
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
  check();
})();
</script>
</body>
</html>`;
}
