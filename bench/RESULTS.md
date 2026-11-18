# Results

## v2 benchmark

Built with `bench/v2.ts`. The accuracy numbers and how they were measured are in `EVAL.md`; this page has the data and the per-source results. Saved reports are in `bench/rounds/`.

### The data

Human samples were all written before 2022, or before 30 Nov 2022 for the sources added in round 3, and come from openly licensed or public sources (see `DATA-LICENSES.md`). Model samples are answers from Claude Haiku, Sonnet and Opus to the prompts in `bench/prompts-v2.json`, `bench/prompts-topic.json` and each round's `prompts.json`. "Non-native" marks writers known to be learning English (ELLIPSE, and PERSUADE essays by English learners). Sources marked fresh-2 and fresh-3 are held-out rounds; the rows from `irc` down were added in round 3.

| Source | Samples | Casual | Professional | Technical | Marketing | Non-native | Genres |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| stackexchange | 1175 | 575 | 393 | 207 | 0 | 0 | qa, comment |
| enron | 900 | 298 | 602 | 0 | 0 | 0 | email |
| gutenberg | 727 | 196 | 531 | 0 | 0 | 0 | essay, letter, fiction |
| hn | 600 | 546 | 0 | 54 | 0 | 0 | comment |
| ellipse | 528 | 91 | 437 | 0 | 0 | 528 | student-essay |
| persuade | 510 | 0 | 510 | 0 | 0 | 41 | student-essay |
| wikitalk | 504 | 434 | 70 | 0 | 0 | 0 | comment |
| reddit | 500 | 500 | 0 | 0 | 0 | 0 | forum |
| blogs | 500 | 500 | 0 | 0 | 0 | 0 | blog |
| jobs | 400 | 0 | 129 | 0 | 271 | 0 | marketing |
| sms | 400 | 400 | 0 | 0 | 0 | 0 | chat |
| amazon | 400 | 400 | 0 | 0 | 0 | 0 | review |
| stackexchange-v1 | 367 | 297 | 70 | 0 | 0 | 0 | qa, comment |
| govuk | 329 | 0 | 309 | 0 | 20 | 0 | news, guidance |
| wine | 300 | 0 | 0 | 0 | 300 | 0 | review |
| oss | 284 | 0 | 74 | 154 | 56 | 0 | marketing, blog, docs |
| gutenberg2 | 270 | 73 | 197 | 0 | 0 | 0 | essay, fiction, letter |
| wikinews | 250 | 0 | 250 | 0 | 0 | 0 | news |
| pymail | 244 | 34 | 0 | 210 | 0 | 0 | email |
| apache (fresh-2) | 215 | 23 | 0 | 192 | 0 | 0 | email |
| gutenberg3 (fresh-2) | 211 | 69 | 142 | 0 | 0 | 0 | fiction, essay, letter |
| globalvoices (fresh-2) | 207 | 0 | 207 | 0 | 0 | 0 | news, blog |
| wikibooks | 174 | 0 | 121 | 53 | 0 | 0 | docs |
| oss2 | 158 | 0 | 0 | 37 | 121 | 0 | marketing, docs |
| mozblog | 154 | 0 | 90 | 0 | 64 | 0 | blog, marketing |
| wikivoyage (fresh-2) | 150 | 0 | 133 | 0 | 17 | 0 | guidance |
| debian (fresh-2) | 98 | 20 | 0 | 78 | 0 | 0 | email |
| gov.uk | 20 | 0 | 8 | 0 | 12 | 0 | guidance |
| go.dev | 19 | 0 | 5 | 8 | 6 | 0 | blog |
| blog.rust-lang.org | 10 | 0 | 4 | 2 | 4 | 0 | blog |
| irc | 1763 | 1763 | 0 | 0 | 0 | 0 | chat |
| hn-ai | 450 | 414 | 0 | 36 | 0 | 0 | comment |
| reddit-modern | 343 | 318 | 0 | 25 | 0 | 0 | forum |
| gh-ai | 292 | 241 | 0 | 51 | 0 | 0 | comment |
| se-ai | 207 | 175 | 0 | 32 | 0 | 0 | qa |
| hn-lower | 15 | 15 | 0 | 0 | 0 | 0 | comment |
| se3 (fresh-3) | 240 | 219 | 0 | 21 | 0 | 0 | qa |
| irc3 (fresh-3) | 303 | 303 | 0 | 0 | 0 | 0 | chat |
| hn3 (fresh-3) | 160 | 147 | 0 | 13 | 0 | 0 | comment |
| gh3 (fresh-3) | 120 | 106 | 0 | 14 | 0 | 0 | comment |
| model: claude-topic | 436 | 382 | 22 | 32 | 0 | 0 | chat, comment, forum, email, qa |
| model: claude-fresh-3 (fresh-3) | 279 | 144 | 66 | 45 | 24 | 0 | chat, comment, forum, email, qa, review, blog, marketing, news, essay, fiction |
| model: claude-v2 | 1582 | 680 | 392 | 250 | 260 | 0 | chat, email, qa, docs, comment, forum, blog, essay, letter, fiction, news, guidance, marketing, review |
| model: claude-fresh-1 | 414 | 177 | 123 | 69 | 45 | 0 | chat, email, qa, docs, comment, blog, essay, fiction, news, marketing, review, letter |
| model: claude-fresh-2 (fresh-2) | 354 | 153 | 120 | 45 | 36 | 0 | chat, email, qa, docs, comment, blog, essay, fiction, news, marketing, review, letter |
| model: claude-v1 | 144 | 60 | 36 | 18 | 30 | 0 | mixed |

In all, 14,497 human samples (12,793 in the pool, 881 held out in round 2 and 823 in round 3) and 3,209 model samples. The probe adds 838 human texts that are never trained on (`bench/v2.ts probe`, see `EVAL.md`).

### Read these with care

- Most human sets are published writing. Private or chat-style messages come from Enron, the Python, Apache and Debian mailing lists, SMS and Ubuntu's public IRC channels.
- IRC samples are one person's consecutive lines. A person's chat turn is how they typed it, but a run of lines is not always one thought.
- Stack Exchange, Wikipedia and Gutenberg texts can include quotations of other writers. They were kept, because people quote in real writing too.
- PERSUADE and ELLIPSE give no per-essay date. The date field is an upper bound.
- Every model is a Claude model, answering through Claude Code's print mode with no system prompt beyond the task.
- The human-pattern score was trained on the train split, so the pool's train numbers are not evidence of anything. Use tune, test and the held-out rounds.

### Round 3, by source (tells 0.3.2)

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:gh3 | 120 | 0.0% | 0.0% | 96.7 |
| human:hn3 | 160 | 0.0% | 1.3% | 94.8 |
| human:irc3 | 303 | 0.0% | 0.0% | 97.8 |
| human:se3 | 240 | 0.0% | 0.8% | 95.2 |
| model:claude-fresh-3 | 279 | 28.3% | 97.1% | 1.9 |

| Model | Texts | Rules flag | Score flags | Either |
| --- | ---: | ---: | ---: | ---: |
| claude-cli:haiku | 93 | 21.5% | 95.7% | 95.7% |
| claude-cli:opus | 93 | 34.4% | 97.9% | 97.9% |
| claude-cli:sonnet | 93 | 29.0% | 96.8% | 96.8% |

### Locked test split, by source (tells 0.3.2)

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:amazon | 96 | 0.0% | 1.0% | 96.6 |
| human:blogs | 104 | 1.0% | 2.9% | 91.7 |
| human:ellipse | 72 | 0.0% | 0.0% | 99.3 |
| human:enron | 186 | 0.0% | 1.6% | 93.4 |
| human:gh-ai | 60 | 0.0% | 1.7% | 96 |
| human:gov.uk | 20 | 0.0% | 10.0% | 88.4 |
| human:govuk | 84 | 0.0% | 0.0% | 98.3 |
| human:gutenberg | 157 | 0.0% | 0.6% | 98.2 |
| human:gutenberg2 | 36 | 0.0% | 0.0% | 98.7 |
| human:hn | 114 | 0.0% | 0.9% | 96.9 |
| human:hn-ai | 80 | 0.0% | 0.0% | 96.4 |
| human:hn-lower | 3 | 0.0% | 0.0% | 99.7 |
| human:irc | 343 | 0.0% | 0.9% | 97.5 |
| human:jobs | 84 | 0.0% | 1.2% | 93.6 |
| human:mozblog | 44 | 0.0% | 2.3% | 93.9 |
| human:oss | 2 | 0.0% | 0.0% | 94.5 |
| human:oss2 | 40 | 0.0% | 2.5% | 93.1 |
| human:persuade | 102 | 0.0% | 0.0% | 97 |
| human:pymail | 45 | 2.2% | 4.4% | 93.2 |
| human:reddit | 93 | 0.0% | 1.1% | 95.8 |
| human:reddit-modern | 32 | 0.0% | 6.3% | 85.4 |
| human:se-ai | 28 | 0.0% | 0.0% | 95.5 |
| human:sms | 54 | 0.0% | n/a | n/a |
| human:stackexchange | 361 | 0.5% | 0.8% | 97.1 |
| human:stackexchange-v1 | 82 | 0.0% | 2.6% | 92.9 |
| human:wikibooks | 24 | 0.0% | 0.0% | 99.1 |
| human:wikinews | 55 | 0.0% | 0.0% | 95.1 |
| human:wikitalk | 105 | 0.0% | 0.0% | 99.1 |
| human:wine | 46 | 0.0% | 0.0% | 92.4 |
| model:claude-fresh-1 | 54 | 18.5% | 100.0% | 0.7 |
| model:claude-topic | 96 | 7.3% | 92.5% | 3.9 |
| model:claude-v1 | 36 | 41.7% | 96.0% | 3.8 |
| model:claude-v2 | 310 | 31.9% | 95.5% | 2.5 |

The rest of this section is the 0.3.0 score model on the 0.3.0 pool, as published then.

### Locked test split, by source (tells 0.3.0)

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:amazon | 96 | 0.0% | 3.1% | 94.7 |
| human:blogs | 104 | 1.0% | 4.8% | 91 |
| human:ellipse | 72 | 0.0% | 0.0% | 99.4 |
| human:enron | 186 | 0.0% | 1.6% | 94.4 |
| human:gov.uk | 20 | 0.0% | 10.0% | 89.9 |
| human:govuk | 84 | 0.0% | 0.0% | 98.6 |
| human:gutenberg | 157 | 0.0% | 0.6% | 98.3 |
| human:gutenberg2 | 36 | 0.0% | 0.0% | 98.4 |
| human:hn | 114 | 0.0% | 0.9% | 96.7 |
| human:jobs | 84 | 0.0% | 1.2% | 93 |
| human:mozblog | 44 | 0.0% | 2.3% | 95.1 |
| human:oss | 2 | 0.0% | 0.0% | 72.5 |
| human:oss2 | 40 | 0.0% | 2.5% | 90.8 |
| human:persuade | 102 | 0.0% | 1.0% | 97.8 |
| human:pymail | 45 | 2.2% | 6.7% | 91.2 |
| human:reddit | 93 | 0.0% | 3.2% | 94.8 |
| human:sms | 54 | 0.0% | n/a | n/a |
| human:stackexchange | 361 | 0.5% | 2.2% | 96.1 |
| human:stackexchange-v1 | 82 | 0.0% | 2.6% | 91.9 |
| human:wikibooks | 24 | 0.0% | 0.0% | 99 |
| human:wikinews | 55 | 0.0% | 1.8% | 95.9 |
| human:wikitalk | 105 | 0.0% | 0.0% | 98.3 |
| human:wine | 46 | 0.0% | 0.0% | 87.4 |
| model:claude-fresh-1 | 54 | 18.5% | 97.7% | 2.6 |
| model:claude-v1 | 36 | 38.9% | 92.0% | 5.6 |
| model:claude-v2 | 310 | 31.9% | 95.1% | 4 |

### Held-out round 2, by source

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:apache | 215 | 0.0% | 1.4% | 96.2 |
| human:debian | 98 | 0.0% | 2.0% | 93.9 |
| human:globalvoices | 207 | 0.0% | 0.0% | 99.3 |
| human:gutenberg3 | 211 | 0.0% | 0.9% | 97.7 |
| human:wikivoyage | 150 | 0.0% | 0.7% | 97.1 |
| model:claude-fresh-2 | 354 | 24.9% | 95.7% | 4.3 |

### Held-out round 1, by source (round-1 model)

| Source | Texts | With a warning or error | Low score | Mean score |
| --- | ---: | ---: | ---: | ---: |
| human:gutenberg2 | 270 | 0.0% | 0.7% | 94.7 |
| human:mozblog | 154 | 2.6% | 4.5% | 88.9 |
| human:pymail | 244 | 0.4% | 4.1% | 90.6 |
| human:wikibooks | 174 | 0.0% | 1.7% | 96.3 |
| human:wikinews | 250 | 0.0% | 4.8% | 89.1 |
| model:claude-fresh-1 | 414 | 24.9% | 94.1% | 5 |

A mean score near 100 means the texts read clearly human to the score. Under 0.3.0, old fiction, open-source READMEs and job ads sat lowest among the human sources; under 0.3.2 the lowest are Reddit posts from tech and business subreddits (mean 85) and GOV.UK pages from the v1 set.

## v1 benchmark

The rest of this page is written by `node --experimental-strip-types bench/run.ts score` and covers the 48-prompt v1 benchmark.


Generated by `node --experimental-strip-types bench/run.ts score`. Raw numbers are in `results.json`. Every sample is cut to its first 150 words or so (at a sentence end) before scoring, so long human posts and short model replies are compared on the same footing.

Read these with care:

- **Known tells per 100 words** counts hits on the rules and nothing else. A text can have no known tells and still read as generated, and people trip the rules too: the Go blog uses em dashes, and Rust release posts open with "The Rust team is happy to announce". It is not a measure of how human a text sounds.
- The human set (`human.json`, 182 samples) is published writing from before 2021: Stack Exchange answers and comments, the Go and Rust blogs, and GOV.UK guidance and press releases. It has no private messages or emails, so it is not a sample of how everyone writes. False-positive rates per rule are in `EVAL.md`.
- The model set is the 48 everyday jobs in `prompts.json`, six per register, answered by each model through Claude Code's print mode with a plain system prompt.
- Both sets are small. Differences of a few points are noise.

### Can the patterns tell people from models?

A logistic regression on the features below (known tells, which human signals are present and how often, and the shape measures), trained on 120 human and 102 model samples and tested on 62 human and 42 model samples it never saw. Model answers are split by prompt, so no prompt appears on both sides.

- Held-out AUC: **0.89** (1.0 separates perfectly, 0.5 is a coin flip). Accuracy at the midpoint: 0.77.
- Known tells alone: AUC 0.84. Adding the human signals and the shape measures takes it to 0.89.

This shows the two sets differ in measurable ways. It does not make the analyzer a detector: the human set is a narrow kind of writing, and a model told to write like these samples would close much of the gap.

### Before and after rewrite

Held-out prompts only. The human-pattern probability is the classifier's output above, averaged. Rewrites ran with the defaults: warnings and errors fixed, info-level hints (such as `bold-overuse`) left alone, and up to two flat sentences per text reworked toward missing signals.

| Rewritten set | Held-out prompts | Known tells before | After | Human-pattern probability before | After |
| --- | ---: | ---: | ---: | ---: | ---: |
| claude-code-haiku+tells | 9 | 7 | 1.7 | 0.36 | 0.43 |
| claude-code-opus+tells | 9 | 8.5 | 6.3 | 0.17 | 0.14 |
| claude-code-sonnet+tells | 9 | 7.7 | 5.2 | 0.25 | 0.26 |

The rewrite cuts known tells by about a third for the Sonnet and Opus sets and by three quarters for Haiku. Much of what is left is info-level bold and emoji, which the defaults leave alone. It moves the human-pattern probability much less, and that is expected: the signals that separate people from models most here (asides, first-hand detail, an opinion with a stake) need facts the draft doesn't have, and the rewrite is not allowed to invent them. Where one would help, it leaves a bracketed placeholder for the writer, and a placeholder counts as a tell (`unfilled-placeholder`) until someone fills it in.

### Known tells

| Source | Samples | Known tells per 100 words | Casual | Professional | Technical | Marketing | With an error | No known tells | Most common |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Human writing | 182 | 0.7 | 0.5 | 0.6 | 1.1 | 1.2 | 0 | 106 | scare-quotes (18), inflated-verb (17), dash (14), no-point-of-view (12), over-qualified (11) |
| claude-code-haiku+tells (claude-cli:haiku, rewritten by claude-cli:haiku) | 24 | 1.2 | 0.7 | 3.5 | 0 | 0.6 | 2 | 18 | unfilled-placeholder (7), label-opener (1), triad (1), list-everything (1), fragment-triad (1) |
| claude-code-haiku (claude-cli:haiku) | 48 | 4.1 | 2.4 | 7 | 0.1 | 6.4 | 9 | 18 | unfilled-placeholder (26), bold-overuse (8), bold-line (6), triad (5), stock-warmth (5) |
| claude-code-opus+tells (claude-cli:opus, rewritten by claude-cli:haiku) | 24 | 2.6 | 4.4 | 3.4 | 1.8 | 1 | 2 | 10 | bold-overuse (18), bold-lead (7), emoji (5), bold-label-list (4), bold-mid-sentence (3) |
| claude-code-opus (claude-cli:opus) | 48 | 6.4 | 6.5 | 7.7 | 1.8 | 7.6 | 9 | 8 | bold-overuse (45), bold-lead (30), emoji (22), unfilled-placeholder (14), bold-line (10) |
| claude-code-sonnet+tells (claude-cli:sonnet, rewritten by claude-cli:haiku) | 24 | 3.1 | 5.7 | 2.6 | 2.3 | 1.7 | 3 | 12 | bold-overuse (16), bold-lead (11), unfilled-placeholder (6), label-opener (2), list-everything (2) |
| claude-code-sonnet (claude-cli:sonnet) | 48 | 6.4 | 5.9 | 7.4 | 2.3 | 8.7 | 5 | 13 | bold-overuse (40), bold-lead (37), unfilled-placeholder (13), stock-warmth (12), emoji (11) |

### Human signals

Share of samples where each signal appears at least once.

| Source | Specific numbers | Names | Dates and times | First-hand detail | An opinion with a stake | Asides and self-correction | Contractions | Plain verbs | A real question | Uneven rhythm | Uneven paragraphs | Concrete opening |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Human writing | 39% | 60% | 13% | 9% | 11% | 39% | 65% | 49% | 16% | 25% | 24% | 40% |
| claude-code-haiku+tells (claude-cli:haiku, rewritten by claude-cli:haiku) | 50% | 71% | 38% | 13% | 0% | 8% | 71% | 75% | 21% | 42% | 29% | 67% |
| claude-code-haiku (claude-cli:haiku) | 46% | 71% | 31% | 10% | 0% | 13% | 73% | 79% | 19% | 44% | 33% | 44% |
| claude-code-opus+tells (claude-cli:opus, rewritten by claude-cli:haiku) | 58% | 79% | 42% | 8% | 0% | 17% | 71% | 79% | 17% | 58% | 46% | 63% |
| claude-code-opus (claude-cli:opus) | 50% | 77% | 38% | 15% | 0% | 25% | 75% | 83% | 21% | 50% | 44% | 52% |
| claude-code-sonnet+tells (claude-cli:sonnet, rewritten by claude-cli:haiku) | 58% | 75% | 42% | 21% | 0% | 8% | 75% | 71% | 13% | 42% | 42% | 75% |
| claude-code-sonnet (claude-cli:sonnet) | 52% | 75% | 42% | 19% | 2% | 17% | 81% | 71% | 17% | 54% | 40% | 50% |

### Shape

Measurements, not grades.

| Source | Words per sentence | Sentence length variation | Specifics per 100 words | Repeated openers | Paragraph variation | Shared openings | Shared closings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Human writing | 17.8 | 0.38 | 4.7 | 0.05 | 0.15 | 0.12 | 0.02 |
| claude-code-haiku+tells (claude-cli:haiku, rewritten by claude-cli:haiku) | 11.6 | 0.39 | 8.4 | 0.01 | 0.08 | 0 | 0 |
| claude-code-haiku (claude-cli:haiku) | 13.5 | 0.44 | 7.6 | 0.02 | 0.12 | 0.08 | 0.06 |
| claude-code-opus+tells (claude-cli:opus, rewritten by claude-cli:haiku) | 12 | 0.52 | 8.9 | 0 | 0.16 | 0 | 0 |
| claude-code-opus (claude-cli:opus) | 12.8 | 0.52 | 8.8 | 0.02 | 0.17 | 0.08 | 0.08 |
| claude-code-sonnet+tells (claude-cli:sonnet, rewritten by claude-cli:haiku) | 11.9 | 0.43 | 9.8 | 0.01 | 0.19 | 0 | 0 |
| claude-code-sonnet (claude-cli:sonnet) | 12.7 | 0.51 | 8.3 | 0.02 | 0.18 | 0.08 | 0.04 |

- **Sentence length variation:** standard deviation of sentence length divided by the mean.
- **Specifics per 100 words:** numbers, names inside a sentence, code spans and units.
- **Repeated openers:** share of sentences whose first two words also open another sentence in the same sample.
- **Paragraph variation:** like sentence variation, across paragraphs.
- **Shared openings and closings:** share of samples in a set that start or end with the same three words as another sample in that set. High values point to templates.
