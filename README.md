# tells

[![Linted with tells](https://tells.nexugen.app/badge.svg)](https://tells.nexugen.app)

tells finds what makes writing read as AI-written, and fixes it. It also finds the patterns people use that models mostly don't, explains each thing it finds, and can rewrite only the sentences that need it.

We built it at [Nexugen](https://nexugen.app) because our agents write a lot of text that people read: replies, emails, release notes, captions. We kept fixing the same things by hand: the em dash, the `it's not X, it's Y` line, a closing sentence about the future, the word `seamless`. So we wrote the rules down, and then wrote code that checks them.

It is a style tool. It doesn't try to beat AI detectors, and its human-pattern score is a measurement of style, not proof of who wrote something. Human writing trips some rules too (the Go team uses em dashes, and that's fine). A text with no tells isn't proof that it reads well. It only means none of the known habits showed up.

You can try it in a browser at [tells.nexugen.app](https://tells.nexugen.app).

## Try it

The package is `@nexugen/tells` on npm and the command it installs is `tells`. Install it with `npm i @nexugen/tells` and run `npx tells`, or try it without installing:

```sh
npx @nexugen/tells lint draft.md
echo "Great question! It's not a tool — it's a movement. Our seamless platform empowers teams to unlock their full potential." | npx @nexugen/tells lint
```

```text
<stdin>:1:1  error  Sycophantic or stock opener [sycophantic-opener]
    "Great question"
    Start with the answer.
<stdin>:1:17  info   "Not X, it's Y" [not-x-but-y]
    "It's not a tool — it's"
    Say the concrete thing directly, and drop the thing it supposedly is not.
<stdin>:1:33  info   Em or en dash [dash]
    "—"
    Write the punctuation the dash stood in for: a comma for an aside, ...
<stdin>:1:56  warn   AI vocabulary [ai-vocabulary]
    "seamless"
    Use the plain word, or better, the specific fact the word was covering for.
...
<stdin>: 19 words, 22 known tells per 100 words (heavy), 1 errors, 3 warnings, 2 info
  human signals  Contractions (2) (too short to judge)
```

Linting is plain rules, heuristics and a small tree model shipped as JSON, so it needs no network or key. A long document takes milliseconds.

Errors and warnings are the findings we trust. Hints (info) are habits worth a look that people also have, like dashes, and they never fail a check on their own.

One habit on its own is not evidence. People write "Great question!" and "seamless" too, so a warning or error only stands when the text shows at least two different kinds of tell (wording, structure, format and so on), or one kind plus a low human-pattern score. Otherwise it is reported as a hint. Marketing copy needs one more kind, and so does a text whose human-pattern score is 90 or above. A slip that only a template leaves, such as two unfilled `[placeholder]` slots or a model calling itself an AI, always stands. `--strict` (or `corroborate: 0` in the API) turns this off and reports every rule at its own severity.

## The human-pattern score

Texts of 60 words or more also get a human-pattern score from 0 to 100: roughly, the chance that a person wrote the text, judged by how its habits compare with about 12,800 human samples and 2,600 model samples. The human side includes chat, lowercase typing and writing about AI, apps and business, so the subject of a text does not move its score. It is a gradient-boosted tree model over about 200 measures (function words, punctuation, sentence shape, casual cues and the rule hits), trained on the benchmark's train split and calibrated on its tune split. Layout is stripped first, so a list or a table does not count against a text. Below the line in `src/score-model.json` (18) the text reads machine-like, and that counts as one kind of evidence for the rules.

It is a measurement of style, not proof of who wrote something. About 1% of human texts score under the line, and about 5% under 50, mostly short casual messages, pitches and READMEs. A model told to write like a person scores over the line 5% to 11% of the time. On short chat, read a score under 50 as "can't tell".

## How often it is wrong

Measured on human and model writing that played no part in building tells. The last held-out set (fresh-3: 823 human texts from Stack Exchange sites, GitHub projects, Hacker News threads and IRC days the benchmark had never used, written from 2012 to Oct 2022, and 279 answers from Haiku, Sonnet and Opus to new prompts) was fetched after tuning for 0.3.2 stopped and scored once; the numbers below are the 0.3.3 model on the same set, a second look at it:

- Human texts with a warning or an error: 0 of 823. On the larger locked test split it was 3 of 2,552 (0.1%), none of them an error.
- Model output of 60 words or more flagged, by a warning, an error or a low human-pattern score: 97% of plain answers and 94% of answers from prompts written to sound human (98% and 89% on the test split).
- AUC of the human-pattern score: 0.999 overall and 0.998 on the adversarial answers.
- Human texts about AI, apps or tech scored under the line no more often than other human texts: 0 of 126 against 0.9% (0.9% against 1.0% on the test split).
- Ordinary chat-assistant answers to everyday requests (advice, how-tos, LinkedIn posts, emails), none used for building: 98% of 186 flagged, 55% with a warning that stands; of 12 plain-prose answers in the default ChatGPT voice, 11 get a warning.
- On a probe of 831 human texts about GPT-3, AI, apps and startups from 2020 to 2022, plus lowercase posts and IRC chat, 1.6% scored under the line, down from 3.0% in tells 0.3.0.

Under 60 words there is no score and only the rules speak, so a short text from a model to a friend is usually left alone: tells flagged 18% of those in round 2. Most model answers in the benchmark are from Claude. GPT-6.2 Sol answers are caught less often (86% under the score's line against 98% to 99% for Claude, on the same everyday requests), because the score learned its sense of machine-made text from Claude; see the model ranking below. The per-register and per-source numbers are in [bench/EVAL.md](bench/EVAL.md). If it flags your own ordinary writing, please open an issue with the text.

## Before and after

These came out of the benchmark. The left side is what a current model wrote when asked for a launch post. The right side is after `tells rewrite`, which only touched the flagged sentences.

```text
Before                                         After
No signal? No problem. It works fully          You don't need signal for this. It works
offline and syncs when you're back online.     fully offline and syncs when you're back
                                               online.
Snap it. Save it. Done.                        Take a photo and save it, and you're done.
```

A support reply, same idea:

```text
Before: Thanks for reaching out, and I'm sorry for the trouble. You're right: order 4471 was charged twice.
After:  I'm sorry for the trouble. You're right: order 4471 was charged twice.
```

Everything outside the flagged sentences comes back byte for byte.

## Two sides

Tells are habits to remove. Human signals are patterns people use in their writing, measured on the human samples in `bench/human.json`:

<!-- tells-off -->
| id | what it looks for |
| --- | --- |
| `specific-number` | a real figure: 42 minutes, 8%, $6,500, 02:10 |
| `named-thing` | a named tool, place, product or person |
| `time-anchor` | a date or a time: on Tuesday, in March, since 2019 |
| `first-hand` | the writer's own experience: I tried, we moved, I've seen |
| `stake` | an opinion with something riding on it: I'd skip it, I wouldn't |
| `aside` | a bracketed aside or a self-correction |
| `contraction` | it's, don't, we'll, where the register allows them |
| `plain-verb` | use, get, fix, try, rather than utilize or facilitate |
| `real-question` | a question the writer actually wants answered |
| `bursty-rhythm` | short and long sentences mixed, not one length |
| `uneven-paragraphs` | paragraphs of different lengths |
| `concrete-first` | a concrete detail before the general point |
<!-- tells-on -->

`lint` reports both. For each register it also says which signals people usually use and this text lacks, with the numbers behind that (in the current profile, 56% of the professional human samples have an aside or a self-correction and 22% of the model samples do). The shares come from `src/profiles.json`, which `bench/run.ts profiles` builds from the training half of the benchmark. Most signals turn out not to separate people from current models: models use numbers, names, dates and contractions as often as people do. Asides and an opinion with something at stake are the two that still do, so treat the list as a description of the text, not a score.

## The rules

There are 63 of them. `npx tells rules` lists them all, and `npx tells rules --json` prints the full set with patterns, so you can use them from another language. Each rule has an id, a severity, a short note on why it reads as machine-written, what to do instead, and an example fix.

Some of the ones that matter most:

<!-- tells-off -->
| id | catches |
| --- | --- |
| `dash` | em dashes, en dashes, and `--` used as a dash |
| `not-x-but-y` | "It's not X, it's Y", "not just X, but Y", "Less X, more Y" |
| `sycophantic-opener` | "Great question!", "I hope this email finds you well" |
| `chatbot-closer` | "Hope this helps!", "Let me know if you have any questions" |
| `staccato` | "No code. No team. No problem." |
| `rhetorical-qa` | "Why does this matter? Because..." |
| `slogan-ending` | a closing moral, like "That's the future of travel." |
| `ai-vocabulary` | delve, seamless, robust, leverage, tapestry and about 80 more |
| `hedge-stack` | "may potentially", "could perhaps in some cases" |
| `uniform-rhythm` | six sentences in a row of nearly the same length |
| `summary-line` | most paragraphs ending on "This means..." or "That's why..." |
| `unfilled-placeholder` | [Your name], [Client name] or [link] left in the text |
| `reassurance-frame` | "can feel overwhelming, but it doesn't have to be" |
| `listicle-intro` | "Here are some key steps to help you get started" |
| `ordinal-sequence` | "First, ... Second, ... Finally," written out as prose |
| `upbeat-close` | "Remember, every journey begins with a single step" |
| `generic-example` | "for example, a small business" in place of a real case |
| `bold-label-list` | bullets that each open with a bold label and a colon |
| `email-boilerplate` | "After careful consideration", "Thank you for taking the time" |
| `stock-courtesy` | "Thanks for your patience", "We apologize for any inconvenience" |
<!-- tells-on -->

The later rules came from reading what Haiku, Sonnet and Opus wrote for the benchmark prompts and writing down what kept coming back. Most of those are about structure, not words: how a reply is laid out, how each paragraph ends, what fills the space where an example should be.

Severity changes with the register: `casual`, `professional`, `technical` or `marketing`. With no `--register` (or `register` option) tells picks one from the text, so a lowercase chat message is judged as chat; pass one when you know it. A semicolon is fine in docs and flagged in a tweet. An exclamation mark is a hint in a chat message and a warning on a landing page.

## Use it in CI

Add it to the project with `npm i -D @nexugen/tells`, then:

```sh
npx tells lint docs/ --ci                    # fail on any error
npx tells lint docs/ --ci --fail-on warning  # stricter
npx tells lint docs/ --ci --max-score 2      # or gate on the score
npx tells lint docs/ --format github         # inline annotations on the PR
```

Exit code 0 means it passed, 1 means it failed, and 2 means the command was wrong.

A `.tellsrc.json` in the repo sets defaults:

```json
{ "register": "technical", "disable": ["semicolon"], "failOn": "warning" }
```

To skip a line, put `tells-ignore` on it. To skip a block, wrap it in `<!-- tells-off -->` and `<!-- tells-on -->`. Code blocks, inline code and URLs are always skipped.

## Use it in an agent

```ts
import { lint, rewrite } from '@nexugen/tells';

const draft = await agent.write(task);
const result = lint(draft, { register: 'casual' });

if (result.counts.error > 0) {
  const fixed = await rewrite(draft, { register: 'casual' });
  send(fixed.text);
}
```

`lint` returns every finding with its offsets, line and column, a score, and the human signals report under `result.human`. With no `register` it guesses one from the text (`result.registerGuess` has the reasons); `result.register` says which one it used. `rewrite` sends only the flagged sentences to a model, with the rules they broke and a few human examples in the same register, then checks the result and retries once if a tell is still there.

When the text lacks the signals its register usually has, `rewrite` also hands the model one or two flat sentences to rework toward them. It may not add facts. An edit that brings in a number or a name the source doesn't have is thrown away and listed in `result.rejected`. Where a detail would help and isn't there, the model writes a placeholder such as `[number]` or `[example from your work]`, and `result.suggestions` lists each one for you to fill in. Pass `humanize: false` to fix tells only.

The default model is Claude Haiku 5.5 through the official SDK. Install it and set a key:

```sh
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=...
npx tells rewrite draft.md --write
```

If you have Claude Code installed and logged in, you can use that instead of an API key. It runs `claude -p` with tools, MCP servers and saved sessions turned off:

```sh
npx tells rewrite draft.md --backend cli
```

Any other model works if you pass something with a `complete` method:

```ts
import { rewrite, fromFunction } from '@nexugen/tells';

const model = fromFunction('my-model', async ({ system, prompt, maxTokens }) => {
  return callMyModel(system, prompt, maxTokens); // return the reply text
});

await rewrite(draft, { model });
```

## Use it in Claude or ChatGPT

tells is also an MCP server with three tools: `check_text` (each flagged phrase with its offsets, why it stands out and what to write instead), `fix_text` (only the flagged sentences, optionally in a voice from `build_voice`) and `build_voice`.

The hosted one needs no sign in. In Claude, add a custom connector with the address `https://tells.nexugen.app/mcp`; in ChatGPT, turn on developer mode and create a connector with the same address and no authentication. In Claude Code:

```sh
claude mcp add --transport http tells https://tells.nexugen.app/mcp
```

To run it on your own machine over stdio instead, so checking never leaves it, put this in Claude Desktop's config:

```json
{ "mcpServers": { "tells": { "command": "npx", "args": ["-y", "@nexugen/tells", "mcp"] } } }
```

Locally, `fix_text` uses `ANTHROPIC_API_KEY` when it is set (or the Claude Code CLI with `TELLS_MODEL_BACKEND=cli`) and the hosted API when it is not. For a custom GPT, import [`/openapi.json`](https://tells.nexugen.app/openapi.json) as an action; [connectors/chatgpt-gpt.md](connectors/chatgpt-gpt.md) has the rest.

## Sound like a person you know

A draft can have no tells at all and still not sound like the person who will sign it. A voice profile fixes that part. You give tells samples of one person's writing (messages, posts, emails), it measures how they write, and `rewrite` can then turn a whole draft into that voice. Every fact stays and none are added.

```sh
npx tells voice build samples/*.txt -o voice.json   # one sample per file, or split a file with lines of ---
npx tells voice show voice.json                     # the habits it found
npx tells rewrite draft.md --voice voice.json --polish
npx tells voice match voice.json draft.md           # 0 to 100: how close a text is to the voice
```

```ts
import { buildVoice, rewrite, styleMatch } from '@nexugen/tells';

const voice = buildVoice(samples);            // samples: string[]; no model, no network
const res = await rewrite(draft, { voice, polish: true });
console.log(res.text, res.voice?.before.score, res.voice?.after.score);
```

Building a profile is plain counting, like the lint. It uses the same measures as the human-pattern score (function words, punctuation, sentence rhythm, casing, contractions, the human signals), each compared with ordinary human writing from the benchmark, plus the words, openings and endings the samples keep coming back to, what they never do, and a few short excerpts. Aim for 10 or more samples and about 1,500 words. The minimum is 5 samples and 600 words. The profile is a JSON file you keep. It holds those excerpts, so treat it like the samples.

The rewrite sends the draft, the profile's description and its excerpts to the model in one call. Then it checks the result against the draft. If the rewrite added or dropped a number, a name, a link, a code span or a `[placeholder]`, it goes back once with the problem named; if it still does not hold, you get your draft back unchanged and the reason in `result.rejected`. After that the text is linted again, and any sentence that still carries a tell goes through the usual span rewrite, told to keep the voice. `polish: true` keeps the writer's shape but uses standard capitals, apostrophes and spelling, for text that will be published. The rewrite never adds spelling mistakes.

`styleMatch(text, voice)` is the check. The score is the share of other people's texts in the benchmark baseline that sit further from the voice than this text does, so 90 means closer than 90% of them. It measures the person, not the human-pattern score: a voice rewrite is not tuned to raise that score, and for a writer who types in lowercase it often goes down. Under about 60 words, read the match loosely.

On 15 public-domain authors from the benchmark, a profile built from 80% of each author's passages put a held-out passage closest to its own author 45% of the time (chance is 7%), and scored held-out passages above other people's writing with an AUC of 0.95. Telling one literary author from another is harder, with an AUC of 0.71. [bench/VOICE.md](bench/VOICE.md) has the method.

## The score

The score is known tells per 100 words, weighted: an error counts 3, a warning 2 and a hint 1. Texts shorter than 50 words are scored as if they had 50, so one dash in a tweet doesn't look like a disaster. 0 is clean, under 2 is light, under 5 is noticeable, and 5 or more is heavy.

It counts habits we know about, and nothing else. A text can score 0 and still be empty or plainly generated, and a person can score 5 on a bad day. In the benchmark, current models often score close to people on this number, which is the reason the human signals exist. Use the score to catch the obvious stuff before a person reads it, not as a verdict on who wrote something.

## Human examples

The rewrite step learns what to do from real writing, not only from the rules. `src/exemplars.ts` has short passages in each register from sources with clear licences: Stack Overflow answers (CC BY-SA), the Go blog (CC BY 4.0), the Rust blog (MIT or Apache 2.0) and GOV.UK (Open Government Licence). Each sample records its author, link and licence, and `npx tells exemplars` lists them. See [DATA-LICENSES.md](DATA-LICENSES.md).

A few samples are house drafts from Nexugen that a person approved. They help the rewrite, but they're marked so the benchmark never counts them as human.

## Model ranking

How AI-sounding is each model's everyday writing? GPT-6.2 Sol, Gemini 4 Hydrogen and Claude Haiku, Sonnet and Opus 5.5 answered the same 108 everyday requests with the system prompt "You are a helpful assistant.", and tells checked every answer. Warnings per 100 words, most first: Gemini 4 Hydrogen 1.85 (17 answers, all advice, because of a free-tier limit), Claude Sonnet 1.20, Claude Haiku 1.13, Claude Opus 1.01, GPT-6.2 Sol 0.74. The table, intervals, most common tells per model and a check for bias toward Claude are at [tells.nexugen.app/models](https://tells.nexugen.app/models) and in [bench/EVAL.md](bench/EVAL.md). The answers are in `bench/models/out/`. Adding a new model takes one command:

```sh
OPENAI_API_KEY=... node --experimental-strip-types bench/models/rank.ts add --provider openai --model <model-id>
GEMINI_API_KEY=... node --experimental-strip-types bench/models/rank.ts add --provider gemini --model <model-id> --gap 13
node --experimental-strip-types bench/models/rank.ts      # rescore every model, write bench/models/ranking.json and src/model-ranking.json
```

## Benchmark

`bench/` holds two benchmarks. The first (v1) is 48 everyday prompts against 182 licensed human samples. The second (v2, `bench/dataset.ts`) has about 14,500 human samples from 40 openly licensed or public sources written before ChatGPT (email, IRC chat, forums, Q&A, GitHub issues, reviews, essays by native and non-native students, fiction, news, guidance, docs and marketing copy) and about 3,200 answers from Haiku, Sonnet and Opus to 1,358 prompts, a third of them written to make the model sound human. Samples are split by group (a mailbox, a site, a book, a prompt topic) into train, tune and a locked test split, and each held-out round is fetched only after the previous one was scored. [bench/EVAL.md](bench/EVAL.md) has the accuracy numbers, [bench/RESULTS.md](bench/RESULTS.md) the per-source scores and caveats, and [DATA-LICENSES.md](DATA-LICENSES.md) the sources and licences.

```sh
node --experimental-strip-types bench/run.ts generate --via claude-cli --model haiku
node --experimental-strip-types bench/run.ts rewrite --via claude-cli --source claude-code-haiku
node --experimental-strip-types bench/run.ts profiles
node --experimental-strip-types bench/run.ts score
node --experimental-strip-types bench/fp.ts          # false positives per rule
node --experimental-strip-types bench/eval.ts        # held-out accuracy (v1)
node --experimental-strip-types bench/v2.ts stats    # v2 dataset by source, register, genre
node --experimental-strip-types bench/v2.ts train    # retrain the human-pattern score
node --experimental-strip-types bench/v2.ts report --on tune
node --experimental-strip-types bench/v2.ts probe     # the modern probe: AI, apps, lowercase chat, human only
node --experimental-strip-types bench/v2.ts topicout  # leave the AI, apps and tech texts out of training, then compare
```

## Hosted API

There is a small HTTP server in `src/server` with the same lint and rewrite, a page at `/` with the checker (installable on phones, with a share target), the developer material at `/developers`, the MCP server at `/mcp` and an OpenAPI description at `/openapi.json`. `POST /v1/voice` with `{"samples": [...]}` returns a voice profile, and `POST /v1/rewrite` and `POST /v1/voice/match` take one back as `"voice"`. The server never stores samples or profiles: you send the profile with each request. Lint is free with no key. Rewrite gives a few free tries per address, more with a free key, and stops at a daily cap on calls and on spend for the whole server. Self-host it with `npm run build && npm run serve`. Settings are in [deploy/README.md](deploy/README.md).

## Browser extension

`extension/` holds a Chrome extension that underlines tells as you type in Gmail, LinkedIn, X, Slack and Notion, and on any other page when you turn it on there. It bundles the checker, so checking runs in the browser with no network. Build it with `npm run build:extension`, then load `extension/build` unpacked from chrome://extensions. Google Docs draws text on a canvas, so it is not supported.

## Contributing

New rules and signals are welcome. A rule needs a before example it catches and an after example it passes, and a signal needs an example it finds; the tests check all of them. If a rule fires on ordinary human writing, that's a bug worth reporting. More licensed human samples help most of all, since the human side is only as good as the writing it learned from.

## Licence

MIT for the code. The human samples keep their own licences, listed per sample.

tells is open source, made by [Nexugen](https://nexugen.app). [GitHub](https://github.com/Nexugen/tells) · [npm](https://www.npmjs.com/package/@nexugen/tells) · [tells.nexugen.app](https://tells.nexugen.app)
