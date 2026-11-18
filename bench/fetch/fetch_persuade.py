"""PERSUADE 2.0: argumentative essays by US students in grades 6 to 12, 15 prompts.

Source:  https://github.com/scrosseye/persuade_corpus_2.0 (training CSV linked from the README,
         hosted on Google Drive, ~620 MB). The test set is a password zip and is not used.
Licence: the repo README says "Creative Commons Attribution 4.0 International License (CC BY 4.0)".
         Essays were collected before the Feedback Prize competition release (Dec 2021); the corpus
         gives no per-essay date, so every sample is dated 2021-01-01 as an upper-bound placeholder.
Usage:   python3 -I fetch_persuade.py /root/tells-data/human/persuade.jsonl [--per-prompt 34] [--keep-raw]
The CSV is downloaded to /root/tells-data/raw/persuade/ and deleted afterwards unless --keep-raw.
Sampling is deterministic (sha1 of the essay id), so reruns give the same ids.
"""
import csv, hashlib, json, os, re, sys

import requests

OUT = sys.argv[1]
PER_PROMPT = int(sys.argv[sys.argv.index('--per-prompt') + 1]) if '--per-prompt' in sys.argv else 34
KEEP = '--keep-raw' in sys.argv
RAW = '/root/tells-data/raw/persuade/persuade_2.0_train.csv'
DRIVE = 'https://drive.usercontent.google.com/download?id=13phHyDzIsb0MHyJr6q-B-qIa9P2tM135&export=download&confirm=t'
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


def download():
    if os.path.exists(RAW):
        return
    os.makedirs(os.path.dirname(RAW), exist_ok=True)
    with requests.get(DRIVE, stream=True, timeout=120, headers={'User-Agent': 'tells-research/0.3'}) as r:
        r.raise_for_status()
        with open(RAW + '.part', 'wb') as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    os.rename(RAW + '.part', RAW)


def main():
    download()
    csv.field_size_limit(1 << 30)
    by_prompt, seen = {}, set()
    with open(RAW, newline='', encoding='utf-8', errors='replace') as f:
        for row in csv.DictReader(f):
            eid = row['essay_id_comp']
            if eid in seen:  # the CSV has one row per discourse element; keep the first per essay
                continue
            seen.add(eid)
            by_prompt.setdefault(row['prompt_name'].strip().strip('"'), []).append({
                'eid': eid, 'text': row['full_text'], 'ell': row['ell_status'].strip(),
                'grade': row['grade_level'].strip(), 'task': row['task'], 'score': row['holistic_essay_score'],
            })
    samples, texts = [], set()
    for prompt in sorted(by_prompt):
        rows = sorted(by_prompt[prompt], key=lambda r: hashlib.sha1(r['eid'].encode()).hexdigest())
        n = 0
        for r in rows:
            t = clean(r['text'])
            # Skip essays heavy with anonymisation placeholders (Generic_Name, PROPER_NAME, ...).
            if len(re.findall(r'\b(?:Generic_\w+|PROPER_NAME|STUDENT_NAME|TEACHER_NAME|LOCATION_NAME)\b', t)) > 2:
                continue
            if words(t) < 60:
                continue
            t2 = trim(t)
            if words(t2) < 60:
                continue
            k = norm(t2)[:300]  # near-duplicate resubmissions share their opening
            if k in texts:
                continue
            texts.add(k)
            slug = re.sub(r'[^a-z0-9]+', '-', prompt.lower()).strip('-')
            samples.append({
                'id': f'persuade-{r["eid"]}', 'source': 'persuade', 'group': f'persuade:{slug}',
                'genre': 'student-essay', 'register': 'professional', 'nonNative': r['ell'] == 'Yes',
                'text': t2, 'url': 'https://github.com/scrosseye/persuade_corpus_2.0', 'author': None,
                'date': '2021-01-01', 'licence': LICENCE, 'redistributable': True,
                'note': f'PERSUADE 2.0 train, prompt "{prompt}" ({r["task"]}), grade {r["grade"] or "unknown"}, '
                        f'holistic score {r["score"]}; whitespace normalised' + ('; trimmed to 600 words' if t2 != t else '')
                        + '; date is an upper-bound placeholder (no per-essay date in the corpus)',
            })
            n += 1
            if n >= PER_PROMPT:
                break
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)
    if not KEEP:
        os.remove(RAW)


if __name__ == '__main__':
    main()
