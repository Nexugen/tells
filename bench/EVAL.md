# Accuracy

Two benchmarks live in `bench/`. The v2 benchmark below is the current one. The v1 numbers (tells 0.2, 182 human samples) are kept at the end for comparison.

## What is measured

A human text is **wrongly flagged** when tells reports a warning or an error on it, in the register it was written in. Hints (info) never count. A model text is **flagged** when it gets a warning or an error, or a human-pattern score under the line (about 30). The score needs 60 words, so shorter texts are judged by the rules alone. AUC is for the human-pattern score, computed over texts of 60 words or more. Calibration error is the expected calibration error of the score read as a probability, over ten bins.

## Data and splits

About 10,600 human samples written before 2022 and about 2,500 model answers (Haiku, Sonnet and Opus through Claude Code's print mode). See `DATA-LICENSES.md` for sources and licences and `bench/v2.ts stats` for the counts by source, register and genre.

- **Pool:** 9,723 human and 2,140 model samples, split by group (a mailbox, a Stack Exchange site, a book, a subreddit, an essay prompt, or one prompt topic with its plain and adversarial versions), 60% train, 20% tune, 20% test. No group appears in two splits.
- **Train** builds the score and is where rules were checked for false positives. **Tune** sets the calibration and the low line and was used to choose between changes. **Test** is locked and was scored once, at the end.
- **Held-out rounds** were fetched from sources and prompts not in the pool. Each was scored exactly once with a model frozen beforehand (`bench/rounds/`). After round 1 was scored and analysed it joined the pool, so round 2 was the only untouched set left for the final check.
- About a third of the prompts are adversarial: the model is told to sound like a person, avoid dashes and lists, write as a tired or non-native writer, or fool a detector.

## Results on data tells never saw

| Set | Human texts | With a warning or error | With an error | Low human-pattern score | Model texts | Plain model output flagged (60+ words) | All plain model output flagged | Adversarial flagged | AUC | AUC, adversarial | Calibration error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r1-fresh-1 | 1092 | 0.5% | 0.0% | 3.1% | 414 | 96.5% | 90.2% | 90.6% | 0.992 | 0.984 | 0.017 |
| r2-fresh-2 | 881 | 0.0% | 0.0% | 0.9% | 354 | 97.6% | 90.7% | 86.1% | 0.998 | 0.997 | 0.013 |
| r2-test | 2006 | 0.2% | 0.1% | 1.9% | 400 | 96.2% | 83.9% | 88.1% | 0.997 | 0.997 | 0.014 |
| r2-tune | 2000 | 0.1% | 0.0% | 1.9% | 482 | 95.5% | 88.2% | 86.3% | 0.996 | 0.994 | 0.016 |

r1 is round 1 (Wikinews, Python mailing lists, Twain, London and Thoreau, Wikibooks, the Mozilla blog), scored with the round-1 model. r2-fresh-2 is round 2 (Apache and Debian mailing lists, Global Voices, Saki, Wilde and Chekhov, Wikivoyage), scored with the final model. r2-test is the locked test split of the pool, scored once with the final model. r2-tune is shown for comparison; it was used for decisions, so it flatters a little.

The target was: no human text with an error, at most 1% with a warning, at least 95% of plain model output flagged and an AUC of at least 0.97.

- **Round 1** missed it in two places. Mozilla's own marketing posts drew warnings (4 of 64, "the power of", "out of the box", "so you can"), and a mailing-list reply drew one for "Thanks for your patience". Overall 0.5% of human texts had a warning, inside the target, but marketing was 4.7%.
- **After round 1:** a text scoring 90 or more now needs one more kind of evidence before a finding stands, marketing needs three kinds instead of two, tables are stripped before scoring, and round 1 joined the pool.
- **Round 2** met the target on texts of 60 words or more: no human text with a warning or an error, 97.6% of plain model output flagged, AUC 0.998 (0.997 on adversarial answers).
- **The locked test split** had 4 human texts of 2,006 with a finding, and one of them was an error: "it's not construction at all: it's" in a Software Engineering answer that also scored 1, so the low score counted as the second kind of evidence. The test split was not used to change anything.
- **Short text is the hole.** Counting texts under 60 words, 90.7% of plain model output was flagged in round 2. Short chat messages from a model were flagged 18% of the time, because only the rules apply and they rightly leave most short messages alone.
- **Adversarial answers** were flagged 86% of the time in round 2 (88% on test).

### Round 2 by register

| Register | Human texts | With a warning or error | Low score | Model texts | Model flagged | AUC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| casual | 112 | 0.0% | 0.9% | 153 | 79.7% | 0.999 |
| professional | 482 | 0.0% | 0.4% | 120 | 96.7% | 0.999 |
| technical | 270 | 0.0% | 1.8% | 45 | 95.6% | 0.997 |
| marketing | 17 | 0.0% | 0.0% | 36 | 94.4% | 1 |

Round 2 has few casual and marketing human texts (112 and 17). The test split covers those registers better:

### Locked test split by register

| Register | Human texts | With a warning or error | Low score | Model texts | Model flagged | AUC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| casual | 874 | 0.2% | 2.3% | 171 | 74.3% | 0.996 |
| professional | 820 | 0.0% | 1.2% | 90 | 95.6% | 0.999 |
| technical | 145 | 1.4% | 3.5% | 64 | 95.3% | 0.999 |
| marketing | 167 | 0.0% | 1.6% | 75 | 89.3% | 0.995 |

### Round 2 by source

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:apache | 215 | 0.0% | 1.4% | 96.2 |
| human:debian | 98 | 0.0% | 2.0% | 93.9 |
| human:globalvoices | 207 | 0.0% | 0.0% | 99.3 |
| human:gutenberg3 | 211 | 0.0% | 0.9% | 97.7 |
| human:wikivoyage | 150 | 0.0% | 0.7% | 97.1 |
| model:claude-fresh-2 | 354 | 24.9% | 95.7% | 4.3 |

### By model

Round 2:

| Model | Texts | Rules flag | Score flags | Either |
| --- | ---: | ---: | ---: | ---: |
| claude-cli:haiku | 118 | 22.0% | 87.3% | 88.1% |
| claude-cli:opus | 118 | 27.1% | 89.0% | 89.0% |
| claude-cli:sonnet | 118 | 25.4% | 89.8% | 89.8% |

Locked test split:

| Model | Texts | Rules flag | Score flags | Either |
| --- | ---: | ---: | ---: | ---: |
| claude-cli:haiku | 132 | 23.5% | 80.3% | 81.1% |
| claude-cli:opus | 111 | 37.8% | 88.3% | 88.3% |
| claude-cli:sonnet | 157 | 31.9% | 86.0% | 86.6% |

### Round 1 by register and source

| Register | Human texts | With a warning or error | Low score | Model texts | Model flagged | AUC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| casual | 107 | 0.0% | 1.9% | 177 | 81.4% | 0.996 |
| professional | 658 | 0.1% | 3.0% | 123 | 97.6% | 0.986 |
| technical | 263 | 0.4% | 3.8% | 69 | 97.1% | 0.999 |
| marketing | 64 | 4.7% | 3.1% | 45 | 95.6% | 0.997 |

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:gutenberg2 | 270 | 0.0% | 0.7% | 94.7 |
| human:mozblog | 154 | 2.6% | 4.5% | 88.9 |
| human:pymail | 244 | 0.4% | 4.1% | 90.6 |
| human:wikibooks | 174 | 0.0% | 1.7% | 96.3 |
| human:wikinews | 250 | 0.0% | 4.8% | 89.1 |
| model:claude-fresh-1 | 414 | 24.9% | 94.1% | 5 |

## What corroboration buys

On the same human texts, with every rule at its own severity (`--strict`) and with the default corroboration:

| Split | Human texts | Wrongly flagged, strict | Wrongly flagged, default | Plain model output flagged by rules, strict | Default |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 5,717 | 6.6% | 0.07% | 39% | 31% |
| tune | 2,000 | 6.0% | 0.1% | 34% | 29% |

Before this, `ai-vocabulary` alone raised a warning on 2% of human texts, and it fired more often on people than on 2026 Claude output. Most rules are habits people have too. Seen together they are evidence, and seen alone they are not.

## Unseen sources

Leave-one-source-out on train and tune, measured before round 1 joined the pool: the score is retrained without one source and tested on it. Share of human texts scored under the line, by the source left out:

| Source left out | Texts | Under the line |
| --- | ---: | ---: |
| Wikipedia talk | 399 | 0% |
| GOV.UK | 244 | 0% |
| PERSUADE essays | 408 | 0.2% |
| ELLIPSE essays | 456 | 0.4% |
| Stack Exchange (v1 sets) | 128 | 0.8% |
| Amazon reviews | 304 | 1.3% |
| Hacker News | 486 | 1.4% |
| Stack Exchange | 812 | 1.5% |
| Reddit | 407 | 2.2% |
| Enron email | 710 | 2.8% |
| Blog Authorship Corpus | 391 | 3.1% |
| Job ads | 316 | 5.4% |
| Open-source READMEs | 282 | 8.2% |
| Project Gutenberg | 570 | 10.2% |

For model output the hard case is a kind of writing the score has never seen from a model: left out one genre at a time, model emails were caught 60% of the time, essays 43%, fiction 44%, comments 38% and chat 31%, against 92% to 100% for answers, forum posts, blogs and marketing. This is why the prompt bank covers 25 genres.

## Remaining weaknesses

- Every model in the benchmark is a Claude model. GPT, Gemini and open models could not be run for this round. Expect other families to be caught less often until they are added.
- Under 60 words only the rules apply, and short casual text from a model reads much like a person's.
- Older literary prose, open-source READMEs and short job ads score lower than other human writing. The score is a style measure, and some human styles sit close to a model's.
- Prompts that ask the model to sound human get through about one time in seven.
- The human sets are published writing. Private messages are only represented by Enron, two public mailing-list archives and SMS.

## v1 benchmark (tells 0.2)

Generated by `bench/eval-report.ts` from `fp-v0.2.json`, `fp-now.json` and `eval.json`. A text counts as **flagged** when tells reports at least one warning or error. Hints (info) never flag a text.

### Human writing left alone

Share of human samples with no warning and no error, checked against the register they were written in. All 182 samples in `human.json`, held-out ones included.

| Register | Samples | v0.2 | Now |
| --- | ---: | ---: | ---: |
| casual | 109 | 82% | 99% |
| professional | 41 | 73% | 98% |
| technical | 10 | 30% | 100% |
| marketing | 22 | 50% | 96% |

These samples were used to tune the rules, so they flatter the result. Two more sets were fetched from other Stack Exchange sites to check that:

| Set | Register | Samples | Rules leave alone |
| --- | --- | ---: | ---: |
| second | casual | 94 | 99% |
| second | professional | 24 | 96% |
| final | casual | 94 | 100% |
| final | professional | 22 | 91% |

The second set was fetched after the first round of changes. Its misfires (dashes, filler transitions, short questions) led to a second round, so it is no longer untouched. The final set was fetched after that and measured once: the rules left alone 98% of its casual samples and 77% of its professional ones. Those professional misfires were "magical" in a fiction-writing answer, "harness" as a noun, "insane" and a legal "[company's]" substitution. They were fixed, which gives the numbers above, and the final set is now spent too. Expect real-world professional writing to land somewhere between those two figures.

### Telling model output apart

Held-out split: 62 human and 42 model texts (Haiku, Sonnet and Opus answering 48 everyday prompts, split by prompt).

| Verdict | Human left alone | Model output flagged | Precision |
| --- | ---: | ---: | ---: |
| Rules, v0.2 | 84% | 45% | 66% |
| Rules, now | 98% | 57% | 96% |
| Style layer (experiment) | 97% | 64% | 93% |
| Rules or style | 95% | 79% | 92% |

By register, rules now:

| Register | Human left alone | Model output flagged |
| --- | ---: | ---: |
| casual | 100% (38) | 42% (12) |
| professional | 100% (14) | 78% (18) |
| technical | 100% (4) | 0% (6) |
| marketing | 83% (6) | 83% (6) |

Most model output that passes is short casual text. A current model asked for a text to a friend writes something close to what a person would, and no rule should claim otherwise. Technical answers from models carry almost no known tells either.

### The style layer, and why it is not shipped

`bench/style.ts` measures function words, punctuation, rhythm and layout, and `eval.ts` trains a logistic regression on them. On the held-out split it reaches an AUC of 0.932 and flags more model output than the rules do. It also scores a plain check-in text that a user reported ("Hey, how have you been? ...") at 0.94, well over its threshold. The human samples are forum posts and the model samples are answers to prompts, so the layer learns where a text came from as much as who wrote it. It stays in `bench/` as an experiment and nothing in the package uses it.

### Human signals

Lift is the share of human training texts with the signal divided by the share of model ones (1 means no difference).

| Signal | Human | Model | Lift |
| --- | ---: | ---: | ---: |
| `stake` | 12% | 1% | 4.586 |
| `aside` | 45% | 20% | 2.175 |
| `real-question` | 22% | 19% | 1.147 |
| `uneven-paragraphs` | 28% | 28% | 0.969 |
| `contraction` | 68% | 75% | 0.908 |
| `specific-number` | 45% | 52% | 0.871 |
| `named-thing` | 60% | 72% | 0.843 |
| `concrete-first` | 38% | 48% | 0.806 |
| `plain-verb` | 55% | 78% | 0.709 |
| `first-hand` | 8% | 19% | 0.501 |
| `bursty-rhythm` | 27% | 58% | 0.479 |
| `time-anchor` | 15% | 35% | 0.456 |

Only an opinion with a stake and asides show a real lift. Models now use numbers, names, dates, contractions and plain verbs as often as people, or more, because the prompts hand them the facts. That is why the signal score is gone. Lint still lists which signals a text has, and only calls one missing when the register's profile shows a clear gap.

### False positives per rule

Share of human samples where the rule raised a warning or an error, before (v0.2) and now. Rules that never did in either version are left out.

| Rule | casual v0.2 | now | professional v0.2 | now | technical v0.2 | now | marketing v0.2 | now |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ai-vocabulary` | 1% | 1% | 0% | 0% | 30% | 0% | 27% | 0% |
| `corporate-excitement` | 0% | 0% | 0% | 0% | 30% | 0% | 5% | 0% |
| `dash` | 1% | 0% | 10% | 0% | 30% | 0% | 14% | 0% |
| `exclamation` | 0% | 0% | 0% | 0% | 0% | 0% | 23% | 5% |
| `stock-hook` | 0% | 0% | 0% | 0% | 10% | 0% | 0% | 0% |
| `not-x-but-y` | 6% | 0% | 10% | 0% | 0% | 0% | 9% | 0% |
| `filler-transition` | 6% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| `rhetorical-qa` | 0% | 0% | 5% | 0% | 0% | 0% | 0% | 0% |
| `hedge-stack` | 4% | 0% | 2% | 0% | 0% | 0% | 0% | 0% |
| `unfilled-placeholder` | 0% | 0% | 2% | 2% | 0% | 0% | 0% | 0% |
| `looking-for-hook` | 2% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| `hype` | 1% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
