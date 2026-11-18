"""Copy the samples whose licence allows it into the repo, and write an id manifest for the rest
(their text stays outside the repo; the fetch_*.py and fresh*_*.py scripts rebuild it).

  $TELLS_DATA/human/*.jsonl         -> bench/data/human/
  $TELLS_DATA/fresh-N/human/*.jsonl -> bench/fresh-N/human/
  everything not redistributable    -> bench/data/manifests/[fresh-N-]<source>.ids.jsonl

Usage: python3 -I bench/fetch/export.py [/root/tells-data]"""
import json, glob, os, re, sys
data = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('TELLS_DATA', '/root/tells-data')
bench = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
man_dir = os.path.join(bench, 'data', 'manifests')
os.makedirs(man_dir, exist_ok=True)
KEYS = ('id', 'source', 'group', 'genre', 'register', 'url', 'date', 'licence')

def export(src_dir, out_dir, prefix):
    for f in sorted(glob.glob(os.path.join(src_dir, '*.jsonl'))):
        rows = [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()]
        keep = [r for r in rows if r.get('redistributable')]
        rest = [r for r in rows if not r.get('redistributable')]
        name = os.path.basename(f)
        if keep:
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as o:
                for r in keep: o.write(json.dumps(r, ensure_ascii=False) + '\n')
        if rest:
            with open(os.path.join(man_dir, prefix + name.replace('.jsonl', '.ids.jsonl')), 'w', encoding='utf-8') as o:
                for r in rest: o.write(json.dumps({k: r.get(k) for k in KEYS}, ensure_ascii=False) + '\n')
        print(prefix + name, 'committed', len(keep), 'manifest only', len(rest))

export(os.path.join(data, 'human'), os.path.join(bench, 'data', 'human'), '')
for d in sorted(glob.glob(os.path.join(data, 'fresh-*'))):
    n = re.search(r'fresh-(\d+)$', d)
    if n: export(os.path.join(d, 'human'), os.path.join(bench, f'fresh-{n.group(1)}', 'human'), f'fresh-{n.group(1)}-')
