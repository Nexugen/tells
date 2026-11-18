"""Chat messages from Ubuntu's public IRC logs, 2010 to 2021: what a person types into a chat box.

Source:  https://irclogs.ubuntu.com/<yyyy>/<mm>/<dd>/%23<channel>.txt. Seeded random days per channel.
         A sample is one person's run of consecutive lines (nobody else speaking in between, at most
         three minutes between lines) that comes to 60 words or more. The lines are kept as typed, one
         per line; leading "nick:" addressing, joins, parts and bot lines are removed.
Licence: public channel logs published by Canonical with no open licence; local measurement only
         (redistributable false). Nicknames are not stored.
Usage:   python3 -I fetch_irc.py OUT --source NAME --days 40 --seed 1 [--split-mod 10 --split-keep 0-6] [--channels a,b]

Before 2022, so before chat assistants. Each day of one channel is a group, split by --split-mod and
--split-keep so the training, probe and held-out sets never share a day.
"""
import hashlib, json, os, random, re, sys, time
import requests

UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
LIC = {'name': 'Ubuntu IRC logs, public; no open licence', 'url': 'https://irclogs.ubuntu.com/'}


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


OUT = sys.argv[1]
SOURCE = arg('--source', 'irc')
RAW = arg('--raw', '/root/tells-data/raw/irc')
DAYS = int(arg('--days', 40))
SEED = int(arg('--seed', 1))
MOD, KEEP = int(arg('--split-mod', 1)), arg('--split-keep', '0-0')
KLO, KHI = (int(v) for v in KEEP.split('-'))
CHANNELS = arg('--channels', 'ubuntu,ubuntu-offtopic,kubuntu,lubuntu,xubuntu,ubuntu-server,ubuntu-uk,ubuntu-us,ubuntu-discuss,ubuntu-devel,ubuntu-desktop,juju').split(',')
PER_DAY = 6
os.makedirs(RAW, exist_ok=True)
LINE = re.compile(r'^\[(\d\d):(\d\d)\] <([^>]+)> (.*)$')


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def get(url):
    path = os.path.join(RAW, hashlib.sha1(url.encode()).hexdigest()[:16] + '.txt')
    if os.path.exists(path):
        return open(path, encoding='utf-8', errors='replace').read()
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=60)
        except requests.RequestException:
            time.sleep(3)
            continue
        if r.status_code == 404:
            open(path, 'w').write('')
            return ''
        if r.status_code == 200:
            open(path, 'w', encoding='utf-8').write(r.text)
            time.sleep(0.5)
            return r.text
        time.sleep(5 * (attempt + 1))
    return ''


def english(t):
    common = len(re.findall(r'\b(the|and|to|of|a|in|is|that|for|it|you|this|on|be|with|as|are|not|or|i)\b', t, re.I))
    return common >= 0.15 * max(1, words(t))


def bursts(log):
    runs, cur = [], None
    for raw in log.splitlines():
        m = LINE.match(raw)
        if not m:
            continue  # joins, parts, nick changes
        hh, mm, nick, msg = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4).strip()
        t = hh * 60 + mm
        if cur and cur['nick'] == nick and 0 <= t - cur['t'] <= 3:
            cur['lines'].append(msg)
            cur['t'] = t
        else:
            if cur:
                runs.append(cur)
            cur = {'nick': nick, 't': t, 'start': raw[1:6], 'lines': [msg]}
    if cur:
        runs.append(cur)
    return runs


def clean(lines):
    out = []
    for l in lines:
        l = re.sub(r'^[\w\[\]`^{}|\\-]{2,20}[:,]\s+', '', l)  # "nick: " addressing
        if re.match(r'^(?:\x01ACTION|!|@|\$ |sudo |http)', l) or re.search(r'https?://|pastebin|paste\.ubuntu', l):
            continue
        out.append(l)
    return out


rng = random.Random(SEED)
have = set()
for root, _, files in os.walk('/root/tells-data'):
    for f in files:
        if f.endswith('.jsonl') and os.path.abspath(os.path.join(root, f)) != os.path.abspath(OUT):
            for line in open(os.path.join(root, f)):
                try:
                    have.add(json.loads(line)['id'])
                except Exception:
                    pass

out = []
for ch in CHANNELS:
    n = 0
    for _ in range(DAYS):
        d = time.gmtime(rng.randrange(1262304000, 1640995200 - 86400))  # 2010 .. 2021
        day = time.strftime('%Y/%m/%d', d)
        group = f'irc:{ch}:{day}'
        b = int(hashlib.sha256(f'irc:{group}'.encode()).hexdigest()[:8], 16) % MOD
        if not KLO <= b <= KHI:
            continue
        log = get(f'https://irclogs.ubuntu.com/{day}/%23{ch}.txt')
        k = 0
        for run in bursts(log):
            if k >= PER_DAY or run['nick'].lower().endswith('bot') or run['nick'] in ('ubottu', 'ubot5', 'ubot93', 'lubotu3'):
                continue
            lines = clean(run['lines'])
            text = '\n'.join(lines)
            if not 60 <= words(text) <= 400 or len(lines) < 2 or not english(text):
                continue
            # Mostly commands, paths or logs.
            if len(re.findall(r'[/{}=<>|]', text)) > 0.06 * len(text.split()):
                continue
            id_ = 'irc-' + hashlib.sha256(f'{ch}:{day}:{run["start"]}:{run["nick"]}'.encode()).hexdigest()[:16]
            if id_ in have:
                continue
            have.add(id_)
            k += 1
            n += 1
            out.append({'id': id_, 'source': SOURCE, 'group': group, 'genre': 'chat', 'register': 'casual', 'nonNative': False,
                        'text': text, 'url': f'https://irclogs.ubuntu.com/{day}/%23{ch}.html', 'author': None,
                        'date': time.strftime('%Y-%m-%d', d), 'licence': LIC, 'redistributable': False,
                        'note': f'#{ch} IRC, one person\'s consecutive lines from {run["start"]} UTC; addressing and links removed, nickname not kept.'})
    print(f'#{ch}: {n}', flush=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    for s in sorted(out, key=lambda s: s['id']):
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(f'{len(out)} samples -> {OUT}')
