"""Project Gutenberg, fresh-2 held-out set: Saki (H. H. Munro), Oscar Wilde, and Anton Chekhov in
Constance Garnett's translation only.

Source:  the PG mirror https://gutenberg.pglaf.org/ (www.gutenberg.org returns 503 to scripts here).
         Book numbers were picked from the mirror's catalogue (cache/epub/feeds/pg_catalog.csv):
         English texts by Saki, by Wilde, or by Chekhov with Garnett credited as translator.
Licence: the works are public domain in the USA; the PG header, footer and licence are stripped,
         which the PG licence allows (https://www.gutenberg.org/policy/license.html).
Usage:   python3 -I fresh2_gutenberg3.py /root/tells-data/fresh-2/human/gutenberg3.jsonl [--per-book 9]
Books are cached in /root/tells-data/raw/fresh2-gutenberg3/.

The paragraph classifier and excerpt cutter are imported from fresh1_gutenberg2.py (same folder):
excerpts are 120 to 400 words of consecutive prose paragraphs cut at paragraph ends; headings,
contents pages, footnotes, captions, verse, play-script lines and front/back matter are skipped.
Plays and poetry volumes are not used. Excerpts that name the author or talk about the text
itself (editors' introductions and notes) are dropped before picking. At most --per-book excerpts per book (never more than 20),
spread evenly across the book; letter volumes only take text that starts at a salutation.
Dates: first publication (Saki, Wilde), year of writing (Wilde's De Profundis), and the year the
Garnett translation volume was first published (Chekhov), since the English text is hers.
"""
import hashlib, html, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('fresh1_gutenberg2', os.path.join(HERE, 'fresh1_gutenberg2.py'))
pg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pg)
pg.html = html  # the HTML fallback in pg.download uses it
pg.RAW = '/root/tells-data/raw/fresh2-gutenberg3'

OUT = sys.argv[1]
PER_BOOK = min(20, int(sys.argv[sys.argv.index('--per-book') + 1]) if '--per-book' in sys.argv else 9)

# (book number, author, title, year, kind, check phrase in the first 20,000 characters)
BOOKS = [
    (2830, 'Saki', 'Reginald', 1904, 'fiction', 'saki'),
    (1870, 'Saki', 'Reginald in Russia, and Other Sketches', 1910, 'fiction', 'saki'),
    (3688, 'Saki', 'The Chronicles of Clovis', 1911, 'fiction', 'saki'),
    (555, 'Saki', 'The Unbearable Bassington', 1912, 'fiction', 'saki'),
    (14540, 'Saki', 'When William Came', 1913, 'fiction', 'saki'),
    (269, 'Saki', 'Beasts and Super-Beasts', 1914, 'fiction', 'saki'),
    (1477, 'Saki', 'The Toys of Peace, and Other Papers', 1919, 'fiction', 'saki'),
    (45099, 'Saki', 'The Rise of the Russian Empire', 1900, 'essay', 'munro'),
    (174, 'Oscar Wilde', 'The Picture of Dorian Gray', 1891, 'fiction', 'wilde'),
    (773, 'Oscar Wilde', "Lord Arthur Savile's Crime and Other Stories", 1891, 'fiction', 'wilde'),
    (902, 'Oscar Wilde', 'The Happy Prince, and Other Tales', 1888, 'fiction', 'wilde'),
    (873, 'Oscar Wilde', 'A House of Pomegranates', 1891, 'fiction', 'wilde'),
    (1017, 'Oscar Wilde', 'The Soul of Man under Socialism', 1891, 'essay', 'wilde'),
    (774, 'Oscar Wilde', 'Essays and Lectures', 1908, 'essay', 'wilde'),
    (14240, 'Oscar Wilde', 'Reviews', 1908, 'essay', 'wilde'),
    (41806, 'Oscar Wilde', 'Impressions of America', 1906, 'essay', 'wilde'),
    (921, 'Oscar Wilde', 'De Profundis', 1897, 'prose-letter', 'wilde'),
    (13415, 'Anton Chekhov', 'The Lady with the Dog and Other Stories', 1917, 'fiction', 'garnett'),
    (13416, 'Anton Chekhov', 'The Darling and Other Stories', 1916, 'fiction', 'garnett'),
    (13505, 'Anton Chekhov', 'The Duel and Other Stories', 1916, 'fiction', 'garnett'),
    (13413, 'Anton Chekhov', 'The Party and Other Stories', 1917, 'fiction', 'garnett'),
    (1732, 'Anton Chekhov', 'The Schoolmistress and Other Stories', 1920, 'fiction', 'tales of chekhov'),
    (1883, 'Anton Chekhov', 'The Wife and Other Stories', 1918, 'fiction', 'garnett'),
    (6408, 'Anton Chekhov', 'Letters of Anton Chekhov to His Family and Friends', 1920, 'letters', 'garnett'),
]


# Editors' and translators' introductions and notes (Ross, Mason, Milne, Garnett) name the author in
# the third person or talk about the text itself; the authors never name themselves in these books.
EDITORIAL = re.compile(r'(?i)\b(?:wilde|saki|munro|chekhov|tchehov|tchekhov)\b|was delivered as a lecture|'
                       r'\bthe text here\b|this edition|collated|\bthe present (?:volume|edition)\b(?! of)|'
                       r'first published in|reprinted (?:in|from)')


def main():
    samples, seen = [], set()
    for n, author, title, year, kind, check in BOOKS:
        try:
            raw = pg.download(n)
        except Exception as e:
            print('skip', n, e)
            continue
        head = raw[:20000].lower()
        # Garnett volumes: her name in the header, or the "Tales of Chekhov" series line her
        # translation carries (the PG catalogue credits her for every book listed here).
        if check not in head or (author == 'Anton Chekhov' and 'chekhov' not in head):
            print('skip', n, 'author/translator not found in the header')
            continue
        paras = pg.paragraphs(pg.strip_pg(raw))
        cands = [c for c in pg.excerpts_from(paras, 'letters' if kind == 'letters' else 'prose')
                 if not EDITORIAL.search(c[1])]
        if not cands:
            print('no excerpts', n, title)
            continue
        step = max(1, len(cands) / PER_BOOK)
        picks = [cands[int(k * step)] for k in range(min(PER_BOOK, len(cands)))]
        got = 0
        for start, text in picks:
            k = pg.norm(text)
            if k in seen:
                continue
            seen.add(k)
            if kind == 'essay':
                genre, register = 'essay', 'professional'
            elif kind in ('letters', 'prose-letter'):
                genre, register = 'letter', 'casual' if kind == 'letters' else 'professional'
            else:
                genre = 'fiction'
                register = 'casual' if pg.dialogue_share(text) >= 0.4 else 'professional'
            h = hashlib.sha1(k.encode()).hexdigest()[:8]
            translated = author == 'Anton Chekhov'
            samples.append({
                'id': f'gutenberg3-{n}-p{start}-{h}', 'source': 'gutenberg3', 'group': f'pg:{n}',
                'genre': genre, 'register': register, 'nonNative': False, 'text': text,
                'url': f'https://www.gutenberg.org/ebooks/{n}',
                'author': 'Anton Chekhov (tr. Constance Garnett)' if translated else author,
                'date': f'{year:04d}-01-01', 'licence': pg.LICENCE, 'redistributable': True,
                'note': f'Excerpt from "{title}" (PG #{n}), paragraphs from {start}; PG header/footer stripped, '
                        'line wraps joined, _italics_ marks and footnote markers removed; date is the approximate '
                        + ('year the Garnett translation was published' if translated else
                           'year of writing' if kind == 'prose-letter' else 'year of first publication'),
            })
            got += 1
        print(n, title, 'candidates', len(cands), 'kept', got, flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(samples), 'to', OUT)


if __name__ == '__main__':
    main()
