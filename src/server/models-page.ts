// /models: how AI-sounding each model's everyday writing is, measured with tells. The numbers come
// from src/model-ranking.json, written by bench/models/rank.ts; the words around them are below.
import RANKING from '../model-ranking.json' with { type: 'json' };
import { esc, headMeta, siteFooter, STYLE, USE_LINKS } from './page.ts';

interface Est { v: number; lo: number; hi: number }
export interface RankedModel { label: string; provider: string; n: number; nScored: number; withWarning: Est; per100: Est; score: Est; machineLike: Est; top: { id: string; name: string; share: number }[] }
export interface Ranking { date: string; tellsVersion: string; models: RankedModel[] }
const R = RANKING as Ranking;

export const MODELS_PATH = '/models';
const TITLE = 'Which AI model sounds most like AI? The tells model ranking';
const DESCRIPTION = 'Claude, GPT and Gemini answered the same everyday requests. tells counted the habits that make each answer read as AI-written. Results, method and limits.';
const H1 = 'The tells model ranking';
const LEDE = 'Every model answered the same everyday requests with the same plain setup. tells counted the habits that make an answer read as AI-written. More warnings means it sounds more like a chatbot.';

/** The paragraphs on the page, in order. Kept as data so the tests can check them with tells. */
export const MODELS_TEXT = {
  readIt: [
    'Warnings are the habits tells reports as a warning or an error: stock openers, a list of bold labels, a cheerful closing line, the words chatbots lean on, a name left as a placeholder in square brackets. A hint does not count. Warnings per 100 words adjusts for length, so a long answer is not punished just for being long.',
    'The human-pattern score runs from 0 to 100 and is judged on answers of 60 words or more. Ordinary human writing mostly scores above 50. Every model here averages 10 or less, so the score says nearly all of their answers read as machine-made and does little to separate them. The ranking is decided by the warnings.',
    'The ranges in brackets are 95% intervals from resampling the answers. Where two ranges overlap, the gap between those models is not settled.',
  ],
  method: [
    'The requests are 108 everyday asks in seven kinds: advice, how-tos, explanations, LinkedIn posts, emails, first-person blog posts and product copy. Each of 54 requests comes twice: as typed, and with "Write it as a few plain paragraphs, no lists, headings or bold." added.',
    'Each model got the system prompt "You are a helpful assistant." and its default temperature, with one answer per request. Claude models answered through Claude Code\'s print mode. GPT answers were capped at 600 tokens with low reasoning effort. Gemini used its default settings.',
    'tells checked each answer with no options, as the web page does. The register (casual, professional, technical, marketing) is guessed from the text.',
  ],
  sizes: [
    'Gemini was asked through the Gemini app at gemini.google.com, one new chat per request, so its answers are what people get there. It answered 89 of the 108. GPT-6.2 Sol answered through the API, and the Claude models through Claude Code with the same system prompt.',
  ],
  bias: [],
};

const pct = (e: Est) => `${Math.round(e.v)}%`;
const range = (e: Est, d = 0) => `${e.lo.toFixed(d)} to ${e.hi.toFixed(d)}`;

/** The words a person reads on /models, for checking the copy with tells. */
export function modelsCopy(): string {
  return [H1, LEDE, DESCRIPTION, ...MODELS_TEXT.readIt, ...MODELS_TEXT.method, ...MODELS_TEXT.sizes, ...MODELS_TEXT.bias].join('\n\n');
}

export function modelsPage(): string {
  const rows = R.models.map((m) => `  <tr>
    <td><b>${esc(m.label)}</b></td>
    <td>${esc(m.provider)}</td>
    <td class="n">${m.n}</td>
    <td class="n">${pct(m.withWarning)}<small>${range(m.withWarning)}</small></td>
    <td class="n">${m.per100.v.toFixed(2)}<small>${range(m.per100, 2)}</small></td>
    <td class="n">${m.score.v.toFixed(1)}<small>${range(m.score, 1)}</small></td>
  </tr>`).join('\n');
  const tops = R.models.map((m) => `  <li><b>${esc(m.label)}</b>${m.top.length ? m.top.map((t) => `${esc(t.name)} (${t.share}%)`).join(', ') : 'No warning came up in more than one answer.'}</li>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({ title: TITLE, description: DESCRIPTION, path: MODELS_PATH, name: 'tells model ranking' })}
<style>
${STYLE}
.rank { overflow-x: auto; margin: 16px 0 8px; }
.rank table { min-width: 560px; }
.rank small { display: block; font-size: 12px; color: var(--muted); }
ol.tops li { margin: 0 0 10px; } ol.tops b { display: block; }
</style>
</head>
<body>
<main class="use">
<p class="crumb"><a href="/">tells</a></p>
<h1>${esc(H1)}</h1>
<p class="lede">${esc(LEDE)}</p>
<p class="muted">Measured ${esc(R.date)} with tells ${esc(R.tellsVersion)}. Sorted by warnings per 100 words, most first.</p>

<div class="rank">
<table>
<thead><tr><th>Model</th><th>Provider</th><th class="n">Answers</th><th class="n">With a warning</th><th class="n">Warnings per 100 words</th><th class="n">Human-pattern score</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>

<h2>How to read it</h2>
${MODELS_TEXT.readIt.map((p) => `<p>${esc(p)}</p>`).join('\n')}

<h2>Most common tells per model</h2>
<p>The share of each model's answers where a habit stood as a warning.</p>
<ol class="tops">
${tops}
</ol>

<h2>Method</h2>
${MODELS_TEXT.method.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${MODELS_TEXT.sizes.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<p>The answers and the script are in the <a href="https://github.com/Nexugen/tells/tree/main/bench/models">repository</a>. A new model takes one command to add.</p>

<h2>Check your own writing</h2>
<ul class="uses-list">
  <li><a href="/">Check any text</a></li>
${USE_LINKS.map((l) => `  <li><a href="${l.path}">${esc(l.label)}</a></li>`).join('\n')}
</ul>

${siteFooter(false)}
</main>
</body>
</html>`;
}
