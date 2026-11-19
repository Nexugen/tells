// The checker's script, shared by the home page and every use-case page.
import { plainTable } from '../plain.ts';
import { CHECKER_COPY, SAMPLE, type PageOpts } from './page.ts';

/** Check, explain, fix, voice, and on the home page the phone install hint. */
export function pageScript(opts: PageOpts, o: { home?: boolean } = {}): string {
  const C = CHECKER_COPY;
  return `<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var RULES = ${JSON.stringify(plainTable()).replace(/</g, '\\u003c')};
  var SAMPLE = ${JSON.stringify(SAMPLE)};
  var tool = $('try'), text = $('text'), out = $('out'), card = $('card'), list = $('list'), result = $('result');
  var register = tool.getAttribute('data-register') || 'auto';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timer = null, seq = 0, live = false, last = null, undoText = null, voice = null, key = '';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  key = store('tells-key') || '';
  try { voice = JSON.parse(store('tells-voice') || 'null'); } catch (e) { voice = null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function scrollTo(el, block) { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: block || 'start' }); }
  function busy(btn, on, label) { btn.classList.toggle('busy', on); btn.disabled = on; var l = btn.querySelector('.lbl'); if (!l) return; if (on && label) { btn.setAttribute('data-label', l.textContent); l.textContent = label; } else if (!on && btn.getAttribute('data-label')) l.textContent = btn.getAttribute('data-label'); }
  function plain(f) { var r = RULES[f.ruleId]; return { name: r ? r[0] : f.name, why: r ? r[1] : '', fix: f.fix }; }
  function post(path, body, withKey) {
    var h = { 'content-type': 'application/json' };
    if (withKey && key) h.authorization = 'Bearer ' + key;
    return fetch(path, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function words(s) { var m = s.match(/[\\p{L}\\p{N}']+/gu); return m ? m.length : 0; }

  // The headline above the marked text.
  function headline(r) {
    var strong = r.findings.filter(function (f) { return f.severity !== 'info'; });
    var kinds = {}; strong.forEach(function (f) { kinds[f.ruleId] = 1; });
    var n = Object.keys(kinds).length, hints = r.findings.length - strong.length;
    var h = r.human || {}, low = h.pattern && h.pattern.low, short = h.tooShort, num = $('num');
    num.className = 'num'; num.textContent = '';
    void num.offsetWidth;
    if (n) {
      num.textContent = n > 9 ? '9+' : n;
      $('headline').textContent = n === 1 ? '1 thing gives this away' : n + ' things give this away';
      $('sub').textContent = 'Tap a marked phrase to see why, and what to write instead.';
    } else if (low && !short) {
      num.className = 'num soft'; num.textContent = '?';
      $('headline').textContent = 'This reads a little machine-made';
      $('sub').textContent = 'No single phrase gives it away, but the rhythm and word choice lean that way. Details only you know help most: names, numbers, what happened.';
    } else if (hints) {
      num.className = 'num ok';
      $('headline').textContent = 'Mostly sounds like a person';
      $('sub').textContent = 'A few small habits are marked lightly. People use these too, so they only matter when they pile up.';
    } else {
      num.className = 'num ok';
      $('headline').textContent = short ? 'Nothing stands out' : 'Sounds like a person';
      $('sub').textContent = short ? 'It is short, so there is less to go on, but nothing in it reads like a chatbot wrote it.' : 'Nothing in it reads like a chatbot wrote it. That is not proof either way, just a good sign.';
    }
  }
  function render(src, r) {
    last = r;
    var at = new Array(src.length);
    r.findings.forEach(function (f, i) { for (var k = f.start; k < f.end; k++) if (at[k] === undefined || r.findings[at[k]].severity === 'info') at[k] = i; });
    var html = '', cur, buf = '', n = 0;
    function flush() {
      if (!buf) return;
      if (cur === undefined) html += esc(buf);
      else { var f = r.findings[cur]; html += '<mark tabindex="0" role="button" data-f="' + cur + '"' + (f.severity === 'info' ? ' class="hint-m"' : '') + ' style="--i:' + (n++) + '" aria-label="' + esc(plain(f).name + ': ' + buf) + '">' + esc(buf) + '</mark>'; }
      buf = '';
    }
    for (var i = 0; i < src.length; i++) { if (at[i] !== cur) { flush(); cur = at[i]; } buf += src[i]; }
    flush();
    out.innerHTML = html || '&nbsp;';
    headline(r);
    var groups = {}, order = [];
    r.findings.forEach(function (f, i) {
      var g = groups[f.ruleId];
      if (!g) { g = groups[f.ruleId] = { f: f, idx: [], phr: [] }; order.push(f.ruleId); }
      g.idx.push(i);
      if (g.phr.indexOf(f.match) < 0 && g.phr.length < 4) g.phr.push(f.match);
      if (f.severity !== 'info') g.f = f;
    });
    order.sort(function (a, b) { return (groups[a].f.severity === 'info') - (groups[b].f.severity === 'info'); });
    var li = '', hintsShown = false, k = 0;
    order.forEach(function (id) {
      var g = groups[id], p = plain(g.f), small = g.f.severity === 'info';
      if (small && !hintsShown) { hintsShown = true; li += '<li class="hints-head">Small things, common in human writing too</li>'; }
      li += '<li tabindex="0"' + (small ? ' class="small"' : '') + ' data-g="' + g.idx.join(',') + '" style="--i:' + (k++) + '"><b>' + esc(p.name) + '</b><span class="phr">' + g.phr.map(function (x) { x = x.replace(/\\s+/g, ' ').trim(); return '<span>' + esc(x.length > 60 ? x.slice(0, 57) + '...' : x) + '</span>'; }).join('') + '</span><p>' + esc(p.why) + '</p><p>' + esc(p.fix) + '</p></li>';
    });
    list.innerHTML = li;
    var good = (r.human && r.human.present) || [], g = $('good');
    var strongCount = r.findings.filter(function (f) { return f.severity !== 'info'; }).length;
    if (good.length && !strongCount) { g.hidden = false; g.innerHTML = '<b>Sounds human:</b> ' + good.slice(0, 4).map(function (p) { return esc(p.name.toLowerCase()); }).join(', ') + '.'; }
    else g.hidden = true;
    $('fix').hidden = !(r.findings.length || (r.human && r.human.missing && r.human.missing.length));
    result.hidden = false;
    hideCard();
  }
  function loading() {
    result.hidden = false;
    $('num').className = 'num soft'; $('num').textContent = '';
    $('headline').textContent = 'Reading it';
    $('sub').textContent = 'This takes a moment.';
    out.innerHTML = '<span class="skel" style="width:92%"></span><span class="skel" style="width:76%"></span><span class="skel" style="width:84%"></span>';
    list.innerHTML = ''; $('good').hidden = true;
  }
  function check(scroll) {
    var src = text.value, mine = ++seq, btn = $('check');
    if (!src.trim()) { result.hidden = true; last = null; return; }
    if (!last) loading();
    if (scroll) busy(btn, true, 'Checking');
    post('/v1/lint', { text: src, register: register })
      .then(function (r) {
        if (mine !== seq) return;
        busy(btn, false);
        if (r.error) { $('hint').textContent = r.error.message; return; }
        $('hint').textContent = '';
        render(src, r);
        live = true;
        if (scroll) scrollTo(result);
      })
      .catch(function () {
        if (mine !== seq) return;
        busy(btn, false);
        if (!last) result.hidden = true;
        $('hint').textContent = navigator.onLine === false ? 'You are offline. Checking needs a connection, so try again once you are back online.' : 'Could not reach tells just now. Try again in a moment.';
      });
  }
  $('check').addEventListener('click', function () {
    if (!text.value.trim()) {
      text.classList.remove('nudge'); void text.offsetWidth; text.classList.add('nudge');
      $('hint').textContent = 'Paste some writing first, or try the example.';
      text.focus();
      return;
    }
    check(true);
  });
  if ($('example')) $('example').addEventListener('click', function () { text.value = SAMPLE; $('diff').hidden = true; check(true); });
  text.addEventListener('input', function () { $('hint').textContent = ''; if (!live) return; clearTimeout(timer); timer = setTimeout(function () { check(false); }, 450); });
  text.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); check(true); } });

  // The card that explains one marked phrase.
  var openMark = null, hov = null;
  function showCard(m) {
    if (!last) return;
    var f = last.findings[+m.getAttribute('data-f')];
    if (!f) return;
    var p = plain(f);
    if (openMark) openMark.classList.remove('on');
    openMark = m; m.classList.add('on');
    $('cardname').textContent = p.name; $('cardwhy').textContent = p.why; $('carddo').textContent = p.fix;
    var wrap = $('wrap').getBoundingClientRect(), rects = m.getClientRects(), r = rects[rects.length - 1] || m.getBoundingClientRect();
    var w = Math.min(360, wrap.width), left = Math.max(0, Math.min(r.left - wrap.left, wrap.width - w));
    card.style.left = left + 'px';
    card.style.top = (r.bottom - wrap.top + 8) + 'px';
    card.classList.add('show');
  }
  function hideCard() { card.classList.remove('show'); if (openMark) openMark.classList.remove('on'); openMark = null; }
  out.addEventListener('click', function (e) { var m = e.target.closest('mark'); if (!m) return; clearTimeout(hov); if (m === openMark && !matchMedia('(hover: hover)').matches) hideCard(); else showCard(m); });
  out.addEventListener('keydown', function (e) { var m = e.target.closest('mark'); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showCard(m); } });
  if (matchMedia('(hover: hover)').matches) {
    out.addEventListener('mouseover', function (e) { var m = e.target.closest('mark'); clearTimeout(hov); if (m) hov = setTimeout(function () { showCard(m); }, 110); });
    $('wrap').addEventListener('mouseleave', function () { clearTimeout(hov); hov = setTimeout(hideCard, 220); });
    card.addEventListener('mouseenter', function () { clearTimeout(hov); });
  }
  $('cardx').addEventListener('click', hideCard);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideCard(); });
  document.addEventListener('click', function (e) { if (openMark && !e.target.closest('#card') && !e.target.closest('mark') && !e.target.closest('li[data-g]')) hideCard(); });
  window.addEventListener('resize', hideCard);
  list.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-g]'); if (!li) return;
    var first = null;
    li.getAttribute('data-g').split(',').forEach(function (i) { var m = out.querySelector('mark[data-f="' + i + '"]'); if (m) { first = first || m; m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); } });
    if (first) { scrollTo(first, 'center'); setTimeout(function () { showCard(first); }, reduce ? 0 : 380); }
  });
  list.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('li[data-g]')) e.target.click(); });

  // Fix it, and rewrite in my style.
  function rewriteCall(body, btn, label, noteEl, done) {
    noteEl.className = 'note'; noteEl.textContent = '';
    busy(btn, true, label);
    function finish(r) {
      busy(btn, false);
      if (r.error) { noteEl.className = 'note err'; noteEl.textContent = r.error.code === 'key_daily_cap' || r.error.code === 'key_limit' ? 'You have used today\\'s free fixes. They come back tomorrow.' : r.error.message; return; }
      done(r);
    }
    function go(retried) {
      post('/v1/rewrite', body, true).then(function (r) {
        if (r.error && r.error.code === 'try_limit' && !key && !retried) {
          return post('/v1/keys', {}).then(function (k) {
            if (k.key) { key = k.key; store('tells-key', key); go(true); }
            else finish({ error: { code: 'key_limit' } });
          });
        }
        finish(r);
      }).catch(function () { finish({ error: { message: 'That did not go through. Check your connection and try again.' } }); });
    }
    go(false);
  }
  function showDiff(before, r, title) {
    var html = '', pos = 0;
    if (r.changes && r.changes.length) {
      r.changes.forEach(function (c) { html += esc(before.slice(pos, c.start)) + '<del>' + esc(c.before) + '</del> <ins>' + esc(c.after) + '</ins>'; pos = c.end; });
      html += esc(before.slice(pos));
    } else html = '<ins>' + esc(r.text) + '</ins>';
    $('difftext').innerHTML = html;
    $('diffhead').textContent = title;
    $('diff').hidden = false;
    $('copy').textContent = 'Copy the new version';
  }
  $('fix').addEventListener('click', function () {
    var before = text.value;
    if (!before.trim()) return;
    rewriteCall({ text: before, register: register }, this, 'Fixing', $('note'), function (r) {
      var n = r.changes.length;
      if (!n) { $('note').textContent = 'Nothing needed changing.'; return; }
      undoText = before;
      text.value = r.text;
      showDiff(before, r, n === 1 ? '1 sentence changed' : n + ' sentences changed');
      $('note').textContent = r.suggestions && r.suggestions.length ? 'Fill in the parts in [square brackets] with your own details.' : '';
      check(false);
      scrollTo($('diff'));
    });
  });
  $('undo').addEventListener('click', function () { if (undoText === null) return; text.value = undoText; undoText = null; $('diff').hidden = true; $('note').textContent = ''; check(false); });
  $('copy').addEventListener('click', function () {
    var b = this, ok = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy the new version'; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.value).then(ok, function () { text.select(); });
    else { text.select(); try { document.execCommand('copy'); ok(); } catch (e) {} }
  });

  var samples = $('samples');
  function splitSamples(s) { var parts = /^\\s*---+\\s*$/m.test(s) ? s.split(/^\\s*---+\\s*$/m) : s.split(/\\n\\s*\\n/); return parts.map(function (x) { return x.trim(); }).filter(Boolean); }
  function meter() { var w = words(samples.value); $('wc').textContent = w >= 600 ? w + ' words, enough to learn from' : w + ' of 600 words'; $('bar').style.width = Math.min(100, w / 6) + '%'; $('meter').classList.toggle('full', w >= 600); }
  function showSaved() {
    $('saved').hidden = !voice;
    var t = $('traits');
    if (voice && voice.summary && voice.summary.length) { t.hidden = false; t.innerHTML = voice.summary.slice(0, 4).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join(''); }
    else t.hidden = true;
  }
  samples.addEventListener('input', meter);
  $('voicebtn').addEventListener('click', function () {
    var v = $('voice'); v.hidden = false; showSaved();
    scrollTo(v);
    if (!voice) setTimeout(function () { samples.focus({ preventScroll: true }); }, reduce ? 0 : 450);
  });
  $('buildvoice').addEventListener('click', function () {
    var btn = this, note = $('voicenote'), parts = splitSamples(samples.value);
    note.className = 'note';
    if (words(samples.value) < 600 || parts.length < 5) { note.textContent = 'Add a little more first: at least five separate pieces and about 600 words in all. More gives a closer match.'; return; }
    busy(btn, true, 'Learning');
    post('/v1/voice', { samples: parts }).then(function (r) {
      busy(btn, false);
      if (r.error) { note.className = 'note err'; note.textContent = r.error.message; return; }
      voice = r; store('tells-voice', JSON.stringify(r));
      samples.value = ''; meter();
      note.textContent = 'Learned from ' + r.samples + ' pieces and ' + r.words + ' words.';
      showSaved();
    }).catch(function () { busy(btn, false); note.className = 'note err'; note.textContent = 'Could not reach tells just now. Try again in a moment.'; });
  });
  $('forget').addEventListener('click', function () { voice = null; store('tells-voice', null); showSaved(); $('voicenote').className = 'note'; $('voicenote').textContent = 'Forgotten. Nothing about your style is left on this device.'; });
  $('voicerewrite').addEventListener('click', function () {
    if (!voice) return;
    var before = text.value, note = $('voicenote');
    if (!before.trim()) { note.className = 'note'; note.textContent = 'Paste the draft you want rewritten in the box at the top first.'; return; }
    rewriteCall({ text: before, register: register, voice: voice, polish: $('polish').checked }, this, 'Rewriting', note, function (r) {
      if (r.kept || r.text === before) { note.textContent = 'Left it as it was: the rewrite could not keep every fact, so nothing changed.'; return; }
      undoText = before; text.value = r.text;
      showDiff(before, { text: r.text, changes: [] }, 'Rewritten in your style');
      $('note').className = 'note';
      $('note').textContent = r.voice ? 'Style match went from ' + r.voice.before.score + ' to ' + r.voice.after.score + ' out of 100.' : '';
      check(false);
      scrollTo($('diff'));
    });
  });
  meter();
  if (!${opts.rewriteOn ? 'true' : 'false'}) $('note').textContent = ${JSON.stringify(C.rewriteOff)};

  // Text shared from another app (the share target), or a link with ?text=
  var q = new URLSearchParams(location.search), shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\\n\\n');
  var fromShare = location.pathname === '/share';
  if (shared) text.value = shared;
  if (shared || fromShare) history.replaceState(null, '', fromShare ? '/' : location.pathname);
  if (text.value.trim()) check(shared || fromShare);
${o.home ? `
  // Old anchors from when the developer material lived on this page.
  var moved = { '#install': 1, '#api': 1, '#badge': 1, '#benchmark': 1, '#ci': 1, '#rules': 1, '#cli': 1, '#keys': 1, '#assistants': 1 };
  if (moved[location.hash]) location.replace('/developers' + location.hash);

  // Add to your phone.
  var phone = $('phone'), deferred = null, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent), small = matchMedia('(max-width: 700px)').matches;
  function showPhone(msg, btn) { if (standalone || !small || store('tells-phone-hint')) return; $('phonemsg').textContent = msg; $('phonego').hidden = !btn; phone.hidden = false; }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; showPhone('Add tells to your phone, then share text to it from any app.', true); });
  $('phonego').addEventListener('click', function () { if (!deferred) return; deferred.prompt(); deferred = null; phone.hidden = true; store('tells-phone-hint', '1'); });
  $('phonex').addEventListener('click', function () { phone.hidden = true; store('tells-phone-hint', '1'); });
  setTimeout(function () { if (!deferred && phone.hidden) showPhone(ios ? 'Add tells to your phone: tap Share, then Add to Home Screen.' : 'Add tells to your phone: open the browser menu, then Add to Home screen.', false); }, 5000);
` : ''}
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
})();
</script>`;
}
