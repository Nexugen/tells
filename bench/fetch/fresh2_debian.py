"""Posts to the debian-user mailing list, 2008 to 2020, for the fresh-2 held-out set.

Source:  the MHonArc archive at https://lists.debian.org/debian-user/YYYY/MM/. For each year two
         months are picked at random (fixed seed); messages are sampled from a random page of each
         month's thread index (threads.html, thrd2.html, ...) and fetched one page at a time.
Licence: public mailing list archive with no open licence (https://lists.debian.org/), so
         redistributable is false.
Usage:   python3 -I fresh2_debian.py /root/tells-data/fresh-2/human/debian.jsonl [--per-year 8]

Cleaning is the one in fresh2_apache.py (imported from the same folder): quoted text, attribution
lines, signatures, list footers and sign-offs are removed and hard wraps joined; posts that are
mostly code, logs, command output or configuration, heavily interleaved, carry contact details,
are not English or come to under 60 words are skipped. Long posts are cut at a paragraph end at
600 words.
"""
import html, importlib.util, json, os, random, re, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('fresh2_apache', os.path.join(HERE, 'fresh2_apache.py'))
ap = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ap)

BASE = 'https://lists.debian.org/debian-user'
LICENCE = {'name': 'Public mailing list archive; no open licence', 'url': 'https://lists.debian.org/'}
AUTO_SUBJECT = re.compile(r'(?i)^\s*(?:re:\s*)*(?:\[?(?:announce|ann|summary|solved)\b|debian (?:project )?news|'
                          r'updated debian \d|subscribe|unsubscribe|out of (?:the )?office|auto(?:matic)? reply)')


def thread_page(year, month, page):
    name = 'threads.html' if page == 1 else f'thrd{page}.html'
    t = ap.get(f'{BASE}/{year}/{month:02d}/{name}')
    if not t:
        return [], 0
    pages = re.search(r'Page \d+ of (\d+)', t)
    items = re.findall(r'<strong><a name="(\d+)" href="(msg\d+\.html)">([^<]*)</a></strong>', t)
    return [(n, href, html.unescape(s)) for n, href, s in items], int(pages.group(1)) if pages else 1


def parse_message(page):
    m = re.search(r'<!--X-Body-of-Message-->(.*?)<!--X-Body-of-Message-End-->', page, re.S)
    if not m:
        return None
    frm = re.search(r'<li><em>From</em>: (.*?)</li>', page)
    when = re.search(r'<li><em>Date</em>: (?:\w{3}, )?(\d{1,2} \w{3} \d{4})', page)
    if not when:
        return None
    try:
        dt = datetime.strptime(when.group(1), '%d %b %Y').date()
    except ValueError:
        return None
    body = m.group(1)
    # Quoted text that MHonArc rendered as <blockquote> (format=flowed mail) becomes ">" lines.
    body = re.sub(r'(?is)<blockquote[^>]*>(.*?)</blockquote>',
                  lambda q: '\n' + '\n'.join('> ' + l for l in re.sub(r'<[^>]+>', '', q.group(1)).split('\n')) + '\n', body)
    body = re.sub(r'(?i)<br\s*/?>', '\n', body)
    body = re.sub(r'(?i)</?(?:p|div)[^>]*>', '\n', body)
    body = html.unescape(re.sub(r'<[^>]+>', '', body))
    author = None
    if frm:
        a = html.unescape(re.sub(r'<[^>]+>', '', frm.group(1)))
        a = re.sub(r'\s*<[^>]*>?\s*$', '', a).strip().strip('"\'').strip()
        author = ap.author_of(a)
    return author, dt, body


def main():
    out_path = sys.argv[1]
    per_year = int(sys.argv[sys.argv.index('--per-year') + 1]) if '--per-year' in sys.argv else 8
    rng = random.Random(20225)
    samples, seen = [], set()
    for year in range(2008, 2021):
        got = 0
        for mi, month in enumerate(sorted(rng.sample(range(1, 13), 2))):
            want = (per_year - got) if mi == 1 else per_year // 2
            _, pages = thread_page(year, month, 1)
            page = rng.randint(1, max(1, pages))
            items, _ = thread_page(year, month, page)
            rng.shuffle(items)
            kept, tried = 0, 0
            for num, href, subject in items:
                if kept >= want or tried >= want * 8:
                    break
                if AUTO_SUBJECT.match(subject) or ap.AUTOMATED_SUBJECT.match(subject):
                    continue
                tried += 1
                url = f'{BASE}/{year}/{month:02d}/{href}'
                pagetext = ap.get(url)
                if not pagetext:
                    continue
                pm = parse_message(pagetext)
                if not pm:
                    continue
                author, dt, body = pm
                if dt.isoformat() >= '2021-01-01' or dt.year < 2007:
                    continue
                text, qb = ap.clean(body)
                if qb > 2:
                    continue
                t = ap.judge(text, subject)
                if not t:
                    continue
                k = ap.norm(t)
                if k in seen:
                    continue
                seen.add(k)
                note = 'Hard wraps joined; signature, list footer and sign-off removed'
                if qb:
                    note = 'Quoted text and attribution lines removed; ' + note[0].lower() + note[1:]
                samples.append({
                    'id': f'debian-{year}-{month:02d}-{num}', 'source': 'debian', 'group': f'debian:{year}',
                    'genre': 'email', 'register': ap.register_of(t), 'nonNative': False, 'text': t, 'url': url,
                    'author': author, 'date': dt.isoformat(), 'licence': LICENCE, 'redistributable': False,
                    'note': note,
                })
                kept += 1
            got += kept
        print('debian', year, 'kept', got, 'total', len(samples), flush=True)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', out_path)


if __name__ == '__main__':
    main()
