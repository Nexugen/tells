"""Project Gutenberg: public-domain essays, letters and fiction by a fixed list of authors.

Source:  the PG mirror https://gutenberg.pglaf.org/ (www.gutenberg.org refuses scripts here).
         Plain-text files at /<d>/<d>/.../<n>/<n>-0.txt (UTF-8), <n>-8.txt (Latin-1) or <n>.txt,
         else the HTML edition /<n>-h/<n>-h.htm (paragraphs taken from <p> elements).
Licence: the works are public domain in the USA; the PG header, footer and licence are stripped,
         which the PG licence allows for redistribution of the bare text
         (https://www.gutenberg.org/policy/license.html).
Usage:   python3 -I fetch_gutenberg.py /root/tells-data/human/gutenberg.jsonl [--per-book 14] [--download-only]
Books are cached in /root/tells-data/raw/gutenberg/ (a few MB each). Only the authors listed in BOOKS
are used; other PG authors are reserved for a held-out test set.

Excerpts are 120 to 400 words of consecutive prose paragraphs, cut at paragraph ends (a single
paragraph over 400 words is cut at a sentence end). Headings, tables of contents, footnotes,
illustration captions, verse and front/back matter are skipped. Letter collections only take text
that starts at a salutation ("My dear ...") so editors' commentary between letters is left out.
At most --per-book excerpts per book, spread evenly across the book.
"""
import hashlib, html, json, os, re, sys, time

import requests

OUT = sys.argv[1]
PER_BOOK = int(sys.argv[sys.argv.index('--per-book') + 1]) if '--per-book' in sys.argv else 14
RAW = '/root/tells-data/raw/gutenberg'
MIRROR = 'https://gutenberg.pglaf.org'
LICENCE = {'name': 'Public domain in the USA (Project Gutenberg)', 'url': 'https://www.gutenberg.org/policy/license.html'}
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}

# (book number, author, title, year of first publication or of writing for letters, genre, kind)
# kind: essay | letters | fiction. Front/back cut: fraction of paragraphs skipped at each end.
BOOKS = [
    # Essays
    (2944, 'Ralph Waldo Emerson', 'Essays, First Series', 1841, 'essay'),
    (2945, 'Ralph Waldo Emerson', 'Essays, Second Series', 1844, 'essay'),
    (39827, 'Ralph Waldo Emerson', 'The Conduct of Life', 1860, 'essay'),
    (10343, 'Charles Lamb', 'Elia and The Last Essays of Elia', 1823, 'essay'),
    (3020, 'William Hazlitt', 'Table Talk: Essays on Men and Manners', 1821, 'essay'),
    (39269, 'William Hazlitt', 'Winterslow: Essays and Characters Written There', 1839, 'essay'),
    (386, 'Robert Louis Stevenson', 'Virginibus Puerisque, and Other Papers', 1881, 'essay'),
    (381, 'Robert Louis Stevenson', 'Memories and Portraits', 1887, 'essay'),
    (614, 'Robert Louis Stevenson', 'Across the Plains, with Other Memories and Essays', 1892, 'essay'),
    (470, 'G. K. Chesterton', 'Heretics', 1905, 'essay'),
    (8092, 'G. K. Chesterton', 'Tremendous Trifles', 1909, 'essay'),
    (11505, 'G. K. Chesterton', 'All Things Considered', 1908, 'essay'),
    (3600, 'Michel de Montaigne (tr. Charles Cotton)', 'Essays of Michel de Montaigne', 1685, 'essay'),
    (575, 'Francis Bacon', 'The Essays or Counsels, Civil and Moral', 1625, 'essay'),
    (64457, 'Virginia Woolf', 'The Common Reader', 1925, 'essay'),
    # Letters
    (35698, 'John Keats', 'Letters of John Keats to His Family and Friends', 1818, 'letters'),
    (42078, 'Jane Austen', 'The Letters of Jane Austen', 1808, 'letters'),
    (14721, 'Abraham Lincoln', 'Speeches & Letters of Abraham Lincoln, 1832-1865', 1858, 'letters'),
    (2657, 'Abraham Lincoln', 'The Papers and Writings of Abraham Lincoln, Volume 5: 1858-1862', 1860, 'letters'),
    (3361, 'Lord Chesterfield', 'Letters to His Son', 1750, 'letters'),
    (40393, 'Vincent van Gogh (tr. Anthony M. Ludovici)', 'The Letters of a Post-Impressionist', 1888, 'letters'),
    # Fiction
    (1342, 'Jane Austen', 'Pride and Prejudice', 1813, 'fiction'),
    (158, 'Jane Austen', 'Emma', 1815, 'fiction'),
    (105, 'Jane Austen', 'Persuasion', 1817, 'fiction'),
    (5247, 'Arnold Bennett', "The Old Wives' Tale", 1908, 'fiction'),
    (12986, 'Arnold Bennett', 'The Card', 1911, 'fiction'),
    (21249, 'Arnold Bennett', 'Clayhanger', 1910, 'fiction'),
    (308, 'Jerome K. Jerome', 'Three Men in a Boat', 1889, 'fiction'),
    (2183, 'Jerome K. Jerome', 'Three Men on the Bummel', 1900, 'fiction'),
    (8164, 'P. G. Wodehouse', 'My Man Jeeves', 1919, 'fiction'),
    (6753, 'P. G. Wodehouse', 'Psmith in the City', 1910, 'fiction'),
    (2005, 'P. G. Wodehouse', 'Piccadilly Jim', 1917, 'fiction'),
    (2233, 'P. G. Wodehouse', 'A Damsel in Distress', 1919, 'fiction'),
    (1661, 'Arthur Conan Doyle', 'The Adventures of Sherlock Holmes', 1892, 'fiction'),
    (2852, 'Arthur Conan Doyle', 'The Hound of the Baskervilles', 1902, 'fiction'),
    (139, 'Arthur Conan Doyle', 'The Lost World', 1912, 'fiction'),
    (541, 'Edith Wharton', 'The Age of Innocence', 1920, 'fiction'),
    (284, 'Edith Wharton', 'The House of Mirth', 1905, 'fiction'),
    (4517, 'Edith Wharton', 'Ethan Frome', 1911, 'fiction'),
    (242, 'Willa Cather', 'My Antonia', 1918, 'fiction'),
    (24, 'Willa Cather', 'O Pioneers!', 1913, 'fiction'),
    (44, 'Willa Cather', 'The Song of the Lark', 1915, 'fiction'),
    (805, 'F. Scott Fitzgerald', 'This Side of Paradise', 1920, 'fiction'),
    (64317, 'F. Scott Fitzgerald', 'The Great Gatsby', 1925, 'fiction'),
    (4368, 'F. Scott Fitzgerald', 'Flappers and Philosophers', 1920, 'fiction'),
    (543, 'Sinclair Lewis', 'Main Street', 1920, 'fiction'),
    (1156, 'Sinclair Lewis', 'Babbitt', 1922, 'fiction'),
    (1429, 'Katherine Mansfield', 'The Garden Party, and Other Stories', 1922, 'fiction'),
    (44385, 'Katherine Mansfield', 'Bliss, and Other Stories', 1920, 'fiction'),
    (1472, 'Katherine Mansfield', 'In a German Pension', 1911, 'fiction'),
    (2776, 'O. Henry', 'The Four Million', 1906, 'fiction'),
    (2777, 'O. Henry', 'Cabbages and Kings', 1904, 'fiction'),
    (1444, 'O. Henry', 'The Voice of the City', 1908, 'fiction'),
]

# Letters whose writers are formal by habit or purpose: register professional, the rest casual.
FORMAL_LETTERS = {14721, 2657, 3361}


def book_path(n):
    s = str(n)
    return ('/'.join(s[:-1]) if len(s) > 1 else '0') + '/' + s


def download(n):
    os.makedirs(RAW, exist_ok=True)
    local = f'{RAW}/{n}.txt'
    if os.path.exists(local):
        return open(local, encoding='utf-8').read()
    base = f'{MIRROR}/{book_path(n)}/{n}'
    for suffix, enc in (('-0.txt', 'utf-8'), ('-8.txt', 'latin-1'), ('.txt', 'latin-1')):
        r = requests.get(base + suffix, headers=UA, timeout=60)
        time.sleep(1)
        if r.status_code == 200 and len(r.content) > 5000:
            data = r.content
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                text = data.decode(enc, errors='replace')
            open(local, 'w', encoding='utf-8').write(text)
            return text
    # Some books exist only as HTML on the mirror: turn paragraphs into blank-line separated text.
    r = requests.get(f'{MIRROR}/{book_path(n)}/{n}-h/{n}-h.htm', headers=UA, timeout=60)
    time.sleep(1)
    if r.status_code == 200:
        h = r.content.decode('utf-8', errors='replace')
        h = re.sub(r'(?is)<(script|style)\b.*?</\1>', '', h)
        h = re.sub(r'(?is)<span class="pagenum".*?</span>', '', h)
        h = re.sub(r'(?i)<br\s*/?>', ' ', h)
        h = re.sub(r'(?i)</(?:p|h\d|div|li|tr|blockquote|pre)>', '\n\n', h)
        h = html.unescape(re.sub(r'<[^>]+>', '', h))
        text = '\n\n'.join(re.sub(r'[ \t]+', ' ', b).strip() for b in re.split(r'\n\s*\n', h) if b.strip())
        open(local, 'w', encoding='utf-8').write(text)
        return text
    raise RuntimeError(f'pg {n}: no text file on the mirror')


def strip_pg(text):
    text = text.replace('\r\n', '\n').replace('\r', '\n').lstrip('﻿')
    m = re.search(r'^\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG.*$', text, re.M | re.I)
    if m:
        text = text[m.end():]
    m = re.search(r'^\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG.*$', text, re.M | re.I)
    if m:
        text = text[:m.start()]
    m = re.search(r'^End of (?:the )?Project Gutenberg', text, re.M | re.I)
    if m:
        text = text[:m.start()]
    # Editors' notes, appendices and indexes at the back: cut at the first such heading past 40%.
    for m in re.finditer(r'^\s*(?:NOTES|EDITOR\'S NOTES|NOTES AND ILLUSTRATIONS|APPENDIX|INDEX|GLOSSARY|FOOTNOTES)\.?\s*$', text, re.M):
        if m.start() > 0.4 * len(text):
            text = text[:m.start()]
            break
    return text


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


HEADING = re.compile(r'^(?:CHAPTER|BOOK|PART|VOLUME|LETTER|SECTION|ESSAY|CANTO|STAVE|ACT|SCENE|APPENDIX|PREFACE|INTRODUCTION|CONTENTS|INDEX|NOTES?|FOOTNOTES?)\b|^[IVXLC]+\.?(?:\s|$)|^\d+\.?$', re.I)
LETTER_DATELINE = re.compile(r'^[A-Z][\w .,\'-]{0,60}(?:,|\.)\s*(?:\w+day,?\s*)?(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\w*\.?\s*\d{0,2}(?:st|nd|rd|th)?,?\s*\d{0,4}\.?$')
SALUTATION = re.compile(r'^(?:My\s+)?(?:dear(?:est)?|Dear(?:est)?|DEAR(?:EST)?|MY DEAR)\b[^.!?]{0,60}[,.:!]', re.I)
CLOSING = re.compile(r'^(?:Yours|Your\s+(?:very\s+)?(?:affectionate|most|ever|obliged|sincere|truly|faithful|friend|loving|own)|Ever\s+(?:yours|your)|Believe me|Adieu|God bless|I am,?\s|I remain|Most\s+(?:truly|sincerely)|Very\s+(?:truly|sincerely)|Affectionately|Faithfully|Sincerely)', re.I)


def paragraphs(text):
    """Split on blank lines; keep each paragraph's raw lines for the verse test."""
    # Some PG files indent every line; remove the book's usual indent so the verse test still works.
    indents = [len(l) - len(l.lstrip(' ')) for l in text.split('\n') if l.strip()]
    common = max(set(indents), key=indents.count) if indents else 0
    if common:
        text = '\n'.join(l[common:] if l[:common].strip() == '' else l.lstrip(' ') for l in text.split('\n'))
    out = []
    for block in re.split(r'\n\s*\n', text):
        lines = [l.rstrip() for l in block.split('\n') if l.strip()]
        if lines:
            out.append(lines)
    return out


def is_verse(lines):
    if len(lines) < 3:
        return False
    lens = [len(l.strip()) for l in lines]
    indented = sum(1 for l in lines if re.match(r'^\s{2,}', l))
    short = sum(1 for n in lens[:-1] if n < 55)
    return short >= 0.7 * (len(lines) - 1) or indented >= 0.5 * len(lines)


def classify(lines):
    """Return the joined paragraph, or None if it is not running prose."""
    joined = re.sub(r'\s+', ' ', ' '.join(l.strip() for l in lines)).strip()
    if not joined:
        return None
    if is_verse(lines):
        return None
    if re.search(r'\[(?:Footnote|Illustration|Sidenote|Transcriber|Note|Editor|Ed\.)|\{\d+\}|\|', joined, re.I):
        return None
    if re.match(r'^(?:\[|\(|\*|_?Footnote|Note\b|NOTE\b)', joined):
        return None
    if re.match(r"^[A-Z][A-Z .'-]{2,}:\s", joined) and not SALUTATION.match(joined):  # play-script speaker lines
        return None
    if HEADING.match(joined) and words(joined) < 15:
        return None
    if SALUTATION.match(joined) and words(joined) <= 8:  # a salutation on its own line
        return joined
    letters = re.sub(r'[^A-Za-z]', '', joined)
    if letters and sum(c.isupper() for c in letters) > 0.6 * len(letters):
        return None
    if not re.search(r'[.!?"”’\')_—:;-]$', joined):
        return None
    if words(joined) < 4:
        return None
    if re.search(r'\b\d{1,4}\s*$|\.{4,}|(?:\s\d+){3}', joined):
        return None
    if len(re.findall(r'\d', joined)) > 0.06 * len(joined):
        return None
    return joined


def tidy(p):
    p = re.sub(r'\s*—?\[[^\]]{0,400}\]—?', ' ', p)  # bracketed editorial insertions
    p = re.sub(r'(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)', r'\1', p)  # _italics_
    p = p.replace('--', '—') if '---' not in p else p
    p = re.sub(r'\s+', ' ', p).strip()
    p = re.sub(r'\s+([,.;:!?])', r'\1', p)
    return p


def cut_sentences(p, cap):
    out = []
    for s in re.split(r'(?:(?<=[.!?])|(?<=[.!?][”"’]))\s+(?=[A-Z“"‘(])', p):
        if words(' '.join(out + [s])) > cap:
            break
        out.append(s)
    return ' '.join(out)


def excerpts_from(paras, kind):
    """Yield (start index, excerpt text) from runs of consecutive prose paragraphs."""
    n = len(paras)
    # Skip front matter and back matter: the first 4% and last 3% of paragraphs.
    lo, hi = int(n * 0.04), int(n * 0.97)
    i = lo
    while i < hi:
        p = classify(paras[i])
        if p is None:
            i += 1
            continue
        if kind == 'letters' and not SALUTATION.match(p):
            i += 1
            continue
        if not re.match(r'^[A-Z“"‘\'(]', p) or re.match(r'^(?:Page|P\.|Line|l\.)\s*\d', p):
            i += 1
            continue
        start, chunk, closed = i, [], False
        while i < hi:
            p = classify(paras[i])
            if p is None:
                break
            if kind == 'letters' and chunk and (SALUTATION.match(p) or LETTER_DATELINE.match(p)):
                break
            t = tidy(p)
            if words(' '.join(chunk + [t])) > 400:
                if not chunk:
                    t = cut_sentences(t, 400)
                    if words(t) >= 120:
                        chunk.append(t)
                break
            chunk.append(t)
            i += 1
            if kind == 'letters' and CLOSING.match(p):
                closed = True
                break
            if words(' '.join(chunk)) >= 300:
                break
        text = '\n\n'.join(chunk)
        if 120 <= words(text) <= 400:
            yield start, text
        if i == start:
            i += 1
        # Leave a gap so consecutive excerpts are not adjacent.
        i += 3


def dialogue_share(t):
    q = re.findall(r'[“"][^”"]{2,}[”"]', t)
    return sum(len(x) for x in q) / max(1, len(t))


def norm(t):
    return re.sub(r'\W+', ' ', t.lower()).strip()


def main():
    only_download = '--download-only' in sys.argv
    samples, seen = [], set()
    for n, author, title, year, kind in BOOKS:
        try:
            raw = download(n)
        except Exception as e:
            print('skip', n, e)
            continue
        if only_download:
            continue
        paras = paragraphs(strip_pg(raw))
        cands = list(excerpts_from(paras, kind))
        if not cands:
            print('no excerpts', n, title)
            continue
        # Spread: pick PER_BOOK candidates evenly across the book.
        step = max(1, len(cands) / PER_BOOK)
        picks = [cands[int(k * step)] for k in range(min(PER_BOOK, len(cands)))]
        got = 0
        for start, text in picks:
            k = norm(text)
            if k in seen:
                continue
            seen.add(k)
            genre = {'essay': 'essay', 'letters': 'letter', 'fiction': 'fiction'}[kind]
            if kind == 'essay':
                register = 'professional'
            elif kind == 'letters':
                register = 'professional' if n in FORMAL_LETTERS else 'casual'
            else:
                register = 'casual' if dialogue_share(text) >= 0.4 else 'professional'
            h = hashlib.sha1(k.encode()).hexdigest()[:8]
            samples.append({
                'id': f'gutenberg-{n}-p{start}-{h}', 'source': 'gutenberg', 'group': f'pg:{n}',
                'genre': genre, 'register': register, 'nonNative': False, 'text': text,
                'url': f'https://www.gutenberg.org/ebooks/{n}', 'author': author,
                'date': f'{year:04d}-01-01', 'licence': LICENCE, 'redistributable': True,
                'note': f'Excerpt from "{title}" (PG #{n}), paragraphs from {start}; PG header/footer stripped, '
                        'line wraps joined, _italics_ marks and footnote markers removed; date is the approximate '
                        + ('year of writing' if kind == 'letters' else 'year of first publication'),
            })
            got += 1
        print(n, title, 'candidates', len(cands), 'kept', got)
    if only_download:
        return
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    main()
