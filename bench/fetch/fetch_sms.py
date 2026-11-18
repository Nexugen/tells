"""Real SMS text messages (the "ham" ones) from the UCI SMS Spam Collection, 2011.

Source:  https://archive.ics.uci.edu/dataset/228/sms+spam+collection (zip, about 200 KB), by Tiago
         Almeida and Jose Maria Gomez Hidalgo. Of the 4,827 ham messages about 3,375 come from the NUS
         SMS Corpus (mostly Singaporean students), 450 from Caroline Tagg's PhD thesis corpus (UK) and
         about 1,000 from the SMS Spam Corpus v0.1 Big. The file does not say which part a message
         came from, so every sample carries the same note.
Licence: CC BY 4.0, as stated on the UCI dataset page (checked: the page links
         creativecommons.org/licenses/by/4.0/legalcode). Redistributable with attribution.
Usage:   python3 -I fetch_sms.py /root/tells-data/human/sms.jsonl [--target 400] [--raw DIR]

Kept: ham messages of 8 words or more (an exception to the 60-word floor: SMS are short), mostly
English letters, no anonymisation placeholders ("<#>", "<TIME>", ...). HTML entities are decoded. Deduped by normalised
text; a stable hash of the line number picks the sample. id = sms-<line number in the file>.
"""
import hashlib, html, io, json, os, re, sys, zipfile

import requests

URL = 'https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip'
LICENCE = {'name': 'CC BY 4.0', 'url': 'https://creativecommons.org/licenses/by/4.0/'}


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 400))
RAW = arg('--raw', '/root/tells-data/raw/sms')


def h(s):
    return int(hashlib.sha1(s.encode()).hexdigest(), 16)


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def load():
    path = os.path.join(RAW, 'SMSSpamCollection')
    if not os.path.exists(path):
        os.makedirs(RAW, exist_ok=True)
        r = requests.get(URL, headers={'User-Agent': 'tells-research/0.3 (dataset builder)'}, timeout=60)
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:  # extracted in memory, no archive left on disk
            open(path, 'wb').write(z.read('SMSSpamCollection'))
    return open(path, encoding='utf-8').read().split('\n')


def main():
    cands, seen = [], set()
    for n, line in enumerate(load(), 1):
        if not line.startswith('ham\t'):
            continue
        text = line[4:]
        if re.search(r'&lt;[A-Z#]+&gt;', text):  # anonymisation placeholders such as <#>, <TIME>, <DECIMAL>
            continue
        text = re.sub(r'\s+', ' ', html.unescape(text)).strip()
        letters = re.findall(r'[^\W\d_]', text)
        if words(text) < 8 or not letters or sum(c.isascii() for c in letters) / len(letters) < 0.97:
            continue
        k = re.sub(r'\W+', ' ', text.lower()).strip()
        if k in seen:
            continue
        seen.add(k)
        cands.append((n, text))
    cands.sort(key=lambda c: h(f'sms-{c[0]}'))
    rows = []
    for n, text in sorted(cands[:TARGET]):
        sid = f'sms-{n}'
        rows.append({
            'id': sid, 'source': 'sms', 'group': f'sms:{h(sid) % 20}', 'genre': 'chat', 'register': 'casual',
            'nonNative': False, 'text': text, 'url': 'https://archive.ics.uci.edu/dataset/228/sms+spam+collection',
            'author': None, 'date': '2011-01-01', 'licence': LICENCE, 'redistributable': True,
            'note': 'Ham SMS from the UCI SMS Spam Collection (line %d); HTML entities decoded. About 70%% of ham '
                    'messages come from the NUS SMS Corpus (mostly Singaporean students, Singapore English, '
                    'nonNative left false); the rest are UK messages. Date is the collection year.' % n,
        })
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in rows:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('candidates', len(cands), 'wrote', len(rows))


if __name__ == '__main__':
    main()
