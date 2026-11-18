"""GOV.UK guidance, news stories, speeches and press releases first published before 2021.

Source:  GOV.UK search API https://www.gov.uk/api/search.json (filtered by
         content_store_document_type and public_timestamp) and the content API
         https://www.gov.uk/api/content/<path> for the body, first_published_at and public_updated_at.
         Only pages first published before 2021-01-01 AND last updated before 2022-01-01 are kept, so
         the text is the pre-2022 wording.
Licence: Open Government Licence v3.0 (stated in every GOV.UK page footer: "All content is available
         under the Open Government Licence v3.0, except where otherwise stated").
Usage:   python3 -I fetch_govuk.py /root/tells-data/human/govuk.jsonl [--target 350]
Takes the opening prose paragraphs (<p> elements outside tables and lists), stopping at the second
heading or near 300 words. Speeches lose "Check against delivery" style lines. Group is the first
organisation's slug; at most 12 samples per organisation.
"""
import hashlib, html, json, re, sys, time
from html.parser import HTMLParser

import requests

OUT = sys.argv[1]
TARGET = int(sys.argv[sys.argv.index('--target') + 1]) if '--target' in sys.argv else 350
PER_ORG = 12
LICENCE = {'name': 'Open Government Licence v3.0', 'url': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'}
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
TYPES = {'detailed_guide': 'guidance', 'news_story': 'news', 'press_release': 'news', 'speech': 'news'}
YEARS = range(2012, 2021)
PER_QUERY = 14
MARKETING = re.compile(r'\b(?:campaign|launch(?:ed|es|ing)?|encourag\w+|join (?:us|the)|sign up|celebrat\w+|competition|awards?|showcase|boost\w*|world-class|exciting)\b', re.I)


def get_json(url, tries=4):
    wait = 3
    for _ in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (404, 410):
                return None
        except (requests.RequestException, ValueError):
            pass
        time.sleep(wait)
        wait *= 2
    return None


class Paras(HTMLParser):
    """Collect top-level <p> text in order, noting headings; ignore tables, lists and asides."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items, self.buf, self.in_p, self.skip, self.divs = [], [], False, 0, []

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get('class') or ''
        if tag == 'div':
            boxed = bool(re.search(r'call-to-action|example|address|contact|attachment|footnotes', cls))
            self.divs.append(boxed)
            self.skip += boxed
        elif tag in ('table', 'ul', 'ol', 'pre', 'blockquote', 'figure'):
            self.skip += 1
        elif tag in ('h2', 'h3', 'h4') and not self.skip:
            self.items.append(('h', ''))
        elif tag == 'p' and not self.skip:
            self.in_p, self.buf = True, []
        elif tag == 'br' and self.in_p:
            self.buf.append(' ')

    def handle_endtag(self, tag):
        if tag in ('table', 'ul', 'ol', 'pre', 'blockquote', 'figure') and self.skip:
            self.skip -= 1
        elif tag == 'div' and self.divs:
            self.skip -= self.divs.pop()
        elif tag == 'p' and self.in_p:
            self.in_p = False
            t = re.sub(r'\s+', ' ', ''.join(self.buf)).strip()
            if t:
                self.items.append(('p', t))

    def handle_data(self, data):
        if self.in_p and not self.skip:
            self.buf.append(data)


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def opening(body):
    p = Paras()
    p.feed(body or '')
    out, heads = [], 0
    for kind, t in p.items:
        if kind == 'h':
            heads += 1
            if out and heads >= 2:
                break
            continue
        if re.match(r'(?i)^(?:check against delivery|this (?:speech|was) (?:was )?(?:transcribed|delivered)|delivered on|transcript|thank you\.?$|watch|read more|find out more|see also|further information|notes to editors)', t):
            continue
        if re.search(r'https?://|www\.|@\w', t) or t.endswith(':') or words(t) < 6:
            continue
        if len(re.findall(r'\d', t)) > 0.1 * len(t):
            continue
        if words(' '.join(out + [t])) > 380:
            if words(' '.join(out)) >= 60:
                break
            continue
        out.append(t)
        if words(' '.join(out)) >= 260:
            break
    return '\n\n'.join(out)


def main():
    candidates = []
    for dtype in TYPES:
        for y in YEARS:
            url = (f'https://www.gov.uk/api/search.json?filter_content_store_document_type={dtype}'
                   f'&filter_public_timestamp=from:{y}-01-01,to:{y}-12-31&count={PER_QUERY}&start={(y * 7) % 40}'
                   '&fields=link,title,public_timestamp,organisations,content_store_document_type')
            d = get_json(url)
            for r in (d or {}).get('results', []):
                orgs = r.get('organisations') or []
                candidates.append((dtype, r['link'], r.get('title', ''), orgs[0]['slug'] if orgs and orgs[0].get('slug') else 'gov-uk'))
            time.sleep(0.6)
        print(dtype, 'candidates so far', len(candidates), flush=True)
    per_org, out, seen = {}, [], set()
    # Interleave types so a short run still covers all four.
    candidates.sort(key=lambda c: hashlib.sha1(c[1].encode()).hexdigest())
    for dtype, link, title, org in candidates:
        if len(out) >= TARGET:
            break
        if per_org.get(org, 0) >= PER_ORG:
            continue
        c = get_json('https://www.gov.uk/api/content' + link)
        time.sleep(0.5)
        if not c:
            continue
        first, updated = (c.get('first_published_at') or '')[:10], (c.get('public_updated_at') or '')[:10]
        if not first or first >= '2021-01-01' or not updated or updated >= '2022-01-01':
            continue
        if (c.get('locale') or 'en') != 'en':
            continue
        t = opening((c.get('details') or {}).get('body', ''))
        if words(t) < 60:
            continue
        k = re.sub(r'\W+', ' ', t.lower()).strip()
        if k in seen:
            continue
        seen.add(k)
        per_org[org] = per_org.get(org, 0) + 1
        genre = TYPES[dtype]
        register = 'marketing' if dtype == 'press_release' and len(MARKETING.findall(t)) >= 2 else 'professional'
        slug = link.rsplit('/', 1)[-1][:70]
        out.append({
            'id': f'govuk-{dtype.replace("_", "-")}-{slug}', 'source': 'govuk', 'group': f'govuk:{org}', 'genre': genre,
            'register': register, 'nonNative': False, 'text': t, 'url': 'https://www.gov.uk' + link, 'author': None,
            'date': first, 'licence': LICENCE, 'redistributable': True,
            'note': f'GOV.UK {dtype.replace("_", " ")} "{title}", opening prose paragraphs; HTML stripped, tables, lists, '
                    f'links-only and contact lines skipped; last updated {updated}',
        })
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in out:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(out), 'organisations', len(per_org))


if __name__ == '__main__':
    main()
