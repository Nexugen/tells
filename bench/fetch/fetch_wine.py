"""WineEnthusiast tasting notes (wine reviews), scraped 2017.

Source:  "Wine Reviews" by zackthoutt (https://www.kaggle.com/datasets/zynicide/wine-reviews), the
         130k-review WineEnthusiast scrape of 2017 with taster names, read through the Hugging Face
         mirror spawn99/wine-reviews with the datasets-server rows API (pages of 100 rows from
         seeded offsets, cached under --raw).
Licence: CC BY-NC-SA 4.0, as published on Kaggle and repeated on the mirror's dataset card
         ("License: CC BY-NC-SA 4.0, Attribution: Zackthoutt"). Non-commercial, so not
         redistributable in an MIT repo; local measurement only.
Usage:   python3 -I fetch_wine.py /root/tells-data/human/wine.jsonl [--target 300] [--raw DIR]

Tasting notes are short: 40 to 600 words kept (an exception to the 60-word floor). Deduped by
normalised text; at most 6 per variety. Group = wine:<variety>. author = the taster's name.
Date is the scrape year (reviews were written before it).
"""
import collections, hashlib, json, os, random, re, sys, time

import requests

API = 'https://datasets-server.huggingface.co/rows'
DS = 'spawn99/wine-reviews'
LICENCE = {'name': 'CC BY-NC-SA 4.0', 'url': 'https://creativecommons.org/licenses/by-nc-sa/4.0/'}
KAGGLE = 'https://www.kaggle.com/datasets/zynicide/wine-reviews'
N_TRAIN = 196630


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 300))
RAW = arg('--raw', '/root/tells-data/raw/wine')
PAGES = int(arg('--pages', 25))
os.makedirs(RAW, exist_ok=True)


def page(offset):
    path = os.path.join(RAW, f'train-{offset}.json')
    if os.path.exists(path):
        return json.load(open(path))
    wait = 5
    for _ in range(5):
        try:
            r = requests.get(API, params={'dataset': DS, 'config': 'default', 'split': 'train', 'offset': offset, 'length': 100},
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
    return len(re.findall(r"[\w'’-]+", t))


def main():
    rng = random.Random(2017)
    offsets = sorted(rng.sample(range(0, N_TRAIN - 100, 100), PAGES))
    cands, seen = [], set()
    for off in offsets:
        for i, r in enumerate(page(off)):
            text = re.sub(r'\s+', ' ', (r.get('description') or '')).strip()
            if not 40 <= words(text) <= 600:
                continue
            k = re.sub(r'\W+', ' ', text.lower()).strip()
            if k in seen:
                continue
            seen.add(k)
            variety = (r.get('variety') or 'unknown').strip()
            sid = 'wine-' + hashlib.sha1(k.encode()).hexdigest()[:12]
            cands.append({
                'id': sid, 'source': 'wine', 'group': 'wine:' + re.sub(r'[^a-z0-9]+', '-', variety.lower()).strip('-'),
                'genre': 'review', 'register': 'marketing', 'nonNative': False, 'text': text, 'url': KAGGLE,
                'author': (r.get('taster_name') or None), 'date': '2017-01-01', 'licence': LICENCE, 'redistributable': False,
                'note': f'WineEnthusiast tasting note for "{(r.get("title") or "").strip()[:100]}" ({r.get("points")} points); '
                        f'mirror row {off + i}; whitespace normalised; date is the 2017 scrape year',
            })
    cands.sort(key=lambda c: c['id'])
    per, out = collections.Counter(), []
    for c in cands:
        if per[c['group']] < 6 and len(out) < TARGET:
            per[c['group']] += 1
            out.append(c)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in out:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('candidates', len(cands), 'wrote', len(out), 'groups', len(per))


if __name__ == '__main__':
    main()
