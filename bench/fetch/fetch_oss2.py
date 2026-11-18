"""More open-source project pitches from before 2022: README introductions and release announcements.

Source:  1. The opening "what this is / why use it" paragraphs of each repo's README at its newest
            stable release tag cut before 2022, read from raw.githubusercontent.com.
         2. For a set of repos known to write prose release notes, the release announcement pages
            (github.com/<repo>/releases/tag/<tag>) of up to 14 stable tags before 2022, keeping
            the prose paragraphs (lists, headings, code blocks and quotes dropped) when they reach
            60 words; at most 3 per repo.
         Tags come from `git ls-remote --tags` and their dates from the tag commit's .patch on
         github.com (the Date line, the commit's author date), found by binary search over the
         version-sorted tags. No GitHub API calls (its unauthenticated limit is shared on this host).
         Repos already in fetch_oss.py's list are skipped.
Licence: MIT, Apache-2.0 or BSD only, read from the repo's LICENSE file at the same tag; anything
         else is skipped. All redistributable.
Usage:   python3 -I fetch_oss2.py /root/tells-data/human/oss2.jsonl [--raw DIR]

Register: technical (genre docs) when the text leans on inline code (one code span per 40 words
or more), otherwise marketing (genre marketing). Group = oss:github.com/<owner>/<repo>, the same
form as oss.jsonl.
"""
import hashlib, html, json, os, re, subprocess, sys, time
from html.parser import HTMLParser

import requests

OUT = sys.argv[1]
RAW = sys.argv[sys.argv.index('--raw') + 1] if '--raw' in sys.argv else '/root/tells-data/raw/oss2'
os.makedirs(RAW, exist_ok=True)
UA = {'User-Agent': 'tells-research/0.3 (dataset builder)'}
CUTOFF = '2022-01-01'

README_REPOS = '''
junegunn/fzf BurntSushi/ripgrep sharkdp/bat sharkdp/fd jesseduffield/lazygit stedolan/jq tmux/tmux ohmyzsh/ohmyzsh
starship/starship alacritty/alacritty cli/cli FiloSottile/age FiloSottile/mkcert restic/restic rclone/rclone
goreleaser/goreleaser spf13/cobra gin-gonic/gin gorilla/mux labstack/echo gofiber/fiber golang-migrate/migrate
go-gitea/gitea syncthing/syncthing nats-io/nats-server etcd-io/bbolt dgraph-io/badger cockroachdb/pebble
pingcap/tidb vitessio/vitess containerd/containerd linkerd/linkerd2 argoproj/argo-cd k3s-io/k3s kubernetes/minikube
istio/istio jaegertracing/jaeger pulumi/pulumi open-policy-agent/opa
tokio-rs/tokio serde-rs/serde actix/actix-web rust-lang/mdBook rust-lang/rustlings tauri-apps/tauri bevyengine/bevy
nushell/nushell zellij-org/zellij ogham/exa dandavison/delta XAMPPRocky/tokei meilisearch/meilisearch
facebook/react vuejs/vue angular/angular sveltejs/sapper preactjs/preact-cli alpinejs/alpine bigskysoftware/htmx
evanw/esbuild swc-project/swc rollup/rollup webpack/webpack parcel-bundler/parcel babel/babel snowpackjs/snowpack
postcss/postcss sass/dart-sass stylelint/stylelint jquery/jquery lodash/lodash axios/axios moment/moment
date-fns/date-fns d3/d3 Leaflet/Leaflet mapbox/mapbox-gl-js pixijs/pixijs immutable-js/immutable-js reduxjs/redux
mobxjs/mobx apollographql/apollo-client graphql/graphql-js prisma/prisma typeorm/typeorm sequelize/sequelize
knex/knex Automattic/mongoose nestjs/nest koajs/koa fastify/fastify hapijs/hapi strapi/strapi
facebook/docusaurus facebook/jest facebook/create-react-app nuxt/nuxt.js redwoodjs/redwood vercel/swr
pmndrs/react-three-fiber framer/motion storybookjs/storybook cypress-io/cypress puppeteer/puppeteer
microsoft/playwright microsoft/TypeScript microsoft/terminal microsoft/PowerToys microsoft/vscode
mui/material-ui chakra-ui/chakra-ui jgthms/bulma foundation/foundation-sites excalidraw/excalidraw
hexojs/hexo 11ty/eleventy docsifyjs/docsify vuejs/vuepress squidfunk/mkdocs-material getzola/zola
expo/expo yarnpkg/yarn pnpm/pnpm lerna/lerna nrwl/nx vercel/hyper marktext/marktext laurent22/joplin
pallets/click pallets/jinja encode/httpx encode/starlette aio-libs/aiohttp mitmproxy/mitmproxy pypa/pipenv
explosion/spaCy huggingface/transformers streamlit/streamlit gradio-app/gradio ray-project/ray keras-team/keras
dask/dask plotly/plotly.py bokeh/bokeh pydantic/pydantic tiangolo/typer Textualize/rich pytest-dev/pytest
python-attrs/attrs boto/boto3 scrapy/scrapy psf/requests-html PyCQA/flake8 pyinstaller/pyinstaller
numba/numba sympy/sympy networkx/networkx statsmodels/statsmodels
ankane/pghero rails/webpacker heartcombo/devise sinatra/sinatra Shopify/liquid
discourse/onebox elixir-lang/elixir phoenixframework/phoenix
JetBrains/kotlin square/okhttp square/retrofit google/guava ReactiveX/RxJava spring-projects/spring-framework
apache/kafka apache/spark apache/cassandra apache/druid apache/arrow
hasura/graphql-engine supabase/supabase PostgREST/postgrest duckdb/duckdb rqlite/rqlite arangodb/arangodb
questdb/questdb timescale/timescaledb ory/kratos ory/hydra keycloak/keycloak jitsi/jitsi-meet RocketChat/Rocket.Chat
neovim/neovim micro-editor/micro lite-xl/lite-xl VSCodium/vscodium atom/atom adobe/brackets xi-editor/xi-editor
fish-shell/fish-shell zsh-users/zsh-autosuggestions sharkdp/hyperfine ajeetdsouza/zoxide wting/autojump
tldr-pages/tldr asciinema/asciinema charmbracelet/glow charmbracelet/bubbletea muesli/duf
spf13/viper sirupsen/logrus uber-go/zap stretchr/testify golang/groupcache go-kit/kit grpc/grpc-go
hashicorp/raft nsqio/nsq influxdata/telegraf prometheus/alertmanager grafana/tempo
rust-lang/cargo diesel-rs/diesel rocket-rs/Rocket hyperium/hyper clap-rs/clap rayon-rs/rayon tikv/tikv
vuejs/vuex vuejs/vue-router quasarframework/quasar marmelab/react-admin
react-hook-form/react-hook-form formium/formik tannerlinsley/react-query pmndrs/zustand facebookexperimental/Recoil
highlightjs/highlight.js PrismJS/prism markedjs/marked showdownjs/showdown quilljs/quill ianstormtaylor/slate
codemirror/CodeMirror websockets/ws
python/mypy PyCQA/pylint pyca/cryptography paramiko/paramiko fabric/fabric benoitc/gunicorn encode/uvicorn
sanic-org/sanic falconry/falcon Pylons/pyramid pallets/werkzeug marshmallow-code/marshmallow python-pillow/Pillow
scikit-image/scikit-image
'''.split()
RELEASE_REPOS = '''
evanw/esbuild BurntSushi/ripgrep prisma/prisma microsoft/terminal microsoft/PowerToys huggingface/transformers
explosion/spaCy redwoodjs/redwood linkerd/linkerd2 ory/kratos ory/hydra hasura/graphql-engine 11ty/eleventy
facebook/create-react-app jesseduffield/lazygit FiloSottile/age FiloSottile/mkcert restic/restic
meilisearch/meilisearch microsoft/playwright nuxt/nuxt.js webpack/webpack vercel/swr tauri-apps/tauri
nushell/nushell containerd/containerd streamlit/streamlit pydantic/pydantic Textualize/rich
'''.split()
STOP_HEAD = re.compile(r'(?i)install|getting started|quick ?start|usage|build|contribut|documentation|setup|requirements|example|table of contents|license|download|develop|support|sponsor|backers|community|roadmap|faq')
PRE = re.compile(r'(?i)alpha|beta|rc|dev|pre|canary|nightly|next|snapshot|test|preview|m\d')


def get(url, tries=3, stream=False):
    wait = 3
    for _ in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=40, stream=stream)
            if r.status_code == 200:
                return r
            if r.status_code in (403, 404, 410, 451):
                return None
        except requests.RequestException:
            pass
        time.sleep(wait)
        wait *= 2
    return None


def words(t):
    return len(re.findall(r"[\w'’-]+", t))


def cache(name, fn):
    path = os.path.join(RAW, name)
    if os.path.exists(path):
        return json.load(open(path))
    v = fn()
    json.dump(v, open(path, 'w'))
    return v


# ---------- tags and dates ----------

def ls_tags(repo):
    try:
        out = subprocess.run(['git', 'ls-remote', '--tags', f'https://github.com/{repo}'], capture_output=True, text=True,
                             timeout=90, env={'GIT_TERMINAL_PROMPT': '0', 'PATH': os.environ.get('PATH', '/usr/bin:/bin')}).stdout
    except subprocess.TimeoutExpired:
        return []
    shas = {}
    for line in out.splitlines():
        sha, ref = line.split('\t')
        name = ref[len('refs/tags/'):]
        if name.endswith('^{}'):
            shas[name[:-3]] = sha  # peeled commit wins
        else:
            shas.setdefault(name, sha)
    return sorted(shas.items())


def stable(tags):
    """The version-sorted stable tags of the most common tag prefix."""
    groups = {}
    for name, sha in tags:
        m = re.match(r'^(.*?)(\d+(?:[._]\d+){1,3})$', name)
        if not m or PRE.search(name[len(m.group(1)):]) or len(m.group(1)) > 25:
            continue
        prefix = m.group(1)
        if PRE.search(prefix) and prefix not in ('v', ''):
            continue
        groups.setdefault(prefix, []).append((tuple(int(x) for x in re.split(r'[._]', m.group(2))), name, sha))
    if not groups:
        return []
    best = max(groups.values(), key=len)
    return [(n, s) for _, n, s in sorted(best)]


def commit_date(repo, sha):
    key = f'date-{repo.replace("/", "_")}-{sha[:12]}.json'

    def fetch():
        r = get(f'https://github.com/{repo}/commit/{sha}.patch', stream=True)
        time.sleep(0.7)
        if not r:
            return None
        head = b''
        for chunk in r.iter_content(2048):
            head += chunk
            if len(head) >= 4096:
                break
        r.close()
        m = re.search(rb'^Date: \w{3}, (\d{1,2}) (\w{3}) (\d{4})', head, re.M)
        if not m:
            return None
        mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].index(m.group(2).decode()) + 1
        return f'{int(m.group(3)):04d}-{mon:02d}-{int(m.group(1)):02d}'
    return cache(key, fetch)


def last_before_cutoff(repo, tags):
    """Index of the newest tag dated before CUTOFF (binary search; dates mostly rise with version)."""
    lo, hi, best = 0, len(tags) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        d = commit_date(repo, tags[mid][1])
        if d is None:
            hi = mid - 1
            continue
        if d < CUTOFF:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return best


# ---------- licence and README ----------

def licence_of(text):
    t = text[:3000]
    if re.search(r'Apache License,?\s+Version 2\.0', t):
        return {'name': 'Apache-2.0', 'url': 'https://www.apache.org/licenses/LICENSE-2.0'}
    if re.search(r'Permission is hereby granted, free of charge', t):
        return {'name': 'MIT', 'url': 'https://opensource.org/licenses/MIT'}
    if re.search(r'Redistribution and use in source and binary forms', t):
        return {'name': 'BSD-3-Clause' if 'Neither the name' in t else 'BSD-2-Clause', 'url': 'https://opensource.org/licenses/BSD-3-Clause'}
    return None


LICENCE_FILES = ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'LICENSE-APACHE', 'LICENCE-MIT', 'LICENCE-APACHE', 'license', 'license.md', 'LICENCE',
                 'MIT-LICENSE', 'COPYING', 'LICENSE.rst')
README_FILES = ('README.md', 'README.rst', 'Readme.md', 'readme.md', 'README.markdown', 'README', 'README.txt', 'README.adoc')


def licence_at(repo, tag):
    def fetch():
        for lf in LICENCE_FILES:
            r = get(f'https://raw.githubusercontent.com/{repo}/{tag}/{lf}')
            time.sleep(0.4)
            if r:
                return licence_of(r.text)
        return None
    return cache(f'lic-{repo.replace("/", "_")}-{re.sub(r"[^A-Za-z0-9.]+", "_", tag)}.json', fetch)


def readme_at(repo, tag):
    def fetch():
        for p in README_FILES:
            r = get(f'https://raw.githubusercontent.com/{repo}/{tag}/{p}')
            time.sleep(0.4)
            if r:
                return [p, r.text]
        return None
    return cache(f'readme-{repo.replace("/", "_")}-{re.sub(r"[^A-Za-z0-9.]+", "_", tag)}.json', fetch)


def codey(src_text, n_words):
    return len(re.findall(r'`[^`\n]+`', src_text)) * 40 >= max(n_words, 1)


def readme_intro(src, path):
    """Opening prose paragraphs; returns (text, raw source of those paragraphs for the code-span count)."""
    src = src.replace('\r', '')
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
    src = re.sub(r'```.*?```|~~~.*?~~~', '\n\n', src, flags=re.S)
    if path.endswith(('.rst', '.adoc')):
        src = re.sub(r'(?m)^\.\. .*(?:\n[ \t]+.*)*', '', src)
        src = re.sub(r'(?m)^::\s*$(?:\n[ \t]+.*|\n\s*$)*', '', src)
        src = re.sub(r'`([^`<]+?)\s*<[^>]+>`_+', r'\1', src)
        src = re.sub(r'``([^`]+)``', r'`\1`', src)
        src = re.sub(r':\w+:`([^`]+)`', r'`\1`', src)
        src = re.sub(r'(?m)^(\S.*)\n[=\-~^*#+]{3,}\s*$', r'# \1', src)
        src = re.sub(r'(?m)^[=\-~^*#+]{3,}\s*$', '', src)
        src = re.sub(r'(?m)^=+ (.*)$', r'# \1', src)
    src = re.sub(r'<[^>]+>', ' ', src)
    src = re.sub(r'\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)', '', src)
    src = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', src)
    src = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', src)
    src = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', src)
    src = re.sub(r'(?m)^\[[^\]]+\]:\s*\S+.*$', '', src)
    src = re.sub(r'https?://\S+', '', src)
    src = html.unescape(src)
    out, raw = [], []
    for block in re.split(r'\n\s*\n', src):
        b = block.strip()
        if not b:
            continue
        if b.startswith('#'):
            if out and (STOP_HEAD.search(b) or words(' '.join(out)) >= 80):
                break
            continue
        lines = b.split('\n')
        if any(re.match(r'^\s*(?:[-*+•]|\d+[.)])\s', l) for l in lines) or '|' in b or b.startswith(('    ', '\t', '>')):
            continue  # lists, tables, quotes and indented code are skipped; prose after them in the intro is kept
        p = re.sub(r'\s+', ' ', b)
        p = re.sub(r'(?<!\w)[*_]{1,2}(\S.*?\S|\S)[*_]{1,2}(?!\w)', r'\1', p)
        if words(p) < 8 or not re.search(r'[.!?)]$', p):
            continue
        if words(' '.join(out + [p])) > 400:
            break
        raw.append(p)
        out.append(p.replace('`', ''))
    return '\n\n'.join(out), ' '.join(raw)


# ---------- release pages ----------

class ReleaseBody(HTMLParser):
    """Top-level <p> paragraphs of the first markdown-body div; counts inline code spans."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0  # div depth inside the body; 0 = not inside
        self.done = False
        self.skip = 0
        self.in_p = False
        self.buf, self.paras, self.codes = [], [], 0

    def handle_starttag(self, tag, attrs):
        if self.done:
            return
        cls = dict(attrs).get('class') or ''
        if self.depth == 0:
            if tag == 'div' and 'markdown-body' in cls:
                self.depth = 1
            return
        if tag == 'div':
            self.depth += 1
        if tag in ('pre', 'ul', 'ol', 'table', 'blockquote', 'details', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.skip += 1
        if tag == 'p' and not self.skip:
            self.in_p, self.buf = True, []
        if tag == 'code' and self.in_p:
            self.codes += 1

    def handle_endtag(self, tag):
        if self.done or self.depth == 0:
            return
        if tag == 'div':
            self.depth -= 1
            if self.depth == 0:
                self.done = True
            return
        if tag in ('pre', 'ul', 'ol', 'table', 'blockquote', 'details', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6') and self.skip:
            self.skip -= 1
        if tag == 'p' and self.in_p:
            self.in_p = False
            t = re.sub(r'\s+', ' ', ''.join(self.buf)).strip()
            if t:
                self.paras.append(t)

    def handle_data(self, data):
        if self.in_p and not self.skip and self.depth:
            self.buf.append(data)


def release(repo, tag):
    def fetch():
        r = get(f'https://github.com/{repo}/releases/tag/{tag}')
        time.sleep(1.5)
        if not r or 'markdown-body' not in r.text:
            return None
        m = re.search(r'<relative-time[^>]*datetime="(\d{4}-\d\d-\d\d)', r.text)
        p = ReleaseBody()
        p.feed(r.text)
        return {'date': m.group(1) if m else None, 'paras': p.paras, 'codes': p.codes}
    return cache(f'rel-{repo.replace("/", "_")}-{re.sub(r"[^A-Za-z0-9.]+", "_", tag)}.json', fetch)


def release_text(rel):
    out = []
    for p in rel['paras']:
        if words(p) < 8 or re.search(r'https?://', p) or not re.search(r'[.!?)]$', p) or re.match(r'(?i)(full changelog|thanks to|contributors?:)', p):
            continue
        if words(' '.join(out + [p])) > 400:
            break
        out.append(p)
    return '\n\n'.join(out)


# ---------- main ----------

def sample(kind, repo, tag, text, date, lic, url, code, note):
    register, genre = ('technical', 'docs') if code else ('marketing', 'marketing')
    return {'id': f'oss2-{kind}-{repo.replace("/", "-").lower()}-{re.sub(r"[^A-Za-z0-9.]+", "-", tag)}', 'source': 'oss2',
            'group': f'oss:github.com/{repo}', 'genre': genre, 'register': register, 'nonNative': False, 'text': text,
            'url': url, 'author': None, 'date': date, 'licence': lic, 'redistributable': True, 'note': note}


def english(text):
    w = re.findall(r"[A-Za-z']+", text)
    stop = set('the and to of a in for is it that with as on this be are you can by an or your from'.split())
    letters = re.findall(r'[^\W\d_]', text)
    return w and sum(x.lower() in stop for x in w) / len(w) >= 0.12 and sum(c.isascii() for c in letters) / len(letters) >= 0.97


def main():
    skip = {l.strip() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fetch_oss.py'))
            .read().split('REPOS = [', 1)[1].split(']\n', 1)[0].replace("'", ' ').replace(',', ' ').replace('(', ' ').replace(')', ' ').split()
            if '/' in l and not l.endswith(('.md', '.rst', '.adoc', '.asciidoc', '.markdown'))}
    for l in open('/root/tells-data/human/oss.jsonl'):
        skip.add(json.loads(l)['group'].split('github.com/')[-1])
    rows, seen = [], set()

    def add(s):
        k = re.sub(r'\W+', ' ', s['text'].lower()).strip()
        if k in seen or not english(s['text']):
            return False
        seen.add(k)
        rows.append(s)
        return True

    repos = list(dict.fromkeys(README_REPOS + RELEASE_REPOS))
    for repo in repos:
        if repo in skip:
            print('skip (in oss)', repo)
            continue
        tags = stable(cache(f'tags-{repo.replace("/", "_")}.json', lambda: ls_tags(repo)))
        if not tags:
            print('no tags', repo)
            continue
        i = last_before_cutoff(repo, tags)
        if i is None:
            print('no pre-2022 tag', repo)
            continue
        tag, sha = tags[i]
        lic = licence_at(repo, tag)
        if not lic:
            print('licence not MIT/Apache/BSD', repo, tag)
            continue
        date = commit_date(repo, sha)
        rd = readme_at(repo, tag)
        if rd:
            text, raw = readme_intro(rd[1], rd[0])
            n = words(text)
            if 60 <= n <= 600:
                add(sample('readme', repo, tag, text, date, lic, f'https://github.com/{repo}/blob/{tag}/{rd[0]}', codey(raw, n),
                           f'Opening paragraphs of {rd[0]} at tag {tag}; markdown/rst markup, badges, links, code and lists '
                           'removed (paragraphs after a list are kept up to the first setup/usage heading); licence read from the LICENSE file at the tag; date is the tag commit date'))
            else:
                print('readme intro too short', repo, n)
        if repo in RELEASE_REPOS:
            kept = 0
            for name, _ in reversed(tags[max(0, i - 13):i + 1]):
                if kept >= 3:
                    break
                rel = release(repo, name)
                if not rel or not rel['date'] or rel['date'] >= CUTOFF:
                    continue
                text = release_text(rel)
                n = words(text)
                if not 60 <= n <= 600:
                    continue
                if add(sample('release', repo, name, text, rel['date'], lic, f'https://github.com/{repo}/releases/tag/{name}',
                              rel['codes'] * 40 >= n,
                              f'Prose paragraphs of the GitHub release notes for {name}; HTML stripped, lists, headings, code '
                              'blocks, quotes and paragraphs with URLs dropped; licence from the LICENSE file at the newest '
                              'pre-2022 tag; date is the release date')):
                    kept += 1
        print(repo, tag, date, lic['name'], 'rows', len(rows), flush=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        for s in rows:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')
    print('wrote', len(rows))


if __name__ == '__main__':
    main()
