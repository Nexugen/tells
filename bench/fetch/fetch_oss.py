"""Open-source project writing from before 2022: opensource.com articles and README introductions.

Sources:
  1. opensource.com articles dated 2010 to 2021, found by walking from a few seed articles along
     the related-article links on each page (tag listings no longer list articles). Each article page is checked for its own
     "Creative Commons Attribution-Share Alike 4.0" licence line and its publication date
     (span.author__meta-date); pages without the licence line are skipped.
  2. The opening "what this is / why use it" paragraphs of READMEs of MIT, Apache-2.0 and BSD
     projects at a release tag cut before 2022, read from raw.githubusercontent.com. The licence is
     read from the LICENSE file at the same tag; the date is the tag's commit date from the GitHub
     API (unauthenticated: one call per repo, under the 60/hour limit).
Fedora Magazine is not used: its footer says it "aspires to publish all content under a Creative
Commons license but may not be able to do so in all cases", so per-article licences are unverifiable.
Licence: CC BY-SA 4.0 (opensource.com), MIT / Apache-2.0 / BSD (READMEs); all redistributable.
Usage:   python3 -I fetch_oss.py /root/tells-data/human/oss.jsonl [--articles 260]
Registers: marketing for announcements, pitches and README intros; technical for how-tos;
professional for opinion and community pieces.
"""
import hashlib, html, json, re, sys, time
from html.parser import HTMLParser

import requests

OUT = sys.argv[1]
N_ARTICLES = int(sys.argv[sys.argv.index('--articles') + 1]) if '--articles' in sys.argv else 260
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
CC = {'name': 'CC BY-SA 4.0', 'url': 'https://creativecommons.org/licenses/by-sa/4.0/'}
MONTHS = {m: i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                       'September', 'October', 'November', 'December'], 1)}
# (repo, tag, README path). Tags were all cut before 2022; the script checks the commit date.
REPOS = [
    ('psf/requests', 'v2.25.1', 'README.md'), ('pallets/flask', '2.0.2', 'README.rst'),
    ('expressjs/express', '4.17.1', 'Readme.md'), ('rails/rails', 'v6.1.4', 'README.md'),
    ('jekyll/jekyll', 'v4.2.1', 'README.markdown'), ('redis/redis', '6.2.6', 'README.md'),
    ('tiangolo/fastapi', '0.70.0', 'README.md'), ('sveltejs/svelte', 'v3.44.0', 'README.md'),
    ('denoland/deno', 'v1.15.0', 'README.md'), ('vitejs/vite', 'v2.6.0', 'README.md'),
    ('tailwindlabs/tailwindcss', 'v2.2.19', 'README.md'), ('traefik/traefik', 'v2.5.0', 'README.md'),
    ('caddyserver/caddy', 'v2.4.6', 'README.md'), ('gohugoio/hugo', 'v0.89.0', 'README.md'),
    ('home-assistant/core', '2021.11.0', 'README.rst'), ('httpie/httpie', '2.6.0', 'README.md'),
    ('psf/black', '21.10b0', 'README.md'), ('python-poetry/poetry', '1.1.11', 'README.md'),
    ('TryGhost/Ghost', '4.20.0', 'README.md'), ('mrdoob/three.js', 'r134', 'README.md'),
    ('pandas-dev/pandas', 'v1.3.4', 'README.md'), ('numpy/numpy', 'v1.21.0', 'README.md'),
    ('scikit-learn/scikit-learn', '1.0', 'README.rst'), ('kubernetes/kubernetes', 'v1.22.0', 'README.md'),
    ('prometheus/prometheus', 'v2.31.0', 'README.md'), ('pytorch/pytorch', 'v1.10.0', 'README.md'),
    ('Kong/kong', '2.6.0', 'README.md'), ('etcd-io/etcd', 'v3.5.0', 'README.md'),
    ('matrix-org/synapse', 'v1.46.0', 'README.rst'), ('zulip/zulip', '4.7', 'README.md'),
    ('nvm-sh/nvm', 'v0.39.0', 'README.md'), ('chartjs/Chart.js', 'v3.6.0', 'README.md'),
    ('twbs/bootstrap', 'v5.1.3', 'README.md'), ('flutter/flutter', '2.5.0', 'README.md'),
    ('facebook/react-native', 'v0.66.0', 'README.md'), ('electron/electron', 'v15.0.0', 'README.md'),
    ('vercel/next.js', 'v12.0.0', 'readme.md'), ('spring-projects/spring-boot', 'v2.5.6', 'README.adoc'),
    ('grafana/grafana', 'v7.5.0', 'README.md'), ('jupyter/notebook', '6.4.5', 'README.md'),
    ('ionic-team/ionic-framework', 'v5.8.0', 'README.md'), ('gatsbyjs/gatsby', 'gatsby@3.0.0', 'README.md'),
    ('sqlalchemy/sqlalchemy', 'rel_1_4_27', 'README.rst'), ('encode/django-rest-framework', '3.12.4', 'README.md'),
    ('celery/celery', 'v5.2.0', 'README.rst'), ('sphinx-doc/sphinx', 'v4.3.0', 'README.rst'),
    ('tornadoweb/tornado', 'v6.1.0', 'README.rst'), ('twisted/twisted', 'twisted-21.7.0', 'README.rst'),
    ('apache/airflow', '2.2.0', 'README.md'), ('pydata/xarray', 'v0.20.0', 'README.rst'),
    ('Homebrew/brew', '3.3.0', 'README.md'),
    ('jashkenas/backbone', '1.4.0', 'README.md'), ('emberjs/ember.js', 'v3.28.0', 'README.md'),
    ('preactjs/preact', '10.5.15', 'README.md'), ('eslint/eslint', 'v8.0.0', 'README.md'),
    ('prettier/prettier', '2.4.1', 'README.md'), ('socketio/socket.io', '4.3.0', 'Readme.md'),
    ('elastic/elasticsearch', 'v7.10.0', 'README.asciidoc'), ('hashicorp/vagrant', 'v2.2.19', 'README.md'),
    ('moby/moby', 'v20.10.0', 'README.md'), ('helm/helm', 'v3.7.0', 'README.md'),
    ('influxdata/influxdb', 'v2.1.0', 'README.md'), ('jenkinsci/jenkins', 'jenkins-2.300', 'README.md'),
    ('apache/superset', '1.3.0', 'README.md'), ('django/django', '3.2', 'README.rst'),
    ('bottlepy/bottle', '0.12.19', 'README.rst'), ('mkdocs/mkdocs', '1.2.3', 'README.md'),
]
STOP_HEAD = re.compile(r'(?i)install|getting started|quick ?start|usage|build|contribut|documentation|setup|requirements|example|table of contents|license|download|develop|support|sponsor|backers|community|roadmap|faq')


def get(url, tries=3):
    wait = 3
    for _ in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=40)
            if r.status_code == 200:
                return r
            if r.status_code in (403, 404, 410):
                return None
        except requests.RequestException:
            pass
        time.sleep(wait)
        wait *= 2
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


# ---------- opensource.com ----------

class Body(HTMLParser):
    """Paragraph text of the article body, in order, until the first code block."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras, self.buf, self.in_p, self.depth, self.skip, self.code_seen = [], [], False, 0, 0, False

    def handle_starttag(self, tag, attrs):
        if tag in ('pre', 'code') and self.paras:
            self.code_seen = True
        if tag in ('pre', 'table', 'ul', 'ol', 'blockquote', 'figure', 'article'):
            self.skip += 1
        if tag == 'p' and not self.skip:
            self.in_p, self.buf = True, []

    def handle_endtag(self, tag):
        if tag in ('pre', 'table', 'ul', 'ol', 'blockquote', 'figure', 'article') and self.skip:
            self.skip -= 1
        if tag == 'p' and self.in_p:
            self.in_p = False
            t = re.sub(r'\s+', ' ', ''.join(self.buf)).strip()
            if t and not self.code_seen:
                self.paras.append(t)

    def handle_data(self, data):
        if self.in_p and not self.skip:
            self.buf.append(data)


def parse_article(s):
    if 'Attribution-Share Alike 4.0' not in s and 'creativecommons.org/licenses/by-sa/4.0' not in s:
        return None
    m = re.search(r'author__meta-date">\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})', s)
    if not m or m.group(1) not in MONTHS:
        return None
    date = f'{int(m.group(3)):04d}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}'
    title = html.unescape((re.search(r'<meta property="og:title" content="([^"]*)"', s) or [None, ''])[1])
    a = re.search(r'author__name[^>]*>\s*<a href="/users/[^"]+"[^>]*>([^<]+)</a>', s) or re.search(r'<a href="/users/[^"]+" hreflang="en">([^<]+)</a>', s)
    i = s.find('field--name-body')
    if i < 0:
        return None
    j = s.find('class="block block-layout-builder', i + 100)
    seg = s[i:j if j > 0 else i + 200000]
    body = Body()
    body.feed(seg)
    has_code = '<pre' in seg
    return {'date': date, 'title': title, 'author': html.unescape(a.group(1)).strip() if a else None,
            'paras': body.paras, 'has_code': has_code}


def osc_register(title, has_code):
    t = title.lower()
    if re.search(r'\b(?:how to|install|tutorial|guide to|getting started|set up|setting up|configure|commands?|script|using|use)\b', t) or has_code:
        return 'technical', 'docs'
    if re.search(r'\b(?:announc\w*|introduc\w*|meet|why|reasons|benefits|top \d+|\d+ (?:open source|best|great|ways|tools|apps)|new|launch\w*|release\w*)\b', t):
        return 'marketing', 'marketing'
    return 'professional', 'blog'


ART = re.compile(r'href="(?:https://opensource\.com)?(/(?:article|life|business|education|government|law|health|open-organization)/(\d{2})/\d{1,2}/[a-z0-9-]+)"')
SEEDS = ['/article/20/1/open-source-productivity-tools', '/article/17/7/how-linux-containers-evolved',
         '/article/21/5/google-v-oracle', '/article/19/3/what-open-source', '/article/18/10/what-open-source-means',
         '/article/16/11/introduction-linux-filesystems', '/article/20/5/open-source-cloud', '/article/17/1/yearbook-best-of-2016']


def opensource_com():
    """Walk article pages from a few seeds, following each page's links to other pre-2022 articles.
    The next page is always the unvisited link with the lowest hash, so the walk spreads widely."""
    frontier, visited, out, seen, seen_paras = set(SEEDS), set(), [], set(), set()
    while frontier and len(out) < N_ARTICLES and len(visited) < N_ARTICLES * 3:
        path = min(frontier, key=lambda l: hashlib.sha1(l.encode()).hexdigest())
        frontier.discard(path)
        visited.add(path)
        r = get('https://opensource.com' + path)
        time.sleep(1.2)
        if not r:
            continue
        for l, yy in ART.findall(r.text):
            if 10 <= int(yy) <= 21 and l not in visited:
                frontier.add(l)
        a = parse_article(r.text)
        if not a or a['date'] >= '2022-01-01':
            continue
        paras = [html.unescape(p) for p in a['paras'] if words(p) >= 6 and not re.search(r'https?://', p) and not p.endswith(':')]
        # Series articles open with the same boilerplate paragraph: keep it only the first time.
        keys = [re.sub(r'\W+', ' ', p.lower()).strip() for p in paras]
        paras = [p for p, k in zip(paras, keys) if k not in seen_paras]
        seen_paras.update(keys)
        chunk = []
        for p in paras:
            if words(' '.join(chunk + [p])) > 350:
                break
            chunk.append(p)
            if words(' '.join(chunk)) >= 220:
                break
        text = '\n\n'.join(chunk)
        if words(text) < 60:
            continue
        k = re.sub(r'\W+', ' ', text.lower()).strip()[:300]
        if k in seen:
            continue
        seen.add(k)
        register, genre = osc_register(a['title'], a['has_code'])
        slug = path.rstrip('/').rsplit('/', 1)[-1]
        out.append({
            'id': f'oss-osc-{path.split("/")[1]}-{path.split("/")[2]}-{path.split("/")[3]}-{slug[:60]}', 'source': 'oss', 'group': 'oss:opensource.com',
            'genre': genre, 'register': register, 'nonNative': False, 'text': text,
            'url': 'https://opensource.com' + path, 'author': a['author'], 'date': a['date'], 'licence': CC,
            'redistributable': True,
            'note': f'opensource.com article "{a["title"]}", opening paragraphs before the first code block; '
                    'HTML stripped, image captions, lists and paragraphs with URLs skipped; licence line checked on the page',
        })
    return out


# ---------- READMEs ----------

def licence_of(text):
    t = text[:3000]
    if re.search(r'Apache License,?\s+Version 2\.0', t):
        return {'name': 'Apache-2.0', 'url': 'https://www.apache.org/licenses/LICENSE-2.0'}
    if re.search(r'Permission is hereby granted, free of charge', t):
        return {'name': 'MIT', 'url': 'https://opensource.org/licenses/MIT'}
    if re.search(r'Redistribution and use in source and binary forms', t):
        return {'name': 'BSD-3-Clause' if 'Neither the name' in t else 'BSD-2-Clause', 'url': 'https://opensource.org/licenses/BSD-3-Clause'}
    return None


def readme_intro(src, path):
    src = src.replace('\r', '')
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
    src = re.sub(r'```.*?```|~~~.*?~~~', '\n\n', src, flags=re.S)
    if path.endswith(('.rst', '.adoc', '.asciidoc')):
        src = re.sub(r'(?m)^\.\. .*(?:\n[ \t]+.*)*', '', src)  # rst directives
        src = re.sub(r'(?m)^::\s*$(?:\n[ \t]+.*|\n\s*$)*', '', src)
        src = re.sub(r'`([^`<]+?)\s*<[^>]+>`_+', r'\1', src)
        src = re.sub(r'``([^`]+)``', r'\1', src)
        src = re.sub(r':\w+:`([^`]+)`', r'\1', src)
        src = re.sub(r'(?m)^(\S.*)\n[=\-~^*#+]{3,}\s*$', r'# \1', src)  # underlined titles
        src = re.sub(r'(?m)^[=\-~^*#+]{3,}\s*$', '', src)
        src = re.sub(r'(?m)^=+ (.*)$', r'# \1', src)  # asciidoc titles
    src = re.sub(r'<[^>]+>', ' ', src)
    src = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', src)
    src = re.sub(r'\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)', '', src)
    src = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', src)
    src = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', src)
    src = re.sub(r'(?m)^\[[^\]]+\]:\s*\S+.*$', '', src)
    src = re.sub(r'https?://\S+', '', src)
    src = re.sub(r'\[([^\]]+)\]', r'\1', src)  # reference-style links
    src = re.sub(r':[a-z_]+:', '', src)  # emoji shortcodes
    src = re.sub(r'(?<=\w)_(?=[\s.,;:)-]|$)', '', src)  # rst link references like NumPy_
    src = html.unescape(src)
    out, started = [], False
    for block in re.split(r'\n\s*\n', src):
        b = block.strip()
        if not b:
            continue
        if b.startswith('#'):
            if out and (STOP_HEAD.search(b) or words(' '.join(out)) >= 80):
                break
            continue
        lines = b.split('\n')
        if any(re.match(r'^\s*(?:[-*+•]|\d+[.)])\s', l) for l in lines) or '|' in b or b.startswith(('    ', '\t', '>')):
            if out:
                break
            continue
        p = re.sub(r'\s+', ' ', b)
        p = re.sub(r'(?<!\w)[*_]{1,2}(\S.*?\S|\S)[*_]{1,2}(?!\w)', r'\1', p).replace('`', '')
        if words(p) < 8 or not re.search(r'[.!?:)]$', p):
            continue
        if sum(c.isalpha() or c.isspace() for c in p) < 0.85 * len(p):  # ASCII art, badges, tables
            continue
        if re.search(r'(?i)requires (?:python|node)|translations?:|available in .* languages|this readme|code of conduct|contributor covenant|sponsor|backer|tidelift|funded|donat', p):
            continue
        if words(' '.join(out + [p])) > 400:
            break
        out.append(p)
    return '\n\n'.join(out)


DATE_CACHE = '/root/tells-data/raw/oss/tag-dates.json'


def tag_date(repo, tag):
    """Commit date of a tag, from the GitHub API, cached on disk to spare the hourly limit."""
    import os
    cache = json.load(open(DATE_CACHE)) if os.path.exists(DATE_CACHE) else {}
    key = f'{repo}@{tag}'
    if key not in cache:
        c = get(f'https://api.github.com/repos/{repo}/commits/{tag}')
        time.sleep(1)
        try:
            cache[key] = c.json()['commit']['committer']['date'][:10] if c else None
        except (ValueError, KeyError):
            cache[key] = None
        if cache[key]:
            os.makedirs(os.path.dirname(DATE_CACHE), exist_ok=True)
            json.dump(cache, open(DATE_CACHE, 'w'), indent=1)
    return cache[key]


def readmes():
    out = []
    for repo, tag, path in REPOS:
        base = f'https://raw.githubusercontent.com/{repo}/{tag}/'
        r = get(base + path)
        time.sleep(1)
        if not r:
            print('no readme', repo, tag)
            continue
        lic = None
        for lf in ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.rst', 'MIT-LICENSE', 'license', 'license.md', 'LICENSE-MIT', 'COPYING', 'LICENSE.APACHE2'):
            lr = get(base + lf)
            time.sleep(0.5)
            if lr:
                lic = licence_of(lr.text)
                break
        if not lic:
            print('licence not MIT/Apache/BSD', repo)
            continue
        text = readme_intro(r.text, path)
        if words(text) < 60:
            print('intro too short', repo, words(text))
            continue
        date = tag_date(repo, tag)
        if not date or date >= '2022-01-01':
            print('no pre-2022 date', repo, date)
            continue
        out.append({
            'id': f'oss-readme-{repo.replace("/", "-").lower()}-{re.sub(r"[^A-Za-z0-9.]+", "-", tag)}', 'source': 'oss',
            'group': f'oss:github.com/{repo}', 'genre': 'marketing', 'register': 'marketing', 'nonNative': False,
            'text': text, 'url': f'https://github.com/{repo}/blob/{tag}/{path}', 'author': None, 'date': date,
            'licence': lic, 'redistributable': True,
            'note': f'Opening paragraphs of {path} at tag {tag}; markdown/rst markup, badges, links, code and lists removed; '
                    'licence read from the LICENSE file at the tag; date is the tag commit date',
        })
    return out


def main():
    rows = readmes()
    print('readmes', len(rows), flush=True)
    rows += opensource_com()
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in rows:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(rows))


if __name__ == '__main__':
    main()
