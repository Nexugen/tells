# tells

A linter for the habits that make text read as AI-written. It finds them, explains each one, and can rewrite only the sentences that have them.

We built it at [Nexugen](https://nexugen.app) because our agents write a lot of text that people read: replies, emails, release notes, captions. We kept fixing the same things by hand: the em dash, the `it's not X, it's Y` line, a closing sentence about the future, the word `seamless`. So we wrote the rules down, and then wrote code that checks them.

It is a style tool. It doesn't try to beat AI detectors, and it can't tell you who wrote something. Human writing trips some rules too (the Go team uses em dashes, and that's fine).

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
<stdin>: 9 words, slop score 20 (heavy), 3 errors, 0 warnings, 1 info
```

Linting is plain rules and heuristics. No model, no network, no key. A long document takes milliseconds.

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

## The rules

There are 33 of them. `npx tells rules` lists them all, and `npx tells rules --json` prints the full set with patterns, so you can use them from another language. Each rule has an id, a severity, a short note on why it reads as machine-written, what to do instead, and an example fix.

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
<!-- tells-on -->

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

`lint` returns every finding with its offsets, line and column, plus a score. `rewrite` sends only the flagged sentences to a model, with the rules they broke and a few human examples in the same register, then checks the result and retries once if a tell is still there.

The default model is Claude Haiku 5.5 through the official SDK. Install it and set a key:

```sh
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=...
npx tells rewrite draft.md --write
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

The slop score is weighted findings per 100 words: an error counts 3, a warning 2 and a hint 1. Texts shorter than 50 words are scored as if they had 50, so one dash in a tweet doesn't look like a disaster. 0 is clean, under 2 is light, under 5 is noticeable, and 5 or more is heavy.

It measures surface habits. A text can score 0 and still be empty, and a person can score 5 on a bad day. Use it to catch the obvious stuff before a person reads it.

## Human examples

The rewrite step learns what to do from real writing, not only from the rules. `src/exemplars.ts` has short passages in each register from sources with clear licences: Stack Overflow answers (CC BY-SA), the Go blog (CC BY 4.0), the Rust blog (MIT or Apache 2.0) and GOV.UK (Open Government Licence). Each sample records its author, link and licence, and `npx tells exemplars` lists them. See [DATA-LICENSES.md](DATA-LICENSES.md).

A few samples are house drafts from Nexugen that a person approved. They help the rewrite, but they're marked so the benchmark never counts them as human.

## Benchmark

`bench/` asks models for twelve everyday writing tasks (a Slack update, a refund reply, a PR description, a launch post and so on) and scores the answers next to the human samples. Scoring is free. Generating answers costs whatever the model costs; our first run was under a dollar. The current numbers are in [bench/RESULTS.md](bench/RESULTS.md).

```sh
node --experimental-strip-types bench/run.ts generate --via anthropic --model claude-haiku-5-5
node --experimental-strip-types bench/run.ts score
```

## Hosted API

There is a small HTTP server in `src/server` with the same lint and rewrite. Lint is free with no key. Rewrite needs a free key and has a daily cap per key, plus a hard daily spend cap for the whole server. Self-host it with `npm run build && npm run serve`. Settings are in [deploy/README.md](deploy/README.md).

## Contributing

New rules are welcome. A rule needs a before example it catches and an after example it passes, and the tests check both. If a rule fires on ordinary human writing, that's a bug worth reporting.

## Licence

MIT for the code. The human samples keep their own licences, listed per sample.

Made by [Nexugen](https://nexugen.app).
