"""Wikipedia talk-page comments (article and user talk), 2001-2015, non-attacking ones only.

Source:  the Wikipedia Detox "personal attacks" corpus (Wulczyn, Thain and Dixon 2017), mirrored
         on Hugging Face as dirtycomputer/Wikipedia_Talk_Labels and read through the
         datasets-server rows API. Each comment's revision id is looked up on the MediaWiki API
         (en.wikipedia.org/w/api.php, 50 per call) for its page title, author and timestamp.
Licence: CC BY-SA 3.0 (Wikipedia text); redistributable with attribution.
Usage:   python3 -I fetch_wikitalk.py /root/tells-data/human/wikitalk.jsonl [--target 500] [--raw DIR]

Rows labelled as attacks are dropped, as are templated messages, tables and anything under 60
words after wiki markup, indentation and signatures are stripped. Revisions that are deleted or
cannot be dated are dropped. At most 3 comments per talk page and 8 per 100-row page. Responses are cached under --raw.
"""
import hashlib, html, json, os, random, re, sys, time
import requests

ROWS = 'https://datasets-server.huggingface.co/rows'
DATASET, TOTAL = 'dirtycomputer/Wikipedia_Talk_Labels', 115864
WIKI = 'https://en.wikipedia.org/w/api.php'
LICENCE = {'name': 'CC BY-SA 3.0', 'url': 'https://creativecommons.org/licenses/by-sa/3.0/'}
UA = {'User-Agent': 'tells-research/0.3 (open-source human-writing benchmark) python-requests'}
PER_PAGE = 3
PER_ROWS = 8  # at most this many from one 100-row page, to spread over the years
TEMPLATED = re.compile(r'welcome to wikipedia|thank you for (your )?(experimenting|contributions)|speedy deletion|fair use|'
                       r'this is an automated|please do not (remove|vandal)|you have been blocked|has been (moved|nominated|listed)|'
                       r'if you would like to|wikiproject|please stop|test page|sandbox|hello,? and welcome|barnstar|'
                       r'image copyright|non-free|orphaned|you may be blocked|unblock|articles? for deletion|preloaded debate|this greeting|'
                       r'merry christmas|happy (new year|holidays|thanksgiving)|spread the (holiday|wikilove)|signpost|newsletter|'
                       r'you are invited|delivered by|mediation|arbitration committee', re.I)
POLICY = re.compile(r'\b(WP:\w+|policy|policies|guideline|NPOV|neutral|consensus|reliable|sources?|cit(e|ation)s?|verifiab\w+|'
                    r'notab\w+|original research|undue)\b', re.I)


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 500))
RAW = arg('--raw', '/root/tells-data/raw/wikitalk')
os.makedirs(RAW, exist_ok=True)


def cached(path, fetch):
    if os.path.exists(path):
        return json.load(open(path))
    data = fetch()
    json.dump(data, open(path, 'w'))
    return data


def rows(offset):
    def fetch():
        for attempt in range(8):
            r = requests.get(ROWS, params={'dataset': DATASET, 'config': 'default', 'split': 'train', 'offset': offset, 'length': 100}, headers=UA, timeout=60)
            if r.status_code == 200:
                time.sleep(2)
                return r.json()
            time.sleep(60 if r.status_code == 429 else 10 * (attempt + 1))
        raise RuntimeError(f'rows {offset}: HTTP {r.status_code}')
    return cached(os.path.join(RAW, f'rows-{offset}.json'), fetch)


def revisions(ids):
    def fetch():
        for attempt in range(6):
            r = requests.get(WIKI, params={'action': 'query', 'prop': 'revisions', 'revids': '|'.join(map(str, ids)),
                                           'rvprop': 'ids|timestamp|user', 'format': 'json', 'formatversion': 2,
                                           'maxlag': 5}, headers=UA, timeout=60)
            if r.status_code == 200 and 'error' not in r.json():
                time.sleep(3)
                return r.json()
            time.sleep(int(r.headers.get('Retry-After', 0) or 0) or 30 * (attempt + 1))
        r.raise_for_status()
        raise RuntimeError(r.json().get('error'))
    data = cached(os.path.join(RAW, f'revs-{ids[0]}-{len(ids)}.json'), fetch)
    out = {}
    for p in data.get('query', {}).get('pages', []):
        for rev in p.get('revisions', []):
            out[rev['revid']] = {'title': p['title'], 'timestamp': rev.get('timestamp'), 'user': rev.get('user')}
    return out


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def clean(c):
    t = html.unescape(c).replace('\xa0', ' ')
    t = t.strip().strip('`"').strip()
    t = t.replace('``', '"')
    if '{|' in t or '|}' in t or TEMPLATED.search(t):
        return ''
    # An edit can hold several signed comments, or the tail of the one above: keep the longest piece.
    segs = re.split(r'\((?:UTC|CET|CEST|EST|EDT|PST|PDT|GMT)\)', t)
    segs = [re.sub(r'\s*\d{1,2}:\d{2},?[\w ,]{0,30}$', '', x) for x in segs]
    t = max(segs, key=words)
    t = re.sub(r'==+[^=]{0,300}==+', ' ', t)                     # section headings
    t = re.sub(r'==+', ' ', t)
    t = re.sub(r'[-—–]*\s*The preceding unsigned comment was added by.*$|Preceding unsigned comment added by.*$', ' ', t, flags=re.I)
    t = re.sub(r'\{\{[^{}]*\}\}', ' ', t)                         # templates
    t = re.sub(r'<[^>]+>', ' ', t)                                # html tags
    t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', t)       # [[link|text]]
    t = re.sub(r'\[https?://\S+\s+([^\]]*)\]', r'\1', t)          # [url text]
    t = re.sub(r'\[?https?://\S+\]?', ' ', t)
    t = re.sub(r"'{2,}", '', t)
    # Signatures and timestamps: "Name (talk) 12:34, 5 June 2008 (UTC)", "~~~~", stray dashes and bullets.
    t = re.sub(r'~{3,5}', ' ', t)
    t = re.sub(r'\d{1,2}:\d{2},? \d{1,2} \w+ \d{4} \((UTC|CET|EST)\)', ' ', t)
    t = re.sub(r'\((talk|contribs?|email)\)|\btalk\s*•\s*contribs?\b|User talk:\S+|User:\S+', ' ', t)
    t = re.sub(r'(^|\s)[:*#]+', ' ', t)                          # indentation and list markers
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'(\s*[-–—•/]+\s*)+$', '', t).strip()
    if re.search(r'[|\[\]•]', t):   # leftover template or link syntax: not plain prose
        return ''
    return t


def english(t):
    common = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|this|on|be|with|as|are|not|or|i)\b', t, re.I))
    return common >= 0.15 * words(t) and sum(ord(c) > 0x2fff for c in t) < 3


def trim(text, limit=600):
    if words(text) <= limit:
        return text
    out, n = [], 0
    for s in re.split(r'(?<=[.!?])\s+', text):
        if n + words(s) > limit:
            break
        out.append(s)
        n += words(s)
    return ' '.join(out)


rng = random.Random(9091)
offsets = sorted({rng.randrange(0, TOTAL - 100) // 100 * 100 for _ in range(400)})
rng.shuffle(offsets)
seen, per_page, out, pages = set(), {}, [], 0
for off in offsets:
    if len(out) >= TARGET:
        break
    try:
        batch = rows(off)['rows']
    except Exception as e:
        print('skip page', off, e)
        continue
    pages += 1
    cands = []
    for item in batch:
        r = item['row']
        if r.get('attack'):
            continue
        t = clean(r.get('comment') or '')
        if words(t) < 60 or not english(t) or len(re.findall(r'\d', t)) > 0.05 * len(t):
            continue
        t = trim(t)
        key = re.sub(r'\W+', ' ', t.lower()).strip()
        if key in seen or not 60 <= words(t) <= 600:
            continue
        cands.append((r, t, key))
    cands = cands[:3 * PER_ROWS]
    ids = [r['rev_id'] for r, _, _ in cands]
    meta = {}
    for i in range(0, len(ids), 50):
        try:
            meta.update(revisions(ids[i:i + 50]))
        except Exception as e:
            print('revision lookup failed', e)
    taken = 0
    for r, t, key in cands:
        if taken >= PER_ROWS:
            break
        m = meta.get(r['rev_id'])
        if not m or not m.get('timestamp') or m['timestamp'] >= '2022':
            continue
        page = m['title']
        if per_page.get(page, 0) >= PER_PAGE or key in seen:
            continue
        seen.add(key)
        taken += 1
        per_page[page] = per_page.get(page, 0) + 1
        out.append({
            'id': f'wikitalk-{r["rev_id"]}', 'source': 'wikitalk', 'group': f'wikitalk:{page}', 'genre': 'comment',
            'register': 'professional' if len(POLICY.findall(t)) >= 2 and words(t) >= 100 else 'casual', 'nonNative': False,
            'text': t, 'url': f'https://en.wikipedia.org/w/index.php?diff=prev&oldid={r["rev_id"]}', 'author': m.get('user'),
            'date': m['timestamp'][:10], 'licence': LICENCE, 'redistributable': True,
            'note': f'Wikipedia {r["ns"]} talk comment from the Detox attack corpus (not an attack); wiki markup, indentation, headings and signatures stripped.',
        })
    if pages % 10 == 0:
        print(f'{pages} pages, {len(out)} samples', flush=True)

out.sort(key=lambda s: s['id'])
with open(OUT, 'w') as f:
    for s in out:
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(out)} samples from {len(per_page)} talk pages, {pages} row pages')
