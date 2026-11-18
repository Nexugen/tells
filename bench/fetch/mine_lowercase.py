"""Lowercase, chat-style Hacker News comments from before 2022, mined from the raw windows fetch_hn.py cached.

People who type in lowercase (no capital at the start of most sentences, "i" for "I") were almost absent
from the pool's 60+ word texts, so the score had never seen them. This keeps HN comments where at least half
the sentences start lowercase, skipping any comment already in a set, and splits them by story: about 70% to
the training addition, 30% to the modern probe.

Licence: Hacker News user content, no open licence (https://www.ycombinator.com/legal/); local measurement only.
Usage:   python3 -I mine_lowercase.py RAW_DIR TRAIN_OUT PROBE_OUT
"""
import glob, hashlib, json, os, re, sys, time

sys.argv += ['--source', 'x']
here = os.path.dirname(os.path.abspath(__file__))
RAW, TRAIN_OUT, PROBE_OUT = sys.argv[1:4]
LIC = {'name': 'Hacker News user content; no open licence', 'url': 'https://www.ycombinator.com/legal/'}
CODEY = re.compile(r'\b(code|compile[rd]?|function|API|python|javascript|JS|rust|golang|java|C\+\+|SQL|database|kernel|linux|'
                   r'server|regex|library|framework|bug|git|docker|async|thread|memory|CPU|GPU|query|syntax|runtime)\b')


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def clean(body):
    import html
    body = re.sub(r'<pre>.*?</pre>', '\n\n[[CODE]]\n\n', body, flags=re.S)
    body = re.sub(r'<p>', '\n\n', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = html.unescape(body).replace('\xa0', ' ')
    out = []
    for p in re.split(r'\n\s*\n', body):
        p = re.sub(r'\s+', ' ', p).strip()
        if p and not p.startswith('>') and p != '[[CODE]]':
            out.append(p)
    return '\n\n'.join(out)


def lower_share(t):
    sents = [s for s in re.split(r'(?<=[.!?])\s+|\n\n', t) if re.search(r'[A-Za-z]', s)]
    if len(sents) < 3:
        return 0
    return sum(1 for s in sents if re.match(r'^\W*[a-z]', s)) / len(sents)


have = set()
for f in glob.glob('/root/tells-data/**/*.jsonl', recursive=True):
    if os.path.abspath(f) in (os.path.abspath(TRAIN_OUT), os.path.abspath(PROBE_OUT)):
        continue
    for line in open(f):
        try:
            have.add(json.loads(line)['id'])
        except Exception:
            pass

train, probe, per_story = [], [], {}
for path in sorted(glob.glob(os.path.join(RAW, '*.json'))):
    for h in json.load(open(path)).get('hits', []):
        raw = h.get('comment_text') or ''
        id_, story = f'hn-{h["objectID"]}', h.get('story_id')
        if id_ in have or not story or '<pre>' in raw or len(re.findall(r'https?://', raw)) > 2 or h['created_at_i'] >= 1640995200:
            continue
        t = clean(raw)
        if not 60 <= words(t) <= 600 or lower_share(t) < 0.5 or not re.search(r'(?:^|\s)i(?:\s|\'m|\'ve|\'d)', t):
            continue
        if per_story.get(story, 0) >= 3:
            continue
        per_story[story] = per_story.get(story, 0) + 1
        rec = {'id': id_, 'source': 'hn-lower', 'group': f'hn:{story}', 'genre': 'comment',
               'register': 'technical' if len(CODEY.findall(t)) >= 3 else 'casual', 'nonNative': False, 'text': t,
               'url': f'https://news.ycombinator.com/item?id={h["objectID"]}', 'author': h.get('author'),
               'date': time.strftime('%Y-%m-%d', time.gmtime(h['created_at_i'])), 'licence': LIC, 'redistributable': False,
               'note': 'HN comment typed mostly in lowercase; HTML stripped, quoted lines removed.'}
        to_probe = int(hashlib.sha256(f'lower:{story}'.encode()).hexdigest()[:8], 16) % 10 < 3
        if to_probe:
            probe.append({**rec, 'source': 'probe-hn-lower'})
        else:
            train.append(rec)

for out, rows in ((TRAIN_OUT, train), (PROBE_OUT, probe)):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        for r in sorted(rows, key=lambda r: r['id']):
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'train {len(train)}, probe {len(probe)}')
