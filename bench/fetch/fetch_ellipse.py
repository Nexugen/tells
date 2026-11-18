"""ELLIPSE: essays by English language learners in US grades 8 to 12, 44 prompts.

Source:  https://github.com/scrosseye/ELLIPSE-Corpus (ELLIPSE_Final_github_train.csv, ~10 MB).
         The password-protected test and raw-rater zips are not used.
Licence: the repo README says "Creative Commons Attribution 4.0 International License (CC BY 4.0)".
         The corpus gives no per-essay date; essays predate the 2022 Kaggle ELL competition, so every
         sample is dated 2021-01-01 as an upper-bound placeholder.
Usage:   python3 -I fetch_ellipse.py /root/tells-data/human/ellipse.jsonl [--per-prompt 12]
           [--exclude /root/tells-data/human/persuade.jsonl]
--exclude skips essays already sampled in another JSONL (some ELLIPSE essays are also in PERSUADE).
Every writer is an English language learner, so nonNative is always true. Sampling is deterministic.
"""
import csv, hashlib, io, json, os, re, sys

import requests

OUT = sys.argv[1]
PER_PROMPT = int(sys.argv[sys.argv.index('--per-prompt') + 1]) if '--per-prompt' in sys.argv else 12
RAW = '/root/tells-data/raw/ellipse/ELLIPSE_Final_github_train.csv'
URL = 'https://raw.githubusercontent.com/scrosseye/ELLIPSE-Corpus/main/ELLIPSE_Final_github_train.csv'
LICENCE = {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/'}


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def trim(t, cap=600):
    """Cut to at most `cap` words, ending at a paragraph end, else at a sentence end."""
    if words(t) <= cap:
        return t
    paras, out = t.split('\n\n'), []
    for p in paras:
        if words('\n\n'.join(out + [p])) > cap:
            break
        out.append(p)
    if out and words('\n\n'.join(out)) >= 60:
        return '\n\n'.join(out)
    sents = re.split(r'(?<=[.!?])\s+', t)
    out = []
    for s in sents:
        if words(' '.join(out + [s])) > cap:
            break
        out.append(s)
    return ' '.join(out)


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def clean(t):
    t = t.replace('\r\n', '\n').replace('\r', '\n').replace('\xa0', ' ')
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r' *\n *', '\n', t)
    t = re.sub(r'\n{2,}', '\n\n', t)
    return t.strip()


def informal(t):
    """Clearly informal: lower-case 'i', text-speak, or many exclamation marks."""
    hits = len(re.findall(r'(?:^|\s)i(?:\s|\')', t)) + len(re.findall(r'\b(?:u|ur|gonna|wanna|lol|cuz|dont|im)\b', t, re.I))
    return hits >= 4 or t.count('!') >= 5


def main():
    if not os.path.exists(RAW):
        os.makedirs(os.path.dirname(RAW), exist_ok=True)
        r = requests.get(URL, timeout=120, headers={'User-Agent': 'tells-research/0.3'})
        r.raise_for_status()
        open(RAW, 'wb').write(r.content)
    rows = list(csv.DictReader(open(RAW, newline='', encoding='utf-8', errors='replace')))
    by_prompt = {}
    for r in rows:
        by_prompt.setdefault(r['prompt'].strip(), []).append(r)
    samples, texts = [], set()
    if '--exclude' in sys.argv:
        for line in open(sys.argv[sys.argv.index('--exclude') + 1], encoding='utf-8'):
            texts.add(norm(json.loads(line)['text'])[:300])
    for prompt in sorted(by_prompt):
        n = 0
        for r in sorted(by_prompt[prompt], key=lambda r: hashlib.sha1(r['text_id_kaggle'].encode()).hexdigest()):
            t = clean(r['full_text'])
            if len(re.findall(r'\b(?:Generic_\w+|PROPER_NAME|STUDENT_NAME|TEACHER_NAME|LOCATION_NAME)\b', t)) > 2:
                continue
            t2 = trim(t)
            if words(t2) < 60:
                continue
            k = norm(t2)[:300]
            if k in texts:
                continue
            texts.add(k)
            slug = re.sub(r'[^a-z0-9]+', '-', prompt.lower()).strip('-')
            samples.append({
                'id': f'ellipse-{r["text_id_kaggle"]}', 'source': 'ellipse', 'group': f'ellipse:{slug}',
                'genre': 'student-essay', 'register': 'casual' if informal(t2) else 'professional', 'nonNative': True,
                'text': t2, 'url': 'https://github.com/scrosseye/ELLIPSE-Corpus', 'author': None,
                'date': '2021-01-01', 'licence': LICENCE, 'redistributable': True,
                'note': f'ELLIPSE train, prompt "{prompt}" ({r["task"]}), grade {r["grade"]}, overall {r["Overall"]}; '
                        'whitespace normalised' + ('; trimmed to 600 words' if t2 != t else '')
                        + '; date is an upper-bound placeholder (no per-essay date in the corpus)',
            })
            n += 1
            if n >= PER_PROMPT:
                break
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    main()
