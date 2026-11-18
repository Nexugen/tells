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
