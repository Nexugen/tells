"""Build bench/human.json from licensed sources. Usage: python3 -I human_corpus.py RAW_DIR OUT_JSON"""
import json, re, sys, html, urllib.request, gzip, os

RAW, OUT = sys.argv[1], sys.argv[2]
UA = {'User-Agent': 'tells-research/0.1', 'Accept-Encoding': 'gzip'}

def get(url, binary=False):
    path = os.path.join(RAW, re.sub(r'[^A-Za-z0-9._-]+', '_', url)[-150:])
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = r.read()
            try: data = gzip.decompress(data)
            except Exception: pass
        open(path, 'wb').write(data)
    return open(path, 'rb').read().decode('utf8')

def prose(md, max_words=200, skip=0):
    md = re.sub(r'^(---|\+\+\+)\n.*?\n\1\n', '', md, flags=re.S)
    md = re.sub(r'```.*?```', '', md, flags=re.S)
    md = re.sub(r'\{\{.*?\}\}', '', md)
    paras = [p.strip() for p in re.split(r'\n\s*\n', md)]
    out, n = [], 0
    for p in paras:
        if not p or p.startswith(('#', '[', '!', '|', '<', '    ', '- ', '* ', '1.')) or re.match(r'^\[.*\]:', p):
            continue
        p = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', p)
        p = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', p)
        p = re.sub(r'\s*\n\s*', ' ', p)
        w = len(p.split())
        if w < 12: continue
        if skip: skip -= 1; continue
        out.append(p); n += w
        if n >= max_words: break
    return '\n\n'.join(out)

samples = []
def add(id_, register, text, title, url, author, date, lic, lic_url, note=None):
    if len(text.split()) < 40:
        print('skip short', id_); return
    s = {'id': id_, 'register': register, 'text': text, 'source': {'title': title, 'url': url, 'author': author, 'date': date},
         'licence': {'name': lic, 'url': lic_url}}
    if note: s['note'] = note
    samples.append(s)

GO = ('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/')
RUST = ('MIT OR Apache-2.0', 'https://github.com/rust-lang/blog.rust-lang.org')
OGL = ('Open Government Licence v3.0', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/')
SO = ('CC BY-SA (2.5, 3.0 or 4.0, by revision date)', 'https://stackoverflow.com/help/licensing')

def front(md, key):
    m = re.search(rf'^{key}\s*[:=]\s*(.+)$', md, re.M)
    return m.group(1).strip().strip('"') if m else ''

def go_author(md):
    m = re.search(r'^by:\s*\n((?:- .+\n)+)', md, re.M)
    return ', '.join(x[2:].strip() for x in m.group(1).splitlines()) if m else 'The Go Authors'

# Go blog: technical and announcement posts
for slug, reg in [('go1.13-errors', 'technical'), ('module-mirror-launch', 'technical'), ('gopls-scalability', 'technical'),
                  ('migrating-to-go-modules', 'technical'), ('survey2019-results', 'professional'), ('contributors-summit-2019', 'professional'),
                  ('go.dev', 'marketing'), ('10years', 'marketing'), ('go1.13', 'marketing'), ('introducing-go-playground', 'marketing'), ('go1.14', 'marketing'), ('go1.16', 'marketing'), ('pkg.go.dev-2020', 'marketing'), ('modules2019', 'technical'), ('gopls-vscode-go', 'technical'), ('fuzz-beta', 'technical'), ('go116-module-changes', 'technical'), ('contributor-workshop', 'professional'), ('gophercon2015', 'professional'),
                  ('open-source', 'professional')]:
    try:
        md = get(f'https://raw.githubusercontent.com/golang/website/master/_content/blog/{slug}.md')
    except Exception as e:
        print('fail', slug, e); continue
    add(f'go-{slug}', reg, prose(md), front(md, 'title'), f'https://go.dev/blog/{slug}', go_author(md), front(md, 'date'), *GO,
        'Opening prose paragraphs; links, code and headings removed.')

# Rust blog
for name, reg in [('Update-on-crates.io-incident', 'professional'), ('Security-advisory-for-std', 'professional'),
                  ('crates-io-security-session-cookies', 'technical'), ('Rust-1.0@0', 'marketing'), ('Rust-1.41.0', 'marketing'),
                  ('Rust-1.51.0', 'technical'), ('Rust-1.61.0', 'marketing'), ('Rust-1.0-beta', 'marketing'), ('Security-advisory', 'professional'), ('mdbook-security-advisory', 'professional')]:
    try:
        md = get(f'https://raw.githubusercontent.com/rust-lang/blog.rust-lang.org/master/content/{name}.md')
    except Exception as e:
        print('fail', name, e); continue
    path = front(md, 'path')
    authors = re.findall(r'"([^"]+)"', front(md, 'authors')) or ['The Rust Team']
    add(f'rust-{name.lower()}', reg, prose(md), front(md, 'title'), f'https://blog.rust-lang.org/{path}/', ', '.join(authors), path[:10].replace('/', '-'), *RUST,
        'Opening prose paragraphs; links, code and headings removed.')

# GOV.UK guidance pages through the content API
for slug in ['renew-driving-licence', 'register-to-vote', 'check-mot-history', 'apply-first-provisional-driving-licence', 'vehicle-tax', 'council-tax', 'jury-service', 'pay-self-assessment-tax-bill', 'universal-credit', 'tax-on-your-private-pension', 'browse', 'apply-for-a-passport', 'student-finance']:
    try:
        d = json.loads(get(f'https://www.gov.uk/api/content/{slug}'))
    except Exception as e:
        print('fail', slug, e); continue
    det = d.get('details', {})
    body = det.get('body') or ' '.join(p.get('body', '') for p in det.get('parts', []))
    paras = [html.unescape(re.sub(r'<[^>]+>', '', p)).strip() for p in re.split(r'</p>|</li>|</h2>|</h3>', body)]
    paras = [re.sub(r'\s+', ' ', p) for p in paras if len(p.split()) >= 6]
    text, n = [], 0
    for p in paras:
        text.append(p); n += len(p.split())
        if n >= 160: break
    add(f'govuk-{slug}', 'professional', '\n\n'.join(text), d.get('title', slug), f'https://www.gov.uk/{slug}', 'GOV.UK', (d.get('public_updated_at') or '')[:10], *OGL,
        'Paragraphs and list items from the page body, markup removed.')

# Stack Overflow answers (casual), from the earlier fetch
so = sorted(json.load(open(os.path.join(RAW, 'so.json'))), key=lambda x: -x['score'])
so = [x for x in so if len(x['text'].split()) >= 45 and x['text'].count('\n') < 12][:15]
for x in so:
    if len(x['text'].split()) < 45: continue
    t = re.sub(r'\n{3,}', '\n\n', x['text']).strip()
    add(f"so-{x['aid']}", 'casual', t, x['title'] + ' (answer)', f"https://stackoverflow.com/a/{x['aid']}", x['author'],
        __import__('datetime').datetime.utcfromtimestamp(x['created']).strftime('%Y-%m-%d'), *SO, 'Answer body as text; markup removed.')

json.dump({'version': 1, 'note': 'Human writing for the benchmark. Every sample has its source and licence. Excerpts, markup removed.', 'samples': samples}, open(OUT, 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(samples), Counter(s['register'] for s in samples))
