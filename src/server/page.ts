// Shared pieces of every page: styles, head tags, header, footer and the checker's markup.
// The checker's script is in page-script.ts and the home page in home.ts.
import type { Register } from '../types.ts';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const SITE = 'https://tells.nexugen.app';

/** The Chrome Web Store page for the extension. Empty until it is published; the home page shows the "Add to Chrome" spot only when this is set. */
export const CHROME_STORE_URL = '';

/** The line about the team behind tells, shown small in the footer of the home page and /developers. */
export const NEXUGEN_LINE = 'Nexugen builds web and mobile apps, takes care of the app store side, and finds customers for them.';
/** A second line for that block. Leave empty until the Nexugen platform really checks its apps and outreach emails with tells; then set it to:
 *  'Nexugen checks the writing in every app it builds and every outreach email with tells.' */
export const NEXUGEN_USES_TELLS = '';

export const SAMPLE = `Great question! In today's fast-paced world, it's not just a tool, it's a movement.

We leverage robust AI to seamlessly streamline your workflow. No setup. No fees. No problem.

Hope this helps! Let me know if you have any questions.`;

/** Shared CSS for every page. */
export const STYLE = `:root {
  --bg: #fbfaf7; --fg: #1b1b1a; --muted: #6b6a65; --line: #e3e0d8; --line-strong: #cfcbc0; --panel: #ffffff;
  --tell: #b42318; --tell-bg: #fde7e4; --tell-soft: #f6c9c3; --human: #146c43; --human-bg: #dff3e7; --accent: #1b1b1a; --on-accent: #fbfaf7; --code: #f2f0ea;
  --shadow: 0 1px 2px rgba(27,27,26,.06); --shadow-lift: 0 10px 30px -12px rgba(27,27,26,.28), 0 2px 6px rgba(27,27,26,.06);
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --sans: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #131312; --fg: #ecebe6; --muted: #9a998f; --line: #2c2b28; --line-strong: #3d3c38; --panel: #1b1b19;
    --tell: #ff8a7a; --tell-bg: #3b1d19; --tell-soft: #5a2620; --human: #6fd3a0; --human-bg: #173126; --accent: #ecebe6; --on-accent: #131312; --code: #22221f;
    --shadow: none; --shadow-lift: 0 12px 32px -10px rgba(0,0,0,.7), 0 0 0 1px #34332f; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 var(--sans); overflow-x: hidden; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }
h1, h2, h3 { font-family: var(--serif); font-weight: 600; letter-spacing: -0.01em; line-height: 1.15; }
h1 { font-size: clamp(40px, 8vw, 64px); margin: 0 0 12px; }
h2 { font-size: 28px; margin: 56px 0 12px; }
h3 { font-size: 21px; margin: 28px 0 8px; }
p { margin: 0 0 14px; }
.lede { font-size: 20px; color: var(--muted); max-width: 640px; }
a { color: inherit; text-underline-offset: 3px; }
code, pre { font-family: var(--mono); font-size: 14.5px; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 0 0 12px; }
textarea { font: inherit; width: 100%; min-height: 180px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: var(--bg); color: var(--fg); line-height: 1.55; }
textarea:focus, input:focus, button:focus-visible, select:focus, a:focus-visible, mark:focus-visible, li:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
select, input, button { font: inherit; font-size: 15px; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; background: var(--bg); color: var(--fg); }
button { background: var(--accent); color: var(--on-accent); border-color: var(--accent); cursor: pointer; font-weight: 600; }
button[disabled] { opacity: .5; cursor: default; }
button.ghost { background: transparent; color: var(--fg); border-color: var(--line-strong); font-weight: 500; }
button.link { background: none; border: 0; padding: 10px 4px; color: var(--muted); font-weight: 500; text-decoration: underline; text-underline-offset: 3px; }
.muted { color: var(--muted); font-size: 15px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
ul.list { padding-left: 18px; margin: 8px 0; } ul.list li { margin: 4px 0; }
.t-txt { color: var(--tell); } .h-txt { color: var(--human); }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 13px; }
td.n, th.n { text-align: right; white-space: nowrap; }
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0 16px; }
.fig { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 14px 16px; }
.fig b { display: block; font-family: var(--serif); font-size: 40px; font-weight: 600; line-height: 1.1; letter-spacing: -0.01em; white-space: nowrap; }
@media (max-width: 420px) { .fig { padding: 12px 14px; } .fig b { font-size: 34px; } }
.fig span { display: block; margin-top: 6px; font-size: 14px; line-height: 1.45; color: var(--muted); }

/* header and footer */
.top { max-width: 860px; margin: 0 auto; padding: 14px 16px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand { font-family: var(--serif); font-size: 26px; font-weight: 600; text-decoration: none; letter-spacing: -0.02em; position: relative; padding: 4px 1px 6px; }
.brand::after { content: ""; position: absolute; left: 1px; right: 1px; bottom: 5px; height: 3px; border-radius: 2px; background: var(--tell); }
.mast { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.by { font-size: 13.5px; color: var(--muted); text-decoration: none; white-space: nowrap; padding: 8px 0; }
.by:hover { color: var(--fg); text-decoration: underline; }
.top nav { display: flex; gap: 2px; }
.top nav a { text-decoration: none; font-size: 15px; color: var(--muted); padding: 10px 10px; border-radius: 8px; }
.top nav a:hover, .top nav a[aria-current] { color: var(--fg); }
footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px 20px; justify-content: space-between; }
footer nav { display: flex; flex-wrap: wrap; gap: 4px 16px; }
footer a { display: inline-block; padding: 4px 0; }
.uses-nav { flex-basis: 100%; margin-bottom: 8px; }
.team { flex-basis: 100%; margin: 0 0 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; font-size: 14px; line-height: 1.5; }
.team b { color: var(--fg); font-weight: 600; }
.team p { margin: 2px 0 0; }

/* developer and inner pages */
.badge-show { display: flex; align-items: center; gap: 12px; margin: 4px 0 16px; }
.badge-show img { display: block; height: 20px; width: auto; }
.snip { margin: 0 0 16px; }
.snip-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.snip-head span { font-size: 14px; color: var(--muted); }
.snip-head button { font-size: 13px; padding: 6px 12px; }
.snip pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
.use h1 { font-size: clamp(34px, 7vw, 54px); }
.crumb { font-size: 15px; margin: 0 0 20px; color: var(--muted); }
ol.habits { padding-left: 22px; margin: 8px 0; } ol.habits li { margin: 0 0 14px; } ol.habits b { display: block; } ol.habits .ex { display: block; color: var(--muted); font-style: italic; }
.uses-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 8px 0 0; list-style: none; }
.uses-list a { display: inline-block; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; background: var(--panel); text-decoration: none; font-size: 15px; }
.uses-list a:hover { border-color: var(--fg); }

/* the checker */
.tool { margin: 28px 0 0; }
.tool textarea#text { display: block; font-size: 18px; line-height: 1.6; min-height: 220px; padding: 18px 18px 22px; border-radius: 16px; border: 1.5px solid var(--line-strong); background: var(--panel); box-shadow: var(--shadow); transition: border-color .2s, box-shadow .2s; }
.tool textarea#text::placeholder { color: var(--muted); opacity: .85; }
.tool textarea#text:focus { outline: none; border-color: var(--fg); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fg) 10%, transparent); }
.tool textarea.nudge { animation: nudge .4s; }
@keyframes nudge { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.go { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 14px 0 0; }
.big { font-size: 18px; padding: 15px 26px; border-radius: 12px; min-height: 54px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; transition: transform .12s, opacity .2s, background-color .2s; }
.big:active:not([disabled]) { transform: scale(.98); }
.go .big { flex: 1 1 auto; }
@media (min-width: 560px) { .go .big { flex: 0 0 auto; min-width: 230px; } }
.hint { font-size: 15px; color: var(--muted); margin: 10px 0 0; }
.hint:empty { display: none; }
.spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .7s linear infinite; display: none; }
.busy .spin { display: inline-block; }
.busy[disabled] { opacity: .8; }
@keyframes spin { to { transform: rotate(360deg); } }

.result { margin: 36px 0 0; scroll-margin-top: 16px; }
.result[hidden] { display: none; }
.verdict { display: flex; align-items: flex-start; gap: 16px; margin: 0 0 16px; }
.verdict .num { flex: none; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font-family: var(--serif); font-size: 30px; font-weight: 600; background: var(--tell-bg); color: var(--tell); animation: pop .35s cubic-bezier(.3,1.4,.5,1); }
.verdict .num.ok { background: var(--human-bg); color: var(--human); }
.verdict .num.ok::before { content: ""; width: 20px; height: 11px; border-left: 3px solid currentColor; border-bottom: 3px solid currentColor; transform: translateY(-3px) rotate(-45deg); }
.verdict .num.soft { background: var(--code); color: var(--muted); }
.verdict h2 { margin: 2px 0 4px; font-size: clamp(26px, 5.5vw, 36px); }
.verdict p { margin: 0; color: var(--muted); }
@keyframes pop { from { transform: scale(.6); opacity: 0; } }
.marked-wrap { position: relative; }
.marked { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px 20px 22px; font-size: 18px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; box-shadow: var(--shadow); }
.marked mark { color: inherit; background: linear-gradient(var(--tell), var(--tell)) no-repeat left bottom / 0% 2.5px; border-radius: 3px; padding: 1px 1px 2px; cursor: pointer; transition: background-color .15s; animation: draw .5s cubic-bezier(.2,.7,.3,1) forwards; animation-delay: calc(var(--i, 0) * 45ms); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.marked mark.hint-m { background-image: radial-gradient(circle, var(--muted) 1.1px, transparent 1.5px); background-size: 5px 3px; background-repeat: repeat-x; background-position: left bottom; animation: none; }
.marked mark:hover, .marked mark.on { background-color: var(--tell-bg); }
.marked mark.flash { animation: flash 1s; background-size: 100% 2.5px; }
@keyframes draw { to { background-size: 100% 2.5px; } }
@keyframes flash { 0%, 100% { background-color: transparent; } 30% { background-color: var(--tell-soft); } }
.skel { display: block; height: 14px; border-radius: 7px; margin: 10px 0; background: linear-gradient(90deg, var(--code) 0, var(--line) 50%, var(--code) 100%) 0 0 / 200% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

.card { position: absolute; z-index: 20; left: 0; width: min(360px, 100%); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 14px; box-shadow: var(--shadow-lift); padding: 14px 16px 12px; font-size: 15.5px; line-height: 1.5; opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .16s, transform .16s, visibility .16s; }
.card.show { opacity: 1; visibility: visible; transform: none; }
.card b { display: block; font-size: 16.5px; margin: 0 30px 4px 0; }
.card .why { margin: 0 0 10px; color: var(--muted); }
.card .do { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--code); }
.card .do::before { content: "Try this: "; font-weight: 600; }
.card .x { position: absolute; top: 4px; right: 4px; width: 40px; height: 40px; padding: 0; border: 0; background: none; color: var(--muted); font-size: 24px; line-height: 1; font-weight: 400; }

.finds { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 10px; }
.finds li { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; cursor: pointer; transition: border-color .15s; animation: rise .35s backwards; animation-delay: calc(var(--i, 0) * 40ms); }
.finds li:hover { border-color: var(--line-strong); }
.finds li b { display: block; font-size: 17px; margin-bottom: 2px; }
.finds .phr { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 8px; }
.finds .phr span { font-size: 14px; padding: 2px 8px; border-radius: 6px; background: var(--tell-bg); }
.finds p { margin: 0; color: var(--muted); font-size: 15.5px; }
.finds p + p { margin-top: 6px; color: var(--fg); }
.finds li.small .phr span { background: var(--code); }
.finds .hints-head { cursor: default; background: none; border: 0; padding: 14px 2px 0; color: var(--muted); font-size: 15px; animation: none; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
.good { margin: 14px 0 0; font-size: 15.5px; color: var(--muted); }
.good b { color: var(--human); font-weight: 600; }

.fixbar { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0 0; }
.fixbar .big { flex: 1 1 220px; }
.note { margin: 12px 0 0; font-size: 15.5px; }
.note:empty { display: none; }
.note.err { color: var(--tell); }
.diffbox { margin: 0 0 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); overflow: hidden; animation: rise .3s; scroll-margin-top: 16px; }
.diffbox[hidden] { display: none; }
.diffhead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.diffhead b { font-family: var(--serif); font-size: 21px; }
.diffhead .row { margin: 0; }
.diffhead button { min-height: 44px; padding: 8px 14px; }
.difftext { padding: 16px 18px 18px; font-size: 17px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.difftext del { color: var(--muted); text-decoration-color: color-mix(in srgb, var(--tell) 70%, transparent); text-decoration-thickness: 1.5px; opacity: .8; }
.difftext ins { text-decoration: none; background: var(--human-bg); box-shadow: inset 0 -2px 0 var(--human); border-radius: 3px; animation: glowin 1.4s; }
@keyframes glowin { from { background-color: color-mix(in srgb, var(--human) 40%, transparent); } }

.voice { margin: 24px 0 0; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); padding: 18px; animation: rise .3s; scroll-margin-top: 16px; }
.voice[hidden] { display: none; }
.voice h3 { margin: 0 0 6px; font-size: 24px; }
.voice p { color: var(--muted); }
.voice textarea { min-height: 200px; font-size: 16px; background: var(--bg); border-radius: 12px; }
.meter { display: flex; align-items: center; gap: 12px; margin: 10px 0 0; font-size: 14px; color: var(--muted); }
.meter .bar { flex: 1; height: 6px; border-radius: 3px; background: var(--code); overflow: hidden; }
.meter .bar i { display: block; height: 100%; width: 0; background: var(--fg); border-radius: 3px; transition: width .3s, background-color .3s; }
.meter.full .bar i { background: var(--human); }
.voice .row { margin: 14px 0 0; gap: 10px 16px; }
.voice label.chk { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--muted); min-height: 44px; }
.voice label.chk input { width: 20px; height: 20px; margin: 0; flex: none; }
.saved { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 16px; border-radius: 12px; background: var(--human-bg); margin: 0 0 14px; }
.saved[hidden] { display: none; }
.saved span { flex: 1 1 200px; font-weight: 600; }
.saved button { min-height: 44px; }
.traits { margin: 0 0 14px; padding-left: 18px; color: var(--muted); font-size: 15px; }
.traits[hidden] { display: none; }

@media (max-width: 520px) {
  .top nav a.wide { display: none; }
  .marked { padding: 16px 16px 18px; font-size: 17px; }
  .verdict { gap: 12px; }
  .verdict .num { width: 46px; height: 46px; font-size: 25px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0s !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  .marked mark:not(.hint-m) { background-size: 100% 2.5px; }
}
`;

export interface PageOpts { rewriteOn: boolean; anonTries: number; keyDaily: number }

/** The words a person reads in the checker, kept here so the tests can check them with tells. */
export const CHECKER_COPY = {
  placeholder: 'Paste an email, a post, a cover letter, anything you wrote.',
  check: 'Check my writing',
  example: 'Try an example',
  fix: 'Fix it',
  voice: 'Make it sound like me',
  voiceTitle: 'Make it sound like you',
  voiceIntro: 'Paste a few things you wrote yourself, such as emails, messages or posts. Leave a blank line between each one. tells learns how you write and keeps that on this device only. Nothing you paste is kept on our side.',
  voiceLearn: 'Learn my style',
  voiceSaved: 'Your style is saved on this device.',
  voiceUse: 'Rewrite in my style',
  voiceForget: 'Forget my style',
  polish: 'Tidy capitals and apostrophes',
  rewriteOff: 'Fixing is paused right now. Checking still works.',
};

/** The paste box, the results and the fix and voice tools. Ids are what pageScript expects. */
export function checkerPanel(opts: PageOpts, c: { sample: string; register: 'auto' | Register; label: string }): string {
  const C = CHECKER_COPY;
  return `<div class="tool" id="try" data-register="${c.register}">
  <label for="text" class="sr">${esc(c.label)}</label>
  <textarea id="text" spellcheck="true" placeholder="${esc(C.placeholder)}">${esc(c.sample)}</textarea>
  <div class="go">
    <button id="check" type="button" class="big"><span class="spin" aria-hidden="true"></span><span class="lbl">${esc(C.check)}</span></button>
${c.sample ? '' : `    <button id="example" type="button" class="link">${esc(C.example)}</button>`}
  </div>
  <p class="hint" id="hint" aria-live="polite"></p>
  <section class="result" id="result" hidden aria-live="polite" aria-labelledby="headline">
    <div class="diffbox" id="diff" hidden>
      <div class="diffhead"><b id="diffhead">Before and after</b><div class="row"><button type="button" id="copy">Copy the new version</button><button type="button" id="undo" class="ghost">Undo</button></div></div>
      <div class="difftext" id="difftext"></div>
    </div>
    <div class="verdict"><div class="num" id="num" aria-hidden="true"></div><div><h2 id="headline"></h2><p id="sub"></p></div></div>
    <div class="marked-wrap" id="wrap">
      <div class="marked" id="out"></div>
      <div class="card" id="card" role="dialog" aria-labelledby="cardname"><button type="button" class="x" id="cardx" aria-label="Close">&times;</button><b id="cardname"></b><p class="why" id="cardwhy"></p><p class="do" id="carddo"></p></div>
    </div>
    <p class="good" id="good" hidden></p>
    <ol class="finds" id="list"></ol>
    <div class="fixbar">
      <button id="fix" type="button" class="big"${opts.rewriteOn ? '' : ' disabled'}><span class="spin" aria-hidden="true"></span><span class="lbl">${esc(C.fix)}</span></button>
      <button id="voicebtn" type="button" class="big ghost">${esc(C.voice)}</button>
    </div>
    <p class="note" id="note">${opts.rewriteOn ? '' : esc(C.rewriteOff)}</p>
  </section>
  <section class="voice" id="voice" hidden aria-labelledby="voicetitle">
    <h3 id="voicetitle">${esc(C.voiceTitle)}</h3>
    <div class="saved" id="saved" hidden><span>${esc(C.voiceSaved)}</span><button type="button" id="voicerewrite"${opts.rewriteOn ? '' : ' disabled'}><span class="spin" aria-hidden="true"></span><span class="lbl">${esc(C.voiceUse)}</span></button><button type="button" id="forget" class="link">${esc(C.voiceForget)}</button></div>
    <ul class="traits" id="traits" hidden></ul>
    <p>${esc(C.voiceIntro)}</p>
    <label for="samples" class="sr">Things you wrote</label>
    <textarea id="samples" spellcheck="false" placeholder="Hey Sam, running ten minutes late, save me a seat?&#10;&#10;Thanks for the photos. The blue one is my favourite, mostly because of the dog."></textarea>
    <div class="meter" id="meter"><span id="wc">0 of 600 words</span><div class="bar"><i id="bar"></i></div></div>
    <div class="row">
      <button id="buildvoice" type="button" class="big"><span class="spin" aria-hidden="true"></span><span class="lbl">${esc(C.voiceLearn)}</span></button>
      <label class="chk"><input type="checkbox" id="polish" checked> ${esc(C.polish)}</label>
    </div>
    <p class="note" id="voicenote"></p>
  </section>
</div>
`;
}

/** Pages that check one kind of writing, linked from every footer. */
export const USE_LINKS: { path: string; label: string; short: string }[] = [
  { path: '/cover-letter', label: 'Check a cover letter', short: 'Cover letter' },
  { path: '/linkedin-post', label: 'Check a LinkedIn post', short: 'LinkedIn post' },
  { path: '/cold-email', label: 'Check a cold email', short: 'Cold email' },
  { path: '/essay', label: 'Check an essay', short: 'Essay' },
  { path: '/email', label: 'Check an email', short: 'Email' },
  { path: '/resume', label: 'Check a resume', short: 'Resume' },
  { path: '/bio', label: 'Check a bio', short: 'Bio or about page' },
];

export function siteHeader(current = ''): string {
  const link = (href: string, label: string, cls = '') => `<a href="${href}"${cls ? ` class="${cls}"` : ''}${current === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="top"><div class="mast"><a class="brand" href="/" aria-label="tells home">tells</a><a class="by" href="https://nexugen.app">by the Nexugen team</a></div><nav aria-label="Site">${link('/models', 'Model ranking', 'wide')}${link('/developers', 'Developers')}</nav></header>`;
}

/** Why we built tells, shown on the home page and at the top of /developers. */
export const WHY_COPY = {
  title: 'Why we built it',
  text: 'At Nexugen we build web and mobile apps for businesses and write the emails that find them customers. Our AI kept writing like AI, so we built tells to catch it. Then we made it free for everyone.',
};

/** The small "from the team behind Nexugen" block. */
export function teamBlock(): string {
  return `<div class="team"><b>From the team behind <a href="https://nexugen.app">Nexugen</a>.</b> ${esc(NEXUGEN_LINE)}${NEXUGEN_USES_TELLS ? `<p>${esc(NEXUGEN_USES_TELLS)}</p>` : ''}</div>`;
}

export function siteFooter(withUses = true, withTeam = false): string {
  return `<footer>
${withUses ? `  <nav aria-label="Check your writing" class="uses-nav">${USE_LINKS.map((u) => `<a href="${u.path}">${esc(u.label)}</a>`).join('')}</nav>
` : ''}${withTeam ? `  ${teamBlock()}
` : ''}  <span>tells is open source, made by <a href="https://nexugen.app">Nexugen</a>. MIT licence.</span>
  <nav aria-label="Project links"><a href="/developers">Developers</a><a href="/models">Model ranking</a><a href="/privacy">Privacy</a><a href="https://github.com/Nexugen/tells">GitHub</a></nav>
</footer>`;
}

/** Canonical, description, Open Graph, JSON-LD, and the install tags for one page. */
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
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131312" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="tells">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

/** The start of every page, up to and including <body>. */
export function pageHead(m: { title: string; description: string; path: string; name?: string; css?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${headMeta(m)}
<style>
${STYLE}${m.css ?? ''}</style>
</head>
<body>`;
}
