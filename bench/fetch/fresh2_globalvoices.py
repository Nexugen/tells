"""Global Voices (English) articles published 2005 to 2020, for the fresh-2 held-out set.

Source:  the WordPress REST API at https://globalvoices.org/wp-json/wp/v2/posts (after/before one
         calendar year at a time, a few random result pages per year, fixed seed). The article page
         itself is fetched for each kept post to read the byline (<meta name="author">) and the
         credits, because the users endpoint is closed to anonymous clients.
Licence: CC BY 3.0. The site footer reads "This site is licensed as Creative Commons Attribution 3.0"
         and https://globalvoices.org/about/global-voices-attribution-policy/ says "Unless otherwise
         stated, all content created by Global Voices is published under a Creative Commons
         Attribution-Only license" linking https://creativecommons.org/licenses/by/3.0/ (checked
         2026-11-18). Posts republished from partner outlets (content-sharing agreements) are skipped,
         since their licence may differ, and so are translations (a "Translated by" credit), so every
         text is the credited writer's own English.
Usage:   python3 -I fresh2_globalvoices.py /root/tells-data/fresh-2/human/globalvoices.jsonl [--per-year 13]
         python3 -I fresh2_globalvoices.py <out.jsonl> --retidy   (re-apply the language-tag removal only)

Text: the article's opening top-level <p> paragraphs, HTML stripped, with the "[es]"-style
language tags Global Voices puts after links removed. Captions, image credits,
embedded media, blockquotes (quoted tweets, posts and translations of them), lists and tables are
not taken; paragraphs that are wholly a quotation, editor's notes and series notes are skipped, and
a paragraph ending in a colon (which introduced a quote) is dropped. Interviews stop before the
first question (or are skipped when the question comes first). The run stops at the first
quote, list or embed once it has 60 words, and is cut at a paragraph end at 600 words.
Many writers are not native English speakers, but nonNative is false unless the post says so.
Genre is "blog" for first-person posts (three or more I/me/my), otherwise "news".
"""
import hashlib, html, json, os, random, re, sys, time
from datetime import datetime
from html.parser import HTMLParser

import requests

API = 'https://globalvoices.org/wp-json/wp/v2/posts'
UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
LICENCE = {'name': 'CC BY 3.0', 'url': 'https://creativecommons.org/licenses/by/3.0/'}
PARTNER = re.compile(r'(?i)originally (?:published|appeared)|republished|re-published|content[- ]sharing|'
                     r'partnership (?:with|between)|is published here|cross-posted|crossposted|with permission')
SKIP_PARA = re.compile(r'(?i)^(?:\[?(?:photo|image|screenshot|featured image|video|picture|map|graphic|chart|'
                       r'cover|source)\b|this (?:post|article|story|report) (?:is|was|forms) (?:part|one)|'
                       r'\[?(?:note|editor|update|disclaimer|correction|all links|unless otherwise)\b|'
                       r'(?:read|see|watch|listen)(?: also| more)?:|follow (?:our|us|global voices)|'
                       r'thumbnail|^via\b)')


def fetch(url, params=None):
    for attempt in range(5):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
            time.sleep(1.2)
            if r.status_code == 200:
                return r
            if r.status_code in (400, 404):
                return None
        except requests.RequestException:
            pass
        time.sleep(10 * (attempt + 1))
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


class Blocks(HTMLParser):
    """Top-level blocks of a post body: ('p', text) for paragraphs, ('x', '') for anything else."""

    VOID = {'br', 'img', 'hr', 'wbr', 'meta', 'link', 'input', 'source', 'embed', 'param'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.stack, self.cur = [], [], []
        self.hide = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            if tag == 'br' and self.stack and self.stack[0] == 'p':
                self.cur.append(' ')
            return
        cls = dict(attrs).get('class') or ''
        if not self.stack:
            self.cur = []
        if self.stack and self.stack[0] == 'p' and (tag in ('iframe', 'script', 'sup', 'img', 'object')
                                                    or 'caption' in cls):
            self.hide += 1
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID or tag not in self.stack:
            return
        while self.stack:
            t = self.stack.pop()
            if self.stack and self.stack[0] == 'p' and t in ('iframe', 'script', 'sup', 'img', 'object'):
                self.hide = max(0, self.hide - 1)
            if t == tag:
                break
        if not self.stack:
            if tag == 'p':
                text = re.sub(r'\s+', ' ', ''.join(self.cur).replace('\xa0', ' ')).strip()
                self.blocks.append(('p', text) if text else ('x', ''))
            else:
                self.blocks.append(('x', ''))
            self.hide = 0

    def handle_data(self, data):
        if self.stack and self.stack[0] == 'p' and not self.hide:
            self.cur.append(data)


LANG_TAG = re.compile(r'(?i)\s*\[(?!sic\])(?:[a-z]{2,3}(?:-[a-z]{2,4})?(?:\s*(?:,|/|and|&)\s*[a-z]{2,3}(?:-[a-z]{2,4})?)*)\]')


def strip_lang_tags(p):
    return re.sub(r'\s+([,.;:!?])', r'\1', LANG_TAG.sub('', p))


def retidy(path):
    """Re-apply the language-tag removal to an existing output file without fetching."""
    rows = [json.loads(l) for l in open(path, encoding='utf-8')]
    for r in rows:
        r['text'] = '\n\n'.join(strip_lang_tags(p).strip() for p in r['text'].split('\n\n'))
    rows = [r for r in rows if words(r['text']) >= 60]
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('retidied', len(rows))


def opening_text(content):
    b = Blocks()
    b.feed(content)
    out = []
    for kind, p in b.blocks:
        if kind == 'x' or not p:
            if words(' '.join(out)) >= 60:
                break
            continue
        # Language tags after links ("[es]", "[ar, fr]", "[pt-BR]") mark the linked page's language.
        p = strip_lang_tags(p)
        p = re.sub(r'\s+([,.;:!?])', r'\1', p).strip()
        # Interview questions and numbered points: what follows is someone else's answer or a list.
        if re.match(r'^(?:\d{1,2}[.)]\s|Q\s?[:.]|A\s?[:.]|Question\b|GV\s?:|Global Voices\s?(?:\(GV\))?:)', p):
            if words(' '.join(out)) >= 60:
                break
            return None
        if SKIP_PARA.search(p) or words(p) < 6:
            continue
        if re.match(r'^[“"«‘].*[”"»’]\W{0,3}$', p) or re.search(r'https?://|www\.|@\w{3,}', p):
            if words(' '.join(out)) >= 60:
                break
            continue
        if p.endswith(':'):
            if words(' '.join(out)) >= 60:
                break
            continue
        if not re.search(r'[.!?"”’)…]$', p):
            continue
        if words(' '.join(out + [p])) > 600:
            break
        out.append(p)
    text = '\n\n'.join(out)
    if words(text) < 60:
        return None
    toks = re.findall(r'[a-z]+', text.lower())
    if sum(x in {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'on', 'was', 'with'} for x in toks) < 0.15 * len(toks):
        return None
    # Mostly quotation: more than half the characters inside quote marks.
    q = re.findall(r'[“"][^”"]{2,}[”"]', text)
    if sum(len(x) for x in q) > 0.5 * len(text):
        return None
    return text


def page_meta(link):
    """(author, ok) from the article page; ok is False for translations and partner republications."""
    r = fetch(link)
    if r is None:
        return None, False
    t = r.text
    m = re.search(r'<meta name="author" content="([^"]*)"', t)
    author = html.unescape(m.group(1)).strip() if m else None
    w = t.find('Written by')
    credits = t[w:w + 800] if w >= 0 else ''
    if 'Translated by' in credits or re.search(r'(?i)class=.translation-credit', t[:w] if w > 0 else ''):
        return author, False
    return author or None, True


def main():
    out_path = sys.argv[1]
    per_year = int(sys.argv[sys.argv.index('--per-year') + 1]) if '--per-year' in sys.argv else 13
    rng = random.Random(20222)
    samples, seen = [], set()
    partial = out_path + '.partial'
    done_years = {}
    if os.path.exists(partial):
        for line in open(partial, encoding='utf-8'):
            s = json.loads(line)
            samples.append(s)
            seen.add(norm(s['text']))
            done_years[s['group']] = done_years.get(s['group'], 0) + 1
    pf = open(partial, 'a', encoding='utf-8')
    fields = 'id,date,link,title,content'
    for year in range(2005, 2021):
        group = f'gv:{year}'
        params = {'after': f'{year}-01-01T00:00:00', 'before': f'{year + 1}-01-01T00:00:00', 'per_page': 20,
                  '_fields': fields}
        r = fetch(API, dict(params, page=1))
        pages = int(r.headers.get('X-WP-TotalPages', 0)) if r is not None else 0
        picks = rng.sample(range(1, pages + 1), min(pages, 6)) if pages else []
        if done_years.get(group, 0) >= per_year:
            continue
        got = done_years.get(group, 0)
        for pg_no in picks:
            if got >= per_year:
                break
            r = fetch(API, dict(params, page=pg_no))
            try:
                posts = r.json() if r is not None else []
            except ValueError:
                posts = []
            rng.shuffle(posts)
            kept = 0
            for p in posts:
                if got >= per_year or kept >= -(-per_year // 3):
                    break
                content = p.get('content', {}).get('rendered', '')
                if PARTNER.search(re.sub(r'<[^>]+>', ' ', content)):
                    continue
                text = opening_text(content)
                if not text or norm(text) in seen:
                    continue
                d = p['date'][:10]
                if d >= '2021-01-01' or int(d[:4]) != year:
                    continue
                author, ok = page_meta(p['link'])
                if not ok:
                    continue
                if author and re.search(r'(?i)\b(?:media|news|online|team|editors?|staff|partners?|agency|'
                                        r'radio|magazine|journal|institute|foundation|network)\b', author):
                    continue  # organisational bylines are partner content
                seen.add(norm(text))
                title = html.unescape(re.sub(r'<[^>]+>', '', p.get('title', {}).get('rendered', ''))).strip()
                nonnative = bool(re.search(r'(?i)\b(?:english is (?:not|my second)|not a native (?:english )?speaker|'
                                           r'my english is)\b', text))
                s = {
                    'id': f'globalvoices-{p["id"]}', 'source': 'globalvoices', 'group': group, 'genre': 'blog' if len(re.findall(r"\b(?:I|my|me|I'm|I've)\b", text)) >= 3 else 'news',
                    'register': 'professional', 'nonNative': nonnative, 'text': text, 'url': p['link'],
                    'author': author, 'date': d, 'licence': LICENCE, 'redistributable': True,
                    'note': f'Global Voices article "{title}"; opening paragraphs, HTML stripped; captions, embeds, '
                            'blockquotes, quote-only and editor\'s-note paragraphs removed; cut at a paragraph end',
                }
                samples.append(s)
                pf.write(json.dumps(s, ensure_ascii=False) + '\n')
                pf.flush()
                kept += 1
                got += 1
        print(group, 'pages', pages, 'kept', got, 'total', len(samples), flush=True)
    pf.close()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    os.remove(partial)
    print('wrote', len(samples), 'to', out_path)


if __name__ == '__main__':
    retidy(sys.argv[1]) if '--retidy' in sys.argv else main()
