import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
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
    assert.equal((await post(`${s.url}/v1/rewrite`, { text: 'We leverage it.' })).status, 401);
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
