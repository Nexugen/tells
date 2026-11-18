"""Stack Exchange answers and comments written before 2021, prose only.

Source:  api.stackexchange.com 2.3, anonymous (300 calls/day). Per site: top-voted answers, one
         page of answers from a seeded random 90-day window, and top-voted comments.
Licence: CC BY-SA by creation date (2.5 before 2011-04-08, 3.0 before 2018-05-02, else 4.0);
         redistributable with attribution (author display name and link kept).
Usage:   python3 -I fetch_stackexchange.py /root/tells-data/human/stackexchange.jsonl [--raw DIR]

Answers with <pre> blocks or more than 3 <code> spans are dropped, as are maths-heavy answers,
non-English texts, list- and link-heavy texts. Comments, like answers, need 60+ words. Responses are cached
under --raw, so a rerun spends no quota on pages it already has. Stops when quota runs low.
"""
import gzip, hashlib, html, json, os, random, re, sys, time
import requests

API = 'https://api.stackexchange.com/2.3'
BEFORE_2021 = 1609459200
START = 1230768000  # 2009-01-01
UA = {'User-Agent': 'tells-research/0.3', 'Accept-Encoding': 'gzip'}
DOMAINS = {'superuser': 'superuser.com', 'askubuntu': 'askubuntu.com', 'serverfault': 'serverfault.com'}
TECHNICAL = {'superuser', 'askubuntu', 'serverfault', 'unix', 'softwareengineering', 'electronics', 'webmasters'}
MATHY = {'math', 'physics', 'quant', 'chemistry', 'economics', 'electronics'}
SITES = ['superuser', 'askubuntu', 'serverfault', 'unix', 'softwareengineering', 'electronics', 'math', 'physics',
         'chemistry', 'biology', 'history', 'philosophy', 'ell', 'german', 'japanese', 'worldbuilding', 'rpg',
         'politics', 'economics', 'skeptics', 'graphicdesign', 'ux', 'webmasters', 'sports', 'christianity',
         'judaism', 'buddhism', 'hinduism', 'linguistics', 'crafts', 'quant']
ANSWERS_PER_SITE, COMMENTS_PER_SITE = 30, 13


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
RAW = arg('--raw', '/root/tells-data/raw/stackexchange')
os.makedirs(RAW, exist_ok=True)
state = {'backoff': 0, 'quota': None, 'calls': 0}


class QuotaOut(Exception):
    pass


def get(name, path, params):
    cache = os.path.join(RAW, name + '.json')
    if os.path.exists(cache):
        return json.load(open(cache))
    if state['quota'] is not None and state['quota'] < 5:
        raise QuotaOut()
    time.sleep(max(1.0, state['backoff']))
    r = requests.get(API + path, params=params, headers=UA, timeout=60)
    state['calls'] += 1
    data = r.json()
    if r.status_code != 200:
        if data.get('error_name') in ('throttle_violation',) or r.status_code == 429:
            raise QuotaOut(data.get('error_message'))
        raise RuntimeError(f'{name}: {r.status_code} {data.get("error_message")}')
    state['backoff'] = data.get('backoff', 0)
    state['quota'] = data.get('quota_remaining')
    json.dump(data, open(cache, 'w'))
    return data


def clean(body):
    body = re.sub(r'<pre\b.*?</pre>', ' ', body, flags=re.S)
    body = re.sub(r'<blockquote>.*?</blockquote>', '\n\n[[QUOTE]]\n\n', body, flags=re.S)
    body = re.sub(r'<img[^>]*>', '\n\n[[QUOTE]]\n\n', body)
    body = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>|<hr\s*/?>', '\n\n', body)
    body = re.sub(r'<li>', '- ', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = html.unescape(body).replace('\xa0', ' ')
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r' *\n *', '\n', body)
    body = re.sub(r'\n{3,}', '\n\n', body).strip()
    return body


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def english(t):
    w = max(1, words(t))
    en = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|this|on|be|with|as|are|not|or)\b', t, re.I))
    de = len(re.findall(r'\b(der|die|und|ist|nicht|das|ich|sie|ein|eine|zu|mit|auf|den|es)\b', t, re.I))
    cjk = sum(ord(c) > 0x2fff for c in t)
    return en >= 0.15 * w and de < 0.3 * en and cjk <= 0.02 * len(t)


def prose(t, site, raw):
    # A removed quote that the text introduces ("it says:") leaves a hole; skip those texts.
    if re.search(r'[:,]\s*\n+\[\[QUOTE\]\]', t) or re.search(r'\[\[QUOTE\]\]\s*$', t) and words(t) < 80:
        return False
    if '<pre' in raw or raw.count('<code>') > 3:
        return False
    if site in MATHY and (t.count('$') > 4 or '\\(' in t or '\\begin' in t):
        return False
    if len(re.findall(r'https?://', t)) > 2 or raw.count('<a ') > 4 or '|' in t and t.count('|') > 4:
        return False
    pars = [p for p in t.split('\n') if p.strip()]
    if sum(p.startswith('- ') or words(p) <= 3 for p in pars) > 0.4 * len(pars):
        return False
    return english(t)


def trim(text, limit=600):
    if words(text) <= limit:
        return text
    out, n = [], 0
    for p in text.split('\n\n'):
        if n + words(p) > limit:
            break
        out.append(p)
        n += words(p)
    if n >= 60:
        return '\n\n'.join(out)
    out, n = [], 0
    for s in re.split(r'(?<=[.!?])\s+', text):
        if n + words(s) > limit:
            break
        out.append(s)
        n += words(s)
    return ' '.join(out)


def licence(ts):
    v = '2.5' if ts < 1302220800 else '3.0' if ts < 1525219200 else '4.0'
    return {'name': f'CC BY-SA {v}', 'url': f'https://creativecommons.org/licenses/by-sa/{v}/'}


def register(site, kind, t):
    if site in TECHNICAL:
        return 'technical'
    if kind == 'comment':
        return 'casual'
    chatty = len(re.findall(r"\b(I'm|I've|I'd|don't|can't|it's|you're|lol|haha|yeah|pretty much|honestly|anyway)\b|!|\?", t, re.I))
    return 'casual' if words(t) < 150 or chatty / max(1, words(t)) > 0.025 else 'professional'


samples, seen = [], set()


def add(site, kind, item, raw):
    t = clean(raw)
    if not prose(t, site, raw):
        return False
    t = re.sub(r'\n*\[\[QUOTE\]\]\n*', '\n\n', t).strip()
    t = re.sub(r'\n{3,}', '\n\n', t)
    if t.endswith(':'):
        return False
    t = trim(t)
    if not 60 <= words(t) <= 600:
        return False
    key = re.sub(r'\W+', ' ', t.lower()).strip()
    if key in seen:
        return False
    ts = item['creation_date']
    if ts >= BEFORE_2021:
        return False
    seen.add(key)
    dom = DOMAINS.get(site, f'{site}.stackexchange.com')
    if kind == 'answer':
        sid, url = f'stackexchange-{site}-a{item["answer_id"]}', f'https://{dom}/a/{item["answer_id"]}'
    else:
        sid, url = f'stackexchange-{site}-c{item["comment_id"]}', f'https://{dom}/posts/comments/{item["comment_id"]}'
    owner = item.get('owner') or {}
    samples.append({
        'id': sid, 'source': 'stackexchange', 'group': f'se:{site}', 'genre': 'qa' if kind == 'answer' else 'comment',
        'register': register(site, kind, t), 'nonNative': False, 'text': t, 'url': url,
        'author': html.unescape(owner['display_name']) if owner.get('display_name') else None,
        'date': time.strftime('%Y-%m-%d', time.gmtime(ts)), 'licence': licence(ts), 'redistributable': True,
        'note': f'Stack Exchange {kind}; HTML stripped, code blocks and block quotes removed.',
    })
    return True


rng = random.Random(1789)
try:
    for site in SITES:
        base = {'site': site, 'filter': 'withbody', 'pagesize': 100}
        top = get(f'{site}-answers-votes', '/answers', {**base, 'order': 'desc', 'sort': 'votes', 'todate': BEFORE_2021})
        lo = rng.randrange(START, BEFORE_2021 - 90 * 86400)
        win = get(f'{site}-answers-window', '/answers', {**base, 'order': 'desc', 'sort': 'votes', 'fromdate': lo, 'todate': lo + 90 * 86400})
        n = 0
        # Interleave top-voted and window answers so both kinds make the cut.
        pool = [x for pair in zip(top.get('items', []), win.get('items', [])) for x in pair]
        pool += top.get('items', [])[len(win.get('items', [])):] + win.get('items', [])[len(top.get('items', [])):]
        for a in pool:
            if n >= ANSWERS_PER_SITE:
                break
            n += add(site, 'answer', a, a.get('body', ''))
        com = get(f'{site}-comments-votes', '/comments', {**base, 'order': 'desc', 'sort': 'votes', 'todate': BEFORE_2021})
        m = 0
        for c in com.get('items', []):
            if m >= COMMENTS_PER_SITE:
                break
            m += add(site, 'comment', c, c.get('body', ''))
        print(f'{site}: {n} answers, {m} comments (quota {state["quota"]})', flush=True)
except QuotaOut as e:
    print('quota or throttle reached, keeping what we have:', e)

samples.sort(key=lambda s: s['id'])
with open(OUT, 'w') as f:
    for s in samples:
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(samples)} samples, {state["calls"]} API calls')
