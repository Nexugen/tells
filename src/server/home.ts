// The home page at / (and /share, where phones send shared text): one question, one box, one button.
import BENCH from '../bench-figures.json' with { type: 'json' };
import { CHECKER_COPY, CHROME_STORE_URL, checkerPanel, esc, pageHead, siteFooter, siteHeader, USE_LINKS, WHY_COPY, NEXUGEN_LINE, type PageOpts } from './page.ts';
import { pageScript } from './page-script.ts';

/** The words on the home page, for checking with tells. */
export const HOME_COPY = {
  title: 'Does it sound like AI? Free check | tells',
  description: 'Paste anything you wrote and see which phrases make it read like a chatbot wrote it. Then fix just those, or rewrite it to sound like you. Free.',
  h1: 'Does it sound like AI?',
  lede: 'Paste something you wrote. tells marks the phrases that make it read like a chatbot wrote it and shows you what to say instead.',
  trust: [
    ['Free, and open source', 'No account and no sign up. Anyone can read the code on GitHub.'],
    ['Careful with people', `Tested on about 14,500 real texts written by people, so it tries hard not to accuse anyone. In the last test on texts it had never seen, ${BENCH.freshHumanFlagged} of ${BENCH.freshHuman} got a warning.`],
    ['A mark is not proof', 'People have these habits too. A marked line is a reason to read it again, not proof that AI wrote it.'],
  ] as [string, string][],
  kindsTitle: 'Check a certain kind of writing',
  kindsIntro: 'Each page knows the habits that show up most in that kind of writing.',
  alsoTitle: 'More from tells',
  also: [
    ['/models', 'Which AI sounds most like AI?', 'Claude, GPT and Gemini answered the same everyday requests. See how each one scored.'],
    ['/developers#assistants', 'Use it in Claude or ChatGPT', 'Add tells to your assistant so it can check and fix its own writing before you see it.'],
    ['/developers', 'For developers', 'The command line tool, the free API, checks for pull requests and the full list of habits.'],
  ] as [string, string, string][],
  chrome: ['Underline it as you type', 'The tells extension for Chrome marks these phrases in Gmail, LinkedIn and other sites while you write. Checking happens on your computer.'],
};

export function homeCopy(): string {
  const H = HOME_COPY;
  return [H.h1, H.lede, H.description, ...H.trust.flat(), H.kindsTitle, H.kindsIntro, H.alsoTitle, ...H.also.map((a) => `${a[1]}. ${a[2]}`), ...H.chrome, WHY_COPY.title, WHY_COPY.text, NEXUGEN_LINE, ...Object.values(CHECKER_COPY)].join('\n\n');
}

const HOME_CSS = `
.hero h1 { font-size: clamp(46px, 11vw, 88px); line-height: 1.02; letter-spacing: -0.025em; margin: 32px 0 14px; }
.hero .lede { font-size: clamp(18px, 4.4vw, 22px); color: var(--muted); max-width: 600px; margin: 0; }
.trust { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin: 80px 0 0; }
.trust div { border-top: 2px solid var(--fg); padding: 14px 0 0; }
.trust b { display: block; font-family: var(--serif); font-size: 21px; margin-bottom: 4px; }
.trust p { margin: 0; color: var(--muted); font-size: 15.5px; }
.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; padding: 0; margin: 14px 0 0; list-style: none; }
.kinds a { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); text-decoration: none; font-size: 16px; transition: border-color .15s; }
.kinds a::after { content: "\\2192"; color: var(--muted); transition: transform .15s; }
.kinds a:hover { border-color: var(--fg); }
.kinds a:hover::after { transform: translateX(3px); }
.origin { margin: 56px 0 0; padding: 22px 24px; border-left: 3px solid var(--tell); background: var(--panel); border-radius: 0 14px 14px 0; }
.origin h2 { margin: 0 0 8px; font-size: 24px; }
.origin p { margin: 0; font-family: var(--serif); font-size: 19px; line-height: 1.55; }
.also { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 14px 0 0; }
.also a { display: block; padding: 16px; border: 1px solid var(--line); border-radius: 14px; text-decoration: none; background: var(--panel); transition: border-color .15s; }
.also a:hover { border-color: var(--fg); }
.also b { display: block; font-size: 17px; margin-bottom: 4px; }
.also span { color: var(--muted); font-size: 15px; }
.chrome-go { display: inline-flex; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 600; }
.phone { display: flex; align-items: center; gap: 12px; margin: 28px 0 0; padding: 10px 6px 10px 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--panel); font-size: 15px; animation: rise .3s; }
.phone[hidden] { display: none; }
.phone img { width: 36px; height: 36px; border-radius: 9px; flex: none; }
.phone span { flex: 1; line-height: 1.35; }
.phone button { min-height: 40px; padding: 6px 14px; }
.phone .x { background: none; border: 0; color: var(--muted); font-size: 24px; font-weight: 400; min-width: 44px; padding: 0; }
`;

/** `shared` is text sent from another app through the share target; it fills the box and is checked at once. */
export function landingPage(opts: PageOpts, shared = ''): string {
  const H = HOME_COPY;
  return `${pageHead({ title: H.title, description: H.description, path: '/', css: HOME_CSS })}
${siteHeader('/')}
<main class="home">
<section class="hero">
<h1>${esc(H.h1)}</h1>
<p class="lede">${esc(H.lede)}</p>
${checkerPanel(opts, { sample: shared, register: 'auto', label: 'Your writing' })}
<div class="phone" id="phone" hidden role="region" aria-label="Add to your phone"><img src="/icons/icon-192.png" alt="" width="36" height="36"><span id="phonemsg"></span><button type="button" id="phonego" hidden>Add</button><button type="button" class="x" id="phonex" aria-label="Dismiss">&times;</button></div>
</section>

<section class="trust" aria-label="About the check">
${H.trust.map(([b, p]) => `  <div><b>${esc(b)}</b><p>${esc(p)}</p></div>`).join('\n')}
</section>

<h2>${esc(H.kindsTitle)}</h2>
<p class="muted">${esc(H.kindsIntro)}</p>
<ul class="kinds">
${USE_LINKS.map((u) => `  <li><a href="${u.path}">${esc(u.short)}</a></li>`).join('\n')}
</ul>
${CHROME_STORE_URL ? `
<h2 id="chrome">${esc(H.chrome[0])}</h2>
<p>${esc(H.chrome[1])}</p>
<p><a class="big chrome-go" href="${esc(CHROME_STORE_URL)}">Add to Chrome</a></p>
` : ''}
<section class="origin" aria-labelledby="why">
<h2 id="why">${esc(WHY_COPY.title)}</h2>
<p>${esc(WHY_COPY.text)}</p>
</section>

<h2>${esc(H.alsoTitle)}</h2>
<div class="also">
${H.also.map(([href, b, s]) => `  <a href="${href}"><b>${esc(b)}</b><span>${esc(s)}</span></a>`).join('\n')}
</div>

${siteFooter(false, true)}
</main>
${pageScript(opts, { home: true })}
</body>
</html>`;
}
