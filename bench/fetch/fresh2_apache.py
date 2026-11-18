"""Posts to Apache Software Foundation public mailing lists, 2005 to 2020, for the fresh-2 held-out set.

Source:  the Pony Mail archive at https://lists.apache.org/. For each list (user@ and dev@ lists of
         httpd, tomcat, spark, kafka, cassandra, maven, lucene/solr, activemq, camel, hadoop) a few
         months are picked at random (fixed seed) from the years the list was active;
         /api/stats.lua?list=<list>&domain=<domain>&d=YYYY-M gives the month's messages and
         /api/email.lua?id=<mid> gives each full message.
Licence: public mailing list archive with no open licence
         (https://www.apache.org/foundation/public-archives.html), so redistributable is false.
Usage:   python3 -I fresh2_apache.py /root/tells-data/fresh-2/human/apache.jsonl [--per-list 22]
         python3 -I fresh2_apache.py <apache.jsonl or debian.jsonl> --relabel   (re-apply text trims and register only)

Cleaning (shared with fresh2_debian.py, which imports this file): quoted lines (">"), attribution
lines ("On ... wrote:", "X wrote:"), anything after an "-----Original Message-----", "From:" header
block or unquoted quoted original, signatures (after "-- "), list footers ("To unsubscribe ..."),
"Sent from" lines and the closing sign-off ("Regards," plus a name) are removed; hard line wraps are
joined into paragraphs. Posts are skipped when they are automated (JIRA, GitHub, commits, CI,
votes and results, announcements), mostly code, logs, stack traces or configuration, carry more than
two separate quote blocks, contain an e-mail address or contact block, have more than two links,
are not English, or come to under 60 words. Long posts are cut at a paragraph end at 600 words.
"""
import hashlib, json, os, random, re, sys, time
from datetime import datetime, timezone

import requests

UA = {'User-Agent': 'tells-research/0.3 (dataset builder; python-requests)'}
API = 'https://lists.apache.org/api'
LICENCE = {'name': 'Public mailing list archive; no open licence',
           'url': 'https://www.apache.org/foundation/public-archives.html'}

# (list, domain, first year, last year)
LISTS = [
    ('users', 'httpd.apache.org', 2005, 2020), ('dev', 'httpd.apache.org', 2005, 2020),
    ('users', 'tomcat.apache.org', 2005, 2020), ('dev', 'tomcat.apache.org', 2005, 2020),
    ('user', 'spark.apache.org', 2014, 2020), ('dev', 'spark.apache.org', 2014, 2020),
    ('users', 'kafka.apache.org', 2012, 2020), ('dev', 'kafka.apache.org', 2012, 2020),
    ('user', 'cassandra.apache.org', 2010, 2020), ('dev', 'cassandra.apache.org', 2010, 2020),
    ('users', 'maven.apache.org', 2005, 2020), ('dev', 'maven.apache.org', 2005, 2020),
    ('solr-user', 'lucene.apache.org', 2007, 2020), ('users', 'activemq.apache.org', 2007, 2020),
    ('users', 'camel.apache.org', 2008, 2020), ('user', 'hadoop.apache.org', 2010, 2020),
]

TECH = re.compile(r'\b(?:server|config|configuration|cluster|node|broker|jar|java|jvm|class|error|exception|version|'
                  r'build|plugin|dependency|module|request|port|ssl|query|index|table|thread|connection|'
                  r'deploy|webapp|servlet|partition|topic|consumer|producer|schema|api|code|patch|bug|'
                  r'release|compile|install|file|directory|memory|heap|log|database|script|process|proxy|header|http|https|url|'
                  r'hostname|raid|mdadm|superblock|grub|boot|bios|uefi|xterm|terminal|console|vim|emacs|browser|'
                  r'javascript|firmware|wheezy|jessie|stretch|buster|squeeze|lenny|sid|unstable|testing|backports|'
                  r'apt|systemd|xorg|gnome|kde|xfce|usb|wifi|ethernet|partition|filesystem|ext4|mount|sudo|root|'
                  r'apache|mod_\w+|vhost|compiler|platform|jsp|javac|ant|maven|mvn|hdfs|rdd|spark|kafka|stream|offset|'
                  r'replica|sstable|compaction|jdk|ssh|os|linux|windows|unix|cpu|load|virtualhost|kernel|package|driver|disk|network|firewall|repository)s?\b', re.I)
SPAM = re.compile(r'(?i)viagra|cialis|casino|replica watch|lottery|bitcoin|\bsex\b|porn|free download|'
                  r'make money|work from home|click here|seo services|job opening|we are hiring|recruit|'
                  r'call for (?:papers|presentations|proposals)|\bCFP\b|early bird|register now|meetup')
CODE = re.compile(r'^\s*(?:at [\w$.]+\(|at [\w$.]+\.\w+|Caused by:|\.\.\. \d+ more|<[/?!]?[\w:.-]+[^>]*>|'
                  r'\d{4}-\d\d-\d\d[ T]\d\d:\d\d|\[?\d\d:\d\d:\d\d|\[(?:INFO|WARN|WARNING|ERROR|DEBUG)\]|'
                  r'(?:INFO|WARN|ERROR|DEBUG|SEVERE|FINE|TRACE)\b|[\w.-]+\s*[:=]\s*\S+\s*$|'
                  r'(?:public|private|protected|static|final|import|package|return|def|class|if|for|while)\b.*[;{(:]\s*$|'
                  r'[{}\[\]();]+\s*$|//|/\*|\*\s|#|\$ |>>>|[\w$.]+\(.*\)\s*;?\s*$|[A-Za-z_][\w.]*\s*=\s*\S|'
                  r'(?:sudo|cd|ls|mvn|java|ant|bin/|\./|apt-get|aptitude|dpkg|cat|grep|echo|mount|ls)\s|'
                  r'[A-Z]:\\|/(?:usr|etc|var|opt|home|dev|tmp|proc)/|\w+@\w+:|[\w-]+\.(?:xml|java|jar|conf|properties)\b\s*$|'
                  r'(?:\S+\s+){0,2}\|)')

ATTRIB = re.compile(r'^\s*(?:On .{0,200}(?:wrote|writes|said)\s*:?\s*$|.{0,120}\b(?:wrote|writes|said)\s*:\s*$|'
                    r'.{0,80}<[^>]*@[^>]*>\s*(?:wrote|writes)|In article <|Quoting .{0,80}:\s*$|Zitat von|Le .* a écrit|'
                    r'Am .{0,80}schrieb)', re.I)
CUT = re.compile(r'^\s*(?:-{3,}\s*Original Message\s*-{3,}|-{3,}\s*Forwarded message|_{10,}|-{20,}\s*$|From:\s|'
                 r'Sent from |-{5,}\s*next part\s*-{5,}|An HTML attachment was scrubbed|To unsubscribe|'
                 r'To UNSUBSCRIBE|For additional commands|Archive: https?://lists\.debian|Begin forwarded message|'
                 r'Get Outlook for|This (?:e-?mail|message) (?:and any|is intended|may contain|contains)|'
                 r'CONFIDENTIAL|DISCLAIMER|NOTICE:|The information (?:contained|in this))', re.I)
FOOTER = re.compile(r'\s*(?:[~=*_]{10,}|This email has been checked for viruses|-{5,}\s*next part\s*-{5,}|'
                    r'An HTML attachment was scrubbed|Sent from (?:my |Mail\b|Samsung|Yahoo|Outlook|Windows)).*', re.S)
EMAILISH = re.compile(r'\b[\w.+-]+ at [\w-]+(?:\.[\w-]+)+\b|[\w.+-]+@[\w-]+\.\w|```|\b(?:tel|ph|m|e|w)\. ?[\w+(]|'
                      r'\b(?:phone|mobile|cell|fax|skype)\s*[:.]', re.I)
AUTOMATED_FROM = re.compile(r'(?i)\b(?:jira|git|github|gitbox|svn|commits?|jenkins|hudson|buildbot|bugzilla|'
                            r'no-?reply|notifications?|wiki|confluence|apache wiki|cvs|mailer-daemon|qa|bot)\b')
AUTOMATED_SUBJECT = re.compile(r'(?i)^\s*(?:re:\s*)*(?:\[(?:jira|github|vote|result|announce|ann|discuss|cancel|'
                               r'jenkins|ci|build|jobs?|ad|off ?topic|ot|spam)[^\]]*\]|svn commit|cvs commit|git push|'
                               r'build (?:failed|failure|fixed)|failure|jenkins|hudson|\[?ANNOUNCE|\[?VOTE|'
                               r'subscribe|unsubscribe|auto(?:matic)? reply|out of (?:the )?office|delivery status)')


def get(url, params=None, as_json=False):
    for attempt in range(4):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=60)
            time.sleep(1.0)
            if r.status_code == 200:
                if as_json:
                    return r.json()
                enc = 'utf-8'
                m = re.search(rb'charset=["\']?([\w-]+)', r.content[:1500], re.I)
                if m:
                    enc = m.group(1).decode()
                try:
                    return r.content.decode(enc, errors='replace')
                except LookupError:
                    return r.content.decode('utf-8', errors='replace')
            if r.status_code == 404:
                return None
        except (requests.RequestException, ValueError):
            pass
        time.sleep(10 * (attempt + 1))
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def clean(body):
    """Drop quotes, attributions and everything from a signature, footer or forwarded original on."""
    lines = body.replace('\r', '').split('\n')
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
            nxt = [l for l in lines[i + 1:i + 4] if l.strip()]
            if nxt and not nxt[0].lstrip().startswith('>'):
                break
            continue
        if s.strip():
            in_quote = False
        out.append(s)
    return '\n'.join(out).strip(), quote_blocks


CLOSING = re.compile(r'(?i)^(?:(?:many|best|kind|warm|warmest|with)\s+)?(?:regards|cheers|thanks|thank you|thx|best|ciao|'
                     r'greetings|hth|sincerely|tia|br|rgds|yours|salut|bye)\b(?:\s+(?:and|&)\s+(?:best\s+)?regards)?'
                     r'(?:\s+(?:very much|a lot|in advance|again|for (?:the|any|your) help))?\s*[,.!-]*(?:\s+[\w.\'~-]+){0,3}\s*$')


def drop_signoff(t):
    """Remove the trailing sign-off: short closing paragraphs without sentence punctuation."""
    # Elision markers left where quoted text was cut ("<snip>", "[...]") go too.
    t = re.sub(r'(?im)^[ \t]*[<\[](?:snip|snipped|\.\.\.|…)[>\]][ \t]*$', '', t)
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    paras = t.split('\n\n')
    # A reply attribution whose "wrote:" wrapped onto the quoted lines: "On Wed, ... 11:59 AM, Name".
    if len(paras) > 1 and words(paras[0]) <= 25 and re.match(r'^On (?:\w{3},? )?.{3,60}(?:\d{4}|[AP]M)\b', paras[0]):
        paras = paras[1:]
    # A closing on its own ("Cheers,", "Thanks and regards,", "Best, Name"): it and everything after go.
    for i, p in enumerate(paras):
        if i and words(p) <= 6 and CLOSING.match(p.strip()):
            paras = paras[:i]
            break
    while len(paras) > 1 and words(paras[-1]) <= 5 and not re.search(r'[.!?)"”]$', paras[-1].strip()):
        paras.pop()
    for i, p in enumerate(paras):
        if i and re.match(r'^On (?:\w{3},? )?.{3,60}(?:\d{4}|[AP]M)\b', p):
            paras = paras[:i]
            break
    while len(paras) > 1 and words(paras[-1]) <= 5 and not re.search(r'[.!?)"”]$', paras[-1].strip()):
        paras.pop()
    if paras and words(paras[-1]) > 8:
        paras[-1] = re.sub(r'(?i)(?<=[.!?:)])\s+(?:(?:many|best|kind|warm|thanks)\s+)?(?:regards|cheers|thanks|thank you|best|ciao|'
                           r'greetings|hth|sincerely|tia|br)(?:\s+(?:very much|a lot|in advance|again|for (?:the|any|your) help))*'
                           r'\s*[,.!]?(?:\s+[\w.\'~-]+){0,3}$', '', paras[-1])
    return '\n\n'.join(paras).strip()


def ok_text(t):
    # Pasted material marked as such is someone else's text.
    return words(t) >= 60 and not EMAILISH.search(t) and not re.search(r'(?i)</?paste>|-{3,} ?(?:begin|end) paste', t)


def judge(text, subject=''):
    """Return the cleaned post text, or None when it is not mostly the writer's own prose."""
    lines = [l for l in text.split('\n') if l.strip()]
    if not lines:
        return None
    code = sum(1 for l in lines if CODE.match(l) or re.match(r'^(?:\s{4,}|\t)\S', l))
    if code > 4 or code > 0.15 * len(lines):
        return None
    if len(re.findall(r'https?://|www\.', text)) > 2:
        return None
    bullets = sum(1 for l in lines if re.match(r'^\s*(?:[-*+•]|\d+[.)]|[a-z][.)])\s', l))
    if bullets > 0.3 * len(lines) and bullets > 2:
        return None
    if SPAM.search(text) or SPAM.search(subject):
        return None
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
    # Mostly a log, listing or output that slipped past the line test: too few sentence ends.
    if len(re.findall(r'[.!?](?:\s|$)', t)) < max(2, words(t) / 60):
        return None
    return t


def register_of(t):
    hits = [m.lower().rstrip('s') for m in TECH.findall(t)]
    return 'technical' if len(hits) >= 2 else 'casual'


def author_of(a):
    if not a:
        return None
    a = re.sub(r'\s*<[^>]*>\s*', '', a).strip().strip('"\'').strip()
    return None if not a or '@' in a or ' at ' in a or AUTOMATED_FROM.search(a) else a


def relabel(path):
    """Re-apply the sign-off/attribution trim, the final gates and register_of to an output file
    (apache.jsonl or debian.jsonl) without fetching anything."""
    rows = []
    for line in open(path, encoding='utf-8'):
        r = json.loads(line)
        r['text'] = drop_signoff(r['text'])
        if ok_text(r['text']):
            r['register'] = register_of(r['text'])
            rows.append(r)
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('relabelled', len(rows), 'in', path)


def month_emails(lst, domain, year, month):
    d = get(f'{API}/stats.lua', {'list': lst, 'domain': domain, 'd': f'{year}-{month}'}, as_json=True)
    return (d or {}).get('emails', [])


def main():
    out_path = sys.argv[1]
    per_list = int(sys.argv[sys.argv.index('--per-list') + 1]) if '--per-list' in sys.argv else 22
    rng = random.Random(20221)
    samples, seen = [], set()
    partial = out_path + '.partial'
    done_lists = set()
    if os.path.exists(partial):
        for line in open(partial, encoding='utf-8'):
            s = json.loads(line)
            samples.append(s)
            seen.add(norm(s['text']))
            done_lists.add(s['group'])
    pf = open(partial, 'a', encoding='utf-8')
    for lst, domain, y0, y1 in LISTS:
        name = f'{lst}@{domain.split(".")[0]}'
        group = f'apache:{name}'
        # Draw the month plan for every list so the plan stays the same when a run resumes.
        years = list(range(y0, y1 + 1))
        plan = [(y, rng.randint(1, 12)) for y in rng.sample(years, min(len(years), 8))]
        if group in done_lists:
            continue
        per_month = max(2, -(-per_list // len(plan)))
        got = 0
        for year, month in sorted(plan):
            if got >= per_list:
                break
            emails = month_emails(lst, domain, year, month)
            rng.shuffle(emails)
            kept, tried = 0, 0
            for e in emails:
                if kept >= per_month or got >= per_list or tried >= per_month * 8:
                    break
                subj = e.get('subject') or ''
                if AUTOMATED_SUBJECT.match(subj) or AUTOMATED_FROM.search(e.get('from') or ''):
                    continue
                tried += 1
                m = get(f'{API}/email.lua', {'id': e['mid']}, as_json=True)
                if not m or not m.get('body'):
                    continue
                dt = datetime.fromtimestamp(m.get('epoch') or e['epoch'], tz=timezone.utc).date()
                if dt.isoformat() >= '2021-01-01' or dt.year < 2005:
                    continue
                body = m['body']
                if re.search(r'(?im)^(?:\+1|-1|\+0)\b', body) and words(body) < 120:
                    continue
                text, qb = clean(body)
                if qb > 2:
                    continue
                t = judge(text, subj)
                if not t:
                    continue
                k = norm(t)
                if k in seen:
                    continue
                seen.add(k)
                note = 'Hard wraps joined; signature, list footer and sign-off removed'
                if qb:
                    note = 'Quoted text and attribution lines removed; ' + note[0].lower() + note[1:]
                s = {
                    'id': f'apache-{name.replace("@", "-")}-{e["mid"][:16]}', 'source': 'apache', 'group': group,
                    'genre': 'email', 'register': register_of(t), 'nonNative': False, 'text': t,
                    'url': f'https://lists.apache.org/thread/{e["mid"]}', 'author': author_of(m.get('from')),
                    'date': dt.isoformat(), 'licence': LICENCE, 'redistributable': False, 'note': note,
                }
                samples.append(s)
                pf.write(json.dumps(s, ensure_ascii=False) + '\n')
                pf.flush()
                kept += 1
                got += 1
        print(group, 'kept', got, 'total', len(samples), flush=True)
    pf.close()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    os.remove(partial)
    print('wrote', len(samples), 'to', out_path)


if __name__ == '__main__':
    relabel(sys.argv[1]) if '--relabel' in sys.argv else main()
