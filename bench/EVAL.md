# Accuracy

Two benchmarks live in `bench/`. The v2 benchmark is the current one. The model ranking (tells 0.4.2) and the everyday answers (0.3.3) are at the top, then round 3 (tells 0.3.2); rounds 1 and 2 (tells 0.3.0) and the v1 numbers (tells 0.2) are kept below for comparison.

## What is measured

A human text is **wrongly flagged** when tells reports a warning or an error on it, in the register it was written in. Hints (info) never count. A model text is **flagged** when it gets a warning or an error, or a human-pattern score under the line (18 in 0.3.2, 30 in 0.3.0). The score needs 60 words, so shorter texts are judged by the rules alone. AUC is for the human-pattern score, computed over texts of 60 words or more. Calibration error is the expected calibration error of the score read as a probability, over ten bins.

A text counts as **about AI, apps or tech** when it uses three or more words such as AI, model, app, startup, pricing, software, users, customers or business (`isTech` in `bench/v2.ts`). **Lowercase** means at least half its sentences start with a small letter.

## Data and splits

12,793 human samples written before 2022 (before 30 Nov 2022 for the newest sources) and 2,576 model answers in the pool, plus two held-out rounds (881 and 823 human texts) and an 838-text probe. Model answers are from Haiku, Sonnet and Opus through Claude Code's print mode. See `DATA-LICENSES.md` for sources and licences and `bench/v2.ts stats` for the counts by source, register and genre.

- **Pool:** split by group (a mailbox, a Stack Exchange site, a book, a subreddit, an IRC channel on one day, a GitHub repository, an HN thread, or one prompt topic with its plain and adversarial versions), 60% train, 20% tune, 20% test. No group appears in two splits. Train has 7,473 human and 1,528 model samples, tune 2,768 and 552, test 2,552 and 496.
- **Train** builds the score and is where rules were checked for false positives. **Tune** sets the calibration and the low line and was used to choose between changes. **Test** is locked and is scored once per release, at the end.
- **Held-out rounds** are fetched from sources and prompts not in the pool, after tuning stops, and scored exactly once with a model frozen beforehand (`bench/rounds/`, with the model and a hash of the code).
- **The probe** (`bench/v2.ts probe`) is present-day-topic human writing that is never trained on: HN comments from 2020 and 2021 found by searching for GPT-3, Copilot, AI, apps and startups; GitHub issue comments on AI and app projects from 2020 to Oct 2022; Reddit posts from tech and business subreddits and lowercase posts; and chat from Ubuntu's IRC channels. It is human only, so it measures how often real writing about these subjects is called machine-like.
- About a third of the prompts are adversarial: the model is told to sound like a person, avoid dashes and lists, type in lowercase like a chat app, write as a tired or non-native writer, or fool a detector.

## Other providers: the model ranking (tells 0.4.2)

### What was measured

GPT-6.2 Sol (OpenAI) and Gemini 4 Hydrogen (Google) answered the 108 everyday requests in `bench/everyday/prompts.json` with the same system prompt the Claude answers had ("You are a helpful assistant."), default temperature, one answer each. GPT ran with `max_completion_tokens` 600 and `reasoning_effort` low (no answer was cut; one that spent all 600 tokens thinking and came back empty was asked again with 1,500). Claude Haiku, Sonnet and Opus 5.5 are the answers already in `bench/everyday/out`, from Claude Code's print mode on 18 Nov. Each answer was checked with `lint()` and no options. `bench/models/rank.ts` reports, per model, the share of answers with a warning or error, warnings and errors per 100 words, the mean human-pattern score (60+ words) and the share under the low line, each with a 95% bootstrap interval (2,000 resamples, fixed seed). The answers are in `bench/models/out/`, and `bench/models/rank.ts add --provider openai --model <id>` answers the requests with a new model and reruns the ranking.

Gemini's free tier allows 20 requests a day per model: Gemini 4 Hydrogen answered 17, all of them advice requests, and Gemini 3.8 Flash 6 (kept in `bench/models/partial/`, not ranked). Gemini 4 Argon, Carbon and Neon refused every request twice ("exceeded your current quota": the free tier has no quota for them). GPT-6.2 Astra, GPT-6.1 Terra and GPT-6 Luna were stopped after 15, 18 and 26 answers when the OpenAI budget was cut to $1.50; their answers are in `bench/models/partial/` and are used below only as extra unseen GPT text. Estimated OpenAI spend, from token counts at list prices (Astra $8/$40, Sol $2/$10, Terra $1/$5, Luna $0.10/$0.50 per million tokens in/out): $0.51 in all, $0.24 of it for the 108 Sol answers.

### Results

| Model | Answers | With a warning | Warnings per 100 words | Human-pattern score | Under the line |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 4 Hydrogen | 17 | 59% (35 to 82) | 1.85 (1.12 to 2.44) | 0.6 (0.3 to 1.1) | 100% (100 to 100) |
| Claude Sonnet 5.5 | 108 | 56% (47 to 66) | 1.20 (0.89 to 1.54) | 0.5 (0.0 to 1.4) | 99% (97 to 100) |
| Claude Haiku 5.5 | 108 | 50% (41 to 59) | 1.13 (0.82 to 1.46) | 1.3 (0.2 to 2.8) | 98% (95 to 100) |
| Claude Opus 5.5 | 108 | 56% (47 to 66) | 1.01 (0.73 to 1.35) | 0.6 (0.2 to 1.1) | 99% (97 to 100) |
| GPT-6.2 Sol | 108 | 32% (23 to 41) | 0.74 (0.51 to 0.99) | 10.0 (5.9 to 15.0) | 86% (79 to 92) |

Rules alone (no score in the corroboration gate, every rule at its own severity), share of answers with a finding: Gemini 4 Hydrogen 65%, Sonnet 63%, Opus 62%, Haiku 54%, GPT-6.2 Sol 36%. On the 62 held-out prompts (the test half, which no version of the score was trained on) the order is the same. On the 17 advice requests Gemini answered, answers with a warning: Gemini 10, Opus 8, Haiku 7, Sonnet 6, GPT-6.2 Sol 2. GPT-6.2 Sol's 24 answers at default reasoning effort and its low-effort answers to the same 24 requests got a warning equally often (4 each).

Most common warnings, share of answers: Gemini 4 Hydrogen bold-label-list 53%, listicle-intro 18%, ai-vocabulary 12%, bold-lead 12%. Claude: unfilled-placeholder 16% to 23%, bold-lead 10% to 16%, bold-label-list 11% to 15%. GPT-6.2 Sol: unfilled-placeholder 16%, bold-lead 13%, corporate-excitement 5%. GPT writes shorter answers (median 171 words against 311 to 357 for Claude and 459 for Gemini).

### The bias check

Until this round every model answer in the benchmark came from Claude, and four rules (`reassurance-frame`, `listicle-intro`, `ordinal-sequence`, `upbeat-close`) were written in 0.3.3 by reading Claude's dev-half answers to these same requests. That could flatter GPT and Gemini (a habit only they have may have no rule) or count against Claude (rules shaped around its habits).

- **Rules written from Claude:** they gave a warning on 6.5% to 13% of Claude answers, 0.9% of GPT-6.2 Sol answers and 24% of Gemini 4 Hydrogen answers. They do not explain Claude ranking above GPT.
- **The score is Claude-shaped.** It calls 86% of GPT-6.2 Sol answers machine-like (mean score 10) against 98% to 99% for Claude (means 0.5 to 1.3). Plain explanations are where it slips: 6 of 16 GPT explanations scored 41 or more. This is the clearest sign that tells, as built, is easier on GPT than on Claude. It does not move the ranking, which is decided by the warnings, but GPT's detection rate below is lower for this reason.

### Training on the new answers

The dev half of the GPT-6.2 Sol and Gemini answers (53 answers of 60+ words between them) joined the train split (`TELLS_TRAIN_OTHERS=1` in `bench/dataset.ts`), split by prompt family like the Claude everyday answers, so no request has answers in both train and the held-out half. The score was retrained with `bench/v2.ts train` and the same settings (the default settings reproduce the shipped 0.4.1 model byte for byte, apart from its date).

| | Shipped model | Retrained with GPT and Gemini |
| --- | ---: | ---: |
| Held-out GPT-6.2 Sol answers (62) under the line | 85.7% | 85.7% |
| Held-out GPT-6.2 Sol mean score | 11.5 | 10.3 |
| Held-out GPT-6.2 Sol flagged (warning or low score) | 85.5% | 85.5% |
| Unseen GPT-6.2 Astra, GPT-6.1 Terra, GPT-6 Luna answers flagged (59) | 100% | 100% |
| Held-out Gemini 4 Hydrogen answers flagged (10) | 100% | 100% |
| Human texts with a warning or error, locked test split | 3 of 2,552 | 5 of 2,552 |
| Human texts under the line, test split | 1.0% | 1.4% |
| Human texts with a warning or error, tune / fresh-3 / v1 false-positive set | 4 of 2,768 / 0 of 823 / 0 of 182 | 4 of 2,768 / 0 of 823 / 0 of 182 |
| Probe (831 human texts) under the line; tech texts | 1.6%; 1.2% | 1.8%; 2.9% |
| Low line | 17 | 19 |

Detection on held-out GPT and Gemini answers did not improve, and human writing fared slightly worse, so the retrained score was **not shipped**. 0.4.2 keeps the 0.4.1 score and rules; only the site, the benchmark data and the ranking are new. Fifty-odd answers are too few to teach the score a second family. The next step is more GPT answers in more genres, and a rule for the plain-explanation shape, which tells still cannot point at.

## Everyday assistant answers (tells 0.3.3)

### What was wrong

A reader pasted a stock ChatGPT-style answer on moving abroad ("can feel overwhelming, but with the right preparation, it doesn't have to be. Here are some key steps... First... Second... Finally... Remember, every journey begins with a single step") into 0.3.2 and got one hint (the dash), a grade of "light" and a human-pattern score of 69. The 0.3.0 and 0.3.1 code gave the same findings and the same 69, so this was not a 0.3.2 regression and not the corroboration gate: with the gate switched off only the dash fired. The rules had nothing for the helpful-answer shape, and every model answer in the benchmark came from Claude with an instruction to skip preambles, so the plain chat-assistant voice was missing from the data.

### What changed

- Four rules for that shape (`src/rules-everyday.ts`): `reassurance-frame` (tone), `listicle-intro` and `ordinal-sequence` (structure), and `upbeat-close` (structure). All are warnings and still go through the gate, so one alone stays a hint.
- `ai-vocabulary` gained invaluable, thrive, unleash, resonates with, enhance your. `corporate-excitement` is a warning (was a hint) and covers "I'm thrilled", "career journey". `whether-youre` covers "whether you have... or...".
- The register guess no longer calls a how-to "marketing" from words like get, start, save and your, which every how-to uses; those count only once a real promotional cue (sale, sign up, % off, hashtags, emoji, more than one "!") is present.
- `bench/everyday/`: 108 everyday requests (advice, how-tos, explanations, LinkedIn posts, emails, first-person articles, product copy), each asked plainly and as "a few plain paragraphs", answered by Haiku, Sonnet and Opus with only "You are a helpful assistant." as the system prompt. Families are split by hash: the dev half (138 answers) joined the training pool, the test half (186 answers) was scored once with the frozen model and is the regression set in `test/fixtures/everyday.json`.
- `test/fixtures/everyday-prose.json`: 12 plain-prose answers in the default ChatGPT voice, the reported one first, never trained on.
- The web page labels each finding Error, Warning or Hint, says "Only hints" (not "No tells") when only hints fired, and "Reads AI-written" when the score is low but no single habit stands out.

### Results

| Set | Texts | With a standing warning, 0.3.2 | 0.3.3 | Warning or low score, 0.3.2 | 0.3.3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plain-prose assistant answers | 12 | 17% | 92% | 58% | 92% |
| Everyday answers, test half | 186 | 49% | 55% | 98% | 98% |

The reported answer now has seven warnings across five rules and scores 47 (was 69). Claude's everyday answers were already mostly caught by the score; the gain is on plain prose without markdown, where 0.3.2 had no rule to fire.

Human texts with a warning or error: 4 of 2,768 on tune (3 before; the new one is a human essay that does use First, Second, Third, Finally), 1 of 7,473 on train, 3 of 2,552 on the locked test split (0.1%, was 0.2%), 0 of 823 on fresh-3. Fresh-3 was already scored once by the 0.3.2 model, so its 0.3.3 numbers (AUC 0.999, 97.2% of plain model output flagged, tech gap -0.9 points) are a second look, not a new held-out round.

| Set | Human texts | With a warning or error | With an error | Low human-pattern score | Model texts | Plain model output flagged (60+ words) | All plain model output flagged | Adversarial flagged | AUC | AUC, adversarial | Calibration error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r4-fresh-3 | 823 | 0.0% | 0.0% | 0.7% | 279 | 97.2% | 97.2% | 93.9% | 0.999 | 0.999 | 0.015 |
| r4-test | 2552 | 0.1% | 0.0% | 1.0% | 496 | 97.6% | 86.8% | 88.9% | 0.998 | 0.998 | 0.008 |
| r4-tune | 2768 | 0.1% | 0.0% | 0.9% | 552 | 94.6% | 88.5% | 83.7% | 0.997 | 0.996 | 0.005 |

On the human probe, 1.6% scored under the line, as in 0.3.2.

### Remaining weaknesses

- A plain, correct explanation (why the sky is blue, compound interest) has no habit to point at; only the score catches it, so it shows "Reads AI-written" with no highlighted sentence.
- A stock LinkedIn job announcement still scores 96 and keeps its tells as hints, because a high score asks for one more kind of evidence. Short LinkedIn-style posts by people score high too, and we have not found a feature that splits them.
- Every model was still a Claude model in 0.3.3. Real GPT and Gemini answers were added in 0.4.2 (see above); they are scored and ranked but not trained on.

## Round 3: present-day human writing (tells 0.3.2)

### What was wrong

Real writing typed today could score very low. A casual chat message, lowercase with typos, asking a colleague about pricing, AI and customers, scored 14 under 0.3.0. Four causes were suspected: the topic (AI and apps), the era (words like "AI" and "npm"), the register guess, and features that reward tidy punctuation. The evidence:

- **Not the topic.** Swapping every tech and business word in that message for gardening words made it score lower (7), not higher. Leave-topic-out (`bench/v2.ts topicout`): with every text about AI, apps or tech removed from training, unseen tech human texts fell under the line 1.7% of the time against 0.9% for other human texts, and unseen tech model text was still caught 94% of the time (other topics 89%). The score was not using the subject to find models. Within the 0.3.0 pool, tech human texts scored under the line as often as the rest (1.2% against 2.0% on test).
- **Not the era, mostly.** On the probe the 0.3.0 score put 4.1% of 2020 and 2021 HN comments about GPT-3, AI and apps under the line and 1.3% of GitHub comments, against about 1% to 2% for the pool. A little higher, and the HN misses were mostly job posts.
- **The register was a side issue.** With no register given, the CLI and API judged every text as `professional`, so that message was reported as professional. But the score was 14 under every register, so this changed the label, not the score.
- **The main cause: no long human chat.** The only human chat in the pool was SMS, under 60 words, so the score never saw it. Of 60+ word training texts, chat came almost only from models. Lowercase, chatty human writing of 60 words or more was rare (140 training texts). Single-feature ablations on the message pointed the same way: lexical variety over 50-word windows (0.87 against a human median of 0.82) moved it 57 points, one use of "every" moved it 44, and the `named-thing` signal (which needs capital letters) 30 (each measure set to the median of human casual training texts in turn, 0.3.0 model). The score had learned that a long, lowercase, comma-heavy chat message is what models write, because that is all it had seen.
- **Short and casual was the soft spot.** Human texts of 120 to 159 words fell under the line about ten times as often as long ones (2.7% against 0.2% on tune and test), and short model text was thin in training.

### What changed

- **More human data, chosen to match the hole:** 1,763 chat runs from Ubuntu's public IRC channels, 2010 to 2021 (one person's consecutive lines, at most three minutes apart, 60 words or more); 450 HN comments from 2014 to May 2020 about machine learning, AI, apps, startups and pricing; 292 GitHub issue comments from AI and app projects, 2018 to Oct 2022; 207 Stack Exchange answers from ai, datascience, android, apple, softwarerecs, freelancing and pm; 343 Reddit posts from tech and business subreddits or typed in lowercase; and 15 lowercase HN comments. Everything predates ChatGPT.
- **Topic-matched model answers:** 436 answers (`bench/prompts-topic.json`, `bench/out-topic/`) in the same genres and subjects: chat with a co-founder or colleague about apps, AI and pricing, HN-style comments, GitHub issue comments, Reddit posts, customer emails, and long everyday chat. About 40% are adversarial, one of them asks for lowercase chat typing with typos. Five prompts that paraphrased a probe text were removed with their answers before training.
- **The score model:** 2,000 trees of depth 3 at rate 0.03, against 400 at 0.06. On tune this raised the share of plain model output caught at the 1% line from 91% to 95%. Chunking long texts into short training pieces was tried and dropped: the message above went from 14 to 5. Chat slang and greeting features were tried and dropped too: no gain.
- **The low line** is still the score under which 1% of human tune texts fall. With harder human writing in tune it is now 18, not 30.
- **The register:** with no register given, tells now guesses it from the text, as `--register auto` did. The guess counts a lowercase "i", contractions without apostrophes and sentences that start lowercase as casual. On lowercase human texts labelled casual, the guess is right 99% of the time, against 86%; over all train and tune texts, 58.3% against 57.9%.

### Results

Round 3 was fetched after the model was frozen and scored once: Stack Exchange answers from twelve sites never used before (cooking, travel, parenting, pets, gardening, diy, money, workplace, stats, cs, gamedev, security), HN comments from Jan to Oct 2022 about GPT-3, AI art, apps, startups, pricing, remote work and customers, GitHub issue comments from six repositories never used, IRC chat from days never used, and 279 answers from all three models to 93 new prompts (`bench/fresh-3/prompts.json`), a third of them adversarial.

| Set | Human texts | With a warning or error | With an error | Low human-pattern score | Model texts | Plain model output flagged (60+ words) | All plain model output flagged | Adversarial flagged | AUC | AUC, adversarial | Calibration error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r3-fresh-3 | 823 | 0.0% | 0.0% | 0.5% | 279 | 97.8% | 97.8% | 95.0% | 0.999 | 0.998 | 0.013 |
| r3-test | 2552 | 0.2% | 0.0% | 1.1% | 496 | 97.0% | 86.2% | 88.9% | 0.998 | 0.998 | 0.008 |
| r3-tune | 2768 | 0.1% | 0.0% | 0.9% | 552 | 94.6% | 88.2% | 84.2% | 0.997 | 0.997 | 0.008 |
| r3-fresh-3, 0.3.0 model | 823 | 0.2% | 0.0% | 2.2% | 279 | 93.9% | 93.9% | 85.9% | 0.992 | 0.986 | 0.016 |

The target was: no human text with an error, at most 1% with a warning, at least 95% of plain model output of 60+ words flagged, an AUC of at least 0.97, and human texts about AI, apps or tech called machine-like no more often than other human texts. Round 3 met all five. The last row scores the same round with the 0.3.0 model, for comparison only; it was run after the round-3 numbers were saved and changed nothing. The locked test split had 4 human texts of 2,552 with a finding (0.16%), one of them an error; every fresh-3 model answer was 60 words or more, which is why both plain columns match there. The Stack Exchange part was first saved with 120 answers repeated as comments (a cache-key bug in `fetch_modern.py`, now fixed); the repeats were removed and the report was rerun with the same frozen model, so each text was still scored by one model only once it was fixed. The numbers above are without the repeats.

Human texts about AI, apps or tech against the rest:

| Set | Human texts about AI, apps or tech | Under the line | Other human texts | Under the line | Gap | Lowercase human texts | Under the line |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r3-fresh-3 | 126 | 0.0% | 694 | 0.6% | -0.6 points | 89 | 0.0% |
| r3-test | 318 | 0.6% | 2087 | 1.2% | -0.6 points | 176 | 1.7% |
| r3-tune | 275 | 1.1% | 2376 | 0.9% | 0.2 points | 200 | 2.0% |
| r3-fresh-3, 0.3.0 model | 126 | 0.8% | 694 | 2.5% | -1.7 points | 89 | 1.1% |

A negative gap means tech texts were called machine-like less often than the rest.

### The probe, before and after

The same 831 probe texts of 60+ words, scored by the 0.3.0 model (line 30) and the 0.3.2 model (line 18):

| Probe set | Texts | Under the line, before (30) | After (18) | Under 50, before | After | 10th percentile, before | After | Mean, before | After |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 831 | 3.0% | 1.6% | 4.7% | 4.7% | 77 | 89 | 92.9 | 94.4 |
| about AI, apps or tech | 171 | 3.5% | 1.2% | 5.8% | 7.0% | 76 | 85 | 92.2 | 93.7 |
| lowercase | 184 | 3.8% | 1.6% | 6.0% | 5.4% | 76 | 77 | 91.4 | 93.4 |
| GitHub issues, AI and app projects | 160 | 1.3% | 0.6% | 1.9% | 1.3% | 83 | 92 | 94.2 | 96.9 |
| HN, GPT-3, AI and apps, 2020 to 2021 | 196 | 4.1% | 3.6% | 5.1% | 6.6% | 73 | 83 | 92.2 | 92.6 |
| HN, lowercase | 13 | 7.7% | 0.0% | 15.4% | 0.0% | 35 | 90 | 87 | 97 |
| Ubuntu IRC chat | 237 | 2.1% | 1.3% | 3.0% | 2.5% | 88 | 96 | 95.2 | 96.8 |
| Reddit, tech and lowercase | 225 | 4.0% | 0.9% | 7.6% | 8.0% | 67 | 68 | 90.5 | 91.6 |

Half as many probe texts fall under the line, and the 10th percentile rose from 77 to 89. The share under 50 did not move (4.7%): the line came down and the middle of the range barely changed, so a few percent of real writing still sits in the uncertain band. The chat message that started this round now scores 28, over the line but still low. Its wording, lowercase and typos are what Claude writes when asked to type casually, and a style measure can only go so far there. HN comments from 2020 and 2021 remain the hardest set (3.6% under the line), mostly job posts and pitches.

### Remaining weaknesses

- Round 3's human texts are casual and technical only: there were no professional or marketing human texts in it. The locked test split covers those registers (0.0% of professional and marketing human texts with a finding).
- Every model is a Claude model.
- Under 60 words only the rules apply.
- Scores on short casual text are not precise: the chat message above scored anywhere from 11 to 40 across the model settings tried on tune. Read a score under 50 on short chat as "can't tell", not as "machine".
- Rounds 2 and 3 have not joined the pool; the next retrain should add them and fetch a new round.

## tells 0.3.0: rounds 1 and 2

The numbers in this section are for the 0.3.0 score model (line about 30), as published then.

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

## Remaining weaknesses in 0.3.0

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
