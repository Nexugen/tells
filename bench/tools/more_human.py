"""Add casual, professional and announcement samples to bench/human.json from sources with clear
licences: Stack Exchange comments and answers written before 2021 (CC BY-SA) and GOV.UK press
releases (Open Government Licence v3.0).

Usage: python3 -I more_human.py bench/human.json
Re-running is safe: samples already present (same id) are skipped.
"""
import gzip, html, json, re, sys, time, urllib.request

OUT = sys.argv[1]
# --fresh / --final: different sites, for check sets that no rule was tuned on. Each writes a new file.
FRESH = '--fresh' in sys.argv or '--final' in sys.argv
FINAL = '--final' in sys.argv
COMMENT_SITES = ['writers', 'sound', 'law', 'woodworking', 'mechanics', 'homebrew', 'gaming', 'movies'] if FINAL else ['english', 'money', 'outdoors', 'music', 'photo', 'scifi', 'boardgames', 'fitness'] if FRESH else ['interpersonal', 'travel', 'cooking', 'parenting', 'bicycles', 'diy', 'pets', 'gardening']
ANSWER_SITES = [('cooking', 'casual', 8), ('bicycles', 'casual', 6), ('law', 'professional', 8), ('writers', 'professional', 8), ('expatriates', 'professional', 6)] if FINAL else [('lifehacks', 'casual', 8), ('pets', 'casual', 6), ('academia', 'professional', 10), ('money', 'professional', 8), ('pm', 'professional', 6)] if FRESH else [('interpersonal', 'casual', 8), ('parenting', 'casual', 6), ('workplace', 'professional', 12), ('travel', 'professional', 6), ('freelancing', 'professional', 6)]
UA = {'User-Agent': 'tells-research/0.2', 'Accept-Encoding': 'gzip'}
BEFORE_2021 = 1609459200


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    try:
        data = gzip.decompress(data)
    except Exception:
        pass
    return json.loads(data)


def clean(body):
    body = re.sub(r'<pre>.*?</pre>', ' ', body, flags=re.S)
    body = re.sub(r'<blockquote>.*?</blockquote>', ' ', body, flags=re.S)
    body = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>', '\n', body)
    body = re.sub(r'<li>', '- ', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = html.unescape(body)
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r'\n\s*\n+', '\n\n', body).strip()
    return body


def se_licence(ts):
    # Stack Exchange: CC BY-SA 2.5 before 8 Apr 2011, 3.0 until 2 May 2018, 4.0 after.
    v = '2.5' if ts < 1302220800 else '3.0' if ts < 1525219200 else '4.0'
    return {'name': f'CC BY-SA {v}', 'url': f'https://creativecommons.org/licenses/by-sa/{v}/'}


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


samples = []

# Comments: short, conversational, casual.
for site in COMMENT_SITES:
    q = get(f'https://api.stackexchange.com/2.3/comments?order=desc&sort=votes&site={site}&todate={BEFORE_2021}&pagesize=100&filter=withbody')
    n = 0
    for c in q.get('items', []):
        t = clean(c['body'])
        if words(t) < 15 or 'http' in t or '@' in t[:40]:
            continue
        samples.append({
            'id': f'se-comment-{site}-{c["comment_id"]}', 'register': 'casual', 'kind': 'comment', 'text': t,
            'source': f'https://{site}.stackexchange.com/a/{c["post_id"]}#comment{c["comment_id"]}',
            'author': c.get('owner', {}).get('display_name', ''), 'licence': se_licence(c['creation_date']),
            'note': 'Stack Exchange comment, HTML stripped.',
        })
        n += 1
        if n >= 10:
            break
    time.sleep(1)

# Answers: advice written to a person. Casual on hobby sites, professional on the workplace site.
for site, register, take in ANSWER_SITES:
    q = get(f'https://api.stackexchange.com/2.3/answers?order=desc&sort=votes&site={site}&todate={BEFORE_2021}&pagesize=50&filter=withbody')
    n = 0
    for a in q.get('items', []):
        t = clean(a['body'])
        if words(t) < 60 or words(t) > 700:
            continue
        samples.append({
            'id': f'se-answer-{site}-{a["answer_id"]}', 'register': register, 'kind': 'answer', 'text': t,
            'source': f'https://{site}.stackexchange.com/a/{a["answer_id"]}',
            'author': a.get('owner', {}).get('display_name', ''), 'licence': se_licence(a['creation_date']),
            'note': 'Stack Exchange answer, HTML stripped, code and quotes removed.',
        })
        n += 1
        if n >= take:
            break
    time.sleep(1)

# GOV.UK press releases before 2021: announcements, the closest licensed stand-in for marketing.
try:
    if FRESH:
        raise RuntimeError('press releases come from the main set only')
    q = get('https://www.gov.uk/api/search.json?filter_content_store_document_type=press_release&count=40&order=-public_timestamp&filter_public_timestamp=to:2020-12-31&fields=link,title,public_timestamp')
    n = 0
    for r in q.get('results', []):
        try:
            c = get('https://www.gov.uk/api/content' + r['link'])
        except Exception:
            continue
        t = clean(c.get('details', {}).get('body', ''))
        t = '\n\n'.join(p for p in t.split('\n\n') if not p.startswith('- '))[:2500]
        if words(t) < 80:
            continue
        samples.append({
            'id': 'govuk-press-' + r['link'].rsplit('/', 1)[-1][:60], 'register': 'marketing', 'kind': 'announcement', 'text': t,
            'source': 'https://www.gov.uk' + r['link'], 'author': 'GOV.UK',
            'licence': {'name': 'Open Government Licence v3.0', 'url': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'},
            'note': 'GOV.UK press release body, lists and links removed, cut to 2,500 characters.',
        })
        n += 1
        if n >= 12:
            break
        time.sleep(0.3)
except Exception as e:
    print('gov.uk skipped:', e)

import os
d = json.load(open(OUT)) if os.path.exists(OUT) else {'version': 1, 'note': 'Fresh check set: never used to tune a rule.', 'samples': []}
have = {s['id'] for s in d['samples']}
new = [s for s in samples if s['id'] not in have]
d['samples'].extend(new)
json.dump(d, open(OUT, 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print('added', len(new), Counter(s['register'] for s in new))
print('total', len(d['samples']), Counter(s['register'] for s in d['samples']))
