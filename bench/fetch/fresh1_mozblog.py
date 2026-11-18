"""The Mozilla Blog (blog.mozilla.org) posts published before 2021, for the fresh-1 held-out set.

Source:  the site's WordPress REST API,
         https://blog.mozilla.org/wp-json/wp/v2/posts?before=2021-01-01T00:00:00&per_page=50&page=N
         (about 1,400 posts, 2007 to 2020). Author names come from /wp-json/wp/v2/users/<id>.
Licence: CC BY-SA 3.0 or any later version. The blog.mozilla.org footer ("Content available under a
         Creative Commons license") links to https://www.mozilla.org/foundation/licensing/website-content/,
         which says text is available under CC BY-SA 3.0 Unported or any later version unless
         otherwise indicated. Trademarks and logos are not covered; only post text is kept.
Usage:   python3 -I fresh1_mozblog.py /root/tells-data/fresh-1/human/mozblog.jsonl [--per-year 11]

The opening prose paragraphs of each post are kept (HTML stripped), up to 600 words and cut at a
paragraph end; headings, lists, block quotes, captions, embeds and code end the run or are
skipped. Posts under 60 words of prose are dropped. Product launches and announcements are
genre "marketing" (register marketing); other posts are genre "blog" (register professional).
At most --per-year posts per calendar year, spread through the year.
"""
import hashlib, html, json, os, random, re, sys, time

import requests

OUT = sys.argv[1]
PER_YEAR = int(sys.argv[sys.argv.index('--per-year') + 1]) if '--per-year' in sys.argv else 11
API = 'https://blog.mozilla.org/wp-json/wp/v2'
UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
RAW = '/root/tells-data/raw/fresh1-mozblog'
LICENCE = {'name': 'CC BY-SA 3.0', 'url': 'https://creativecommons.org/licenses/by-sa/3.0/'}
PRODUCT = re.compile(r"(?i)\b(?:introducing|announcing|announce[sd]?|launch(?:es|ed|ing)?|now available|"
                     r"available (?:today|now)|new (?:firefox|version|release|feature|features)|download|"
                     r"releas(?:e|es|ed|ing)|try (?:it|the new)|today we(?:'|’)re|we(?:'|’)re (?:excited|thrilled|proud|happy)|"
                     r"meet (?:the )?(?:new )?firefox|upgrade|get firefox)\b")


def get(url, params=None):
    for attempt in range(5):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
            time.sleep(1.0)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (400, 404):
                return None
        except (requests.RequestException, ValueError):
            pass
        time.sleep(10 * (attempt + 1))
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def text_of(fragment):
    t = re.sub(r'<br\s*/?>', ' ', fragment)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t).replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return re.sub(r'\s+([,.;:!?])', r'\1', t)


def opening_prose(content):
    c = re.sub(r'<!--.*?-->', '', content, flags=re.S)
    c = re.sub(r'<(script|style|figure|figcaption|pre|code|table|iframe|blockquote)\b.*?</\1>', '\n<hr>\n', c, flags=re.S | re.I)
    # Walk top-level blocks in order: paragraphs are kept; a heading or list after some prose ends the opening.
    out = []
    for m in re.finditer(r'<(p|h[1-6]|ul|ol|hr)\b[^>]*>(.*?)(?:</\1>|(?=<hr))', c, flags=re.S | re.I):
        tag, inner = m.group(1).lower(), m.group(2)
        if tag != 'p':
            if words(' '.join(out)) >= 60:
                break
            continue
        t = text_of(inner)
        if not t or words(t) < 6:
            continue
        if re.search(r'https?://|www\.', t) or re.match(r'(?i)^(?:image|photo|credit|editor’s note|editor\'s note|update|note:|\[)', t):
            continue
        if not re.search(r'[.!?:"”’)]$', t) or re.match(r'^[–—•·*-]', t):
            continue
        if words(' '.join(out + [t])) > 600:
            break
        out.append(t)
    # A closing paragraph that introduces a removed list ("including:") would dangle.
    while out and out[-1].endswith(':'):
        out.pop()
    return '\n\n'.join(out)


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def main():
    os.makedirs(RAW, exist_ok=True)
    cache = f'{RAW}/posts.json'
    if os.path.exists(cache):
        posts = json.load(open(cache))
    else:
        posts, page = [], 1
        while True:
            batch = get(f'{API}/posts', {'before': '2021-01-01T00:00:00', 'per_page': 50, 'page': page,
                                         '_fields': 'id,date,link,title,content,author,categories'})
            if not batch:
                break
            posts.extend(batch)
            print('page', page, len(posts), flush=True)
            page += 1
        json.dump(posts, open(cache, 'w'))
    cats = {c['id']: html.unescape(c['name']) for c in (get(f'{API}/categories', {'per_page': 100}) or [])}
    by_year = {}
    for p in posts:
        by_year.setdefault(p['date'][:4], []).append(p)
    rng = random.Random(20215)
    samples, seen, users = [], set(), {}
    for year in sorted(by_year):
        ps = sorted(by_year[year], key=lambda p: p['date'])
        cands = []
        for p in ps:
            t = opening_prose(p['content']['rendered'])
            if words(t) < 60:
                continue
            toks = re.findall(r'[a-z]+', t.lower())
            if sum(x in {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'we', 'you', 'it'} for x in toks) < 0.15 * len(toks):
                continue
            cands.append((p, t))
        step = max(1.0, len(cands) / PER_YEAR)
        picks = [cands[int(k * step)] for k in range(min(PER_YEAR, len(cands)))]
        for p, t in picks:
            k = norm(t)
            if k in seen:
                continue
            seen.add(k)
            title = text_of(p['title']['rendered'])
            catnames = [cats.get(c, '') for c in p.get('categories', [])]
            head = title + ' ' + t.split('\n\n')[0]
            marketing = bool(PRODUCT.search(head)) and not any(c in ('Internet Policy', 'Internet Culture') for c in catnames)
            a = p.get('author')
            if a not in users:
                u = get(f'{API}/users/{a}') if a else None
                users[a] = u.get('name') if u and u.get('name') not in (None, '', 'admin') else None
            h = hashlib.sha1(k.encode()).hexdigest()[:8]
            samples.append({
                'id': f'mozblog-{p["id"]}-{h}', 'source': 'mozblog', 'group': f'mozblog:{year}',
                'genre': 'marketing' if marketing else 'blog', 'register': 'marketing' if marketing else 'professional',
                'nonNative': False, 'text': t, 'url': p['link'], 'author': users[a], 'date': p['date'][:10],
                'licence': LICENCE, 'redistributable': True,
                'note': f'Opening prose paragraphs of "{title}"; HTML stripped, headings, lists, captions, quotes and '
                        'embeds removed; cut at a paragraph end. Date is the WordPress publication date.',
            })
        print(year, 'candidates', len(cands), 'kept', len(picks), flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    main()
