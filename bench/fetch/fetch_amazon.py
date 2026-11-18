"""Amazon customer reviews written before 2014, from the amazon_polarity dataset.

Source:  amazon_polarity (Zhang, Zhao and LeCun 2015, "Character-level Convolutional Networks for
         Text Classification"), built from the SNAP Amazon reviews data of McAuley and Leskovec
         (2013), which covers reviews from 1995 to March 2013. Read from the Hugging Face dataset
         fancyzhx/amazon_polarity (test split, 400,000 rows) through the datasets-server rows API,
         pages of 100 rows at seeded offsets, cached under --raw.
Licence: the Hugging Face dataset card states Apache-2.0 for the dataset; the review text itself is
         Amazon customer content collected for research (SNAP terms: research use). Not treated as
         redistributable; local measurement only.
Usage:   python3 -I fetch_amazon.py /root/tells-data/human/amazon.jsonl [--target 400] [--raw DIR]

The data has no per-review date or product category: date is 2013-01-01 (end of the collection;
every review is from before 2013-04), group is a hash bucket of the text (20 buckets,
amazon:<n>). The review title is not part of the text. 60-600 words kept, English only, deduped.
"""
import hashlib, json, os, random, re, sys, time

import requests

API = 'https://datasets-server.huggingface.co/rows'
DS = 'fancyzhx/amazon_polarity'
N_TEST = 400000
LICENCE = {'name': 'Apache-2.0 (HF dataset card); review text is Amazon customer content, research use',
           'url': 'https://huggingface.co/datasets/fancyzhx/amazon_polarity'}
STOP = set('the and to of a i it is in this for that was my with but not you on have as be'.split())


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 400))
RAW = arg('--raw', '/root/tells-data/raw/amazon')
PAGES = int(arg('--pages', 30))
os.makedirs(RAW, exist_ok=True)


def page(offset):
    path = os.path.join(RAW, f'test-{offset}.json')
    if os.path.exists(path):
        return json.load(open(path))
    wait = 5
    for _ in range(5):
        try:
            r = requests.get(API, params={'dataset': DS, 'config': 'amazon_polarity', 'split': 'test', 'offset': offset, 'length': 100},
                             headers={'User-Agent': 'tells-research/0.3 (dataset builder)'}, timeout=60)
            if r.status_code == 200:
                rows = [x['row'] for x in r.json()['rows']]
                json.dump(rows, open(path, 'w'))
                time.sleep(1.5)
                return rows
        except (requests.RequestException, ValueError, KeyError):
            pass
        time.sleep(wait)
        wait *= 2
    return []


def words(t):
    return re.findall(r"[\w'’-]+", t)


def main():
    rng = random.Random(2013)
    offsets = sorted(rng.sample(range(0, N_TEST - 100, 100), PAGES))
    cands, seen = [], set()
    for off in offsets:
        for i, r in enumerate(page(off)):
            text = re.sub(r'<[^>]+>', ' ', r.get('content') or '')
            text = re.sub(r'\s+', ' ', text).strip()
            w = words(text)
            if not 60 <= len(w) <= 600 or re.search(r'https?://|www\.', text):
                continue
            letters = re.findall(r'[^\W\d_]', text)
            if sum(c.isascii() for c in letters) / len(letters) < 0.98 or sum(x.lower() in STOP for x in w) / len(w) < 0.18:
                continue
            k = re.sub(r'\W+', ' ', text.lower()).strip()
            if k in seen:
                continue
            seen.add(k)
            hx = hashlib.sha1(k.encode()).hexdigest()
            cands.append({
                'id': f'amazon-{hx[:12]}', 'source': 'amazon', 'group': f'amazon:{int(hx, 16) % 20}', 'genre': 'review',
                'register': 'casual', 'nonNative': False, 'text': text, 'url': 'https://huggingface.co/datasets/fancyzhx/amazon_polarity',
                'author': None, 'date': '2013-01-01', 'licence': LICENCE, 'redistributable': False,
                'note': f'amazon_polarity test row {off + i} ({"positive" if r.get("label") == 1 else "negative"}); title dropped, '
                        'whitespace normalised; no per-review date, 2013-01-01 is the end of the SNAP collection (to March 2013)',
            })
    cands.sort(key=lambda c: c['id'])
    out = cands[:TARGET]
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in out:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('candidates', len(cands), 'wrote', len(out))


if __name__ == '__main__':
    main()
