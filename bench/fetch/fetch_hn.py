"""Hacker News comments written before 2022.

Source:  HN Algolia search API (hn.algolia.com/api/v1/search_by_date, tags=comment), one page of
         comments from each of a set of seeded random 3-hour windows between 2009 and 2021.
Licence: Hacker News user content, no open licence (https://www.ycombinator.com/legal/).
         Not redistributable; usable for local measurement only.
Usage:   python3 -I fetch_hn.py /root/tells-data/human/hn.jsonl [--target 600] [--raw DIR]

HTML is stripped, quoted lines (starting with ">") and code blocks dropped; 60-600 words kept;
at most 3 comments per story and 6 per window. Responses are cached under --raw.
"""
import hashlib, html, json, os, random, re, sys, time
import requests

API = 'https://hn.algolia.com/api/v1/search_by_date'
START, END = 1230768000, 1640995200 - 3 * 3600  # 2009-01-01 .. end of 2021
LICENCE = {'name': 'Hacker News user content; no open licence', 'url': 'https://www.ycombinator.com/legal/'}
PER_STORY, PER_WINDOW = 3, 6
UA = {'User-Agent': 'tells-research/0.3'}
CODEY = re.compile(r'\b(code|compile[rd]?|function|API|python|javascript|JS|rust|golang|java|C\+\+|SQL|database|kernel|linux|'
                   r'server|regex|library|framework|bug|git|docker|async|thread|memory|CPU|GPU|query|type system|syntax|runtime)\b')


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 600))
RAW = arg('--raw', '/root/tells-data/raw/hn')
os.makedirs(RAW, exist_ok=True)


def window(lo):
    path = os.path.join(RAW, f'win-{lo}.json')
    if os.path.exists(path):
        return json.load(open(path))
    params = {'tags': 'comment', 'numericFilters': f'created_at_i>{lo},created_at_i<{lo + 3 * 3600}', 'hitsPerPage': 200,
              'attributesToRetrieve': 'author,comment_text,created_at_i,story_id,objectID', 'attributesToHighlight': ''}
    for attempt in range(4):
        r = requests.get(API, params=params, headers=UA, timeout=60)
        if r.status_code == 200:
            data = r.json()
            json.dump(data, open(path, 'w'))
            time.sleep(1)
            return data
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f'window {lo}: HTTP {r.status_code}')


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def clean(body):
    body = re.sub(r'<pre>.*?</pre>', '\n\n[[CODE]]\n\n', body, flags=re.S)
    body = re.sub(r'<p>', '\n\n', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = html.unescape(body).replace('\xa0', ' ')
    pars = []
    for p in re.split(r'\n\s*\n', body):
        p = re.sub(r'\s+', ' ', p).strip()
        if not p or p.startswith('>') or p == '[[CODE]]':
            continue
        pars.append(p)
    return '\n\n'.join(pars)


def english(t):
    common = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|this|on|be|with|as|are|not|or|i)\b', t, re.I))
    return common >= 0.15 * words(t) and sum(ord(c) > 0x2fff for c in t) < 3


def trim(text, limit=600):
    if words(text) <= limit:
        return text
    out, n = [], 0
    for p in text.split('\n\n'):
        if n + words(p) > limit:
            break
        out.append(p)
        n += words(p)
    if n >= 60:
        return '\n\n'.join(out)
    out, n = [], 0
    for s in re.split(r'(?<=[.!?])\s+', text):
        if n + words(s) > limit:
            break
        out.append(s)
        n += words(s)
    return ' '.join(out)


rng = random.Random(4242)
windows = [rng.randrange(START, END) for _ in range(150)]
seen, per_story, out = set(), {}, []
for i, lo in enumerate(windows):
    if len(out) >= TARGET:
        break
    try:
        hits = window(lo).get('hits', [])
    except Exception as e:
        print('skip', lo, e)
        continue
    n = 0
    for h in sorted(hits, key=lambda h: int(h['objectID'])):
        if n >= PER_WINDOW:
            break
        raw = h.get('comment_text') or ''
        if '<pre>' in raw or len(re.findall(r'https?://', raw)) > 2:
            continue
        t = clean(raw)
        story = h.get('story_id')
        if not story or per_story.get(story, 0) >= PER_STORY or words(t) < 60 or not english(t):
            continue
        t = trim(t)
        if not 60 <= words(t) <= 600 or h['created_at_i'] >= 1640995200:
            continue
        key = re.sub(r'\W+', ' ', t.lower()).strip()
        if key in seen:
            continue
        seen.add(key)
        per_story[story] = per_story.get(story, 0) + 1
        n += 1
        out.append({
            'id': f'hn-{h["objectID"]}', 'source': 'hn', 'group': f'hn:{story}', 'genre': 'comment',
            'register': 'technical' if len(CODEY.findall(t)) >= 2 else 'casual', 'nonNative': False,
            'text': t, 'url': f'https://news.ycombinator.com/item?id={h["objectID"]}', 'author': h.get('author'),
            'date': time.strftime('%Y-%m-%d', time.gmtime(h['created_at_i'])), 'licence': LICENCE, 'redistributable': False,
            'note': 'HN comment; HTML stripped, quoted lines removed.',
        })
    if (i + 1) % 25 == 0:
        print(f'{i + 1} windows, {len(out)} samples', flush=True)

out.sort(key=lambda s: s['id'])
with open(OUT, 'w') as f:
    for s in out:
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(out)} samples from {len(per_story)} stories')
