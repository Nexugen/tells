"""Reddit posts and comments (2006 to 2016) from the Webis-TLDR-17 corpus.

Source:  https://huggingface.co/datasets/webis/tldr-17 read through the datasets-server rows API
         (the viewer serves the first 1,327,000 rows). The "content" field (the post without its
         TL;DR line) is used, never the summary. Creation dates are looked up by id on the
         Arctic Shift Reddit archive API (https://arctic-shift.photon-reddit.com); when an id is not
         found the corpus upper bound 2016-12-31 is used and the note says so.
Licence: CC BY 4.0, per the HF dataset card and the Zenodo record 10.5281/zenodo.1043504.
Usage:   python3 -I fetch_reddit.py /root/tells-data/human/reddit.jsonl [--target 500] [--pages 70]
At most 30 samples per subreddit, allocated in proportion to subreddit volume. Pages are drawn at
fixed offsets spread over the rows, so reruns give the same ids.
"""
import hashlib, html, json, re, sys, time

import requests

OUT = sys.argv[1]
TARGET = int(sys.argv[sys.argv.index('--target') + 1]) if '--target' in sys.argv else 500
PAGES = int(sys.argv[sys.argv.index('--pages') + 1]) if '--pages' in sys.argv else 70
PER_SUB = 30
ROWS = 1327000
API = 'https://datasets-server.huggingface.co/rows?dataset=webis/tldr-17&config=default&split=train&offset={}&length=100'
LICENCE = {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/'}
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
STOP = set('the and to of a i it is that in you for was my but on with this have be not they so me just at are what like do he she we if or as all your can'.split())


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
    for p in t.split('\n\n'):
        if words('\n\n'.join(out + [p])) > cap:
            break
        out.append(p)
    if out and words('\n\n'.join(out)) >= 60:
        return '\n\n'.join(out)
    out = []
    for s in re.split(r'(?<=[.!?])\s+', t):
        if words(' '.join(out + [s])) > cap:
            break
        out.append(s)
    return ' '.join(out)


def clean(t):
    t = html.unescape(t).replace('\r', '')
    lines = [l for l in t.split('\n') if not l.lstrip().startswith('>')]  # quoted replies
    t = '\n'.join(lines)
    t = re.sub(r'\[([^\]]*)\]\(\s*\)?', r'\1', t)  # links whose URL the corpus already removed
    t = re.sub(r'https?://\S+|www\.\S+', '', t)
    t = re.sub(r'(?<!\w)[*_]{1,3}(\S[^*_\n]*?\S|\S)[*_]{1,3}(?!\w)', r'\1', t)  # markdown emphasis
    t = re.sub(r'^\s*#+\s*', '', t, flags=re.M)
    t = re.sub(r'(?i)\b(?:edit|update)\s*\d*\s*:.*$', '', t, flags=re.S) if words(t) > 200 else t
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r' *\n *', '\n', t)
    t = re.sub(r'\n{2,}', '\n\n', t)
    return t.strip()


def english(t):
    ws = re.findall(r"[a-z']+", t.lower())
    if not ws:
        return False
    ascii_share = sum(c.isascii() for c in t) / len(t)
    return ascii_share > 0.97 and sum(w in STOP for w in ws) / len(ws) > 0.25


def mostly_list(t):
    lines = [l for l in t.split('\n') if l.strip()]
    listy = sum(1 for l in lines if re.match(r'^\s*(?:[-*+•]|\d+[.)])\s', l))
    return len(lines) >= 4 and listy > 0.4 * len(lines)


def dates_for(ids):
    out = {}
    for kind, sel in (('comments', [i for i in ids if i.startswith('c') or i.startswith('d')]), ('posts', ids)):
        sel = [i for i in sel if i not in out]
        for k in range(0, len(sel), 50):
            chunk = sel[k:k + 50]
            try:
                d = get_json(f'https://arctic-shift.photon-reddit.com/api/{kind}/ids?ids={",".join(chunk)}&fields=id,created_utc', tries=3)
                for x in d.get('data') or []:
                    out[x['id']] = time.strftime('%Y-%m-%d', time.gmtime(int(x['created_utc'])))
            except Exception as e:
                print('date lookup failed', kind, e)
            time.sleep(1.5)
    return out


def main():
    by_sub, seen = {}, set()
    for p in range(PAGES):
        off = int(p * (ROWS - 100) / max(1, PAGES - 1))
        d = get_json(API.format(off))
        for row in d.get('rows', []):
            x = row['row']
            t = clean(x.get('content') or '')
            if words(t) < 60 or not english(t) or mostly_list(t):
                continue
            t = trim(t)
            if words(t) < 60:
                continue
            k = re.sub(r'\W+', ' ', t.lower()).strip()
            if k in seen:
                continue
            seen.add(k)
            by_sub.setdefault(x['subreddit'], []).append({'id': x['id'], 'author': x['author'], 'text': t, 'sub': x['subreddit']})
        time.sleep(3)
        print('page', p, 'offset', off, 'subs', len(by_sub))
    # Allocate the target in proportion to each subreddit's share of the eligible rows (so busy
    # subreddits get more, capped at PER_SUB), then hand out the remainder one per subreddit in a
    # fixed hash order so small subreddits are spread at random rather than alphabetically.
    total = sum(len(v) for v in by_sub.values())
    quota = {s: min(PER_SUB, len(v), int(len(v) * TARGET / total)) for s, v in by_sub.items()}
    order = sorted(by_sub, key=lambda s: hashlib.sha1(s.encode()).hexdigest())
    left = TARGET - sum(quota.values())
    for sub in order:
        if left <= 0:
            break
        if quota[sub] < min(PER_SUB, len(by_sub[sub])):
            quota[sub] += 1
            left -= 1
    picked = [x for sub in order for x in by_sub[sub][:quota[sub]]]
    dates = dates_for([x['id'] for x in picked])
    with open(OUT, 'w', encoding='utf-8') as f:
        for x in picked:
            date = dates.get(x['id'])
            note = 'Webis-TLDR-17 "content" field (TL;DR removed by the corpus); quoted lines, URLs and markdown stripped'
            if not date:
                date, note = '2016-12-31', note + '; creation date not found, corpus upper bound used'
            f.write(json.dumps({
                'id': f'reddit-{x["id"]}', 'source': 'reddit', 'group': f'reddit:{x["sub"]}', 'genre': 'forum',
                'register': 'casual', 'nonNative': False, 'text': x['text'],
                'url': f'https://www.reddit.com/r/{x["sub"]}/comments/{x["id"]}/' if not x['id'].startswith('c')
                       else f'https://www.reddit.com/r/{x["sub"]}/comments/_/_/{x["id"]}/',
                'author': x['author'], 'date': date, 'licence': LICENCE, 'redistributable': True, 'note': note,
            }, ensure_ascii=False) + '\n')
    print('wrote', len(picked), 'subreddits', len({x['sub'] for x in picked}), 'dated', sum(x['id'] in dates for x in picked))


if __name__ == '__main__':
    main()
