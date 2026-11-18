"""Personal blog posts from the Blog Authorship Corpus (blogger.com, collected August 2004).

Source:  Schler, Koppel, Argamon and Pennebaker (2006), originally at
         https://u.cs.biu.ac.il/~koppel/BlogCorpus.htm. The canonical HF dataset
         (barilan/blog_authorship_corpus) is script-based and not served by the datasets-server, so
         the parquet mirror https://huggingface.co/datasets/tasksource/blog_authorship_corpus
         (same fields: id, gender, age, topic, sign, date, text) is read through the rows API.
Licence: the corpus is distributed for non-commercial research use only (the mirror's "apache-2.0"
         tag is the mirror's, not the authors'), so redistributable is false.
Usage:   python3 -I fetch_blogs.py /root/tells-data/human/blogs.jsonl [--target 500] [--pages 220]
At most 3 posts per blogger; posts under 60 words, mostly links, or reposted (forwarded mail,
surveys, lyrics) are dropped. Rows are sorted by
blogger, so small pages are taken at fixed offsets spread over the whole corpus.
"""
import hashlib, html, json, re, sys, time

import requests

OUT = sys.argv[1]
TARGET = int(sys.argv[sys.argv.index('--target') + 1]) if '--target' in sys.argv else 500
PAGES = int(sys.argv[sys.argv.index('--pages') + 1]) if '--pages' in sys.argv else 220
ROWS = 681284
API = 'https://datasets-server.huggingface.co/rows?dataset=tasksource/blog_authorship_corpus&config=default&split=train&offset={}&length=40'
LICENCE = {'name': 'Blog Authorship Corpus: non-commercial research use only', 'url': 'https://u.cs.biu.ac.il/~koppel/BlogCorpus.htm'}
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
STOP = set('the and to of a i it is that in you for was my but on with this have be not they so me just at are what like do he she we if or as all your can'.split())
# The corpus writes dates as "14,May,2004", with month names in the blogger's locale.
MONTHS = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'januar': 1, 'februar': 2, 'märz': 3, 'maerz': 3, 'mai': 5, 'juni': 6, 'juli': 7, 'oktober': 10, 'dezember': 12,
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
    'gennaio': 1, 'febbraio': 2, 'aprile': 4, 'maggio': 5, 'giugno': 6, 'luglio': 7, 'settembre': 9, 'ottobre': 10, 'dicembre': 12,
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'maio': 5, 'junho': 6, 'julho': 7, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
    'januari': 1, 'februari': 2, 'maart': 3, 'mei': 5, 'augustus': 8,
}


def get_json(url, tries=6):
    wait = 5
    for _ in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            if r.status_code == 200:
                return r.json()
        except (requests.RequestException, ValueError):
            pass
        time.sleep(wait)
        wait *= 2
    raise RuntimeError('failed: ' + url)


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def trim(t, cap=600):
    if words(t) <= cap:
        return t
    out = []
    for s in re.split(r'(?<=[.!?])\s+', t):
        if words(' '.join(out + [s])) > cap:
            break
        out.append(s)
    return ' '.join(out)


def parse_date(s):
    m = re.match(r'^\s*(\d{1,2}),\s*([^,]+?),\s*(\d{4})\s*$', s or '')
    if not m:
        return None
    mon = MONTHS.get(m.group(2).strip().lower())
    if not mon:
        return None
    y, d = int(m.group(3)), int(m.group(1))
    if not (1999 <= y <= 2004 and 1 <= d <= 31):
        return None
    return f'{y:04d}-{mon:02d}-{d:02d}'


def clean(t):
    t = html.unescape(t)
    t = re.sub(r'\burlLink\b', '', t)  # the corpus's placeholder for a link
    t = re.sub(r'https?://\S+|www\.\S+', '', t)
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


def english(t):
    ws = re.findall(r"[a-z']+", t.lower())
    if not ws:
        return False
    return sum(c.isascii() for c in t) / len(t) > 0.97 and sum(w in STOP for w in ws) / len(ws) > 0.25


def main():
    per_blogger, picked, seen = {}, [], set()
    for p in range(PAGES):
        off = int(p * (ROWS - 40) / max(1, PAGES - 1))
        d = get_json(API.format(off))
        for row in d.get('rows', []):
            x = row['row']
            raw = x.get('text') or ''
            links = len(re.findall(r'\burlLink\b|https?://', raw))
            t = clean(raw)
            n = words(t)
            if n < 60 or links > max(2, n / 60) or not english(t):
                continue
            # Reposted material rather than the blogger's own words: forwarded mail and newsgroup
            # posts, survey/quiz memes (many questions), song lyrics.
            if re.search(r'\b(?:From|Subject|Newsgroups|Date|Sent|To):\s', t) or re.search(r'\S+@\S+\.\w+', t):
                continue
            if t.count('?') > max(8, n / 25) or re.search(r'(?i)\b(?:lyrics|chorus|verse \d|survey|quiz)\b', t):
                continue
            date = parse_date(x.get('date'))
            if not date:
                continue
            bid = str(x['id'])
            if per_blogger.get(bid, 0) >= 3:
                continue
            t = trim(t)
            if words(t) < 60:
                continue
            k = re.sub(r'\W+', ' ', t.lower()).strip()
            if k in seen:
                continue
            seen.add(k)
            per_blogger[bid] = per_blogger.get(bid, 0) + 1
            h = hashlib.sha1(k.encode()).hexdigest()[:10]
            picked.append({
                'id': f'blogs-{bid}-{h}', 'source': 'blogs', 'group': f'blog:{bid}', 'genre': 'blog', 'register': 'casual',
                'nonNative': False, 'text': t, 'url': None, 'author': None, 'date': date, 'licence': LICENCE,
                'redistributable': False,
                'note': f'Blog Authorship Corpus post (blogger {bid}, {x.get("gender")}, age {x.get("age")}, topic {x.get("topic")}); '
                        'urlLink placeholders and URLs removed, whitespace collapsed (the corpus has no paragraph breaks)'
                        + ('; trimmed to 600 words' if words(clean(raw)) > 600 else ''),
            })
        time.sleep(2.5)
        if p % 20 == 0:
            print('page', p, 'offset', off, 'picked', len(picked), flush=True)
    # Thin evenly to the target if the pages gave more.
    if len(picked) > TARGET:
        step = len(picked) / TARGET
        picked = [picked[int(i * step)] for i in range(TARGET)]
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in picked:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(picked), 'bloggers', len({s['group'] for s in picked}))


if __name__ == '__main__':
    main()
