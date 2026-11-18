"""Human writing about technology, apps, AI and business, from before ChatGPT (30 Nov 2022).

Used for three sets that never overlap (deduplicated by id across every file under /root/tells-data):
  the topic-matched training addition (human/ai-*.jsonl, joins the pool and is split by group),
  the modern probe (probe/*.jsonl, never trained on), and the round-3 held-out set (fresh-3/human/*.jsonl).

Sources:
  hn      HN Algolia search API (hn.algolia.com/api/v1/search, tags=comment) for keyword queries in a date
          range. Hacker News user content, no open licence; local measurement only.
  github  GitHub REST API, /repos/<owner>/<repo>/issues/comments, oldest first from --since, kept only when
          created before --before. Comments by bots and comments that are mostly code, logs or links are
          dropped. GitHub user content under GitHub's terms; no open licence; local measurement only.
  se      Stack Exchange API 2.3, answers and comments on one site in a date range, CC BY-SA
          (redistributable with attribution, like fetch_stackexchange.py).
  reddit  Webis-TLDR-17 (Reddit 2006 to 2016, CC BY 4.0) through the HF datasets-server rows API, pages at
          seeded offsets. Keeps posts from tech, app and business subreddits, and posts typed mostly in
          lowercase from any subreddit. The post without its TL;DR line is used, never the summary.

Usage:
  python3 -I fetch_modern.py hn OUT --queries "GPT-3,Copilot" --from 2020-06-01 --to 2022-01-01 --source NAME [--target 200]
  python3 -I fetch_modern.py github OUT --repos "owner/repo,..." --since 2020-01-01 --before 2022-11-01 --source NAME [--per-repo 40]
  python3 -I fetch_modern.py reddit OUT --pages 300 --seed 7 --source NAME [--split-mod 10 --split-keep 0-6]
  python3 -I fetch_modern.py se OUT --sites "ai,datascience" --from 2016-01-01 --to 2022-01-01 --source NAME [--per-site 40]

Text is cleaned the same way for all of them: HTML and markdown markup stripped, quoted lines (">") and code
blocks removed, 60 to 600 words kept, at most 3 comments per thread. Raw responses are cached under --raw.
"""
import glob, hashlib, html, json, os, random, re, sys, time
import requests

UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
CHATGPT = 1669766400  # 2022-11-30


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


KIND, OUT = sys.argv[1], sys.argv[2]
SOURCE = arg('--source', KIND)
RAW = arg('--raw', f'/root/tells-data/raw/modern-{KIND}')
os.makedirs(RAW, exist_ok=True)
CODEY = re.compile(r'\b(code|compile[rd]?|function|API|python|javascript|JS|rust|golang|java|C\+\+|SQL|database|kernel|linux|'
                   r'server|regex|library|framework|bug|git|docker|async|thread|memory|CPU|GPU|query|type system|syntax|runtime|'
                   r'tensor|gradient|model\.fit|pytorch|tensorflow|npm|build|config)\b')


def ts(d):
    return int(time.mktime(time.strptime(d, '%Y-%m-%d')))


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def english(t):
    common = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|this|on|be|with|as|are|not|or|i)\b', t, re.I))
    return common >= 0.15 * max(1, words(t)) and sum(ord(c) > 0x2fff for c in t) < 3


def clean_html(body):
    body = re.sub(r'<pre>.*?</pre>', '\n\n[[CODE]]\n\n', body, flags=re.S)
    body = re.sub(r'<blockquote>.*?</blockquote>', '\n\n', body, flags=re.S)
    body = re.sub(r'<(p|br|li)\b[^>]*>', '\n\n', body)
    body = re.sub(r'<[^>]+>', '', body)
    return paras(html.unescape(body).replace('\xa0', ' '))


def clean_md(body):
    body = body.replace('\r', '')
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'<details>.*?</details>', '', body, flags=re.S)
    body = re.sub(r'```.*?```', '\n\n[[CODE]]\n\n', body, flags=re.S)
    body = re.sub(r'^(?: {4}|\t).*$', '', body, flags=re.M)
    body = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', body)
    body = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = re.sub(r'^\s*>.*$', '', body, flags=re.M)
    body = re.sub(r'^#{1,6}\s+', '', body, flags=re.M)
    return paras(html.unescape(body))


def paras(body):
    out = []
    for p in re.split(r'\n\s*\n', body):
        p = re.sub(r'\s+', ' ', p).strip()
        if not p or p.startswith('>') or p == '[[CODE]]':
            continue
        out.append(p)
    return '\n\n'.join(out)


def trim(text, limit=600):
    if words(text) <= limit:
        return text
    out, n = [], 0
    for p in text.split('\n\n'):
        if n + words(p) > limit:
            break
        out.append(p)
        n += words(p)
    return '\n\n'.join(out) if n >= 60 else ''


def usable(raw, t):
    if len(re.findall(r'https?://', raw)) > 2 or words(t) < 60 or not english(t):
        return False
    # Mostly code, logs or paths.
    if len(re.findall(r'`[^`]+`', t)) > 4 or len(re.findall(r'[{}();=<>]', t)) > 0.08 * len(t.split()):
        return False
    return True


def taken():
    """Every id already in a human, probe or fresh file, so the sets stay disjoint."""
    ids = set()
    for f in glob.glob('/root/tells-data/**/*.jsonl', recursive=True) + glob.glob('/root/tells/bench/**/*.jsonl', recursive=True):
        if os.path.abspath(f) == os.path.abspath(OUT):
            continue
        for line in open(f):
            try:
                ids.add(json.loads(line)['id'])
            except Exception:
                pass
    return ids


def cached_get(url, params, key):
    path = os.path.join(RAW, hashlib.sha1(key.encode()).hexdigest()[:16] + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    for attempt in range(4):
        r = requests.get(url, params=params, headers=UA, timeout=60)
        if r.status_code == 200:
            data = r.json()
            json.dump(data, open(path, 'w'))
            time.sleep(1)
            return data
        if r.status_code in (403, 429):
            print('rate limited', r.status_code, r.headers.get('x-ratelimit-reset'), flush=True)
            time.sleep(60 * (attempt + 1))
        else:
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f'{url}: HTTP {r.status_code}')


def register(t):
    return 'technical' if len(CODEY.findall(t)) >= 3 else 'casual'


def record(id_, group, genre, t, url, author, when, licence, redist, note, reg=None):
    return {'id': id_, 'source': SOURCE, 'group': group, 'genre': genre, 'register': reg or register(t), 'nonNative': False,
            'text': t, 'url': url, 'author': author, 'date': time.strftime('%Y-%m-%d', time.gmtime(when)),
            'licence': licence, 'redistributable': redist, 'note': note}


def hn():
    lic = {'name': 'Hacker News user content; no open licence', 'url': 'https://www.ycombinator.com/legal/'}
    lo, hi = ts(arg('--from')), min(ts(arg('--to')), CHATGPT)
    target = int(arg('--target', 200))
    queries = [q.strip() for q in arg('--queries').split(',')]
    per_q = -(-target // len(queries))
    have, out, per_story = taken(), [], {}
    for q in queries:
        n = 0
        for page in range(8):
            if n >= per_q:
                break
            p = {'query': q, 'tags': 'comment', 'numericFilters': f'created_at_i>{lo},created_at_i<{hi}', 'hitsPerPage': 100, 'page': page}
            hits = cached_get('https://hn.algolia.com/api/v1/search', p, json.dumps(p, sort_keys=True)).get('hits', [])
            if not hits:
                break
            for h in hits:
                raw = h.get('comment_text') or ''
                id_ = f'hn-{h["objectID"]}'
                story = h.get('story_id')
                if id_ in have or '<pre>' in raw or not story or per_story.get(story, 0) >= 3 or h['created_at_i'] >= hi:
                    continue
                t = trim(clean_html(raw))
                if not usable(raw, t):
                    continue
                have.add(id_)
                per_story[story] = per_story.get(story, 0) + 1
                n += 1
                out.append(record(id_, f'hn:{story}', 'comment', t, f'https://news.ycombinator.com/item?id={h["objectID"]}', h.get('author'),
                                  h['created_at_i'], lic, False, f'HN comment found by search "{q}"; HTML stripped, quotes and code removed.'))
                if n >= per_q:
                    break
        print(f'{q}: {n}', flush=True)
    return out


def github():
    lic = {'name': 'GitHub user content; no open licence', 'url': 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service'}
    since, before = arg('--since'), min(ts(arg('--before')), CHATGPT)
    per_repo = int(arg('--per-repo', 40))
    have, out = taken(), []
    for repo in [r.strip() for r in arg('--repos').split(',')]:
        n, per_issue = 0, {}
        for page in range(1, 6):
            if n >= per_repo:
                break
            p = {'since': f'{since}T00:00:00Z', 'sort': 'created', 'direction': 'asc', 'per_page': 100, 'page': page}
            try:
                items = cached_get(f'https://api.github.com/repos/{repo}/issues/comments', p, repo + json.dumps(p, sort_keys=True))
            except Exception as e:
                print('skip', repo, e)
                break
            if not items:
                break
            for c in items:
                when = int(time.mktime(time.strptime(c['created_at'][:19], '%Y-%m-%dT%H:%M:%S')))
                user = c.get('user') or {}
                issue = c.get('issue_url', '').rsplit('/', 1)[-1]
                id_ = f'gh-{repo.replace("/", "-")}-{c["id"]}'
                if when >= before or id_ in have or user.get('type') == 'Bot' or str(user.get('login', '')).endswith('[bot]'):
                    continue
                if per_issue.get(issue, 0) >= 3:
                    continue
                raw = c.get('body') or ''
                t = trim(clean_md(raw))
                if not usable(raw, t):
                    continue
                have.add(id_)
                per_issue[issue] = per_issue.get(issue, 0) + 1
                n += 1
                out.append(record(id_, f'gh:{repo}', 'comment', t, c.get('html_url'), user.get('login'), when, lic, False,
                                  'GitHub issue comment; markdown, quotes and code blocks removed.'))
                if n >= per_repo:
                    break
        print(f'{repo}: {n}', flush=True)
    return out


def se():
    lo, hi = ts(arg('--from')), min(ts(arg('--to')), CHATGPT)
    per_site = int(arg('--per-site', 40))
    have, out = taken(), []

    def lic(when):
        v = '2.5' if when < 1302220800 else '3.0' if when < 1525219200 else '4.0'
        return {'name': f'CC BY-SA {v}', 'url': f'https://creativecommons.org/licenses/by-sa/{v}/'}

    for site in [s.strip() for s in arg('--sites').split(',')]:
        n = 0
        for kind in ('answers', 'comments'):
            want = per_site * 2 // 3 if kind == 'answers' else per_site - n
            got = 0
            for page in range(1, 4):
                if got >= want:
                    break
                p = {'site': site, 'fromdate': lo, 'todate': hi, 'order': 'desc', 'sort': 'votes', 'pagesize': 100, 'page': page, 'filter': 'withbody'}
                data = cached_get(f'https://api.stackexchange.com/2.3/{kind}', p, kind + json.dumps(p, sort_keys=True))
                for a in data.get('items', []):
                    raw = a.get('body') or ''
                    pid = a.get('answer_id') or a.get('comment_id')
                    id_ = f'se-{site}-{kind[0]}{pid}'
                    if id_ in have or '<pre>' in raw or raw.count('<code>') > 3 or raw.count('$') > 4:
                        continue
                    t = trim(clean_html(raw))
                    if not usable(raw, t) or len(re.findall(r'^\s*[-*\d]', t, re.M)) > 4:
                        continue
                    have.add(id_)
                    got += 1
                    n += 1
                    owner = (a.get('owner') or {}).get('display_name')
                    thread = a.get('question_id') or a.get('post_id')
                    link = f'https://{site}.stackexchange.com/a/{pid}' if kind == 'answers' else f'https://{site}.stackexchange.com/q/{thread}'
                    out.append(record(id_, f'se:{site}', 'qa' if kind == 'answers' else 'comment', html.unescape(t), link, owner,
                                      a['creation_date'], lic(a['creation_date']), True, f'Stack Exchange {kind[:-1]}; HTML stripped.',
                                      reg=arg('--register')))
                    if got >= want:
                        break
                if not data.get('has_more'):
                    break
        print(f'{site}: {n}', flush=True)
    return out


TECH_SUBS = {s.lower() for s in (
    'startups Entrepreneur smallbusiness business marketing technology tech programming learnprogramming webdev web_design '
    'MachineLearning artificial datascience compsci cscareerquestions sysadmin Android apple iphone ios androiddev iOSProgramming '
    'gadgets software apps AppHookup SaaS freelance personalfinance investing jobs careerguidance Futurology singularity '
    'buildapc pcmasterrace linux windows techsupport javascript Python gamedev indiegaming productivity').split()}


def lower_share(t):
    sents = [x for x in re.split(r'(?<=[.!?])\s+|\n\n', t) if re.search(r'[A-Za-z]', x)]
    if len(sents) < 3:
        return 0
    return sum(1 for x in sents if re.match(r'^\W*[a-z]', x)) / len(sents)


def reddit():
    lic = {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/'}
    api = 'https://datasets-server.huggingface.co/rows?dataset=webis/tldr-17&config=default&split=train&offset={}&length=100'
    rng = random.Random(int(arg('--seed', 7)))
    pages = int(arg('--pages', 300))
    mod, keep = int(arg('--split-mod', 1)), arg('--split-keep', '0-0')
    klo, khi = (int(v) for v in keep.split('-'))
    offsets = sorted({rng.randrange(0, 1327000 // 100) * 100 for _ in range(pages)})
    have, out, per_sub = taken(), [], {}
    for i, off in enumerate(offsets):
        try:
            rows = cached_get(api.format(off), None, f'tldr17:{off}').get('rows', [])
        except Exception as e:
            print('skip', off, e)
            continue
        for r in rows:
            row = r['row']
            sub, id_ = row.get('subreddit') or '', f'reddit-{row.get("id")}'
            tech, low = sub.lower() in TECH_SUBS, False
            t = trim(paras(html.unescape(row.get('content') or '')))
            if id_ in have or not usable(row.get('content') or '', t):
                continue
            low = lower_share(t) >= 0.5 and bool(re.search(r"(?:^|\s)i(?:\s|'m|'ve|'d)", t))
            if not (tech or low) or per_sub.get(sub, 0) >= 25:
                continue
            group = f'reddit:{sub}' if tech else f'reddit-lower:{sub}'
            b = int(hashlib.sha256(f'modern:{group}'.encode()).hexdigest()[:8], 16) % mod
            if not klo <= b <= khi:
                continue
            have.add(id_)
            per_sub[sub] = per_sub.get(sub, 0) + 1
            rec = record(id_, group, 'forum', t, f'https://www.reddit.com/r/{sub}/comments/{row.get("id")}', row.get('author'),
                         ts('2016-12-31'), lic, True, 'Webis-TLDR-17 post without its TL;DR line; date is the corpus upper bound.')
            rec['tags'] = [x for x, on in (('tech', tech), ('lowercase', low)) if on]
            out.append(rec)
        if (i + 1) % 50 == 0:
            print(f'{i + 1} pages, {len(out)} samples', flush=True)
    return out


rows = {'hn': hn, 'github': github, 'se': se, 'reddit': reddit}[KIND]()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    for s in sorted(rows, key=lambda s: s['id']):
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(rows)} samples -> {OUT}')
