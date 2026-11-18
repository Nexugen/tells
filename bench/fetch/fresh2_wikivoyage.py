"""English Wikivoyage city-guide prose, as of the last revision before 2021, for the fresh-2 held-out set.

Source:  https://en.wikivoyage.org. Candidate pages are the members of Category:Star cities and
         Category:Guide cities (list=categorymembers, the only API calls). For each page the last
         revision before 2021-01-01 is found from the history page (index.php?action=history&
         offset=20210101000000&limit=1, the same revision as prop=revisions&rvstart=2020-12-31T00:00:00Z
         &rvdir=older&rvlimit=1) and rendered with index.php?oldid=...&action=render.
Licence: CC BY-SA 3.0 (Wikivoyage text licence for revisions before 2023), attributed to
         "Wikivoyage contributors" with a link to the revision.
Usage:   python3 -I fresh2_wikivoyage.py /root/tells-data/fresh-2/human/wikivoyage.jsonl [--pages 150]

One sample per page, from its "Understand", "Get in" or "See" section (the preferred section rotates
from page to page so the three are mixed; if it has too little prose the next one is tried). Only
the section's top-level <p> paragraphs are kept, so listings, lists, tables, climate boxes, images
and captions drop out; paragraphs holding listing markup, links spelled out or no sentence end are
skipped, and the run stops at the first list or table after 60 words so the text stays
consecutive. Up to 600 words, cut at a paragraph end. A section is skipped if its prose is under
60 words. Register: "marketing" when the text sells the place (several promotional words such as
stunning, charming, must-see), otherwise "professional".
"""
import hashlib, html, json, os, random, re, sys, time
from datetime import datetime
from html.parser import HTMLParser

import requests

API = 'https://en.wikivoyage.org/w/api.php'
INDEX = 'https://en.wikivoyage.org/w/index.php'
UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
LICENCE = {'name': 'CC BY-SA 3.0', 'url': 'https://creativecommons.org/licenses/by-sa/3.0/'}
SECTIONS = ['Understand', 'Get_in', 'See']
PROMO = re.compile(r'(?i)\b(?:stunning|charming|breathtaking|picturesque|vibrant|bustling|delightful|must-see|'
                   r'world-class|world-famous|spectacular|magnificent|gorgeous|unforgettable|enchanting|'
                   r'idyllic|lively|beautiful|wonderful|fascinating|impressive|famous|renowned|unique|'
                   r'treasures?|gem|highlights?|attractions?|worth (?:a )?visit(?:ing)?|not to be missed|'
                   r'well worth|best-preserved|splendid|glorious|scenic|perfect)\b')


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


def category(name):
    out, cont = [], {}
    while True:
        params = dict(action='query', list='categorymembers', cmtitle='Category:' + name, cmnamespace=0,
                      cmlimit=500, format='json', formatversion=2, maxlag=5, **cont)
        r = fetch(API, params)
        try:
            d = r.json() if r is not None else {}
        except ValueError:
            d = {}
        out += [m['title'] for m in d.get('query', {}).get('categorymembers', [])]
        if 'continue' not in d:
            return out
        cont = {'cmcontinue': d['continue']['cmcontinue']}


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


class Sections(HTMLParser):
    """Top-level paragraphs per h2 section; a None entry marks a list, table or box between them."""

    VOID = {'br', 'img', 'hr', 'wbr', 'meta', 'link', 'input', 'source', 'area', 'col', 'base', 'track'}
    BLOCKS = {'ul', 'ol', 'dl', 'table', 'pre', 'blockquote', 'figure'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections, self.section = {}, None
        self.stack = []          # open tags below mw-parser-output: (tag, hidden)
        self.cur, self.in_p, self.listing = [], False, False
        self.in_h2, self.h2 = False, ''

    def hidden(self):
        return any(h for _, h in self.stack)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls, style = a.get('class') or '', (a.get('style') or '').replace(' ', '')
        if (tag == 'div' and 'mw-parser-output' in cls) or tag == 'section':
            return  # Parsoid wraps each heading's content in <section>: transparent here
        if tag == 'h2':
            self.in_h2, self.h2 = True, a.get('id') or ''
        if tag in self.VOID:
            if tag == 'br' and self.in_p:
                self.cur.append(' ')
            return
        if self.in_p and ('vcard' in cls or 'listing' in cls):
            self.listing = True
        hide = tag in ('sup', 'style', 'script') or 'display:none' in style or 'noprint' in cls \
            or 'mw-editsection' in cls or 'reference' in cls
        if tag == 'p' and len(self.stack) == 0:
            self.in_p, self.cur, self.listing = True, [], False
        elif len(self.stack) == 0 and (tag in self.BLOCKS or (tag == 'div' and 'mw-heading' not in cls)):
            if self.section is not None:
                self.sections.setdefault(self.section, []).append(None)
        self.stack.append((tag, hide))

    def handle_endtag(self, tag):
        if tag in self.VOID or tag == 'section':
            return
        if tag == 'h2':
            self.in_h2 = False
            self.section = self.h2 or None
        # Pop to the matching tag (tolerates unclosed inner tags).
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        else:
            return
        if tag == 'p' and self.in_p and len(self.stack) == 0:
            self.in_p = False
            text = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
            if self.section is not None and text:
                self.sections.setdefault(self.section, []).append(None if self.listing else text)

    def handle_data(self, data):
        if self.in_h2 and not self.h2:
            self.h2 = data.strip().replace(' ', '_')
        if self.in_p and not self.hidden():
            self.cur.append(data)


def section_text(paras):
    out = []
    for p in paras:
        if p is None:
            if words(' '.join(out)) >= 60:
                break
            out = []
            continue
        p = re.sub(r'\s+([,.;:!?])', r'\1', p).strip()
        if words(p) < 8 or re.search(r'https?://|www\.|\+\d[\d ()-]{6,}', p) or not re.search(r'[.!?"”’)]$', p):
            if words(' '.join(out)) >= 60:
                break
            out = []
            continue
        if words(' '.join(out + [p])) > 600:
            break
        out.append(p)
    text = '\n\n'.join(out)
    if words(text) < 60:
        return None
    toks = re.findall(r'[a-z]+', text.lower())
    if sum(x in {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'you', 'be', 'or'} for x in toks) < 0.15 * len(toks):
        return None
    if len(re.findall(r'\d', text)) > 0.05 * len(text):  # timetables, prices, distances
        return None
    return text


def page_sample(title, order):
    r = fetch(INDEX, {'title': title, 'action': 'history', 'offset': '20210101000000', 'limit': 1})
    if r is None:
        return None
    m = re.search(r'data-mw-revid="(\d+)"[^>]*data-mw-ts="(\d{14})"', r.text)
    if not m or m.group(2) >= '20210101000000':
        return None
    revid, ts = m.group(1), m.group(2)
    r = fetch(INDEX, {'oldid': revid, 'action': 'render'})
    if r is None or 'mw-parser-output' not in r.text:
        return None
    parser = Sections()
    parser.feed(r.text)
    for sec in order:
        text = section_text(parser.sections.get(sec, []))
        if not text:
            continue
        promo = len(PROMO.findall(text))
        register = 'marketing' if promo >= 3 or (sec == 'See' and promo >= 2) else 'professional'
        d = datetime.strptime(ts, '%Y%m%d%H%M%S').date()
        h = hashlib.sha1(f'{title}|{sec}'.encode()).hexdigest()[:10]
        return {
            'id': f'wikivoyage-{h}', 'source': 'wikivoyage', 'group': f'wikivoyage:{title}', 'genre': 'guidance',
            'register': register, 'nonNative': False, 'text': text,
            'url': f'https://en.wikivoyage.org/w/index.php?oldid={revid}', 'author': 'Wikivoyage contributors',
            'date': d.isoformat(), 'licence': LICENCE, 'redistributable': True,
            'note': f'Wikivoyage "{title}", section "{sec.replace("_", " ")}", revision {revid} (last before 2021; '
                    'date is that revision\'s); top-level paragraphs only, listings, lists, tables, templates and '
                    'captions removed; cut at a paragraph end',
        }
    return None


def main():
    out_path = sys.argv[1]
    want = int(sys.argv[sys.argv.index('--pages') + 1]) if '--pages' in sys.argv else 150
    rng = random.Random(20223)
    titles = sorted(set(category('Star cities') + category('Guide cities')))
    print('candidate pages', len(titles), flush=True)
    rng.shuffle(titles)
    samples, seen = [], set()
    partial = out_path + '.partial'
    done = set()
    if os.path.exists(partial):
        for line in open(partial, encoding='utf-8'):
            s = json.loads(line)
            samples.append(s)
            seen.add(norm(s['text']))
            done.add(s['group'].split(':', 1)[1])
    pf = open(partial, 'a', encoding='utf-8')
    for i, title in enumerate(titles):
        if len(samples) >= want:
            break
        order = SECTIONS[i % 3:] + SECTIONS[:i % 3]
        if title in done:
            continue
        s = page_sample(title, order)
        if not s or norm(s['text']) in seen:
            continue
        seen.add(norm(s['text']))
        samples.append(s)
        pf.write(json.dumps(s, ensure_ascii=False) + '\n')
        pf.flush()
        if len(samples) % 10 == 0:
            print('kept', len(samples), 'tried', i + 1, flush=True)
    pf.close()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    os.remove(partial)
    print('wrote', len(samples), 'to', out_path)


if __name__ == '__main__':
    main()
