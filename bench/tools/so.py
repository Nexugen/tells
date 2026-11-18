"""Fetch top-voted Stack Overflow answers (CC BY-SA) written before 2021. Usage: python3 -I so.py RAW_DIR/so.json"""
import json, urllib.request, gzip, re, html, sys
out = sys.argv[1]
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'tells-research/0.1','Accept-Encoding':'gzip'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        try: data = gzip.decompress(data)
        except Exception: pass
        return json.loads(data)
res = []
for tag in ['git','bash','css','python','javascript','linux','html','sql','docker','node.js','vim','regex','c%23','java']:
    q = get(f'https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged={tag}&site=stackoverflow&pagesize=15&todate=1609459200')
    ids = ';'.join(str(x['question_id']) for x in q['items'])
    a = get(f'https://api.stackexchange.com/2.3/questions/{ids}/answers?order=desc&sort=votes&site=stackoverflow&pagesize=100&filter=withbody&todate=1609459200')
    titles = {x['question_id']: html.unescape(x['title']) for x in q['items']}
    for x in a['items']:
        body = x['body']
        if '<pre' in body or '<code>' in body and body.count('<code>')>3: continue
        text = html.unescape(re.sub(r'<[^>]+>','',body)).strip()
        w = len(text.split())
        if 40 <= w <= 200:
            res.append({'qid':x['question_id'],'aid':x['answer_id'],'title':titles.get(x['question_id']),'author':x['owner'].get('display_name'),'created':x['creation_date'],'score':x['score'],'text':text})
json.dump(res, open(out,'w'), indent=1)
print(len(res))
