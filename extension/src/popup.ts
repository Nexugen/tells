// The tells popup: a paste box checked on this computer, plus Fix and Sound like me, which call the
// public API only when pressed.
import { lint } from '../../src/lint.ts';
import { plainRule } from '../../src/plain.ts';
import type { LintResult } from '../../src/types.ts';

declare const chrome: any;

const API = 'https://tells.nexugen.app';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = $<HTMLTextAreaElement>('text');
const samples = $<HTMLTextAreaElement>('samples');
let voice: unknown = null;
let key = '';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const words = (s: string) => (s.match(/[\p{L}\p{N}']+/gu) ?? []).length;

chrome.storage.local.get({ enabled: true, voice: null, key: '', draft: '' }, (v: { enabled: boolean; voice: unknown; key: string; draft: string }) => {
  $<HTMLInputElement>('enabled').checked = v.enabled;
  voice = v.voice; key = v.key;
  if (v.draft && !text.value) { text.value = v.draft; check(); }
  $('saved').hidden = !voice;
});
$<HTMLInputElement>('enabled').addEventListener('change', (e) => chrome.storage.local.set({ enabled: (e.target as HTMLInputElement).checked }));

function render(src: string, r: LintResult) {
  const strong = r.findings.filter((f) => f.severity !== 'info');
  const kinds = new Set(strong.map((f) => f.ruleId)).size;
  $('headline').textContent = kinds ? (kinds === 1 ? '1 thing gives this away' : `${kinds} things give this away`) : r.findings.length ? 'Mostly sounds like a person' : 'Sounds like a person';
  const taken: boolean[] = [];
  const keep = r.findings.slice().sort((a, b) => (a.severity === 'info' ? 1 : 0) - (b.severity === 'info' ? 1 : 0)).filter((f) => {
    for (let i = f.start; i < f.end; i++) if (taken[i]) return false;
    for (let i = f.start; i < f.end; i++) taken[i] = true;
    return true;
  }).sort((a, b) => a.start - b.start);
  let html = '', pos = 0;
  for (const f of keep) {
    const p = plainRule(f.ruleId);
    html += esc(src.slice(pos, f.start)) + `<mark${f.severity === 'info' ? ' class="hint"' : ''} title="${esc(`${p.name}. ${f.fix}`)}">${esc(src.slice(f.start, f.end))}</mark>`;
    pos = f.end;
  }
  $('out').innerHTML = html + esc(src.slice(pos));
  const seen = new Set<string>();
  $('list').innerHTML = r.findings.filter((f) => f.severity !== 'info' && !seen.has(f.ruleId) && seen.add(f.ruleId)).map((f) => `<li><b>${esc(plainRule(f.ruleId).name)}</b><span>${esc(f.fix)}</span></li>`).join('');
  $('result').hidden = false;
}

function check() {
  const src = text.value;
  chrome.storage.local.set({ draft: src.slice(0, 20_000) });
  if (!src.trim()) { $('result').hidden = true; return; }
  render(src, lint(src, { plain: true }));
}
let t = 0;
text.addEventListener('input', () => { clearTimeout(t); t = window.setTimeout(check, 300); });
$('check').addEventListener('click', check);

$('grab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'tells:text' });
    if (r?.text) { text.value = r.text; check(); } else note('Click into the box you are writing in on the page first.', true);
  } catch {
    note('tells is not running on this page yet. Press "Underline on this page too" below, click into your text, then try again.', true);
  }
});

function note(msg: string, err = false, el = 'note') { const n = $(el); n.textContent = msg; n.className = err ? 'note err' : 'note'; }

async function post(path: string, body: unknown, withKey = false) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(withKey && key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
  return res.json();
}

async function rewrite(body: Record<string, unknown>, btn: HTMLButtonElement, label: string) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label; note('');
  try {
    let r = await post('/v1/rewrite', body, true);
    if (r.error?.code === 'try_limit' && !key) {
      const k = await post('/v1/keys', {});
      if (k.key) { key = k.key; chrome.storage.local.set({ key }); r = await post('/v1/rewrite', body, true); }
    }
    if (r.error) return note(r.error.code === 'key_daily_cap' || r.error.code === 'try_limit' ? 'You have used today\'s free fixes. They come back tomorrow.' : r.error.message, true);
    return r;
  } catch {
    note('That did not go through. Check your connection and try again.', true);
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

$('fix').addEventListener('click', async (e) => {
  if (!text.value.trim()) return;
  const r = await rewrite({ text: text.value }, e.currentTarget as HTMLButtonElement, 'Fixing');
  if (!r) return;
  const n = r.changes.length;
  if (!n) return note('Nothing needed changing.');
  text.value = r.text; check();
  note(`${n === 1 ? '1 sentence' : `${n} sentences`} changed. Copy it from the box above.${r.suggestions?.length ? ' Fill in the parts in [square brackets].' : ''}`);
});

$('voicebtn').addEventListener('click', async (e) => {
  if (!voice) { $('voice').hidden = false; samples.focus(); return; }
  if (!text.value.trim()) return;
  const r = await rewrite({ text: text.value, voice, polish: true }, e.currentTarget as HTMLButtonElement, 'Rewriting');
  if (!r) return;
  if (r.kept || r.text === text.value) return note('Left it as it was: the rewrite could not keep every fact.');
  text.value = r.text; check();
  note(r.voice ? `Rewritten in your style. Style match ${r.voice.before.score} to ${r.voice.after.score} out of 100.` : 'Rewritten in your style.');
});

samples.addEventListener('input', () => { const w = words(samples.value); $('wc').textContent = w >= 600 ? `${w} words, enough` : `${w} of 600 words`; });
$('learn').addEventListener('click', async (e) => {
  const parts = samples.value.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 5 || words(samples.value) < 600) return note('Add a little more: at least five pieces and about 600 words.', true, 'voicenote');
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  try {
    const r = await post('/v1/voice', { samples: parts });
    if (r.error) return note(r.error.message, true, 'voicenote');
    voice = r; chrome.storage.local.set({ voice: r });
    samples.value = ''; $('voice').hidden = true; $('saved').hidden = false;
    note('Style learned. Press Sound like me to rewrite the box above in it.');
  } catch {
    note('Could not reach tells. Try again in a moment.', true, 'voicenote');
  } finally { btn.disabled = false; }
});
$('forget').addEventListener('click', () => { voice = null; chrome.storage.local.remove('voice'); $('saved').hidden = true; note('Your style is forgotten.'); });

$('here').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    note('tells is on for this page until you reload it. Click into a text box and start typing.');
  } catch {
    note('Chrome does not let extensions run on this page.', true);
  }
});
