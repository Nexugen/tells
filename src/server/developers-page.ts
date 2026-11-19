// /developers: everything for people who build with tells. The command line tool, the library, CI,
// the API and keys, assistant connectors, the benchmark, the badge and the full list of habits.
import BENCH from '../bench-figures.json' with { type: 'json' };
import VOICE from '../voice-figures.json' with { type: 'json' };
import { RULES } from '../rules.ts';
import { plainRule } from '../plain.ts';
import { esc, pageHead, siteFooter, siteHeader, SITE, WHY_COPY } from './page.ts';

export const DEVELOPERS_PATH = '/developers';
export const MCP_URL = `${SITE}/mcp`;

const BADGE_MD = '[![Linted with tells](https://tells.nexugen.app/badge.svg)](https://tells.nexugen.app)';
const BADGE_HTML = '<a href="https://tells.nexugen.app"><img src="https://tells.nexugen.app/badge.svg" alt="Linted with tells" height="20"></a>';

const DESKTOP_CONFIG = `{
  "mcpServers": {
    "tells": { "command": "npx", "args": ["-y", "@nexugen/tells", "mcp"] }
  }
}`;

const CSS = `
.toc { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 20px 0 0; list-style: none; }
.toc a { display: inline-block; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-size: 15px; background: var(--panel); }
.toc a:hover { border-color: var(--fg); }
section[id] { scroll-margin-top: 16px; }
.steps { padding-left: 22px; } .steps li { margin: 0 0 8px; }
.origin { margin: 24px 0 0; padding: 16px 20px; border-left: 3px solid var(--tell); background: var(--panel); border-radius: 0 12px 12px 0; }
.origin p { margin: 0; color: var(--muted); }
.rules { overflow-x: auto; }
.rules td:first-child { white-space: nowrap; }
.rules code { font-size: 13px; }
.sev { font-size: 12px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); white-space: nowrap; }
.sev.error, .sev.warning { color: var(--tell); border-color: currentColor; }
.sev.info { color: var(--muted); }
`;

function snip(id: string, label: string, code: string): string {
  return `<div class="snip">
  <div class="snip-head"><span>${esc(label)}</span><button type="button" class="ghost copy" data-for="${id}">Copy</button></div>
  <pre><code id="${id}">${esc(code)}</code></pre>
</div>`;
}

export function developersPage(): string {
  const B = BENCH;
  const rows = RULES.map((r) => `<tr><td><code>${esc(r.id)}</code></td><td>${esc(plainRule(r.id).name)}</td><td><span class="sev ${r.severity}">${r.severity}</span></td><td>${esc(r.why)}</td></tr>`).join('\n');
  return `${pageHead({ title: 'tells for developers: CLI, API, CI and assistant connectors', description: 'Install the tells command line tool and library, call the free API, check docs in CI, connect tells to Claude or ChatGPT, and see the benchmark and every rule.', path: DEVELOPERS_PATH, name: 'tells for developers', css: CSS })}
${siteHeader(DEVELOPERS_PATH)}
<main class="use">
<h1>tells for developers</h1>
<p class="lede">The same checks as the home page, as a command line tool, a library, a free API, a CI step and a connector for AI assistants. Checking runs locally with no model and no network. Only the rewrite calls a model.</p>
<div class="origin"><p><b>${esc(WHY_COPY.title)}.</b> ${esc(WHY_COPY.text)}</p></div>
<ul class="toc">
  <li><a href="#install">Install</a></li><li><a href="#ci">CI</a></li><li><a href="#assistants">Claude and ChatGPT</a></li><li><a href="#api">API</a></li><li><a href="#keys">Free keys</a></li><li><a href="#voice">Voice</a></li><li><a href="#benchmark">Benchmark</a></li><li><a href="#badge">Badge</a></li><li><a href="#rules">Rules</a></li>
</ul>

<section id="install">
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
</section>

<section id="ci">
<h2>In CI</h2>
<p>Inline on the pull request, as GitHub annotations:</p>
<pre><code>- run: npx @nexugen/tells lint docs/ --format github --ci</code></pre>
<p class="muted">Add <code>--fail-on warning</code> to block a merge on warnings as well as errors.</p>
</section>

<section id="assistants">
<h2>Use it in Claude or ChatGPT</h2>
<p>tells runs as an MCP server, so an assistant can check its own draft, fix the flagged sentences and learn your style. The remote server needs no sign in.</p>
${snip('mcp-url', 'Server address', MCP_URL)}
<h3>Claude (claude.ai and Claude Desktop)</h3>
<ol class="steps">
  <li>Open Settings, then Connectors, and choose Add custom connector.</li>
  <li>Name it tells and paste the server address above. Leave the sign in fields empty.</li>
  <li>In a chat, turn tells on from the tools menu and ask Claude to check its draft with tells.</li>
</ol>
<h3>Claude Code</h3>
${snip('mcp-code', 'Terminal', `claude mcp add --transport http tells ${MCP_URL}`)}
<h3>ChatGPT</h3>
<ol class="steps">
  <li>Open Settings, then Apps and Connectors, then Advanced, and turn on Developer mode.</li>
  <li>Choose Create, name it tells, paste the server address above and pick No authentication.</li>
  <li>In a chat, pick tells from the tools menu and ask ChatGPT to check its answer.</li>
</ol>
<p>For a custom GPT, import <a href="/openapi.json">/openapi.json</a> as an action. Its privacy policy is at <a href="/privacy">/privacy</a>.</p>
<h3>On your own computer</h3>
<p>The package also runs the server locally over stdio, so checking never leaves your machine. Add this to Claude Desktop's config file:</p>
${snip('mcp-local', 'claude_desktop_config.json', DESKTOP_CONFIG)}
<p class="muted">The tools are <code>check_text</code>, <code>fix_text</code> and <code>build_voice</code>. Locally, <code>fix_text</code> uses your <code>ANTHROPIC_API_KEY</code> when it is set and the public API when it is not.</p>
</section>

<section id="api">
<h2>API</h2>
<pre><code>curl -s https://tells.nexugen.app/v1/lint -d '{"text":"Great question! It is robust."}'
curl -s -X POST https://tells.nexugen.app/v1/keys</code></pre>
<p class="muted">Checking is free with no key. Endpoints are listed at <a href="/v1">/v1</a>, and the OpenAPI description is at <a href="/openapi.json">/openapi.json</a>.</p>
</section>

<section id="keys">
<h2>Free keys</h2>
<p>The rewrite gives a few free tries a day to each address. A free key from <code>POST /v1/keys</code> raises that. Send it as <code>Authorization: Bearer &lt;key&gt;</code>. Keys are stored only as a hash.</p>
</section>

<section id="voice">
<h2>Voice from the command line</h2>
<pre><code>tells voice build samples/*.txt -o voice.json
tells rewrite draft.md --voice voice.json</code></pre>
<p>Tested on ${VOICE.authors} public domain authors: a held-out passage was closest to its own author's profile ${VOICE.attribution} of the time (chance is ${VOICE.chance}), and it outscored other people's writing with an AUC of ${VOICE.aucVsOtherHumans}. <a href="https://github.com/Nexugen/tells/blob/main/bench/VOICE.md">How it is measured</a>.</p>
</section>

<section id="benchmark">
<h2>Benchmark</h2>
<p>tells looks for two things. <span class="t-txt">Tells</span> are habits to remove: dashes, contrast frames, closing slogans, stock openers, generic examples. <span class="h-txt">Human signals</span> are patterns people use far more than models: specific numbers, names and dates, first-hand detail, asides, uneven rhythm.</p>
<p>We tested it on ${B.humanSamples} human samples written before 2022, from about ${B.sources} sources, and ${B.modelSamples} answers from Claude Haiku, Sonnet and Opus to ${B.prompts} prompts in ${B.genres} genres. A third of the prompts told the model to sound like a person. The final check used a held-out set that tells had never seen, fetched after tuning stopped and scored once.</p>
<div class="figures">
  <div class="fig"><b>${B.freshHumanFlagged}</b><span>of ${B.freshHuman} human texts in the held-out set got a warning or error</span></div>
  <div class="fig"><b>${B.freshPlainFlagged}</b><span>of plain AI text of 60 words or more flagged, same set</span></div>
  <div class="fig"><b>${B.freshAuc}</b><span>AUC of the human-pattern score, same set</span></div>
  <div class="fig"><b>${B.testFlagged}</b><span>of ${B.testHuman} human texts in the locked test split got a warning or error</span></div>
</div>
<p class="muted">Limits: texts under 60 words are judged by the rules alone, most model answers in the benchmark come from Claude, and answers from prompts that asked the model to write like a person were caught about ${B.adversarialFlagged} of the time. <a href="https://github.com/Nexugen/tells/blob/main/bench/RESULTS.md">Method, data and results per source</a>. To compare models, see <a href="/models">the tells model ranking</a>.</p>
</section>

<section id="badge">
<h2>Badge</h2>
<p>If your docs or README pass tells, you can say so.</p>
<div class="badge-show"><img src="/badge.svg" alt="Linted with tells" width="102" height="20"></div>
${snip('badge-md', 'Markdown', BADGE_MD)}
${snip('badge-html', 'HTML', BADGE_HTML)}
</section>

<section id="rules">
<h2>Every habit tells looks for</h2>
<p>One habit on its own is reported as a hint. A warning or error stands when the text shows at least two different kinds of tell, or one kind plus a low human-pattern score. The severity below is what a rule reports once that holds. The JSON is at <a href="/v1/rules">/v1/rules</a>.</p>
<div class="rules"><table>
<thead><tr><th>Id</th><th>Name</th><th>Severity</th><th>Why it stands out</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>

${siteFooter(true, true)}
</main>
<script>
Array.prototype.forEach.call(document.querySelectorAll('button.copy'), function (b) {
  b.addEventListener('click', function () {
    var src = document.getElementById(b.getAttribute('data-for')).textContent;
    var done = function (ok) { b.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src).then(function () { done(true); }, function () { done(false); });
    else done(false);
  });
});
</script>
</body>
</html>`;
}
