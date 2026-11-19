import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createApp, configFromEnv } from '../src/server/index.ts';
import { Store } from '../src/server/store.ts';
import { fromFunction } from '../src/model.ts';
import { lint } from '../src/lint.ts';
import { homeCopy } from '../src/server/home.ts';
import { privacyCopy } from '../src/server/privacy-page.ts';
import { CHROME_STORE_URL } from '../src/server/page.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'tells-pages-test-'));
  const cfg = { ...configFromEnv({ TELLS_DATA_DIR: dir }), port: 0 };
  const model = fromFunction('fake', async (req) => {
    const { sentences } = JSON.parse(req.prompt) as { sentences: { id: number }[] };
    return { text: JSON.stringify({ edits: sentences.map((s) => ({ id: s.id, text: 'The sync runs every five minutes.' })) }), costUsd: 0.001 };
  });
  const server = createApp(cfg, { model, store: new Store(dir) });
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() }));
  });
}

/** What a reader sees: tags, scripts, styles and code blocks removed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<code>[\s\S]*?<\/code>/g, 'it')
    .replace(/<table[\s\S]*?<\/table>/g, '')
    .replace(/<(p|h1|h2|h3|li|div|section|footer|header|ol|ul|nav|tr|span class="phr")[^>]*>/g, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&times;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

const strong = (copy: string, register: 'auto' | 'professional' | 'technical' = 'auto') =>
  lint(copy, { register }).findings.filter((f) => f.severity !== 'info').map((f) => `${f.ruleId}: ${copy.slice(f.start, f.end)}`);

const rpc = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });

test('home: plain first screen, links out, copy passes tells, no Chrome spot until a store URL is set', async () => {
  const s = await setup();
  try {
    const html = await (await fetch(`${s.url}/`)).text();
    const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf('<section class="result"'));
    const heroText = visibleText(hero);
    assert.match(heroText, /Does it sound like AI\?/);
    for (const jargon of [/\bregister\b/i, /\bAPI\b/, /\bCLI\b/, /\bnpm\b/, /\bkey\b/i, /benchmark/i, /\bCI\b/, /ruleId|rule id/i]) assert.ok(!jargon.test(heroText), `first screen mentions ${jargon}`);
    assert.ok(html.includes('id="text"') && html.includes('id="check"') && html.includes('id="fix"') && html.includes('id="samples"'));
    for (const path of ['/cover-letter', '/linkedin-post', '/cold-email', '/essay', '/email', '/resume', '/bio', '/models', '/developers', '/privacy']) assert.ok(html.includes(`href="${path}`), `links ${path}`);
    assert.ok(html.includes('by the Nexugen team') && html.includes('Why we built it') && html.includes('From the team behind'));
    assert.ok(!/[—–]/.test(html), 'no dashes');
    assert.ok(!/linter/i.test(visibleText(html)), 'tells is not called a linter');
    if (!CHROME_STORE_URL) assert.ok(!html.includes('Add to Chrome'));
    assert.deepEqual(strong(homeCopy()), []);
    assert.deepEqual(strong(homeCopy(), 'professional'), []);
    assert.deepEqual(strong(visibleText(html)), [], 'everything a reader sees on the home page');
  } finally {
    s.close();
  }
});

test('/developers holds the developer material, keeps the anchors, and its prose passes tells', async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.url}/developers`);
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const id of ['install', 'ci', 'assistants', 'api', 'keys', 'voice', 'benchmark', 'badge', 'rules']) assert.ok(html.includes(`id="${id}"`), `#${id}`);
    assert.ok(html.includes('npm i @nexugen/tells') && html.includes('https://tells.nexugen.app/mcp') && html.includes('/openapi.json'));
    assert.ok(html.includes('<link rel="canonical" href="https://tells.nexugen.app/developers">'));
    assert.ok(!/[—–]/.test(html));
    assert.ok(!/linter/i.test(visibleText(html)));
    assert.deepEqual(strong(visibleText(html), 'technical'), []);
    // The home page sends the old anchors here.
    const home = await (await fetch(`${s.url}/`)).text();
    assert.ok(home.includes("location.replace('/developers' + location.hash)"));
    assert.ok((await (await fetch(`${s.url}/sitemap.xml`)).text()).includes('/developers</loc>'));
  } finally {
    s.close();
  }
});

test('/privacy covers the site, API, connectors and extension, and passes tells', async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.url}/privacy`);
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const w of ['extension', 'API', 'Anthropic', 'hash', 'local storage', 'Claude and ChatGPT']) assert.ok(html.includes(w), w);
    assert.ok(!/[—–]/.test(html));
    assert.deepEqual(strong(privacyCopy()), []);
    assert.deepEqual(strong(privacyCopy(), 'professional'), []);
  } finally {
    s.close();
  }
});

test('installable: manifest, icons, service worker, and the CSP allows them', async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.url}/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /manifest\+json/);
    const m = await res.json();
    assert.equal(m.display, 'standalone');
    assert.equal(m.start_url.split('?')[0], '/');
    assert.ok(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable'));
    for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
      const r = await fetch(`${s.url}${icon.src}`);
      assert.equal(r.status, 200, icon.src);
      assert.equal(r.headers.get('content-type'), icon.type, icon.src);
      if (icon.type === 'image/png') {
        const b = Buffer.from(await r.arrayBuffer());
        const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
        assert.equal(`${w}x${h}`, icon.sizes, icon.src);
      }
    }
    const apple = await fetch(`${s.url}/icons/apple-touch-icon.png`);
    assert.equal(apple.status, 200);
    assert.equal(Buffer.from(await apple.arrayBuffer()).readUInt32BE(16), 180);
    const sw = await fetch(`${s.url}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type') ?? '', /javascript/);
    assert.match(await sw.text(), /addEventListener\('fetch'/);
    const home = await fetch(`${s.url}/`);
    const csp = home.headers.get('content-security-policy') ?? '';
    assert.match(csp, /manifest-src 'self'/);
    assert.match(csp, /worker-src 'self'/);
    const html = await home.text();
    assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest">') && html.includes('apple-touch-icon') && html.includes('apple-mobile-web-app-capable'));
    assert.ok(html.includes("navigator.serviceWorker.register('/sw.js')"));
  } finally {
    s.close();
  }
});

test('share target: text shared from another app lands in the box', async () => {
  const s = await setup();
  try {
    const m = await (await fetch(`${s.url}/manifest.webmanifest`)).json();
    assert.equal(m.share_target.action, '/share');
    assert.equal(m.share_target.method, 'POST');
    assert.equal(m.share_target.params.text, 'text');
    const res = await fetch(`${s.url}/share`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ title: '', text: 'Great question! We leverage <b>robust</b> tools.' }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.ok(html.includes('Great question! We leverage &lt;b&gt;robust&lt;/b&gt; tools.</textarea>'));
    const get = await fetch(`${s.url}/share?text=hello`);
    assert.equal(get.status, 200);
    assert.ok((await get.text()).includes('id="text"'));
  } finally {
    s.close();
  }
});

test('openapi.json describes the public API for GPT actions', async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.url}/openapi.json`);
    assert.equal(res.status, 200);
    const o = await res.json();
    assert.equal(o.openapi, '3.1.0');
    assert.equal(o.servers[0].url, 'https://tells.nexugen.app');
    const ops = Object.values(o.paths as Record<string, Record<string, { operationId: string }>>).flatMap((p) => Object.values(p).map((x) => x.operationId));
    assert.deepEqual(ops.sort(), ['buildVoice', 'checkText', 'fixText', 'getFreeKey', 'listRules']);
    const gpt = readFileSync(new URL('../connectors/chatgpt-gpt.md', import.meta.url), 'utf8');
    assert.ok(gpt.includes('https://tells.nexugen.app/openapi.json') && gpt.includes('https://tells.nexugen.app/privacy'));
    assert.ok(!/—/.test(gpt));
  } finally {
    s.close();
  }
});

test('MCP over HTTP: initialize, list, check, fix, voice, notifications and wrong methods', async () => {
  const s = await setup();
  try {
    const init = await rpc(s.url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.equal(init.status, 200);
    const ij = await init.json();
    assert.equal(ij.result.protocolVersion, '2025-06-18');
    assert.equal(ij.result.serverInfo.name, 'tells');
    assert.ok(ij.result.capabilities.tools);
    assert.equal((await rpc(s.url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const tools = (await (await rpc(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools as { name: string; inputSchema: { type: string } }[];
    assert.deepEqual(tools.map((t) => t.name), ['check_text', 'fix_text', 'build_voice']);
    for (const t of tools) assert.equal(t.inputSchema.type, 'object');

    const check = (await (await rpc(s.url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_text', arguments: { text: 'Great question! We leverage robust tools to seamlessly streamline everything. Hope this helps!' } } })).json()).result;
    assert.ok(!check.isError);
    const f = check.structuredContent.findings as { phrase: string; start: number; end: number; why: string; suggestion: string }[];
    assert.ok(f.length >= 3);
    assert.ok(f.every((x) => x.why && x.suggestion && x.end > x.start));
    assert.ok(f.some((x) => x.phrase === 'Great question'));
    assert.match(check.content[0].text, /give this away/);

    const fix = (await (await rpc(s.url, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fix_text', arguments: { text: 'We leverage it.' } } })).json()).result;
    assert.ok(!fix.isError, JSON.stringify(fix));
    assert.equal(fix.structuredContent.text, 'The sync runs every five minutes.');

    const samples = Array.from({ length: 30 }, (_, i) => `okay so sample ${i + 1} is here. the build finished but the logo is still wrong, can you fix that? i think its the old file. maybe check the cache too`);
    const voice = (await (await rpc(s.url, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'build_voice', arguments: { samples } } })).json()).result;
    assert.equal(voice.structuredContent.voice.format, 'tells-voice');
    const few = (await (await rpc(s.url, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'build_voice', arguments: { samples: ['too short'] } } })).json()).result;
    assert.equal(few.isError, true);

    const bad = await (await rpc(s.url, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope', arguments: {} } })).json();
    assert.equal(bad.error.code, -32602);
    assert.equal((await (await rpc(s.url, { jsonrpc: '2.0', id: 8, method: 'nope' })).json()).error.code, -32601);
    assert.equal((await fetch(`${s.url}/mcp`)).status, 405);
    const batch = await (await rpc(s.url, [{ jsonrpc: '2.0', id: 9, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }])).json();
    assert.deepEqual(batch, [{ jsonrpc: '2.0', id: 9, result: {} }]);
  } finally {
    s.close();
  }
});

test('MCP over stdio: tells mcp answers initialize, tools/list and check_text', async () => {
  const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', new URL('../src/cli.ts', import.meta.url).pathname, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines: string[] = [];
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_text', arguments: { text: 'Great question! Hope this helps!' } } });
  const deadline = Date.now() + 15_000;
  while (lines.length < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  child.stdin.end();
  child.kill();
  const byId = new Map(lines.map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.equal(byId.get(1).result.protocolVersion, '2025-11-25');
  assert.equal(byId.get(2).result.tools.length, 3);
  assert.ok(byId.get(3).result.structuredContent.findings.length >= 2);
  assert.equal(lines.length, 3, 'a notification gets no reply');
});

test('extension: builds, minimal permissions, no network for checking', () => {
  const root = new URL('../extension/', import.meta.url).pathname;
  execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe' });
  const m = JSON.parse(readFileSync(join(root, 'build', 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions.sort(), ['activeTab', 'scripting', 'storage']);
  assert.deepEqual(m.host_permissions, ['https://tells.nexugen.app/*']);
  assert.ok(!m.content_scripts[0].matches.some((x: string) => x.includes('<all_urls>') || x.includes('127.0.0.1') || x.includes('docs.google.com')));
  const content = readFileSync(join(root, 'build', 'content.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(content), 'the content script never talks to the network');
  const listing = readFileSync(join(root, 'store', 'listing.md'), 'utf8');
  assert.ok(listing.includes('Google Docs') && listing.includes('https://tells.nexugen.app/privacy'));
  assert.ok(!/—/.test(listing));
});
