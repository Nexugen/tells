import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, configFromEnv, estimateCostUsd } from '../src/server/index.ts';
import { Store } from '../src/server/store.ts';
import { fromFunction } from '../src/model.ts';

function setup(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tells-api-test-'));
  const cfg = { ...configFromEnv({ TELLS_DATA_DIR: dir, ...env }), port: 0 };
  let calls = 0;
  const model = fromFunction('fake', async (req) => {
    calls++;
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    return { text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: 'The sync runs every five minutes.' })) }), costUsd: 0.001 };
  });
  const store = new Store(dir);
  const server = createApp(cfg, { model, store });
  return new Promise<{ url: string; close: () => void; calls: () => number }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close(), calls: () => calls });
    });
  });
}

const post = (url: string, body: unknown, key?: string) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });

test('lint is free and needs no key', async () => {
  const s = await setup();
  try {
    const res = await post(`${s.url}/v1/lint`, { text: 'We leverage it — fast.', register: 'casual' });
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.deepEqual(j.findings.map((f: { ruleId: string }) => f.ruleId), ['ai-vocabulary', 'dash']);
    assert.equal((await post(`${s.url}/v1/lint`, { text: 'x', register: 'pirate' })).status, 400);
    assert.equal((await post(`${s.url}/v1/lint`, {})).status, 400);
    assert.equal((await fetch(`${s.url}/v1/rules`)).status, 200);
    assert.equal((await fetch(`${s.url}/nope`)).status, 404);
  } finally {
    s.close();
  }
});

test('rewrite needs a key, then stops at the per-key daily cap', async () => {
  const s = await setup({ TELLS_KEY_DAILY_REWRITES: '2' });
  try {
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' }, 'tells_fake')).status, 401);
    const { key } = await (await post(`${s.url}/v1/keys`, {})).json();
    assert.match(key, /^tells_[0-9a-f]{40}$/);
    const ok = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' }, key);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).text, 'The sync runs every five minutes.');
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' }, key)).status, 200);
    const capped = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' }, key);
    assert.equal(capped.status, 429);
    assert.equal((await capped.json()).error.code, 'key_daily_cap');
    const usage = await (await fetch(`${s.url}/v1/usage`, { headers: { authorization: `Bearer ${key}` } })).json();
    assert.equal(usage.remaining, 0);
  } finally {
    s.close();
  }
});

test('clean text costs nothing and does not use up a rewrite', async () => {
  const s = await setup({ TELLS_KEY_DAILY_REWRITES: '1' });
  try {
    const { key } = await (await post(`${s.url}/v1/keys`, {})).json();
    for (let i = 0; i < 3; i++) assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'The cache keeps pages for five minutes.' }, key)).status, 200);
    assert.equal(s.calls(), 0);
  } finally {
    s.close();
  }
});

test('the global spend cap stops rewrites before the model is called', async () => {
  const s = await setup({ TELLS_DAILY_SPEND_USD: String(estimateCostUsd(20, 'claude-haiku-5-5')) });
  try {
    const { key } = await (await post(`${s.url}/v1/keys`, {})).json();
    const res = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' }, key);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'global_daily_cap');
    assert.equal(s.calls(), 0);
  } finally {
    s.close();
  }
});

test('a few free tries per address without a key', async () => {
  const s = await setup({ TELLS_ANON_REWRITES_PER_IP: '2' });
  try {
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' })).status, 200);
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' })).status, 200);
    const third = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' });
    assert.equal(third.status, 429);
    assert.equal((await third.json()).error.code, 'try_limit');
  } finally {
    s.close();
  }
});

test('rewrite waits when the shared account is busy, and stops at the daily call cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tells-usage-'));
  const usage = join(dir, 'usage.json');
  writeFileSync(usage, JSON.stringify({ claude: { pct: 90 } }));
  const s = await setup({ TELLS_USAGE_FILE: usage, TELLS_USAGE_MAX_PCT: '85', TELLS_DAILY_CALLS: '2' });
  try {
    const busy = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' });
    assert.equal(busy.status, 503);
    assert.equal((await busy.json()).error.code, 'busy');
    assert.equal(s.calls(), 0);
    writeFileSync(usage, JSON.stringify({ claude: { pct: 40 } }));
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' })).status, 200);
    const capped = await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' });
    assert.equal(capped.status, 503);
    assert.equal((await capped.json()).error.code, 'global_daily_cap');
  } finally {
    s.close();
  }
});

test('keys per address per day, text length, and the kill switch', async () => {
  const s = await setup({ TELLS_KEYS_PER_IP_PER_DAY: '1', TELLS_REWRITE_MAX_CHARS: '10' });
  try {
    const { key } = await (await post(`${s.url}/v1/keys`, {})).json();
    assert.equal((await post(`${s.url}/v1/keys`, {})).status, 429);
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage this a lot.' }, key)).status, 413);
  } finally {
    s.close();
  }
  const off = await setup({ TELLS_REWRITE_OFF: '1' });
  try {
    assert.equal((await post(`${off.url}/v1/rewrite`, { text: 'We leverage it.' }, 'x')).status, 503);
    assert.equal((await post(`${off.url}/v1/lint`, { text: 'We leverage it.' })).status, 200);
  } finally {
    off.close();
  }
});

test('the root serves the page, the JSON index moved to /v1, and lint returns human signals', async () => {
  const s = await setup();
  try {
    const page = await fetch(`${s.url}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
    const html = await page.text();
    assert.match(html, /\/v1\/lint/);
    assert.ok(!/[—–]/.test(html), 'no dashes on the page');
    const index = await fetch(`${s.url}/v1`);
    assert.match(index.headers.get('content-type') ?? '', /json/);
    const lint = await (await post(`${s.url}/v1/lint`, { text: "I moved the cron to 02:10 on Tuesday (twice, actually)." })).json();
    assert.ok(lint.human.present.length > 0);
  } finally {
    s.close();
  }
});

test('the badge is a cached SVG, and the page shows it with copyable snippets', async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.url}/badge.svg`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^image\/svg\+xml/);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
    const svg = await res.text();
    assert.match(svg, /^<svg /);
    assert.ok(svg.includes('linted with') && svg.includes('>tells<'));
    const page = await (await fetch(`${s.url}/`)).text();
    assert.ok(page.includes('<img src="/badge.svg"'));
    assert.ok(page.includes('[![Linted with tells](https://tells.nexugen.app/badge.svg)](https://tells.nexugen.app)'));
    assert.ok(page.includes('&lt;img src=&quot;https://tells.nexugen.app/badge.svg&quot;'));
    assert.ok(page.includes('tells is open source, made by <a href="https://nexugen.app">Nexugen</a>'));
  } finally {
    s.close();
  }
});

// A synthetic writer for the voice endpoints.
const VOICE_SAMPLES = Array.from({ length: 30 }, (_, i) =>
  `okay so sample ${i + 1} is here. the build finished but the logo is still wrong, can you fix that? i think its the old file. maybe check the cache too`);

test('voice: built from samples, nothing stored, usable for match and rewrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tells-api-voice-'));
  const cfg = { ...configFromEnv({ TELLS_DATA_DIR: dir }), port: 0 };
  const store = new Store(dir);
  const prompts: string[] = [];
  const model = fromFunction('fake', async (req) => {
    prompts.push(req.prompt);
    const p = JSON.parse(req.prompt) as { draft?: string };
    return { text: JSON.stringify({ text: (p.draft ?? '').replace('We are pleased to share that the', 'okay the') }), costUsd: 0.001 };
  });
  const server = createApp(cfg, { model, store });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const built = await post(`${url}/v1/voice`, { samples: VOICE_SAMPLES });
    assert.equal(built.status, 200);
    const voice = await built.json();
    assert.equal(voice.format, 'tells-voice');
    store.flush();
    const { readdirSync, readFileSync } = await import('node:fs');
    for (const f of readdirSync(dir)) assert.ok(!readFileSync(join(dir, f), 'utf8').includes('the logo is still wrong'), 'samples must not be stored');

    assert.equal((await post(`${url}/v1/voice`, { samples: ['too short'] })).status, 400);
    const m = await post(`${url}/v1/voice/match`, { text: 'okay the logo is fixed now. can you check the cache? i think its fine', voice });
    assert.equal(m.status, 200);
    assert.ok(typeof (await m.json()).score === 'number');
    assert.equal((await post(`${url}/v1/voice/match`, { text: 'hi', voice: { format: 'nope' } })).status, 400);

    const draft = 'We are pleased to share that the new export is live. It handles 3 formats.';
    const rw = await post(`${url}/v1/rewrite`, { text: draft, voice, polish: true });
    assert.equal(rw.status, 200);
    const j = await rw.json();
    assert.equal(j.text, 'okay the new export is live. It handles 3 formats.');
    assert.ok(j.voice && typeof j.voice.after.score === 'number');
    assert.equal(JSON.parse(prompts[0]).draft, draft);
  } finally {
    server.close();
  }
});

test('use-case pages are served, titled, indexable and listed in the sitemap', async () => {
  const { USE_CASES } = await import('../src/server/use-cases.ts');
  const s = await setup();
  try {
    const sitemap = await fetch(`${s.url}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get('content-type') ?? '', /xml/);
    const map = await sitemap.text();
    assert.ok(map.includes('<loc>https://tells.nexugen.app/</loc>'));
    const robots = await (await fetch(`${s.url}/robots.txt`)).text();
    assert.match(robots, /Sitemap: https:\/\/tells\.nexugen\.app\/sitemap\.xml/);
    const home = await (await fetch(`${s.url}/`)).text();
    assert.equal(USE_CASES.length, 7);
    for (const u of USE_CASES) {
      const res = await fetch(`${s.url}${u.path}`);
      assert.equal(res.status, 200, u.path);
      const html = await res.text();
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      assert.ok(title.length > 10 && title.includes(u.h1.replace(/'/g, '&#39;')), `${u.path} title: ${title}`);
      assert.ok(html.includes(`<link rel="canonical" href="https://tells.nexugen.app${u.path}">`), u.path);
      assert.ok(html.includes('og:title') && html.includes('application/ld+json') && html.includes('meta name="description"'), u.path);
      assert.ok(html.includes('id="text"') && html.includes('id="samples"') && html.includes('/v1/lint'), `${u.path} has the checker`);
      assert.ok(!html.includes('—'), `${u.path} has no em dash`);
      assert.ok(map.includes(`<loc>https://tells.nexugen.app${u.path}</loc>`), `${u.path} in sitemap`);
      assert.ok(home.includes(`href="${u.path}"`), `${u.path} linked from home`);
    }
    const slash = await fetch(`${s.url}/essay/`, { redirect: 'manual' });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), '/essay');
    assert.equal((await fetch(`${s.url}/essay`, { method: 'HEAD' })).status, 200);
  } finally {
    s.close();
  }
});

test('use-case page copy passes tells, and each listed habit fires on that page\'s sample', async () => {
  const { USE_CASES, useCaseCopy } = await import('../src/server/use-cases.ts');
  const { lint } = await import('../src/lint.ts');
  for (const u of USE_CASES) {
    const copy = useCaseCopy(u);
    assert.ok(!/—/.test(copy), u.path);
    for (const register of ['auto', u.register] as const) {
      const bad = lint(copy, { register }).findings.filter((f) => f.severity !== 'info');
      assert.deepEqual(bad.map((f) => `${f.ruleId}: ${copy.slice(f.start, f.end)}`), [], `${u.path} copy (${register})`);
    }
    assert.ok(u.habits.length >= 4 && u.habits.length <= 6, u.path);
    const sample = lint(u.sample, { register: u.register });
    assert.ok(sample.findings.length >= 3, `${u.path} sample shows findings`);
  }
});
