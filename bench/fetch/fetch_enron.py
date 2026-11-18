"""Enron email bodies written by the mailbox owners (sent folders only), 1998-2002.

Source:  the CMU Enron corpus, May 2015 release (enron_mail_20150507.tar.gz, 443 MB), streamed
         once and never stored: only sent-folder messages that pass the filters are cached, as
         small JSONL, under --raw. (The Hugging Face copy corbt/enron-emails was tried first, via
         the datasets-server rows API, but its anonymous rate limit allows only a few pages a
         minute and sent mail is scattered across 517k rows.)
Licence: public record released by FERC; research use. Not redistributable here.
         https://www.cs.cmu.edu/~enron/
Usage:   python3 -I fetch_enron.py /root/tells-data/human/enron.jsonl [--target 900] [--raw DIR]

Quoted replies, forwarded blocks, attachments, signatures and legal footers are removed; hard
line wraps are joined. Selection is deterministic (sha1 of the Message-ID), round-robin over
mailboxes with at most PER_BOX samples each, so reruns give the same set.
"""
import email, email.policy, email.utils, hashlib, json, os, re, sys, tarfile
import requests

TARBALL = 'https://www.cs.cmu.edu/~enron/enron_mail_20150507.tar.gz'
LICENCE = {'name': 'Public record (FERC release); research use', 'url': 'https://www.cs.cmu.edu/~enron/'}
PER_BOX = 12
UA = {'User-Agent': 'tells-research/0.3'}


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
TARGET = int(arg('--target', 900))
RAW = arg('--raw', '/root/tells-data/raw/enron')
os.makedirs(RAW, exist_ok=True)
CACHE = os.path.join(RAW, 'sent-candidates.jsonl')


CUT = re.compile(r'^\s*(-{2,}\s*Original Message|.*<\S+@\S+>\s+on \d\d/\d\d/\d{4}|Please respond to|Subject:\s|To:\s*$|To:\s+undisclosed|-{3,}\s*Forwarded by|_{5,}|-{5,}\s*$|\*{5,}|={5,}|From:\s|Sent:\s|To:\s.*@|'
                 r'.*\bwrote:\s*$|.*@(ECT|ENRON|Enron|EES|ENRON_DEVELOPMENT)\b.*\d\d/\d\d/\d{4}|'
                 r'.*\d\d/\d\d/\d{2,4} \d\d:\d\d (AM|PM)|This (e-?mail|message) (and any|is|contains)|The information contained in|'
                 r'.*(confidential|privileged) (information|and)|Get your FREE|Do You Yahoo|_+\s*$)', re.I)
SIGNOFF = re.compile(r'^(thanks|thank you|regards|best regards|best|cheers|sincerely|love|later|take care|talk to you later|'
                     r'thx|ttyl|many thanks|kind regards|warm regards|all the best)[\s,.!-]*$', re.I)
CASUAL = re.compile(r"\b(love|lol|haha|hey|hi there|dinner|lunch|beer|drinks|party|weekend|golf|game|kids|baby|wife|husband|"
                    r"mom|dad|honey|birthday|vacation|fun|movie|tickets|wedding|church|y'all|ya|gonna|wanna|gotta|cool|awesome|miss you|"
                    r"baseball|football|super bowl|basketball|ski|skiing|beach|vegas|trip|pizza|dog|house|garden\w*|how are you|hope you)\b|!|:\)|;\)", re.I)
BUSINESS = re.compile(r'\b(deal|contract|agreement|counterpart\w*|trad(e|es|ing)|credit|legal|attached|review|approv\w+|report|project|'
                      r'transaction|pric(e|es|ing)|gas|power|ISDA|regulat\w+|customer|invoice|budget|meeting|schedule|FERC|tariff)\b', re.I)


def register(text):
    c, b = len(CASUAL.findall(text)), len(BUSINESS.findall(text))
    return 'casual' if c >= 3 or (c >= 1 and b == 0) or (c >= 2 and b <= 2) else 'professional'
BULK = re.compile(r'\b(unsubscribe|all rights reserved|\(c\) \d{4}|copyright|click here|newsletter|reuters|associated press|agence france|'
                  r'press release|dow jones|bloomberg)\b', re.I)


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def unwrap(par):
    lines = [l.strip() for l in par.split('\n') if l.strip()]
    if len(lines) > 1 and sum(len(l) >= 45 for l in lines[:-1]) >= 0.7 * (len(lines) - 1):
        return ' '.join(lines)
    return '\n'.join(lines)


def clean(body):
    body = body.replace('\r', '').replace('\t', ' ').replace('\xa0', ' ')
    keep = []
    for line in body.split('\n'):
        if CUT.match(line):
            break
        if line.lstrip().startswith('>'):
            continue
        if re.search(r'<<.*?>>|\.(doc|xls|ppt|pdf)\b', line, re.I) and words(line) < 10:
            continue
        keep.append(line.rstrip())
    text = '\n'.join(keep)
    pars = [unwrap(p) for p in re.split(r'\n\s*\n', text) if p.strip()]
    # Drop the sign-off and name block at the end: short trailing paragraphs/lines.
    while pars:
        last = pars[-1].split('\n')
        while last and (words(last[-1]) <= 4 or SIGNOFF.match(last[-1]) or re.search(r'\d{3}[.\- ]\d{3,4}|@|www\.|\bSuite\b|\bHouston, ?TX\b', last[-1])):
            last.pop()
        if last and len(last) < len(pars[-1].split('\n')) and SIGNOFF.match(last[-1] or ''):
            last.pop()
        if last:
            pars[-1] = '\n'.join(last)
            break
        pars.pop()
    # A lone greeting line ("Steve,") stays: it is part of how people write email.
    text = '\n\n'.join(pars)
    text = re.sub(r'[ ]{2,}', ' ', text)
    return text.strip()


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
    sents = re.split(r'(?<=[.!?])\s+', text)
    out, n = [], 0
    for s in sents:
        if n + words(s) > limit:
            break
        out.append(s)
        n += words(s)
    return ' '.join(out)


def english(t):
    common = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|we|i|this|on|be|with|will|have)\b', t, re.I))
    return common >= 0.12 * words(t) and sum(ord(c) > 0x2fff for c in t) < 3


def usable(t):
    lines = [l for l in t.split('\n') if l.strip()]
    if not lines or BULK.search(t) or t.count('http') > 1:
        return False
    listy = sum(bool(re.match(r'\s*([-*•]|\d+[.)])\s', l)) or words(l) <= 4 for l in lines)
    numeric = len(re.findall(r'\d', t)) / max(1, len(t))
    return listy <= 0.3 * len(lines) and numeric < 0.06 and english(t)




def stream_candidates():
    tmp = CACHE + '.part'
    n = kept = 0
    with requests.get(TARBALL, headers=UA, stream=True, timeout=120) as r, open(tmp, 'w') as f:
        r.raise_for_status()
        r.raw.decode_content = False
        with tarfile.open(fileobj=r.raw, mode='r|gz') as tar:
            for m in tar:
                parts = m.name.split('/')
                if not m.isfile() or len(parts) < 4 or 'sent' not in parts[2].lower():
                    continue
                n += 1
                raw = tar.extractfile(m).read()
                msg = email.message_from_bytes(raw, policy=email.policy.compat32)
                subject = msg.get('Subject') or ''
                if re.match(r'\s*(fw|fwd)\b', subject, re.I):
                    continue
                try:
                    dt = email.utils.parsedate_to_datetime(msg.get('Date'))
                except Exception:
                    continue
                if not 1998 <= dt.year <= 2002:
                    continue
                payload = msg.get_payload(decode=True)
                if not isinstance(payload, bytes):
                    continue
                text = clean(payload.decode('latin-1', 'replace'))
                if words(text) < 60 or not usable(text):
                    continue
                kept += 1
                f.write(json.dumps({'box': parts[1], 'file': '/'.join(parts[1:]), 'mid': msg.get('Message-ID') or m.name,
                                    'date': dt.strftime('%Y-%m-%d'), 'text': text}) + '\n')
                if n % 5000 == 0:
                    print(f'{n} sent messages read, {kept} kept', flush=True)
    os.replace(tmp, CACHE)
    print(f'{n} sent messages read, {kept} kept')


if not os.path.exists(CACHE):
    stream_candidates()

cands = [json.loads(l) for l in open(CACHE)]
for c in cands:
    c['h'] = hashlib.sha1(c['mid'].encode()).hexdigest()
cands.sort(key=lambda c: c['h'])
seen, by_box = set(), {}
for c in cands:
    # Re-clean the cached text so changes to the filters apply without streaming the archive again.
    t = clean(c['text'])
    if words(t) < 60 or not usable(t):
        continue
    t = trim(t)
    if not 60 <= words(t) <= 600:
        continue
    key = re.sub(r'\W+', ' ', t.lower()).strip()
    if key in seen:
        continue
    seen.add(key)
    c['text'] = t
    by_box.setdefault(c['box'], []).append(c)

out = []
for rnd in range(PER_BOX):
    for box in sorted(by_box):
        if len(out) < TARGET and rnd < len(by_box[box]):
            c = by_box[box][rnd]
            out.append({
                'id': f'enron-{box}-{c["h"][:12]}', 'source': 'enron', 'group': f'enron:{box}', 'genre': 'email',
                'register': register(c['text']), 'nonNative': False,
                'text': c['text'], 'url': 'https://www.cs.cmu.edu/~enron/', 'author': None, 'date': c['date'],
                'licence': LICENCE, 'redistributable': False,
                'note': f'Enron corpus maildir/{c["file"]}; quoted reply, forwarded text, attachments, signature and footer removed, line wraps joined.',
            })

out.sort(key=lambda s: s['id'])
with open(OUT, 'w') as f:
    for s in out:
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(out)} samples from {len({s["group"] for s in out})} mailboxes ({len(cands)} candidates)')
