// tells for Chrome: underlines the phrases that make writing read as AI-written while you type.
// Everything here runs in the page with no network. Underlines are drawn in an overlay inside a
// shadow root, so the page's own editor, its text and its cursor are never touched.
import { lint } from '../../src/lint.ts';
import { plainRule } from '../../src/plain.ts';
import type { Finding } from '../../src/types.ts';

declare const chrome: any;

type Field = HTMLTextAreaElement | HTMLElement;
interface Mark { f: Finding; rects: DOMRect[]; strong: boolean }

const MAX_CHARS = 20_000;
const DEBOUNCE_MS = 600;

(() => {
  const w = window as unknown as { __tellsLoaded?: boolean };
  if (w.__tellsLoaded) return;
  w.__tellsLoaded = true;

  let enabled = true;
  let active: Field | null = null;
  let marks: Mark[] = [];
  let lastText = '';
  let timer = 0;
  let frame = 0;
  let hoverTimer = 0;
  let hideTimer = 0;
  let shownMark: Mark | null = null;
  const ignored = new Set<string>();
  // Textarea offsets relative to the content box, so scrolling only needs a shift.
  let areaRects: { f: Finding; strong: boolean; rects: { x: number; y: number; w: number; h: number }[] }[] = [];

  try {
    chrome.storage?.local.get({ enabled: true }, (v: { enabled: boolean }) => { enabled = v.enabled; if (!enabled) clear(); });
    chrome.storage?.onChanged.addListener((c: Record<string, { newValue: unknown }>) => {
      if (c.enabled) { enabled = c.enabled.newValue !== false; if (!enabled) clear(); else if (active) schedule(0); }
    });
  } catch { /* storage is optional */ }

  // The overlay.
  const host = document.createElement('tells-overlay');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .u { position: fixed; height: 2px; border-radius: 1px; background: #d92d20; pointer-events: none; }
    .u.hint { background: none; border-bottom: 2px dotted #98a2b3; height: 0; }
    .u.on { box-shadow: 0 0 0 3px rgba(217,45,32,.18); }
    .pill { position: fixed; pointer-events: none; font: 600 11px/1 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #fff; background: #1b1b1a; border-radius: 999px; padding: 4px 8px; opacity: .88; }
    .card { position: fixed; pointer-events: auto; width: 300px; max-width: calc(100vw - 16px); box-sizing: border-box; background: #fff; color: #1b1b1a; border: 1px solid #d9d6cd; border-radius: 12px; box-shadow: 0 10px 30px -12px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.08); padding: 12px 14px; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; opacity: 0; transform: translateY(-3px); transition: opacity .14s, transform .14s; }
    .card.show { opacity: 1; transform: none; }
    .card b { display: block; font-size: 14.5px; margin: 0 0 4px; }
    .card p { margin: 0 0 8px; color: #5f5e58; }
    .card .do { margin: 0; padding: 7px 9px; border-radius: 8px; background: #f2f0ea; color: #1b1b1a; }
    .card .do::before { content: "Try this: "; font-weight: 600; }
    .card .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: #8a8980; }
    .card button { font: inherit; font-size: 12px; background: none; border: 0; color: #5f5e58; text-decoration: underline; cursor: pointer; padding: 4px 0; }
    .brand { font-family: Georgia, serif; font-weight: 600; color: #1b1b1a; border-bottom: 2px solid #d92d20; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1f1f1d; color: #ecebe6; border-color: #3d3c38; }
      .card p, .card button { color: #a9a89f; }
      .card .do { background: #2a2a27; color: #ecebe6; }
      .brand { color: #ecebe6; }
      .pill { background: #ecebe6; color: #131312; }
    }
    @media (prefers-reduced-motion: reduce) { .card { transition: none; } }
  </style><div id="layer"></div><div class="pill" id="pill" hidden></div><div class="card" id="card" role="tooltip" hidden><b id="name"></b><p id="why"></p><p class="do" id="do"></p><div class="foot"><span class="brand">tells</span><button type="button" id="ignore">Ignore this one</button></div></div>`;
  const layer = root.getElementById('layer') as HTMLDivElement;
  const card = root.getElementById('card') as HTMLDivElement;
  const pill = root.getElementById('pill') as HTMLDivElement;
  const attach = () => { if (!host.isConnected) document.documentElement.appendChild(host); };

  // Which fields count: a textarea, or the root of a rich text editor. Never inputs or passwords.
  function fieldFor(el: EventTarget | null): Field | null {
    if (!(el instanceof HTMLElement)) return null;
    if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el;
    if (!el.isContentEditable) return null;
    let top: HTMLElement = el;
    while (top.parentElement && top.parentElement.isContentEditable) top = top.parentElement;
    if (top === document.body || top === document.documentElement) return null;
    return top;
  }

  function textOf(el: Field): { text: string; nodes: { node: Text; start: number }[] } {
    if (el instanceof HTMLTextAreaElement) return { text: el.value, nodes: [] };
    const nodes: { node: Text; start: number }[] = [];
    let text = '';
    let lastBlock: Element | null = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        if (tag === 'BR') text += '\n';
        continue;
      }
      const t = n as Text;
      if (!t.data) continue;
      const block = blockOf(t, el);
      if (lastBlock && block !== lastBlock && !text.endsWith('\n')) text += '\n\n';
      lastBlock = block;
      nodes.push({ node: t, start: text.length });
      text += t.data;
      if (text.length > MAX_CHARS) break;
    }
    return { text, nodes };
  }
  function blockOf(n: Node, stop: Element): Element {
    let e = n.parentElement;
    while (e && e !== stop) {
      const d = getComputedStyle(e).display;
      if (d === 'block' || d === 'list-item' || d === 'flex' || d === 'grid' || d === 'table-row') return e;
      e = e.parentElement;
    }
    return stop;
  }

  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(run, { timeout: 800 }); else run();
    }, delay);
  }

  function pick(findings: Finding[]): Finding[] {
    // One finding per span: the stronger one wins where two overlap.
    const sorted = findings.filter((f) => !ignored.has(`${f.ruleId}:${f.match}`)).sort((a, b) => (a.severity === 'info' ? 1 : 0) - (b.severity === 'info' ? 1 : 0) || a.start - b.start);
    const out: Finding[] = [];
    for (const f of sorted) if (!out.some((o) => f.start < o.end && o.start < f.end)) out.push(f);
    return out.sort((a, b) => a.start - b.start);
  }

  function run() {
    if (!enabled || !active || !active.isConnected) return clear();
    const { text, nodes } = textOf(active);
    if (text.length > MAX_CHARS || !text.trim()) { lastText = text; return clear(); }
    if (text === lastText && marks.length) return position();
    lastText = text;
    const findings = pick(lint(text, { plain: true }).findings);
    if (active instanceof HTMLTextAreaElement) {
      areaRects = measureArea(active, text, findings);
      marks = areaRects.map((a) => ({ f: a.f, strong: a.strong, rects: [] }));
    } else {
      marks = findings.map((f) => ({ f, strong: f.severity !== 'info', rects: [] }));
      ranges = findings.map((f) => rangeFor(nodes, f.start, f.end));
    }
    position();
  }

  let ranges: (Range | null)[] = [];
  function rangeFor(nodes: { node: Text; start: number }[], start: number, end: number): Range | null {
    let a: { node: Text; start: number } | undefined, b: { node: Text; start: number } | undefined;
    for (const n of nodes) {
      if (!a && start < n.start + n.node.data.length) a = n;
      if (end <= n.start + n.node.data.length) { b = n; break; }
    }
    if (!a || !b || !a.node.isConnected || !b.node.isConnected) return null;
    const r = document.createRange();
    try {
      r.setStart(a.node, Math.max(0, Math.min(a.node.data.length, start - a.start)));
      r.setEnd(b.node, Math.max(0, Math.min(b.node.data.length, end - b.start)));
    } catch { return null; }
    return r;
  }

  const COPY = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textAlign', 'tabSize', 'direction'] as const;
  function measureArea(el: HTMLTextAreaElement, text: string, findings: Finding[]) {
    const cs = getComputedStyle(el);
    const m = document.createElement('div');
    const s = m.style as unknown as Record<string, string>;
    for (const k of COPY) s[k] = (cs as unknown as Record<string, string>)[k];
    m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.top = '0'; m.style.left = '-99999px';
    m.style.whiteSpace = 'pre-wrap'; m.style.overflowWrap = 'break-word'; m.style.wordBreak = cs.wordBreak;
    m.style.boxSizing = 'content-box'; m.style.border = '0'; m.style.padding = '0'; m.style.margin = '0';
    m.style.width = `${el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
    let pos = 0;
    const spans: HTMLSpanElement[] = [];
    for (const f of findings) {
      m.appendChild(document.createTextNode(text.slice(pos, f.start)));
      const sp = document.createElement('span');
      sp.textContent = text.slice(f.start, f.end);
      m.appendChild(sp); spans.push(sp);
      pos = f.end;
    }
    m.appendChild(document.createTextNode(text.slice(pos) + '​'));
    root.appendChild(m);
    const base = m.getBoundingClientRect();
    const out = findings.map((f, i) => ({ f, strong: f.severity !== 'info', rects: Array.from(spans[i].getClientRects()).map((r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height })) }));
    m.remove();
    return out;
  }

  function position() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!active || !active.isConnected || !enabled) return clear();
      attach();
      const box = active.getBoundingClientRect();
      const cs = getComputedStyle(active);
      const clipTop = box.top + parseFloat(cs.borderTopWidth), clipBottom = box.bottom - parseFloat(cs.borderBottomWidth);
      const clipLeft = box.left, clipRight = box.right;
      if (active instanceof HTMLTextAreaElement) {
        const ox = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) - active.scrollLeft;
        const oy = box.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) - active.scrollTop;
        marks.forEach((mk, i) => { mk.rects = areaRects[i].rects.map((r) => new DOMRect(ox + r.x, oy + r.y, r.w, r.h)); });
      } else {
        marks.forEach((mk, i) => { const r = ranges[i]; mk.rects = r ? Array.from(r.getClientRects()).filter((x) => x.width > 0) : []; });
      }
      const frag = document.createDocumentFragment();
      let strong = 0;
      for (const mk of marks) {
        if (mk.strong) strong++;
        for (const r of mk.rects) {
          if (r.bottom < clipTop || r.bottom > clipBottom + 2 || r.right < clipLeft || r.left > clipRight) continue;
          const u = document.createElement('div');
          u.className = mk.strong ? 'u' : 'u hint';
          if (mk === shownMark) u.classList.add('on');
          u.style.left = `${Math.max(r.left, clipLeft)}px`;
          u.style.top = `${r.bottom - 1}px`;
          u.style.width = `${Math.min(r.right, clipRight) - Math.max(r.left, clipLeft)}px`;
          frag.appendChild(u);
        }
      }
      layer.replaceChildren(frag);
      if (strong) {
        pill.hidden = false;
        pill.textContent = strong === 1 ? '1 tell' : `${strong} tells`;
        pill.style.left = `${Math.max(4, box.right - 64)}px`;
        pill.style.top = `${Math.max(4, Math.min(window.innerHeight - 24, box.bottom - 24))}px`;
      } else pill.hidden = true;
      if (shownMark) placeCard(shownMark);
    });
  }

  function clear() {
    marks = []; areaRects = []; ranges = [];
    layer.replaceChildren();
    pill.hidden = true;
    hideCard(true);
  }

  // The explain card.
  function hit(x: number, y: number): Mark | null {
    for (const mk of marks) for (const r of mk.rects) if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 3) return mk;
    return null;
  }
  function placeCard(mk: Mark) {
    const r = mk.rects[mk.rects.length - 1];
    if (!r) return hideCard(true);
    const wid = Math.min(300, window.innerWidth - 16);
    card.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - wid - 8))}px`;
    const below = r.bottom + 8;
    const h = card.offsetHeight || 150;
    card.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below}px`;
  }
  function showCard(mk: Mark) {
    clearTimeout(hideTimer);
    if (shownMark === mk && !card.hidden) return;
    shownMark = mk;
    const p = plainRule(mk.f.ruleId);
    (root.getElementById('name') as HTMLElement).textContent = p.name;
    (root.getElementById('why') as HTMLElement).textContent = p.why;
    (root.getElementById('do') as HTMLElement).textContent = mk.f.fix;
    card.hidden = false;
    placeCard(mk);
    requestAnimationFrame(() => card.classList.add('show'));
    position();
  }
  function hideCard(now = false) {
    clearTimeout(hideTimer);
    const go = () => { card.classList.remove('show'); card.hidden = true; if (shownMark) { shownMark = null; if (marks.length) position(); } };
    if (now) go(); else hideTimer = window.setTimeout(go, 280);
  }
  card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  card.addEventListener('mouseleave', () => hideCard());
  root.getElementById('ignore')!.addEventListener('click', () => {
    if (shownMark) ignored.add(`${shownMark.f.ruleId}:${shownMark.f.match}`);
    hideCard(true);
    lastText = '';
    run();
  });

  let moveQueued = false, mx = 0, my = 0;
  document.addEventListener('mousemove', (e) => {
    if (!marks.length) return;
    mx = e.clientX; my = e.clientY;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      const mk = hit(mx, my);
      clearTimeout(hoverTimer);
      if (mk) hoverTimer = window.setTimeout(() => showCard(mk), 220);
      else if (shownMark) hideCard();
    });
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (!marks.length || e.composedPath().includes(host)) return;
    const mk = hit(e.clientX, e.clientY);
    if (mk) showCard(mk); else hideCard(true);
  }, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shownMark) hideCard(true); }, true);

  // Following the focused field.
  document.addEventListener('focusin', (e) => {
    const f = fieldFor(e.composedPath()[0] ?? e.target);
    if (!f) return;
    if (f !== active) { active = f; lastText = ''; clear(); }
    schedule(150);
  }, true);
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const now = fieldFor(document.activeElement);
      if (!now && active && !active.contains(document.activeElement)) { active = null; clear(); }
    }, 250);
  }, true);
  document.addEventListener('input', (e) => {
    const f = fieldFor(e.composedPath()[0] ?? e.target);
    if (!f) return;
    if (f !== active) { active = f; lastText = ''; }
    hideCard(true);
    // Hide underlines that would sit on moving text until the check runs again.
    if (marks.length) { layer.replaceChildren(); pill.hidden = true; marks = []; }
    schedule();
  }, true);
  const reposition = () => { if (marks.length) position(); };
  window.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (active) { lastText = ''; schedule(100); } }, { passive: true });

  // A field that already has focus when the script arrives (injected with "Underline on this page").
  const already = fieldFor(document.activeElement);
  if (already) { active = already; schedule(0); }

  // The popup asks for the focused field's text when the user presses "Use the text from this page".
  try {
    chrome.runtime?.onMessage.addListener((msg: { type?: string }, _s: unknown, reply: (r: unknown) => void) => {
      if (msg?.type === 'tells:text') reply({ text: active ? textOf(active).text : (window.getSelection()?.toString() ?? '') });
    });
  } catch { /* not in an extension */ }
})();
