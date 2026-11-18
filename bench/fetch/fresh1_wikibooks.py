"""English Wikibooks instructional prose, as of the last revision before 2021, for the fresh-1 held-out set.

Source:  https://en.wikibooks.org. Chapter lists come from the API (list=allpages with the book's
         prefix; the Cookbook uses a fixed list of technique and ingredient pages). For each page the
         last revision before 2021-01-01 is found from the history page (index.php?action=history&
         offset=20210101000000&limit=1, the same revision as prop=revisions&rvstart=2020-12-31&rvdir=older)
         and rendered with index.php?oldid=...&action=render. Wikimedia rate-limits unidentified
         API clients hard, so only the chapter listings use the API.
Licence: CC BY-SA 3.0 (Wikibooks text licence for revisions before 2023; also GFDL), attributed to
         "Wikibooks contributors" with a link to the revision.
Usage:   python3 -I fresh1_wikibooks.py /root/tells-data/fresh-1/human/wikibooks.jsonl [--per-book 8]
         python3 -I fresh1_wikibooks.py <out.jsonl> --retidy   (re-apply the paragraph rules only)

Only the page's top-level <p> paragraphs are kept (so infoboxes, navigation templates, tables,
lists, code blocks, captions and footnotes drop out), from the first prose paragraph, up to 600
words and cut at a paragraph end. Pages are skipped when prose is under 60 words or under half
of the page's visible text (mostly code, tables or lists). Requires fresh1_wikinews.py beside it
(the HTML paragraph extractor is shared).
"""
import hashlib, importlib.util, json, os, random, re, sys, time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('fresh1_wikinews', os.path.join(HERE, 'fresh1_wikinews.py'))
wn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wn)

OUT = sys.argv[1]
PER_BOOK = int(sys.argv[sys.argv.index('--per-book') + 1]) if '--per-book' in sys.argv else 8
API = 'https://en.wikibooks.org/w/api.php'
INDEX = 'https://en.wikibooks.org/w/index.php'
LICENCE = {'name': 'CC BY-SA 3.0', 'url': 'https://creativecommons.org/licenses/by-sa/3.0/'}

# (book, register). Books with too few usable pages are simply skipped.
BOOKS = [
    ('Cookbook', 'professional'),
    ('Computer Programming', 'technical'),
    ('Introduction to Software Engineering', 'technical'),
    ('Introduction to Programming Languages', 'technical'),
    ('A-level Computing', 'technical'),
    ('Introduction to Computer Information Systems', 'technical'),
    ('Object Oriented Programming', 'technical'),
    ('Software Engineering with an Agile Development Framework', 'technical'),
    ('Chess', 'professional'),
    ('Rowing', 'professional'),
    ('Tennis', 'professional'),
    ('Juggling', 'professional'),
    ('Fencing', 'professional'),
    ('Canadian History', 'professional'),
    ('European History', 'professional'),
    ('US History', 'professional'),
    ('World History', 'professional'),
    ('History of Ireland', 'professional'),
    ('South African History', 'professional'),
    ('Knots', 'professional'),
    ('Bicycle Maintenance and Repair', 'professional'),
    ('Beekeeping', 'professional'),
    ('First Aid', 'professional'),
    ('Woodworking', 'professional'),
    ('How To Assemble A Desktop PC', 'professional'),
    ('Sewing', 'professional'),
    ('Guitar', 'professional'),
    ('Movie Making Manual', 'professional'),
]
COOKBOOK = ['Braising', 'Roasting', 'Frying', 'Deep Frying', 'Baking', 'Boiling', 'Grilling', 'Stewing', 'Steaming',
            'Poaching', 'Sautéing', 'Barbecue', 'Smoking', 'Blanching', 'Bread', 'Cheese', 'Rice', 'Pasta',
            'Knife Skills', 'Food Safety', 'Cast Iron Cookware', 'Tea', 'Coffee', 'Chocolate', 'Garlic', 'Potato',
            'Egg', 'Flour', 'Yeast', 'Salt', 'Sugar', 'Butter', 'Olive Oil', 'Vinegar', 'Stock', 'Sourdough',
            'Cuisine of India', 'Cuisine of Japan', 'Cuisine of Italy', 'Cuisine of France', 'Cuisine of Mexico',
            'Cuisine of China', 'Cuisine of Ethiopia', 'Cuisine of Germany', 'Kitchen Knife', 'Measurement',
            'Herbs', 'Spices', 'Meat', 'Fish', 'Vegetables', 'Fruit', 'Wine', 'Beer', 'Microwave Oven']


def api(**params):
    params.update(format='json', formatversion=2, maxlag=5)
    r = wn.fetch(API, params)
    try:
        return r.json() if r is not None else {}
    except ValueError:
        return {}


def chapters(book):
    if book == 'Cookbook':
        return ['Cookbook:' + t for t in COOKBOOK]
    q = api(action='query', list='allpages', apprefix=book + '/', apnamespace=0, aplimit=500, apfilterredir='nonredirects')
    return [p['title'] for p in q.get('query', {}).get('allpages', [])]


def visible_words(body):
    t = re.sub(r'<(style|script)\b.*?</\1>', ' ', body, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    return wn.words(wn.html.unescape(t))


def page_sample(title, book, register):
    r = wn.fetch(INDEX, {'title': title, 'action': 'history', 'offset': '20210101000000', 'limit': 1})
    if r is None:
        return None
    m = re.search(r'data-mw-revid="(\d+)"[^>]*data-mw-ts="(\d{14})"', r.text) or \
        re.search(r'data-mw-ts="(\d{14})"[^>]*data-mw-revid="(\d+)"', r.text)
    if not m:
        return None
    revid, ts = (m.group(1), m.group(2)) if m.re.pattern.startswith('data-mw-revid') else (m.group(2), m.group(1))
    if ts >= '20210101000000':
        return None
    r = wn.fetch(INDEX, {'oldid': revid, 'action': 'render'})
    body = r.text if r is not None else ''
    if 'mw-parser-output' not in body:
        return None
    parser = wn.Prose()
    parser.feed(body)
    out = []
    for p in parser.paras:
        p = wn.clean_para(p)
        if not p or wn.words(p) < 8 or re.search(r'https?://|www\.', p):
            continue
        # A paragraph ending in a colon introduced a list, table or code block that was removed.
        if not re.search(r'[.!?"”’)]$', p):
            continue
        if wn.words(' '.join(out + [p])) > 600:
            break
        out.append(p)
    text = '\n\n'.join(out)
    prose = sum(wn.words(wn.clean_para(p)) for p in parser.paras)
    if wn.words(text) < 60 or prose < 0.5 * max(1, visible_words(body)):
        return None
    toks = re.findall(r'[a-z]+', text.lower())
    if sum(x in {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'you', 'be', 'or'} for x in toks) < 0.15 * len(toks):
        return None
    if len(re.findall(r'[{};=]|\(\)', text)) > 0.01 * len(text):
        return None
    d = datetime.strptime(ts, '%Y%m%d%H%M%S').date()
    h = hashlib.sha1(title.encode()).hexdigest()[:10]
    return {
        'id': f'wikibooks-{h}', 'source': 'wikibooks', 'group': f'wikibooks:{book}', 'genre': 'docs',
        'register': register, 'nonNative': False, 'text': text,
        'url': f'https://en.wikibooks.org/w/index.php?oldid={revid}', 'author': 'Wikibooks contributors',
        'date': d.isoformat(), 'licence': LICENCE, 'redistributable': True,
        'note': f'Wikibooks page "{title}", revision {revid} (last before 2021; date is that revision\'s); '
                'top-level paragraphs only, templates, lists, tables, code and captions removed; cut at a paragraph end',
    }


def retidy():
    """Apply the colon-paragraph rule to an existing output file without fetching."""
    rows = []
    for l in open(OUT, encoding='utf-8'):
        r = json.loads(l)
        r['text'] = '\n\n'.join(p for p in r['text'].split('\n\n') if not p.rstrip().endswith(':'))
        if wn.words(r['text']) >= 60:
            rows.append(r)
    with open(OUT, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('retidied', len(rows))


def main():
    rng = random.Random(20214)
    samples, seen = [], set()
    # Resume: samples already written (partial run or an earlier full run) are kept, their books skipped.
    for src in (OUT, OUT + '.partial'):
        if not os.path.exists(src):
            continue
        for line in open(src, encoding='utf-8'):
            s = json.loads(line)
            if wn.norm(s['text']) in seen:
                continue
            samples.append(s)
            seen.add(wn.norm(s['text']))
    done = {s['group'].split(':', 1)[1] for s in samples}
    partial = open(OUT + '.partial', 'a', encoding='utf-8')
    for book, register in BOOKS:
        if book in done:
            continue
        titles = chapters(book)
        rng.shuffle(titles)
        cap = PER_BOOK * 2 if book == 'Cookbook' else PER_BOOK
        got, tried = 0, 0
        for t in titles:
            if got >= cap or tried >= cap * 3:
                break
            tried += 1
            s = page_sample(t, book, register)
            if not s:
                continue
            k = wn.norm(s['text'])
            if k in seen:
                continue
            seen.add(k)
            samples.append(s)
            partial.write(json.dumps(s, ensure_ascii=False) + '\n')
            partial.flush()
            got += 1
        print(book, 'pages', len(titles), 'tried', tried, 'kept', got, 'total', len(samples), flush=True)
    partial.close()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    os.remove(OUT + '.partial')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    retidy() if '--retidy' in sys.argv else main()
