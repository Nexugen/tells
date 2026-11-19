// /stats: the private dashboard. Plain HTML, no scripts, no outside requests.
import { esc } from './page.ts';
import { statsJson } from './stats.ts';

type Report = ReturnType<typeof statsJson>;
type Period = Report['today'];

const n = (x: number) => x.toLocaleString('en-US');

function top(rec: Record<string, number>, limit = 12): string {
  const rows = Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!rows.length) return '<p class="muted">None yet.</p>';
  return `<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${n(v)}</td></tr>`).join('')}</table>`;
}

function card(title: string, p: Period): string {
  const f = p.fixes;
  const row = (label: string, v: number | string) => `<tr><td>${esc(label)}</td><td class="num">${typeof v === 'number' ? n(v) : esc(v)}</td></tr>`;
  return `<section class="card">
<h2>${esc(title)}</h2>
<p class="range">${esc(p.from === p.to ? p.from : `${p.from} to ${p.to}`)}</p>
<div class="big"><div><b>${n(p.visitors)}</b><span>visitors</span></div><div><b>${n(p.pageViews)}</b><span>page views</span></div><div><b>${n(p.checks.total)}</b><span>checks</span></div><div><b>${n(f.total)}</b><span>fixes</span></div></div>
<table>
${row('Checks on the site', p.checks.site)}
${row('Checks through the API', p.checks.api)}
${row('Checks through MCP', p.checks.mcp)}
${row('Fixes: site / API / MCP / extension', `${f.ok.site} / ${f.ok.api} / ${f.ok.mcp} / ${f.ok.extension}`)}
${row('Fixes refused: busy or daily cap', f.busy)}
${row('Fixes refused: rate limited', f.rateLimited)}
${row('Fixes failed: other', f.otherFailed)}
${row('Voice profiles built', p.voice.builds)}
${row('Rewrites in a voice', p.voice.rewrites)}
${row('Style matches', p.voice.matches)}
${row('MCP connects', p.mcp.connects)}
${row('MCP tool calls', Object.entries(p.mcp.tools).map(([k, v]) => `${k} ${v}`).join(', ') || '0')}
${row('Shared to tells from a phone', p.shareTarget)}
${row('Added to home screen', p.pwaInstalls)}
${row('Opened from home screen', p.appOpens)}
${row('Free keys issued', p.keysIssued)}
${row('Devices', Object.entries(p.devices).map(([k, v]) => `${k} ${v}`).join(', ') || '0')}
${row('Crawler and script requests (not counted above)', p.bots)}
</table>
<h3>Referrers</h3>${top(p.referrers)}
<h3>utm_source</h3>${top(p.utmSources)}
<h3>Pages</h3>${top(p.pages)}
${Object.keys(f.failuresByCode).length ? `<h3>Fix failures by code</h3>${top(f.failuresByCode)}` : ''}
</section>`;
}

function hourChart(h: Report['todayByHour']): string {
  const max = Math.max(1, ...h.views, ...h.checks);
  const W = 24 * 26, H = 140;
  const bars = h.views.map((v, i) => {
    const vh = Math.round((v / max) * (H - 20));
    const ch = Math.round((h.checks[i] / max) * (H - 20));
    const x = i * 26 + 3;
    return `<rect x="${x}" y="${H - 16 - vh}" width="10" height="${vh}" class="v"><title>${i}:00 UTC, ${v} views, ${h.visitors[i]} new visitors</title></rect>`
      + `<rect x="${x + 11}" y="${H - 16 - ch}" width="10" height="${ch}" class="c"><title>${i}:00 UTC, ${h.checks[i]} checks, ${h.fixes[i]} fixes</title></rect>`
      + (i % 3 === 0 ? `<text x="${x}" y="${H - 2}">${i}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Page views and checks per hour today, UTC">${bars}</svg>
<p class="legend"><i class="v"></i> page views <i class="c"></i> checks, per UTC hour. Highest bar: ${n(max)}.</p>`;
}

export function statsPage(r: Report): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>tells stats</title>
<style>
:root { --bg: #fafaf8; --fg: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --card: #fff; --v: #2f6f4f; --c: #c08a2b; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ececea; --muted: #9a9a94; --line: #2c2c2a; --card: #1e1e1d; --v: #6fbf94; --c: #e0b25a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 40px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 0; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 16px 0 4px; }
.muted, .range, .legend { color: var(--muted); font-size: 13px; }
.range { margin: 2px 0 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-top: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px; min-width: 0; }
.big { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.big b { display: block; font-size: 24px; font-variant-numeric: tabular-nums; }
.big span { color: var(--muted); font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td { padding: 3px 0; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
td.num { text-align: right; padding-left: 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
svg { width: 100%; height: auto; display: block; }
svg .v, .legend .v { fill: var(--v); background: var(--v); }
svg .c, .legend .c { fill: var(--c); background: var(--c); }
svg text { fill: var(--muted); font-size: 10px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 2px 0 8px; }
</style>
</head>
<body>
<main>
<h1>tells stats</h1>
<p class="muted">Counts per UTC day, updated ${esc(r.generatedAt.slice(0, 16).replace('T', ' '))} UTC. Visitors over several days are a sum of daily counts, since nobody is followed from one day to the next. JSON: /stats.json with the same token.</p>
<section class="card" style="margin-top:16px"><h2>Today by hour</h2>${hourChart(r.todayByHour)}</section>
<div class="grid">
${card('Today', r.today)}
${card('Yesterday', r.yesterday)}
${card('Last 7 days', r.last7)}
${card('Last 30 days', r.last30)}
</div>
</main>
</body>
</html>`;
}
