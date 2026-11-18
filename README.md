# tells

A linter for the habits that make text read as AI-written, and for the patterns people use that models mostly don't. It finds both, explains each one, and can rewrite only the sentences that need it.

We built it at [Nexugen](https://nexugen.app) because our agents write a lot of text that people read: replies, emails, release notes, captions. We kept fixing the same things by hand: the em dash, the `it's not X, it's Y` line, a closing sentence about the future, the word `seamless`. So we wrote the rules down, and then wrote code that checks them.

It is a style tool. It doesn't try to beat AI detectors, and it can't tell you who wrote something. Human writing trips some rules too (the Go team uses em dashes, and that's fine). A text with no tells isn't proof that it reads well. It only means none of the known habits showed up.

You can try it in a browser at [tells.nexugen.app](https://tells.nexugen.app).

## Try it

```sh
npx tells lint draft.md
echo "Great question! It's not a tool — it's a movement." | npx tells lint
```

```text
<stdin>:1:1  error  Sycophantic or stock opener [sycophantic-opener]
    "Great question"
    Start with the answer.
<stdin>:1:17  error  "Not X, it's Y" [not-x-but-y]
    "It's not a tool — it's"
    Say the concrete thing directly, and drop the thing it supposedly is not.
<stdin>:1:33  error  Em or en dash [dash]
    "—"
    Write the punctuation the dash stood in for: a comma for an aside, ...
<stdin>: 9 words, 20 known tells per 100 words (heavy), 3 errors, 0 warnings, 1 info
  human signals  Contraction (1), signal score 8/100
```

Linting is plain rules and heuristics, so it needs no model, network or key. A long document takes milliseconds.

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

Tells are habits to remove. Human signals are things people do far more often than models, worked out from the human samples in `bench/human.json`:

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

`lint` reports both. For each register it also says which signals people usually use and this text lacks, with the numbers behind that (in the current profile, 64% of the professional human samples have an aside or a self-correction and 11% of the model samples do). The shares come from `src/profiles.json`, which `bench/run.ts profiles` builds from the training half of the benchmark.

## The rules

There are 56 of them. `npx tells rules` lists them all, and `npx tells rules --json` prints the full set with patterns, so you can use them from another language. Each rule has an id, a severity, a short note on why it reads as machine-written, what to do instead, and an example fix.

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
| `generic-example` | "for example, a small business" in place of a real case |
| `bold-label-list` | bullets that each open with a bold label and a colon |
| `email-boilerplate` | "After careful consideration", "Thank you for taking the time" |
| `stock-courtesy` | "Thanks for your patience", "We apologize for any inconvenience" |
<!-- tells-on -->

The later rules came from reading what Haiku, Sonnet and Opus wrote for the benchmark prompts and writing down what kept coming back. Most of those are about structure, not words: how a reply is laid out, how each paragraph ends, what fills the space where an example should be.

Severity changes with the register you pick: `casual`, `professional` (the default), `technical` or `marketing`. A semicolon is fine in docs and flagged in a tweet. An exclamation mark is a hint in a chat message and a warning on a landing page.

## Use it in CI

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
import { lint, rewrite } from 'tells';

const draft = await agent.write(task);
const result = lint(draft, { register: 'casual' });

if (result.counts.error > 0) {
  const fixed = await rewrite(draft, { register: 'casual' });
  send(fixed.text);
}
```

`lint` returns every finding with its offsets, line and column, a score, and the human signals report under `result.human`. `rewrite` sends only the flagged sentences to a model, with the rules they broke and a few human examples in the same register, then checks the result and retries once if a tell is still there.

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
import { rewrite, fromFunction } from 'tells';

const model = fromFunction('my-model', async ({ system, prompt, maxTokens }) => {
  return callMyModel(system, prompt, maxTokens); // return the reply text
});

await rewrite(draft, { model });
```

## The score

The score is known tells per 100 words, weighted: an error counts 3, a warning 2 and a hint 1. Texts shorter than 50 words are scored as if they had 50, so one dash in a tweet doesn't look like a disaster. 0 is clean, under 2 is light, under 5 is noticeable, and 5 or more is heavy.

It counts habits we know about, and nothing else. A text can score 0 and still be empty or plainly generated, and a person can score 5 on a bad day. In the benchmark, current models often score close to people on this number, which is the reason the human signals exist. Use the score to catch the obvious stuff before a person reads it, not as a verdict on who wrote something.

## Human examples

The rewrite step learns what to do from real writing, not only from the rules. `src/exemplars.ts` has short passages in each register from sources with clear licences: Stack Overflow answers (CC BY-SA), the Go blog (CC BY 4.0), the Rust blog (MIT or Apache 2.0) and GOV.UK (Open Government Licence). Each sample records its author, link and licence, and `npx tells exemplars` lists them. See [DATA-LICENSES.md](DATA-LICENSES.md).

A few samples are house drafts from Nexugen that a person approved. They help the rewrite, but they're marked so the benchmark never counts them as human.

## Benchmark

`bench/` asks models for 24 everyday writing tasks (a Slack update, a refund reply, a PR description, a launch post, a code review and so on) and compares the answers with 52 human samples. Every sample is cut to its first 150 words so length doesn't give the answer away.

It reports three things: known tells per 100 words for each source, how often each human signal shows up, and whether a small logistic regression on those features can tell human samples from model ones on a held-out 30% it never trained on. In the current run, known tells alone reach an AUC of 0.79 and the full set of features reaches 0.89. The current numbers and their caveats are in [bench/RESULTS.md](bench/RESULTS.md).

```sh
node --experimental-strip-types bench/run.ts generate --via claude-cli --model haiku
node --experimental-strip-types bench/run.ts rewrite --via claude-cli --source claude-code-haiku
node --experimental-strip-types bench/run.ts profiles
node --experimental-strip-types bench/run.ts score
```

## Hosted API

There is a small HTTP server in `src/server` with the same lint and rewrite, and a page at `/` with a live checker. Lint is free with no key. Rewrite gives a few free tries per address, more with a free key, and stops at a daily cap on calls and on spend for the whole server. Self-host it with `npm run build && npm run serve`. Settings are in [deploy/README.md](deploy/README.md).

## Contributing

New rules and signals are welcome. A rule needs a before example it catches and an after example it passes, and a signal needs an example it finds; the tests check all of them. If a rule fires on ordinary human writing, that's a bug worth reporting. More licensed human samples help most of all, since the human side is only as good as the writing it learned from.

## Licence

MIT for the code. The human samples keep their own licences, listed per sample.

Made by [Nexugen](https://nexugen.app).
