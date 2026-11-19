# Voice profiles: how the match is measured

`src/voice.ts` builds a profile from samples of one writer and scores how close another text is to it. This file says how, and how well it works on public data.

## The measures

Each text gets the same vector the human-pattern score uses (`featureVector` in `src/score.ts`), minus the rule hits and the register flag, which are about tells and not about a person: function word rates, punctuation rates, sentence length and spread, word length, word variety, casing and contraction habits, sentence openings, and the human signals. That is 190 measures.

Each measure is put in standard units against ordinary human writing: `bench/voice-baseline.ts` takes the benchmark's human samples of 25 to 600 words from the train and tune splits (9,900 texts; the locked test split is not read) and stores the mean and spread of each measure, how often it is above zero, how often common words appear, and 466 reference vectors, up to 16 per source, rounded. Only numbers go into `src/voice-baseline.json`, no text. Values are clipped at 3 standard units so one emoji in a short text cannot decide a match.

A profile stores the writer's centre (the mean of their samples) and spread on each measure. The distance from a text to a voice is the weighted mean absolute gap between the text's vector and the centre, with each measure weighted by 1 / (0.3 + the writer's spread on it), so habits the writer is steady on count for more. This is Burrows' Delta with a weight. The match score is a percentile: the share of the 466 reference texts that sit further from the voice than the text does. With `polish`, the casing and apostrophe measures are left out.

The habits list, favourite words (from a fixed list of style words, so topic words stay out), phrasings, openings, endings and "never uses" come from the same samples and are what the rewrite model reads.

## Results on public-domain authors

`node --experimental-strip-types bench/voice.ts --write` (writes `bench/voice-results.json` and `src/voice-figures.json`):

- 15 Project Gutenberg authors with 25 or more passages of 25 to 600 words. A fifth of each author's passages are held out by a hash of their id; the profile is built from the rest. 128 held-out passages.
- Attribution: the held-out passage is closest to its own author's profile 45% of the time. Chance is 7%.
- Match score, own held-out passages against 1,906 human texts from other sources (outside the reference set): AUC 0.95. Median match of an author's own held-out passages: 96.
- Against the other 14 authors' held-out passages: AUC 0.71. Nineteenth and early twentieth century prose is close together on these measures, so this is the hard case.

Two limits. The Gutenberg authors are part of the baseline, so their era is in the reference set; that makes the match against other people harder, not easier. And a measure of style can be matched by a text that says something the writer never would, so the score says nothing about the content.

## Using it to check a rewrite

Build the profile from most of a writer's samples and keep some back. Score the kept-back samples with `styleMatch` to see what "sounds like them" looks like for this writer, then score the rewrite against the same profile. Do not judge a voice rewrite by the human-pattern score: it was trained to tell people from models, not one person from another, and a writer's own habits (lowercase, fragments) can pull it down.
