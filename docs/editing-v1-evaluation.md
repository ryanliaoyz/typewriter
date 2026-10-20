# Second model comparison (60-case benchmark)

[Back to the README](../README.md) · [Per-case review](editing-v1-results.md) ·
[Benchmark rubric](../benchmarks/editing-v1/rubric.md) ·
[First comparison](evaluation.md)

## Summary

On the evening of 2026-10-18 we ran four local models on the 60-case
**editing-v1** benchmark, twice each, using the app's real checking code, and read
every result.

- **Gemma 4 E4B did best on almost every measure.** It settled on an answer for 59
  of 60 cases, made the most faithful grammar fixes and shortenings, kept the most
  meaning distinctions (22 of 24), and was the fastest (0.24 s median per sentence).
  Because of this it is now the app's default model.
- **It is still not safe to accept blindly.** It left only half of the sentences
  that should stay unchanged alone (one of the other six was withheld), and 8 of its
  35 published suggestions changed the meaning. Read every suggestion before accepting it.
- **Gemma 2 9B (Q5)** fixed grammar well but often failed to settle, and sometimes
  asked for text instead of editing.
- **Llama 3.1 8B** was quick but sometimes answered a question instead of correcting
  it, and blurred subtle distinctions.
- **Qwen 3.5 9B**, the winner of the [first comparison](evaluation.md), did worst
  here: its repeated shortening often removed meaning the case said to keep.

This was decided by the editing results only. No instructions, cases, rubric or
settings were changed during or after the run.

## What was compared

The **60-case editing-v1 suite** ran twice per model through the app's shared
checking code. Each sentence was checked on its own; the case notes and example
answers in the benchmark were never sent to the model.

| Configuration | Reported parameters / quantization | Role |
| --- | --- | --- |
| `gemma2:9b-instruct-q5_K_M` | 9.2B / Q5_K_M | Newly installed, higher-precision Gemma 2 |
| `gemma4:e4b` | 7.5B / Q4_K_M | Newly installed Gemma 4 ("E4B" is the tag name, not its size) |
| `llama3.1:8b-instruct-q5_K_M` | 8.0B / Q5_K_M | Newly installed Llama 3.1 |
| `qwen3.5:9b` | 9.7B / Q4_K_M | Baseline from the first comparison, rerun on this suite |

The Gemma 2 Q4 and Qwen 3 results from the first comparison used other sentences
and an older Ollama, so they aren't directly comparable. In particular, this run
can't show whether moving Gemma 2 from Q4 to Q5 helped.

The benchmark has four kinds of case (see the [rubric](../benchmarks/editing-v1/rubric.md)):

| Kind | Cases | The model should |
| --- | --- | --- |
| **G** (grammar) | 12 | fix a specific grammar error without other changes |
| **C** (compression) | 12 | remove obvious padding without changing meaning |
| **N** (no change) | 12 | return a correct, concise sentence exactly unchanged |
| **P** (pairs) | 24 (12 pairs) | keep a subtle difference in meaning between two similar sentences |

## Setup

Linux x86-64; Intel Core i5-13400F; about 30 GiB of RAM; NVIDIA GeForce RTX 4060 with
8,188 MiB of video memory (driver 595.99.02). Node 22.14.0 and npm 11.6.2. Ollama was
**0.40.6**, newer than the **0.18.2** used in the first comparison. The runs started
on the local evening of **2026-10-18** (UTC **2026-10-19**). Everything ran on the
local machine, one model at a time, one request at a time.

Settings were the app's own: temperature 0, up to 2,048 tokens, no "thinking", no
streaming, up to five rounds including the final "no change" round, and 120 seconds
per request. Model loading was timed separately. Sentence times include every round
but not the app's typing pause or queue wait. These are measurements on an ordinary
workstation: each model's template, built-in settings, CPU/GPU split, caching and
first-use costs can all differ, so this compares models as installed, not model
designs or quantization levels.

Gemma 4 declares `draft_num_predict: 3`, which was left as is. Full model details and
raw answers were kept locally in `/tmp/opencode/typewriter-editing-v1-2026-10-18/`
and aren't part of the repository.

Fingerprints (SHA-256) of the frozen inputs:

```text
cases.jsonl: 465ad0cfa31870343c6c2d3f20a793a3ba29fb768db3c034e6589569b051ab84
rubric.md:   c7ad8d78e4096ab56b919ede474c526f162e4f25d6185a236dad5b60129ff559
case list:   0cdfc147c57f80fe5fb864cfdc5e85cbb445ca38ad796a69df2662ff60523632
prompt.txt:  de523dcdff7cc68b0c6a07e52eeee548244326fc4c17c7f875065ca6120ab5be
```

Exact model digests:

```text
gemma2:9b-instruct-q5_K_M
  272e1f3a41a6f5bfdb95991cb255be151d3940fa2996297e312171f7a83199cc
gemma4:e4b
  dc35e8d9c6061baa6f0fa870975ab6932e2542b579b13ea0f199fa4bb7300c9c
llama3.1:8b-instruct-q5_K_M
  27fe1b0ab52c0027e30f4a007d2137b451af6021a53485959a961b0fe84ce2dc
qwen3.5:9b
  6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7
```

## Reproduce

Set up Ollama as described in the [README](../README.md#model-server-setup) and
install the exact tags above (the evaluator checks for them but doesn't download
them). Run the commands one at a time, without using the editor meanwhile:

```sh
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=qwen3.5:9b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3.5-9b.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=gemma2:9b-instruct-q5_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma2-9b-q5.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=gemma4:e4b EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma4-e4b.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=llama3.1:8b-instruct-q5_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > llama3.1-8b-q5.jsonl
npm run evaluate:summarize -- qwen3.5-9b.jsonl gemma2-9b-q5.jsonl gemma4-e4b.jsonl llama3.1-8b-q5.jsonl
```

PowerShell syntax and the output format are in the
[rubric](../benchmarks/editing-v1/rubric.md#reproduction-and-versioning) and the
[first comparison](evaluation.md#what-the-output-contains).

## How results were judged

Results were judged with the rubric that was written before any model ran.
Grammar repair, faithful shortening, unchanged controls, kept distinctions, harmful
suggestions, answering only with the edited sentence, and reliability are scored
separately. A withheld check (one that failed to settle, so nothing was shown)
counts neither as a success nor as a harmful suggestion. The example answers in the
benchmark are illustrations, not the only right answer; exact matching is used only
for the "no change" cases. Two pair sentences getting the same final text is a
warning sign, not an automatic verdict.

The reviewer was the coding assistant, reading results with model names hidden and
groups shuffled. That reduces bias but doesn't make the reviewer independent; the
same assistant wrote the benchmark. Clear meaning errors and uncertain cases are
kept apart, and every round of every check was compared with the original
sentence, including checks that failed.

## Reliability and speed

Each cell shows **run 1, run 2**, each out of 60. "Stable" means the check settled,
right or wrong; quality is judged further down.

| Configuration | Stable | Cycles | Limits | Invalid | Transport errors | N controls unchanged (out of 12) |
| --- | --- | --- | --- | --- | --- | --- |
| Qwen 3.5 9B | 54, 54 | 6, 6 | 0, 0 | 0, 0 | 0, 0 | 3, 3 |
| Gemma 2 9B Q5 | 49, 49 | 11, 11 | 0, 0 | 0, 0 | 0, 0 | 5, 5 |
| Gemma 4 E4B | 59, 59 | 1, 1 | 0, 0 | 0, 0 | 0, 0 | 6, 6 |
| Llama 3.1 8B Q5 | 52, 52 | 8, 8 | 0, 0 | 0, 0 | 0, 0 | 3, 3 |

Times cover all 120 checks per model, including failed ones; loading is excluded,
but the first sentence still pays some start-up cost.

| Configuration | Generation requests | Median | p95 | Maximum | Stable-only median / p95 | Loading warm-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen 3.5 9B | 265 | 1.44 s | 2.58 s | 22.26 s | 1.37 / 2.52 s | 45.81 s |
| Gemma 2 9B Q5 | 278 | 2.97 s | 9.28 s | 14.15 s | 2.85 / 5.56 s | 11.36 s |
| Gemma 4 E4B | 206 | 0.24 s | 1.92 s | 7.55 s | 0.23 / 1.99 s | 18.62 s |
| Llama 3.1 8B Q5 | 276 | 0.81 s | 1.86 s | 2.46 s | 0.76 / 1.79 s | 12.39 s |

All four ran on Ollama's `llamacpp` runner with a 4,096-token context, and none
returned "thinking" text. Ollama reported memory use of 5.73 GiB (4.38 GiB on the GPU)
for Qwen, 4.96 / 4.35 GiB for Gemma 2 Q5 and 6.01 / 4.99 GiB for Llama. For Gemma 4 it
reported only 0.24 GiB (257,152,777 bytes), which can't be the full size of a 6.6 GB
model; treat that as a reporting quirk, not as evidence of special efficiency. Its
measured speed is what it is, but this run doesn't explain it. Qwen's 22-second
maximum was its very first check.

In total: **480 sentence checks and 1,025 model requests**, plus four loading
warm-ups, with every expected result present and no network errors or unusable
answers. That doesn't mean every answer was a proper edit; see below.

How many rounds checks took (**1 / 2 / 3 / 4 / 5**), including failed checks:

| Configuration | Repeat 1 | Repeat 2 |
| --- | --- | --- |
| Gemma 4 E4B | 24 / 29 / 7 / 0 / 0 | 24 / 29 / 7 / 0 / 0 |
| Gemma 2 9B Q5 | 11 / 32 / 7 / 7 / 3 | 11 / 31 / 8 / 8 / 2 |
| Llama 3.1 8B Q5 | 13 / 27 / 12 / 5 / 3 | 13 / 27 / 12 / 5 / 3 |
| Qwen 3.5 9B | 13 / 25 / 19 / 2 / 1 | 13 / 25 / 20 / 1 / 1 |

## Quality

Each cell is **run 1, run 2**. A G or C success needs the intended fix or
shortening, good grammar, unchanged meaning, and an answer that is only the edited
sentence. A P success allows rewording as long as the distinction survives.
Uncertain cases count neither as successes nor as harm. The cases protect tense
and exact wording such as "exactly", not just the general topic; see the
[judgement boundaries](editing-v1-results.md#shared-judgment-boundaries).

| Configuration | Faithful grammar /12 | Faithful useful compression /12 | Unchanged N /12 | Preserved P /24 | Harmful / all published suggestions |
| --- | --- | --- | --- | --- | --- |
| Gemma 4 E4B | 10, 10 | 9, 9 | 6, 6 | 22, 22 | 8/35, 8/35 |
| Gemma 2 9B Q5 | 9, 9 | 8, 8 | 5, 5 | 9, 9 | 11/38, 11/38 |
| Llama 3.1 8B Q5 | 6, 6 | 7, 7 | 3, 3 | 15, 15 | 12/39, 12/39 |
| Qwen 3.5 9B | 6, 6 | 4, 5 | 3, 3 | 14, 14 | 20/41, 19/41 |

The 24 pair sentences broken down as **kept / changed / uncertain / withheld**:

| Configuration | Repeat 1 | Repeat 2 | Comparable pairs /12 | Colliding pairs |
| --- | --- | --- | --- | --- |
| Gemma 4 E4B | 22 / 2 / 0 / 0 | 22 / 2 / 0 / 0 | 12, 12 | None |
| Gemma 2 9B Q5 | 9 / 4 / 3 / 8 | 9 / 4 / 3 / 8 | 6, 6 | None |
| Llama 3.1 8B Q5 | 15 / 7 / 1 / 1 | 15 / 7 / 1 / 1 | 11, 11 | P06 and P10, both repeats |
| Qwen 3.5 9B | 14 / 6 / 1 / 3 | 14 / 6 / 1 / 3 | 10, 10 | P03 and P08, both repeats |

"Comparable" pairs are those where both sentences settled; "colliding" pairs ended
up with identical text. Gemma 2 had no collisions partly because it withheld so
many: only six pairs had both answers. Llama turned both "might prevent
overheating" and "prevents overheating" into a statement of design intent, and
both "at least 18" and "older than 18" into the same age limit. Qwen merged "is
intended to remove lead" with "removes lead", and "consistent with a leak" with
"establish that there is a leak". Gemma 4 kept those
distinctions but still dropped the "has been" tense in both P01 sentences. Different
wording alone doesn't make a pair a success.

### Answering with only the edited sentence

These counts are about each returned answer, not each check. An answer can pass the
app's format checks and still not be an edit. For example, Gemma 2 sometimes asked
for text even though it had been given a complete sentence, and for case N11 that
request even settled and became a published suggestion. Gemma 4 inserted a Markdown
escape into the identifier `retry_count`. Llama answered a question with an invented
neighbour and added an editing heading. Meaning errors without such format
problems are counted as harm above instead.

| Configuration | Compliant responses / returned responses (R1, R2) | Cases with any contract violation (R1, R2) | Definite drift after earlier faithful candidate (R1, R2) |
| --- | --- | --- | --- |
| Gemma 4 E4B | 101/103, 101/103 | 1, 1 | 2, 2 |
| Gemma 2 9B Q5 | 116/139, 118/139 | 6, 5 | 4, 4 |
| Llama 3.1 8B Q5 | 134/138, 134/138 | 2, 2 | 1, 1 |
| Qwen 3.5 9B | 133/133, 132/132 | 0, 0 | 9, 9 |

The last column counts checks where an early round gave a faithful edit and a later
round damaged it. It includes withheld checks: Llama's one case (G05) was withheld,
one of Gemma 2's four was withheld in run 1, and all of Gemma 4's and Qwen's were
published. No case was found where later rounds repaired such damage.

Examples:

- Gemma 4, G10: first fixes "Nadia asked where the nearest exit was", then changes
  it to "Nadia asked for the nearest exit". C06: first keeps "Exactly twelve", then
  drops the protected "exactly". The settling round then confirms the worse version.
- Gemma 2, P12B: starts with the faithful "The repair revealed the leak", then says
  the repair "fixed" and finally "stopped" the leak; finding a leak isn't fixing it.
- Qwen, C12: starts with a faithful "reviewed but didn't approve", then publishes "We
  rejected the draft". Not approving isn't rejecting, and the review disappears.
- Llama, N02: publishes "I gave the spare key to my neighbor", answering the
  question instead of leaving it alone. Settling doesn't make that right.

### Run-to-run differences

Gemma 4 and Llama gave identical final results on all 60 cases in both runs.
Gemma 2 differed on C01 (withheld versus a faithful shortening), C12 (faithful
versus losing the review) and N11 (published request for text versus withheld).
Qwen differed on C11 (lost versus kept "average"). Totals can match even when
different individual cases pass or fail, and the intermediate rounds can vary even
when the final text doesn't. Temperature 0 didn't guarantee identical behaviour.

## Recommendation and limits

**Gemma 4 E4B is the best of these four for this job**, and the app now uses it by
default. It still fails to leave half of the "no change" sentences alone and
publishes about eight meaning errors per 60 cases, so it must never rewrite text
automatically: keep the version checks, accept/reject, and visible errors.

Gemma 2 Q5 does well on grammar and shortening but often gives up or withholds.
Llama is quick but invents answers and blurs distinctions. Qwen 3.5's lead in the
first comparison doesn't carry over: its repeated shortening often removes protected
meaning. None of this is a general ranking of these models, or evidence about Q4
versus Q5.

Limits of this comparison:

- Only 60 made-up English sentences, with 12 per task and 12 hand-written pairs.
- The same assistant wrote the benchmark and judged the results, despite hiding
  model names. Cases involving tense, timing, agreement versus decision, strength of
  wording and "might/must" need an independent human judge before strong claims.
- Two runs, one machine, one model order and one setup per model; no confidence
  intervals, no shuffled sentence order, and no control over caching or GPU usage.
- The five-round settling rule is part of what was tested; single-round quality
  wasn't scored separately.
- Gemma 4 E4B hasn't yet been tried in the browser, and nothing ran on macOS or
  Windows. The raw answers are temporary local files, not a published dataset.

## Checks made alongside this run

- `npm test -- --run`: all 296 tests passed across 15 files.
- `npm run build`: passed, with the usual bundle-size warning.
- `git diff --check`: passed.
- Documentation links resolve, the npm commands exist, all four model runs were
  made, and every quoted output was checked against the raw answers.
- At the time of this run, no instructions, test cases, checking code, default model
  or benchmark notes were changed. The default model was switched to Gemma 4 E4B
  afterwards, as a separate change.
