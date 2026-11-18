# Data licences

The code in this repository is MIT. The writing samples in `src/exemplars.ts` are not all ours, and each one keeps its own licence. Every sample records its author, a link to the original and the licence it was used under.

| Source | Licence | What we used |
| --- | --- | --- |
| Stack Overflow answers | CC BY-SA 2.5, 3.0 or 4.0, by the date of the revision | short answers from before 2021, credited to their authors |
| The Go Blog | CC BY 4.0 | short excerpts from two posts |
| Rust Blog | MIT or Apache 2.0 | short excerpts from two posts |
| GOV.UK | Open Government Licence v3.0 | sentences from one guidance page |
| Nexugen | MIT, as this repository | house drafts, marked `human: false` |

Changes: some excerpts drop markdown links, code, footnote markers or an account name, and one joins a bullet list into a sentence. Each sample's `note` says what changed.

The Stack Overflow samples are share-alike. If you reuse them, keep the credit and the licence. The rest of this repository is not a derivative of them.

We left out anything with an unclear licence, including forum and social media posts.

## Benchmark samples

`bench/human.json` holds 182 samples: 70 under CC BY-SA 3.0, 43 under CC BY-SA 4.0, 20 under Open Government Licence v3.0, 19 under CC BY 4.0, 15 under CC BY-SA (2.5, 3.0 or 4.0, by revision date), 10 under MIT OR Apache-2.0, 5 under CC BY-SA 2.5. They come from Stack Exchange answers and comments written before 2021, the Go and Rust blogs, and GOV.UK guidance and press releases. `bench/human-fresh.json` (118) and `bench/human-final.json` (116) are Stack Exchange comments and answers from other sites, under the same CC BY-SA terms, kept apart to check false positives. Each sample records its source link and licence, and its note names the author where there is one. `bench/tools/` has the scripts that fetched them.

The model answers in `bench/out/` were written by Claude models for this benchmark.

## Benchmark v2

The v2 benchmark (`bench/dataset.ts`) uses about 12,800 human samples in its pool, all written before 2022 except the round-3 additions, which are from before ChatGPT (30 Nov 2022). Each one records its source link, author where known, date and licence. Only sources whose licence allows redistribution are committed. The rest are fetched by the scripts in `bench/fetch/` into `$TELLS_DATA` (default `/root/tells-data`), and `bench/data/manifests/` lists their ids so a rerun can be checked against ours. `python3 -I bench/fetch/export.py` rebuilds the committed files and the manifests.

| Source | Samples | Licence | In the repo |
| --- | ---: | --- | --- |
| Stack Exchange answers and comments | 1,175 | CC BY-SA 2.5, 3.0 or 4.0, by revision date | yes, `bench/data/human/` |
| Project Gutenberg (essays, letters, fiction) | 727 | public domain in the USA | yes |
| ELLIPSE corpus (student essays, English learners) | 528 | CC BY 4.0 | yes |
| PERSUADE 2.0 corpus (student essays) | 510 | CC BY 4.0 | yes |
| Wikipedia talk pages | 504 | CC BY-SA 3.0 | yes |
| Reddit posts (Webis-TLDR-17) | 500 | CC BY 4.0 | yes |
| UCI SMS Spam Collection, real messages only | 400 | CC BY 4.0 | yes |
| EMSCAD job ads, real postings only | 400 | CC0 1.0 | yes |
| Open-source READMEs and release notes | 442 | each project's licence (MIT, Apache-2.0, BSD, CC BY-SA 4.0) | yes |
| GOV.UK guidance and news | 329 | Open Government Licence v3.0 | yes |
| Enron email | 900 | public record, research use | no, fetch with `fetch_enron.py` |
| Hacker News comments | 600 | no open licence | no, `fetch_hn.py` |
| Blog Authorship Corpus | 500 | non-commercial research use | no, `fetch_blogs.py` |
| Amazon reviews (amazon_polarity) | 400 | research use | no, `fetch_amazon.py` |
| WineEnthusiast tasting notes | 300 | CC BY-NC-SA 4.0 | no, `fetch_wine.py` |
| Reddit posts from tech and business subreddits, and lowercase posts (Webis-TLDR-17) | 343 | CC BY 4.0 | yes, `fetch_modern.py reddit` |
| Stack Exchange: ai, datascience, android, apple, softwarerecs, freelancing, pm | 207 | CC BY-SA 3.0 or 4.0, by date | yes, `fetch_modern.py se` |
| Ubuntu IRC channels, one person's consecutive lines (2010 to 2021) | 1,763 | public logs, no open licence | no, `fetch_irc.py` |
| Hacker News comments about AI, apps and startups (2014 to May 2020) | 450 | no open licence | no, `fetch_modern.py hn` |
| GitHub issue comments, AI and app projects (2018 to Oct 2022) | 292 | GitHub user content, no open licence | no, `fetch_modern.py github` |
| Hacker News comments typed mostly in lowercase | 15 | no open licence | no, `mine_lowercase.py` |

Held-out rounds, each fetched after the previous one was scored:

| Round | Source | Samples | Licence | In the repo |
| --- | --- | ---: | --- | --- |
| fresh-1 | Wikinews | 250 | CC BY 2.5 | yes, `bench/fresh-1/human/` |
| fresh-1 | Project Gutenberg (Twain, London, Thoreau) | 270 | public domain in the USA | yes |
| fresh-1 | Wikibooks | 174 | CC BY-SA 3.0 | yes |
| fresh-1 | Mozilla blog | 154 | CC BY-SA 3.0 | yes |
| fresh-1 | Python mailing lists (python-list, tutor) | 244 | public archive, no open licence | no, `fresh1_pymail.py` |
| fresh-2 | Global Voices | 207 | CC BY 3.0 | yes, `bench/fresh-2/human/` |
| fresh-2 | Project Gutenberg (Saki, Wilde, Chekhov in Garnett's translation) | 211 | public domain in the USA | yes |
| fresh-2 | Wikivoyage | 150 | CC BY-SA 3.0 | yes |
| fresh-2 | Apache Software Foundation mailing lists | 215 | public archive, no open licence | no, `fresh2_apache.py` |
| fresh-2 | debian-user mailing list | 98 | public archive, no open licence | no, `fresh2_debian.py` |
| fresh-3 | Stack Exchange: cooking, travel, parenting, pets, gardening, diy, money, workplace, stats, cs, gamedev, security | 240 | CC BY-SA 3.0 or 4.0, by date | yes, `bench/fresh-3/human/` |
| fresh-3 | Ubuntu IRC channels, days not used elsewhere | 303 | public logs, no open licence | no, `fetch_irc.py` |
| fresh-3 | Hacker News comments, Jan to Oct 2022 | 160 | no open licence | no, `fetch_modern.py hn` |
| fresh-3 | GitHub issue comments, six repositories not used elsewhere (2021 to Oct 2022) | 120 | GitHub user content, no open licence | no, `fetch_modern.py github` |

The modern probe (`bench/v2.ts probe`, never trained on) has 838 human texts: 225 Reddit posts (CC BY 4.0, committed in `bench/probe/human/`), and 240 Ubuntu IRC runs, 200 HN comments from 2020 and 2021, 160 GitHub issue comments and 13 lowercase HN comments, which are not redistributable and listed by id in `bench/data/manifests/probe-*.ids.jsonl`. IRC samples do not keep nicknames.

The share-alike samples keep their licence if you reuse them. The PERSUADE and ELLIPSE files give no per-essay date, so their date field is an upper bound.

Model samples in `bench/out-v2/`, `bench/out-topic/`, `bench/fresh-1/out/`, `bench/fresh-2/out/` and `bench/fresh-3/out/` were written by Claude Haiku, Sonnet and Opus for this benchmark from the prompts in `bench/prompts-v2.json`, `bench/prompts-topic.json` and the `prompts.json` of each round.
