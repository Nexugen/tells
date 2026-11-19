import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, configFromEnv } from '../src/server/index.ts';
import { Store } from '../src/server/store.ts';
import { Stats, referrerDomain, deviceClass, utmSource, summary } from '../src/server/stats.ts';
import { fromFunction } from '../src/model.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const VOICE_SAMPLES = Array.from({ length: 30 }, (_, i) => `ok so build ${i} went out on Tuesday after the call with Dana, it took two tries and the cache was the problem again. I fixed it by hand, then wrote it down so the next person does not lose an hour like I did.`);
const SECRET = 'my secret draft about the merger with Initech';

function setup(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tells-stats-test-'));
  const cfg = { ...configFromEnv({ TELLS_DATA_DIR: dir, TELLS_TRUST_PROXY: '1', TELLS_STATS_TOKEN: 'tok_test_123', ...env }), port: 0 };
  const model = fromFunction('fake', async (req) => {
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    return { text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: 'The sync runs every five minutes.' })) }), costUsd: 0.001 };
  });
  const stats = new Stats(join(dir, 'stats'));
  const server = createApp(cfg, { model, store: new Store(dir), stats });
  return new Promise<{ url: string; dir: string; stats: Stats; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, dir, stats, close: () => { stats.close(); server.close(); } }));
  });
}

const visit = (url: string, path: string, h: Record<string, string> = {}) => fetch(`${url}${path}`, { headers: { 'user-agent': UA, 'x-real-ip': '203.0.113.7', ...h } });

test('helpers: referrer domain only, device class, utm_source', () => {
  assert.equal(referrerDomain(undefined, 'tells.nexugen.app'), 'direct');
  assert.equal(referrerDomain('https://www.linkedin.com/feed/update/urn:li:activity:1?x=1', 'tells.nexugen.app'), 'linkedin.com');
  assert.equal(referrerDomain('https://lnkd.in/abc', 'tells.nexugen.app'), 'lnkd.in');
  assert.equal(referrerDomain('https://t.co/xyz', 'tells.nexugen.app'), 'x.com');
  assert.equal(referrerDomain('https://www.google.co.uk/', 'tells.nexugen.app'), 'google');
  assert.equal(referrerDomain('https://news.ycombinator.com/item?id=1', 'tells.nexugen.app'), 'news.ycombinator.com');
  assert.equal(referrerDomain('https://tells.nexugen.app/developers', 'tells.nexugen.app'), 'internal');
  assert.equal(deviceClass(PHONE), 'mobile');
  assert.equal(deviceClass(UA), 'desktop');
  assert.equal(utmSource('utm_source=LinkedIn&utm_medium=post'), 'linkedin');
  assert.equal(utmSource('utm_source=' + encodeURIComponent('<script>')), 'other');
  assert.equal(utmSource('q=1'), undefined);
});

test('counters: views, daily visitors, referrers, checks, fixes, voice, MCP, share, install', async () => {
  const s = await setup();
  try {
    await visit(s.url, '/?utm_source=linkedin', { referer: 'https://www.linkedin.com/feed/' });
    await visit(s.url, '/developers', { referer: 'https://tells.nexugen.app/' });
    await visit(s.url, '/privacy');
    await visit(s.url, '/', { 'user-agent': PHONE, 'x-real-ip': '198.51.100.2', referer: 'https://t.co/abc' });
    await visit(s.url, '/', { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
    await visit(s.url, '/', { 'sec-fetch-dest': 'empty' }); // the service worker filling its cache
    await fetch(`${s.url}/`, { method: 'HEAD', headers: { 'user-agent': UA } });
    const post = (path: string, body: unknown, h: Record<string, string> = {}) => fetch(`${s.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });
    await post('/v1/lint', { text: SECRET }, { origin: 'https://tells.nexugen.app' });
    await post('/v1/lint', { text: SECRET });
    assert.equal((await post('/v1/rewrite', { text: 'We leverage it.' })).status, 200);
    await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_text', arguments: { text: SECRET } } });
    assert.equal((await post('/v1/voice', { samples: VOICE_SAMPLES })).status, 200);
    await post('/v1/event', { event: 'pwa_install' });
    assert.equal((await post('/v1/event', { event: SECRET })).status, 400);
    await fetch(`${s.url}/share`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ text: SECRET }) });

    const r = await (await fetch(`${s.url}/stats.json`, { headers: { authorization: 'Bearer tok_test_123' } })).json();
    const t = r.today;
    assert.equal(t.pageViews, 4);
    assert.equal(t.visitors, 2);
    assert.deepEqual(t.pages, { '/': 2, '/developers': 1, '/privacy': 1 });
    assert.equal(t.referrers['linkedin.com'], 1);
    assert.equal(t.referrers['x.com'], 1);
    assert.equal(t.referrers.internal, 1);
    assert.equal(t.referrers.direct, 1);
    assert.deepEqual(t.utmSources, { linkedin: 1 });
    assert.deepEqual(t.devices, { desktop: 1, mobile: 1 });
    assert.equal(t.bots, 1);
    assert.equal(t.checks.site, 1);
    assert.equal(t.checks.api, 1);
    assert.equal(t.checks.mcp, 1);
    assert.equal(t.fixes.ok.api, 1);
    assert.equal(t.mcp.tools.check_text, 1);
    assert.equal(t.mcp.connects, 1);
    assert.equal(t.voice.builds, 1);
    assert.equal(t.pwaInstalls, 1);
    assert.equal(t.shareTarget, 1);
    assert.equal(r.todayByHour.views.reduce((a: number, b: number) => a + b, 0), 4);

    // Rate limited fixes are counted as failures, not fixes.
    await post('/v1/rewrite', { text: 'We leverage it.' });
    await post('/v1/rewrite', { text: 'We leverage it.' });
    await post('/v1/rewrite', { text: 'We leverage it.' });
    const r2 = await (await fetch(`${s.url}/stats.json?token=tok_test_123`)).json();
    assert.equal(r2.today.fixes.ok.api, 3);
    assert.equal(r2.today.fixes.rateLimited, 1);
  } finally {
    s.close();
  }
});

test('no text, address, user agent or full URL is stored', async () => {
  const s = await setup();
  try {
    await visit(s.url, '/?utm_source=x&secret=' + encodeURIComponent(SECRET), { referer: 'https://www.reddit.com/r/writing/comments/abc/my_post?share=1' });
    await fetch(`${s.url}/v1/lint`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-real-ip': '203.0.113.7' }, body: JSON.stringify({ text: SECRET }) });
    s.stats.flush();
    const files = readdirSync(join(s.dir, 'stats'));
    assert.equal(files.length, 1);
    assert.match(files[0], /^\d{4}-\d{2}-\d{2}\.json$/);
    const raw = readFileSync(join(s.dir, 'stats', files[0]), 'utf8');
    for (const bad of ['merger', 'Initech', '203.0.113', 'Mozilla', 'Chrome', 'r/writing', 'secret', 'share=1', s.stats.saltForTest()]) assert.ok(!raw.includes(bad), `stored ${bad}`);
    assert.equal(JSON.parse(raw).referrers['reddit.com'], 1);
  } finally {
    s.close();
  }
});

test('the salt changes every UTC day, so the same visitor counts again and cannot be linked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tells-stats-salt-'));
  let now = new Date('2026-11-19T23:59:00Z');
  const st = new Stats(dir, { now: () => now });
  try {
    const v = { path: '/', query: '', ip: '203.0.113.7', ua: UA };
    const salt1 = st.saltForTest();
    st.view(v);
    st.view(v);
    assert.equal(st.days(1)[0].visitors, 1);
    now = new Date('2026-11-20T00:01:00Z');
    const salt2 = st.saltForTest();
    assert.notEqual(salt1, salt2);
    st.view(v);
    const [today, yesterday] = st.days(2);
    assert.equal(today.date, '2026-11-20');
    assert.equal(today.visitors, 1);
    assert.equal(yesterday.visitors, 1);
    assert.equal(yesterday.views['/'], 2);
    assert.equal(summary([today, yesterday]).visitors, 2);
    st.flush();
    for (const f of readdirSync(dir)) {
      const raw = readFileSync(join(dir, f), 'utf8');
      assert.ok(!raw.includes(salt1) && !raw.includes(salt2));
    }
  } finally {
    st.close();
  }
});

test('/stats and /stats.json reject requests without the right token', async () => {
  const s = await setup();
  try {
    assert.equal((await fetch(`${s.url}/stats`)).status, 401);
    assert.equal((await fetch(`${s.url}/stats.json`)).status, 401);
    assert.equal((await fetch(`${s.url}/stats?token=wrong`)).status, 401);
    assert.equal((await fetch(`${s.url}/stats.json`, { headers: { authorization: 'Bearer tok_test_12' } })).status, 401);
    const ok = await fetch(`${s.url}/stats?token=tok_test_123`);
    assert.equal(ok.status, 200);
    const html = await ok.text();
    assert.ok(html.includes('Today by hour') && html.includes('Last 30 days'));
    assert.ok(!/[—–]/.test(html));
  } finally {
    s.close();
  }
  const closed = await setup({ TELLS_STATS_TOKEN: '' });
  try {
    assert.equal((await fetch(`${closed.url}/stats`)).status, 401);
    assert.equal((await fetch(`${closed.url}/stats?token=`)).status, 401);
  } finally {
    closed.close();
  }
});
