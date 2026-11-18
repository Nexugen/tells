"""English Wikinews articles published 2006 to 2020, for the fresh-1 held-out set.

Source:  the MediaWiki API at https://en.wikinews.org/w/api.php. For each month, a few day
         categories ("Category:March 5, 2015") are picked at random (fixed seed), one published
         article is taken from each, and the article is rendered from the revision current a week
         after its publication date (index.php?oldid=...&action=render), so later edits are left out.
         The API is only used for category listings: Wikimedia rate-limits unidentified API clients
         hard, so revision lookup (the history page) and rendering go through index.php.
Licence: Wikinews:Copyright says material published after 25 September 2005 and before
         16 December 2024 is CC BY 2.5 (CC BY 4.0 after that, public domain before). Every article
         here is from 2006 to 2020, so all are CC BY 2.5, attributed to "Wikinews".
Usage:   python3 -I fresh1_wikinews.py /root/tells-data/fresh-1/human/wikinews.jsonl [--per-month 2]
         python3 -I fresh1_wikinews.py <out.jsonl> --retidy [--keep 250]   (re-apply paragraph rules, thin evenly)

Only article prose is kept: the <p> paragraphs at the top level of the rendered page, so infoboxes,
image captions, tables, related-news boxes and templates drop out. The publication dateline, the
"Sources", "External links" and "Related news" sections, and interview transcripts are removed.
Text is cut at a paragraph end at 600 words; articles under 60 words are dropped.
"""
import hashlib, html, json, os, random, re, sys, time
from datetime import date, datetime, timedelta
from html.parser import HTMLParser

import requests

OUT = sys.argv[1]
PER_MONTH = int(sys.argv[sys.argv.index('--per-month') + 1]) if '--per-month' in sys.argv else 2
API = 'https://en.wikinews.org/w/api.php'
INDEX = 'https://en.wikinews.org/w/index.php'
UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
LICENCE = {'name': 'CC BY 2.5', 'url': 'https://creativecommons.org/licenses/by/2.5/'}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December']
STOP_HEADINGS = re.compile(r'^(?:sources?|external links|related news|related articles|see also|references|notes|interview)$', re.I)


def fetch(url, params):
    for attempt in range(8):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
        except requests.RequestException:
            time.sleep(10 * (attempt + 1))
            continue
        if r.status_code == 429 or 'maxlag' in r.text[:200]:
            time.sleep(int(r.headers.get('Retry-After', 30)) + 5 * attempt)
            continue
        time.sleep(1.5)
        return r if r.status_code == 200 else None
    return None


def api(**params):
    params.update(format='json', formatversion=2, maxlag=5)
    r = fetch(API, params)
    try:
        return r.json() if r is not None else {}
    except ValueError:
        return {}


class Prose(HTMLParser):
    """Collect the text of top-level <p> elements, stopping at the first unwanted heading."""

    SKIP = {'table', 'figure', 'div', 'ul', 'ol', 'dl', 'blockquote', 'pre', 'style', 'script', 'sup', 'span_hidden'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras, self.cur, self.in_p, self.skip, self.stop = [], [], False, 0, False
        self.depth = 0  # depth of skipped containers above the current position
        self.heading, self.in_h = [], False
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if self.stop:
            return
        a = dict(attrs)
        cls = a.get('class') or ''
        style = a.get('style') or ''
        if tag in ('h2', 'h3'):
            self.in_h, self.heading = True, []
        if tag == 'div' and 'mw-parser-output' in cls:
            self.stack.append(('div', False))
            return
        hide = tag in self.SKIP or 'display:none' in style.replace(' ', '') or 'published' in cls \
            or 'reference' in cls or 'noprint' in cls or 'mw-editsection' in cls
        if tag in ('br', 'img', 'hr', 'wbr', 'meta', 'link', 'input'):
            if tag == 'br' and self.in_p and not self.skip:
                self.cur.append(' ')
            return
        self.stack.append((tag, hide))
        if hide:
            self.skip += 1
        if tag == 'p' and not self.skip:
            self.in_p, self.cur = True, []

    def handle_endtag(self, tag):
        if self.stop:
            return
        if tag in ('h2', 'h3') and self.in_h:
            self.in_h = False
            h = re.sub(r'\s+', ' ', ''.join(self.heading)).strip()
            if STOP_HEADINGS.match(h):
                self.stop = True
        # pop to the matching tag
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, hide in self.stack[i:]:
                    if hide:
                        self.skip -= 1
                del self.stack[i:]
                break
        if tag == 'p' and self.in_p:
            self.in_p = False
            t = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
            if t:
                self.paras.append(t)

    def handle_data(self, data):
        if self.stop:
            return
        if self.in_h:
            self.heading.append(data)
        if self.in_p and not self.skip:
            self.cur.append(data)


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def clean_para(p):
    p = re.sub(r'\[\s*(?:edit|citation needed|\d+)\s*\]', '', p)
    p = re.sub(r'\s+([,.;:!?])', r'\1', p)
    return re.sub(r'\s+', ' ', p).strip()


def article_text(paras):
    out = []
    for p in paras:
        p = clean_para(p)
        if not p or words(p) < 5:
            continue
        if re.match(r'^(?:\w+day, )?\w+ \d{1,2}, \d{4}$', p):  # dateline
            continue
        if re.search(r'https?://|www\.', p):
            continue
        if not re.search(r'[.!?"”’)\']$', p):  # headline links, or a colon leading into a removed list
            continue
        if words(' '.join(out + [p])) > 600:
            break
        out.append(p)
    return '\n\n'.join(out)


def looks_like_interview(paras):
    qa = sum(1 for p in paras if re.match(r"^\(?\(?(?:WN|Wikinews|Q|A)\)?\)?\s*[:)]|^\(\(WN\)\)", p))
    return qa >= 3


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def day_categories(year, month):
    n = (date(year + (month == 12), month % 12 + 1, 1) - date(year, month, 1)).days
    return [f'Category:{MONTHS[month - 1]} {d}, {year}' for d in range(1, n + 1)]


def main():
    rng = random.Random(20211)
    samples, seen = [], set()
    if os.path.exists(OUT + '.partial'):
        for line in open(OUT + '.partial', encoding='utf-8'):
            s = json.loads(line)
            samples.append(s)
            seen.add(norm(s['text']))
    done_months = {s['group'].split(':', 1)[1] for s in samples}
    partial = open(OUT + '.partial', 'a', encoding='utf-8')
    for year in range(2006, 2021):
        for month in range(1, 13):
            ym = f'{year}-{month:02d}'
            if ym in done_months:
                continue
            days = day_categories(year, month)
            rng.shuffle(days)
            got, tries = 0, 0
            for cat in days:
                if got >= PER_MONTH or tries >= PER_MONTH + 4:
                    break
                tries += 1
                q = api(action='query', generator='categorymembers', gcmtitle=cat, gcmnamespace=0, gcmlimit=100,
                        gcmtype='page', prop='categories', cllimit='max',
                        clcategories='Category:Published|Category:Disputed|Category:Retracted')
                members = []
                for pg in q.get('query', {}).get('pages', []):
                    cats = {c['title'] for c in pg.get('categories', [])}
                    if 'Category:Published' in cats and not cats & {'Category:Disputed', 'Category:Retracted'}:
                        members.append(pg['title'])
                members.sort()
                if not members:
                    continue
                rng.shuffle(members)
                for title in members[:3]:
                    s = fetch_article(title, cat, year, month)
                    if not s:
                        continue
                    k = norm(s['text'])
                    if k in seen:
                        continue
                    seen.add(k)
                    samples.append(s)
                    partial.write(json.dumps(s, ensure_ascii=False) + '\n')
                    partial.flush()
                    got += 1
                    break
            print(ym, 'kept', got, 'total', len(samples), flush=True)
    partial.close()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    os.remove(OUT + '.partial')
    print('wrote', len(samples), 'to', OUT)


def retidy(keep):
    """Re-apply the paragraph rules to an existing output file without fetching, and optionally
    thin it to `keep` samples: whole months are kept and the second sample is dropped from every
    k-th month, so the spread over 2006 to 2020 stays even."""
    rows = []
    for l in open(OUT, encoding='utf-8'):
        r = json.loads(l)
        r['text'] = '\n\n'.join(p for p in r['text'].split('\n\n') if re.search(r'[.!?"”’)\']$', p.rstrip()))
        if words(r['text']) >= 60:
            rows.append(r)
    if keep and len(rows) > keep:
        by_month = {}
        for r in rows:
            by_month.setdefault(r['group'], []).append(r)
        extra = [g for g in sorted(by_month) if len(by_month[g]) > 1]
        drop_n = len(rows) - keep
        step = len(extra) / drop_n if drop_n <= len(extra) else 1
        drop = {extra[int(i * step)] for i in range(min(drop_n, len(extra)))}
        rows = [r for g in sorted(by_month) for r in (by_month[g][:1] if g in drop else by_month[g])]
    with open(OUT, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('retidied', len(rows))


def fetch_article(title, cat, year, month):
    m = re.match(r'Category:(\w+) (\d+), (\d{4})', cat)
    pub = date(int(m.group(3)), MONTHS.index(m.group(1)) + 1, int(m.group(2)))
    cutoff = datetime(pub.year, pub.month, pub.day) + timedelta(days=8)
    # The history page lists revisions older than `offset`, newest first.
    r = fetch(INDEX, {'title': title, 'action': 'history', 'offset': cutoff.strftime('%Y%m%d000000'), 'limit': 1})
    m = re.search(r'data-mw-revid="(\d+)"', r.text) if r is not None else None
    if not m:
        return None
    revid = int(m.group(1))
    r = fetch(INDEX, {'oldid': revid, 'action': 'render'})
    body = r.text if r is not None else ''
    if 'mw-parser-output' not in body:
        return None
    parser = Prose()
    parser.feed(body)
    paras = parser.paras
    if looks_like_interview(paras):
        return None
    text = article_text(paras)
    if words(text) < 60 or not text.strip():
        return None
    # English and prose only: a minimum share of common function words.
    toks = re.findall(r'[a-z]+', text.lower())
    if sum(t in {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'was', 'that', 'for', 'on', 'said'} for t in toks) < 0.12 * len(toks):
        return None
    h = hashlib.sha1(title.encode()).hexdigest()[:10]
    return {
        'id': f'wikinews-{h}', 'source': 'wikinews', 'group': f'wikinews:{pub.year}-{pub.month:02d}',
        'genre': 'news', 'register': 'professional', 'nonNative': False, 'text': text,
        'url': f'https://en.wikinews.org/w/index.php?oldid={revid}', 'author': 'Wikinews contributors',
        'date': pub.isoformat(), 'licence': LICENCE, 'redistributable': True,
        'note': f'Wikinews article "{title}", revision {revid} (as of a week after publication); '
                'rendered HTML reduced to top-level paragraphs; dateline, infobox, captions, Sources '
                'and related-news sections removed; cut at a paragraph end',
    }


if __name__ == '__main__':
    if '--retidy' in sys.argv:
        retidy(int(sys.argv[sys.argv.index('--keep') + 1]) if '--keep' in sys.argv else 0)
    else:
        main()
