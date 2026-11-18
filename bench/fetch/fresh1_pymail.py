"""Posts to the Python mailing lists tutor and python-list, 2005 to 2020, for the fresh-1 held-out set.

Source:  the Mailman pipermail archives at https://mail.python.org/pipermail/<list>/<YYYY-Month>/.
         For each list and year, three months are picked at random (fixed seed); messages are
         sampled from each month's thread index and fetched one page at a time.
Licence: public mailing list archive with no open licence, so redistributable is false.
Usage:   python3 -I fresh1_pymail.py /root/tells-data/fresh-1/human/pymail.jsonl [--per-year 8] [--resume]
         python3 -I fresh1_pymail.py <out.jsonl> --relabel   (re-apply register/author rules only)

Cleaning: quoted lines (">"), attribution lines ("On ... wrote:", "X wrote:"), anything after an
"-----Original Message-----" or unquoted forwarded/quoted block, signatures (after "-- "), list
footers, "Sent from" lines and the closing sign-off
("Regards," plus a name) are removed; hard line wraps are joined into paragraphs. Posts are
skipped when they are mostly code or tracebacks, carry more than two separate quote blocks
(heavily interleaved replies read as fragments once the quotes go), are announcements, look like
spam, contain an e-mail address or contact block, are not English, or come to under 60 words. Long posts are cut at a paragraph end at 600 words.
"""
import hashlib, html, json, os, random, re, sys, time
from datetime import datetime

import requests

OUT = sys.argv[1]
PER_YEAR = int(sys.argv[sys.argv.index('--per-year') + 1]) if '--per-year' in sys.argv else 8
BASE = 'https://mail.python.org/pipermail'
UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
LICENCE = {'name': 'Public mailing list archive; no open licence', 'url': 'https://mail.python.org/'}
LISTS = ['tutor', 'python-list']
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December']
TECH = re.compile(r'\b(?:python|function|module|class|code|error|exception|script|list|dict|dictionary|string|'
                  r'variable|method|import|install|library|file|program|loop|syntax|compile|interpreter|object|'
                  r'package|thread|socket|unicode|regex|database|gui|tkinter|numpy|windows|linux)s?\b', re.I)
SPAM = re.compile(r'(?i)viagra|cialis|casino|replica|lottery|bitcoin|crypto|\bsex\b|porn|free download|'
                  r'cheap|discount|make money|work from home|\$\d+ ?(?:per|a) (?:day|hour)|click here|seo services')
CODE = re.compile(r'^\s*(?:>>>|\.\.\.\s|def |class |import |from \S+ import|return\b|print\s*\(|print |if .*:$|'
                  r'for .* in .*:$|while .*:$|elif |else:|try:|except\b|finally:|with .*:$|raise |Traceback|'
                  r'File ".*", line|[A-Za-z_]\w*Error\b|[\w.\[\]]+\s*[+\-*/]?=\s*\S|[\w.]+\(.*\)\s*$|[{}\[\]();]+\s*$|#|\$ |C:\\)')


def get(url):
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            time.sleep(1.0)
            if r.status_code == 200:
                return r.content.decode('utf-8', errors='replace') if b'charset=utf-8' in r.content[:800].lower() \
                    else r.content.decode('latin-1', errors='replace')
            if r.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(10 * (attempt + 1))
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def thread_index(lst, year, month):
    page = get(f'{BASE}/{lst}/{year}-{MONTHS[month - 1]}/thread.html')
    if not page:
        return []
    out = []
    for m in re.finditer(r'<!--(\d+) [^>]*-->\s*<LI><A HREF="(\d+)\.html">([^<]*)', page):
        out.append((int(m.group(1)), m.group(2), html.unescape(m.group(3)).strip()))
    return out


def parse_message(page):
    author = re.search(r'<B>(.*?)</B>', page, re.S)
    when = re.search(r'<I>([A-Z][a-z]{2} [A-Z][a-z]{2} +\d+ [\d:]+ (?:[A-Z]+ )?\d{4})</I>', page)
    body = re.search(r'<!--beginarticle-->\s*<PRE>(.*?)</PRE>\s*<!--endarticle-->', page, re.S)
    if not body or not when:
        return None
    d = when.group(1).split()
    try:
        dt = datetime.strptime(f'{d[1]} {d[2]} {d[-1]}', '%b %d %Y').date()
    except ValueError:
        return None
    b = re.sub(r'<[^>]+>', '', body.group(1))
    b = html.unescape(b).replace('\r', '')
    a = html.unescape(re.sub(r'<[^>]+>', '', author.group(1))).strip() if author else None
    return a or None, dt, b


ATTRIB = re.compile(r'^\s*(?:On .{0,200}(?:wrote|writes|said)\s*:?\s*$|.{0,120}\b(?:wrote|writes|said)\s*:\s*$|'
                    r'.{0,80}<[^>]*\bat\b[^>]*>\s*(?:wrote|writes)|In article <|Quoting .{0,80}:\s*$|Zitat von|Le .* a écrit)', re.I)
CUT = re.compile(r'^\s*(?:-{3,}\s*Original Message\s*-{3,}|-{3,}\s*Forwarded message|_{10,}|From:\s|Sent from my|'
                 r'-{5,}\s*next part\s*-{5,}|An HTML attachment was scrubbed|Sent from |To unsubscribe|Tutor maillist|https?://mail\.python\.org/mailman/listinfo|Begin forwarded message)', re.I)


def clean(body):
    lines = body.split('\n')
    out, quote_blocks, in_quote = [], 0, False
    for i, line in enumerate(lines):
        s = line.rstrip()
        if s in ('-- ', '--') or CUT.match(s):
            break
        if s.lstrip().startswith(('>', '|>')):
            if not in_quote:
                quote_blocks += 1
            in_quote = True
            continue
        if ATTRIB.match(s):
            # Attribution followed by unquoted text: the rest is the quoted original.
            nxt = [l for l in lines[i + 1:i + 4] if l.strip()]
            if nxt and not nxt[0].lstrip().startswith('>'):
                break
            continue
        if s.strip():
            in_quote = False
        out.append(s)
    return '\n'.join(out).strip(), quote_blocks


def judge(text, subject):
    lines = [l for l in text.split('\n') if l.strip()]
    if not lines:
        return None
    code = sum(1 for l in lines if CODE.match(l) or re.match(r'^(?:\s{4,}|\t)\S', l))
    if code > 4 or code > 0.1 * len(lines):
        return None
    if len(re.findall(r'https?://|www\.', text)) > 2:
        return None
    if SPAM.search(text) or SPAM.search(subject) or re.match(r'(?i)\[?ANN(?:OUNCE)?\b|\[?ANN:|^\[?JOB', subject):
        return None
    # Join hard wraps into paragraphs.
    paras = []
    for block in re.split(r'\n\s*\n', text):
        p = re.sub(r'\s+', ' ', block).strip()
        if p:
            paras.append(p)
    out = []
    for p in paras:
        if words(' '.join(out + [p])) > 600:
            break
        out.append(p)
    t = drop_signoff(FOOTER.sub('', '\n\n'.join(out)).strip())
    if not ok_text(t):
        return None
    toks = re.findall(r'[a-z]+', t.lower())
    fw = {'the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'i', 'that', 'for', 'you', 'this', 'with', 'be', 'not', 'but'}
    if sum(x in fw for x in toks) < 0.18 * len(toks):
        return None
    return t


def register_of(t):
    hits = [m.lower().rstrip('s') for m in TECH.findall(t)]
    return 'technical' if len(set(hits)) >= 2 or len(hits) >= 3 else 'casual'


def author_of(a):
    # Archives without a display name show the obfuscated address ("name at host"): leave it out.
    return None if not a or ' at ' in a or '@' in a else a


FOOTER = re.compile(r'\s*(?:[~=*_]{10,}|(?<=\s)-{5,}(?=\s)|Do you Yahoo!?|__________________|This email has been checked for viruses|-{5,}\s*next part\s*-{5,}|An HTML attachment was scrubbed|Sent from (?:my |Mail\b|Samsung|Yahoo|Outlook|Windows)).*', re.S)


EMAILISH = re.compile(r'\b[\w.+-]+ at [\w-]+(?:\.[\w-]+)+\b|[\w.+-]+@[\w-]+\.\w|```|\b(?:tel|ph|m|e|w)\. ?[\w+(]')


# Off-topic Usenet-gateway spam that the patterns above miss, found by reading the output.
DROP_IDS = {'pymail-python-list-2007-feb-426425'}


def ok_text(t):
    """Final gate after trimming: no addresses or contact blocks (personal data), no code fences."""
    return words(t) >= 60 and not EMAILISH.search(t)


def drop_signoff(t):
    """Remove the trailing sign-off: short closing paragraphs without sentence punctuation
    ("Regards,", "Cheers", a bare name). Closings written as sentences ("Thanks in advance.") stay."""
    paras = t.split('\n\n')
    while len(paras) > 1 and words(paras[-1]) <= 5 and not re.search(r'[.!?)"”]$', paras[-1].strip()):
        paras.pop()
    # A reply attribution that wrapped ("On Thu, ... at 7:14 PM, Name" / "wrote:") ends the post.
    for i, p in enumerate(paras):
        if i and re.match(r'^On (?:\w{3},? )?.{3,60}(?:\d{4}|[AP]M)\b', p):
            paras = paras[:i]
            break
    while len(paras) > 1 and words(paras[-1]) <= 5 and not re.search(r'[.!?)"”]$', paras[-1].strip()):
        paras.pop()
    # "Regards, Name" joined onto the last paragraph by wrap-joining.
    if words(paras[-1]) > 8:
        paras[-1] = re.sub(r'(?i)(?<=[.!?:)])\s+(?:(?:many|best|kind|warm|thanks)\s+)?(?:regards|cheers|thanks|thank you|best|ciao|'
                           r'greetings|hth|sincerely|tia)(?:\s+(?:very much|a lot|in advance|again|for (?:the|any|your) help))*'
                           r'\s*[,.!]?(?:\s+[\w.\'~-]+){0,3}$', '', paras[-1])
    return '\n\n'.join(paras).strip()


def relabel():
    """Re-apply the footer cut, register_of and author_of to an existing output file without fetching."""
    rows = []
    for l in open(OUT, encoding='utf-8'):
        r = json.loads(l)
        r['text'] = drop_signoff(FOOTER.sub('', r['text']).strip())
        if ok_text(r['text']) and r['id'] not in DROP_IDS:
            rows.append(r)
    for r in rows:
        r['register'] = register_of(r['text'])
        r['author'] = author_of(r['author'])
    with open(OUT, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('relabelled', len(rows))


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def main():
    rng = random.Random(20212)
    samples, seen = [], set()
    # --resume: posts already in OUT are kept as they are (not refetched) and count toward each
    # list-year's quota; posts later removed from OUT are refetched and judged again by the current rules.
    existing = {}
    if '--resume' in sys.argv and os.path.exists(OUT):
        existing = {r['id']: r for r in map(json.loads, open(OUT, encoding='utf-8'))}
    for lst in LISTS:
        for year in range(2005, 2021):
            months = rng.sample(range(1, 13), 3)
            kept = 0
            for mi, month in enumerate(months):
                want = (PER_YEAR - kept) // (3 - mi) + (1 if (PER_YEAR - kept) % (3 - mi) else 0)
                idx = thread_index(lst, year, month)
                if not idx:
                    continue
                rng.shuffle(idx)
                # Thread starters and direct replies first: least interleaved quoting.
                idx.sort(key=lambda x: min(x[0], 2))
                got, tried = 0, 0
                for depth, num, subject in idx:
                    if got >= want or tried >= want * 6:
                        break
                    sid = f'pymail-{lst}-{year}-{MONTHS[month - 1][:3].lower()}-{num}'
                    if sid in existing:
                        samples.append(existing[sid])
                        seen.add(norm(existing[sid]['text']))
                        got += 1
                        continue
                    tried += 1
                    url = f'{BASE}/{lst}/{year}-{MONTHS[month - 1]}/{num}.html'
                    page = get(url)
                    if not page:
                        continue
                    pm = parse_message(page)
                    if not pm:
                        continue
                    author, dt, body = pm
                    if dt.year != year or dt.isoformat() >= '2022-01-01':
                        continue
                    text, qb = clean(body)
                    if qb > 2:
                        continue
                    t = judge(text, subject)
                    if not t:
                        continue
                    k = norm(t)
                    if k in seen or sid in DROP_IDS:
                        continue
                    seen.add(k)
                    register = register_of(t)
                    note = 'HTML stripped; hard wraps joined'
                    if qb:
                        note += '; quoted text and attribution lines removed'
                    samples.append({
                        'id': sid, 'source': 'pymail',
                        'group': f'pymail:{lst}:{year}', 'genre': 'email', 'register': register, 'nonNative': False,
                        'text': t, 'url': url, 'author': author_of(author), 'date': dt.isoformat(), 'licence': LICENCE,
                        'redistributable': False,
                        'note': note + '; signature, list footer and anything after a reply-quote marker removed',
                    })
                    got += 1
                kept += got
            print(lst, year, 'kept', kept, 'total', len(samples), flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    relabel() if '--relabel' in sys.argv else main()
