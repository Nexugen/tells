"""Real job advertisements (company pitches and role descriptions) from EMSCAD, 2012 to 2014.

Source:  EMSCAD, the Employment Scam Aegean Dataset (University of the Aegean; 17,880 postings from
         Workable, 2012 to 2014), as the Kaggle CSV "Real or Fake: Fake JobPosting Prediction"
         (https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction), read from
         the Hugging Face mirror victor/real-or-fake-fake-jobposting-prediction (fake_job_postings.csv,
         50 MB). Only real postings (fraudulent = 0) are used.
Licence: CC0 1.0, as published on Kaggle and on the mirror's dataset card ("license: cc0-1.0").
         Redistributable.
Usage:   python3 -I fetch_jobs.py /root/tells-data/human/jobs.jsonl [--target 400] [--raw DIR]

The CSV has lost its HTML: list items and headings run into the next sentence ("DeveloperDo you
want..."). Text is split at those joins and at runs of spaces; a field whose segments are mostly
not full sentences (bullet lists, headings) is dropped, and the sample is the leading run of full
sentences (60 to 350 words). #URL_...#, #EMAIL_...# and #PHONE_...# anonymisation tokens are
removed. company_profile gives register marketing; description gives professional, or marketing
when it is mostly the company talking about itself. Group = jobs:co-<hash of the company profile>
(so a company's pitch and its role descriptions share a group), or jobs:<industry> when there is
no profile. At most two samples per group.
"""
import collections, csv, hashlib, html, json, os, re, sys

import requests

URL = 'https://huggingface.co/datasets/victor/real-or-fake-fake-jobposting-prediction/resolve/main/fake_job_postings.csv'
LICENCE = {'name': 'CC0 1.0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/'}
KAGGLE = 'https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction'
STOP = set('the and to of a in for is we you our with are be on as that will an at this your or by from have'.split())


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 400))
RAW = arg('--raw', '/root/tells-data/raw/jobs')


def h(s):
    return hashlib.sha1(s.encode()).hexdigest()


def words(t):
    return re.findall(r"[\w'’-]+", t)


def load():
    path = os.path.join(RAW, 'fake_job_postings.csv')
    if not os.path.exists(path):
        os.makedirs(RAW, exist_ok=True)
        with requests.get(URL, headers={'User-Agent': 'tells-research/0.3 (dataset builder)'}, timeout=120, stream=True) as r:
            r.raise_for_status()
            with open(path, 'wb') as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    csv.field_size_limit(10 ** 8)
    return list(csv.DictReader(open(path, encoding='utf-8')))


def basic(t):
    t = html.unescape(html.unescape(t)).replace('\xa0', ' ').replace('\xad', '-')
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r'\(?\s*#(?:URL|EMAIL|PHONE)_[0-9a-f]+#\s*\)?', ' ', t)
    return t


def camel_counts(rows):
    """How often each camel-case token (e.g. LinkedIn, WhatsApp) occurs; frequent ones are real words, rare ones are joins."""
    c = collections.Counter()
    for r in rows:
        for f in ('company_profile', 'description'):
            c.update(re.findall(r'\b\w*[a-z][A-Z]\w*\b', basic(r[f])))
    return c


def segments(t, camel):
    t = re.sub(r'\b\w*[a-z][A-Z]\w*\b', lambda m: m.group(0) if camel[m.group(0)] >= 5 else re.sub(r'([a-z])([A-Z])', r'\1\n\2', m.group(0)), t)
    t = re.sub(r'([a-z0-9%)][.!?])([A-Z"“])', r'\1\n\2', t)  # sentences glued after a lost line break
    t = re.sub(r' {2,}|\t', '\n', t)
    t = re.sub(r'\s*([•·●▪■◦➢►✓✔]|\*{2,})\s*', r'\n\1 ', t)  # inline bullets start a new (non-sentence) segment
    return [re.sub(r'\s+', ' ', s).strip() for s in t.split('\n') if s.strip()]


def is_sentence(s):
    return len(words(s)) >= 5 and re.search(r'[.!?]["”’)]?$', s) is not None and not re.match(r'^(?:[-*•·●▪■◦➢►✓✔]|\*\*)', s)


def prose(raw, camel):
    segs = segments(basic(raw), camel)
    if not segs:
        return None
    total = sum(len(words(s)) for s in segs)
    sent_words = sum(len(words(s)) for s in segs if is_sentence(s))
    if total == 0 or sent_words / total < 0.7:  # bullet- or heading-heavy
        return None
    out = []
    for s in segs:
        if not is_sentence(s):
            break
        if len(words(' '.join(out + [s]))) > 350:
            break
        out.append(s)
    text = ' '.join(out)
    w = words(text)
    if len(w) < 60:
        return None
    letters = re.findall(r'[^\W\d_]', text)
    if sum(c.isascii() for c in letters) / len(letters) < 0.98 or sum(x.lower() in STOP for x in w) / len(w) < 0.18:
        return None  # not English
    if re.search(r'https?://|www\.|@\w+\.\w', text):
        return None
    return text


def desc_register(text):
    we = len(re.findall(r"\b(?:we|we're|we’re|our|us)\b", text, re.I))
    you = len(re.findall(r"\b(?:you|your|you'll|you’ll|candidate|responsib\w*|role|position)\b", text, re.I))
    return 'marketing' if we > 1.5 * you else 'professional'


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'unknown'


def main():
    rows = [r for r in load() if r['fraudulent'] == '0']
    camel = camel_counts(rows)
    cands, seen = [], set()
    for r in rows:
        prof = r['company_profile'].strip()
        group = f'jobs:co-{h(re.sub(r"\W+", " ", prof.lower()).strip())[:10]}' if len(words(prof)) >= 5 else f'jobs:{slug(r["industry"])}'
        for field in ('company_profile', 'description'):
            text = prose(r[field], camel)
            if not text:
                continue
            k = re.sub(r'\W+', ' ', text.lower()).strip()
            if k in seen:
                continue
            seen.add(k)
            reg = 'marketing' if field == 'company_profile' else desc_register(text)
            cands.append({
                'id': f'jobs-{r["job_id"]}-{"profile" if field == "company_profile" else "desc"}', 'source': 'jobs',
                'group': group, 'genre': 'marketing', 'register': reg, 'nonNative': False, 'text': text,
                'url': KAGGLE, 'author': None, 'date': '2014-01-01', 'licence': LICENCE, 'redistributable': True,
                'note': f'EMSCAD job posting {r["job_id"]} ("{r["title"].strip()[:80]}"), {field} field; real posting (fraudulent=0); '
                        'joined list items/headings split off and only the leading run of full sentences kept; '
                        'anonymisation tokens (#URL_..#) removed; dataset covers 2012 to 2014, date is its end year',
            })
    # balance pitches and role descriptions, at most two per group, stable hash order
    cands.sort(key=lambda c: h(c['id']))
    per_group, picked = collections.Counter(), {'company_profile': [], 'description': []}
    for c in cands:
        kind = 'company_profile' if c['id'].endswith('-profile') else 'description'
        if per_group[c['group']] >= 2 or len(picked[kind]) >= TARGET // 2:
            continue
        per_group[c['group']] += 1
        picked[kind].append(c)
    out = sorted(picked['company_profile'] + picked['description'], key=lambda c: (int(c['id'].split('-')[1]), c['id']))
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in out:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('real postings', len(rows), 'candidates', len(cands), 'wrote', len(out),
          collections.Counter(c['register'] for c in out), 'groups', len({c['group'] for c in out}))


if __name__ == '__main__':
    main()
