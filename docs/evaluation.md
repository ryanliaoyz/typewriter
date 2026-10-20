# First model comparison (37 sentences)

[Back to the README](../README.md) · [Per-sentence review](evaluation-results.md) ·
[Second comparison (60 cases)](editing-v1-evaluation.md)

## Summary

On 2026-10-18 we ran three local models through the app's real checking code on
37 test sentences, twice each, and read every result.

- **None of the three can be trusted to keep meaning.** All of them published
  suggestions that changed what a sentence says.
- **Qwen 3.5 9B did best here:** it answered almost every sentence, left most valid
  sentences alone, and made the fewest clear meaning errors.
- **Gemma 2 9B, the default at the time, did worst:** it often failed to settle on
  an answer, and sometimes asked for text instead of editing.
- **Qwen 3 8B was fastest** but rewrote more correct sentences and made more
  meaning errors.

A later, larger [second comparison](editing-v1-evaluation.md) on 60 cases found
that Gemma 4 E4B does better than all of these; it is now the app's default.

## What was compared

The comparison measures the app's own sentence-checking job, not general chatbot
quality. The instructions ([`prompt.txt`](../prompt.txt)), the sentences, the
settings (temperature 0, up to 2,048 tokens), the answer checks and the
five-round settling rule were the same for every model. Each model kept its own
chat template and default settings from Ollama, so this compares models as you'd
actually install them, not their raw weights under identical conditions.

| Ollama tag | Quantization | Role |
| --- | --- | --- |
| `gemma2:9b-instruct-q4_K_M` | Q4_K_M | The default at the time; about 5.8 GB download |
| `qwen3.5:9b` | Q4_K_M on this machine | Previously tested baseline; about 6.6 GB installed |
| `qwen3:8b` | Q4_K_M on this machine | Smaller comparison model; about 5.2 GB installed |

Tags can point to different files over time, so the run records each model's exact
digest (below). No cloud models or `llama-server` were tested.

## The test sentences

There are **37 sentences**, each with a stable ID:

- the 24 paragraphs of [`tests.txt`](../tests.txt): 1–8 mainly test grammar, 9–16
  shortening, and 17–24 are correct sentences that should stay unchanged (these
  groups are a reading aid, not strict labels);
- 13 earlier problem cases from
  [`scripts/evaluation-cases.mjs`](../scripts/evaluation-cases.mjs): two long
  grammar-and-padding examples, three meeting variants, an employee-role example,
  qualified measurements, the researcher example, "not yet", scoped attribution,
  negation, a precise number, and a software-update example.

This set is now called the **legacy** suite. The newer
[60-case benchmark](../benchmarks/editing-v1/rubric.md) is scored differently, so
don't mix the two sets of numbers.

## How results were judged

Every original was read next to its final suggestion, and every intermediate
answer was read when a check failed or meaning changed. Results were judged on
separate points:

- **Meaning:** are the people and roles, facts, tense, cause, negation, who said
  it, numbers, certainty, degree, scope and emphasis kept? A concrete change is a
  failure; a debatable one is marked uncertain.
- **Grammar:** were errors fixed, missed or introduced? There is no single correct
  answer for most sentences.
- **Shortening:** was it useful, missed, or did it destroy information? Fewer words
  alone isn't better.
- **Restraint:** correct, concise sentences should come back unchanged. Needless
  synonym swaps are noted separately from meaning errors.
- **Reliability:** did the check settle, cycle, run out of rounds, or return
  something unusable?

The reviewer was the coding assistant, not an independent panel of people. This is
a small, local evaluation, not a guarantee.

## Reproduce

Install dependencies and set up Ollama as described in the README. Don't start a
second `ollama serve` if the service or app is already running. Download the models:

```sh
ollama pull gemma2:9b-instruct-q4_K_M
ollama pull qwen3.5:9b
ollama pull qwen3:8b
```

Run one model at a time, without using the editor or other GPU work meanwhile.

Linux or macOS, from the repository root:

```sh
OLLAMA_MODEL=gemma2:9b-instruct-q4_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma2-9b.jsonl
OLLAMA_MODEL=qwen3.5:9b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3.5-9b.jsonl
OLLAMA_MODEL=qwen3:8b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3-8b.jsonl
npm run evaluate:summarize -- gemma2-9b.jsonl qwen3.5-9b.jsonl qwen3-8b.jsonl
```

PowerShell 7 or later (repeat for each model):

```powershell
$env:OLLAMA_MODEL = 'gemma2:9b-instruct-q4_K_M'
$env:EVALUATION_REPEATS = '2'
npm run evaluate:model --silent | Out-File -Encoding utf8 gemma2-9b.jsonl
npm run evaluate:summarize -- gemma2-9b.jsonl
```

The PowerShell syntax is given for convenience; only Linux was actually used.
The raw output files are large local artifacts and aren't committed.

Settings for the evaluator (it does **not** read `.env.local` or the `VITE_*`
settings):

| Variable | Meaning | Default |
| --- | --- | --- |
| `OLLAMA_MODEL` | Model to test | The app's default model (now `gemma4:e4b`; Gemma 2 when this run was made) |
| `OLLAMA_SERVER_URL` | Ollama's address, without `/v1` | `http://127.0.0.1:11434` |
| `EVALUATION_SUITE` | `legacy` (these 37 sentences) or `editing-v1` (60 cases) | `legacy` |
| `EVALUATION_REPEATS` | How many times to run the whole set (1–3) | 1 |

Before running, the evaluator checks that the model is installed and records the
model, runtime, and fingerprints (SHA-256) of the instructions and sentences. It
loads the model once, then checks every sentence in order, one at a time, with
exactly the app's settings: temperature 0, up to 2,048 tokens, no "thinking", up to
five rounds, 120 seconds per request. Temperature 0 doesn't guarantee identical
answers, so running twice shows how much answers vary in practice.

Timings include every round for a sentence, but not the app's typing pause, queue
wait or the initial model loading. Ollama may reuse work between sentences, so
these aren't cold-start numbers. With Node 22.14 you'll see an "experimental"
warning on the error output; it doesn't affect the results.

## What the output contains

Each line of output is one JSON record:

1. **`run`:** date, exact model and digest, model settings, Node, platform and
   Ollama versions, fingerprints, settings and number of cases. Current runs use
   schema version 2 with a `suite` field; older schema-1 runs are read as legacy.
2. **`warmup`:** how long loading took, and how much of the model sat on the GPU.
3. **`case`:** model, repeat number, case ID and category, original sentence,
   outcome, final text (or `null`), time taken, word counts, any error, and every
   round's input, raw answer, HTTP status and time.

The summary refuses incomplete or duplicated runs. It reports counts and timings,
not quality. A model that cycles or gives unusable answers is a measured result,
not a script error; only network failures make the command fail. Timings are shown
both for all checks and for successful ones only, so fast failures can't look like
fast suggestions. For the 60-case suite it also reports how many "leave unchanged"
sentences were left unchanged, and whether both halves of a contrast pair got the
same final text.

## How a winner was chosen

Meaning comes first, then grammar and restraint, then useful shortening, then
reliability and speed. A model that makes meaning errors is never called safe,
even if it comes out on top.

## Results

### Environment

Run on **2026-10-18** on Linux x86-64 with an Intel Core i5-13400F, about 30 GiB
of RAM, and an NVIDIA GeForce RTX 4060 with 8,188 MiB of video memory (driver
595.99.02), using Ollama **0.18.2**, Node **22.14.0** and npm **11.6.2**. Each model
ran the full set twice, one model at a time. This was an ordinary development
machine with other work going on, so treat timings as rough.

Fingerprints (SHA-256):

```text
prompt.txt: de523dcdff7cc68b0c6a07e52eeee548244326fc4c17c7f875065ca6120ab5be
tests.txt:  21eab27c81346e8db498e5ac06a39d11c429fa422bc208703f6345ccfc6701c2
case list:  ccaddc60db9c984561f862c9383fb9fbc8e63604fbf7ebfa02331deb05b30287
```

Exact model digests:

```text
gemma2:9b-instruct-q4_K_M
  c20bec88025f3aefa420efd64dca0ee4abc8e36078d6b74b0f660cdcbd5d1982
qwen3.5:9b
  6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7
qwen3:8b
  500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41
```

All three are Q4_K_M. Their built-in settings differ: Qwen 3.5 uses presence
penalty 1.5, top-k 20 and top-p 0.95; Qwen 3 uses repeat penalty 1, top-k 20, top-p
0.95 and its own stop tokens; Gemma uses its own stop tokens. Only temperature was
overridden. Gemma's tag uses an older template that merges the instructions and
the sentence into one message, which may be part of why it sometimes asked for text;
this run can't tell whether that's the template or the model.

The full answers and timings were kept locally in
`/tmp/opencode/typewriter-evaluation-2026-10-18/` and aren't part of the repository;
the commands above recreate them. Every final suggestion and judgement is in the
[per-sentence review](evaluation-results.md).

### Reliability and speed

Each model checked the 37 sentences twice (74 checks). Both runs gave the same
final results, so the table counts **sentences**, not checks.

| Configuration | Stable | Clean | Suggestions | Cycles | Limits | Invalid / transport errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 22/37 | 4 | 18 | 5 | 10 | 0 / 0 |
| Qwen 3.5 9B | 36/37 | 7 | 29 | 1 | 0 | 0 / 0 |
| Qwen 3 8B | 28/37 | 3 | 25 | 7 | 2 | 0 / 0 |

"Stable" means the check settled on an answer, right or wrong. "Cycles" went back
to an earlier wording; "Limits" used all five rounds.

Timings below include failed checks; the "stable-only" column leaves them out.

| Configuration | Requests across 74 checks | Median | p95 | Maximum | Stable-only median / p95 | Loading warm-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 258 | 5.02 s | 9.20 s | 11.38 s | 3.11 / 9.03 s | 5.37 s |
| Qwen 3.5 9B | 178 | 1.88 s | 4.51 s | 5.17 s | 1.84 / 4.51 s | 3.00 s |
| Qwen 3 8B | 216 | 0.96 s | 2.73 s | 3.00 s | 0.77 / 2.01 s | 24.04 s |

How many rounds each of the 74 checks took (including the final "no change"
round and failed checks):

| Configuration | 1 pass | 2 passes | 3 passes | 4 passes | 5 passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 8 | 16 | 8 | 16 | 26 |
| Qwen 3.5 9B | 14 | 30 | 18 | 10 | 2 |
| Qwen 3 8B | 6 | 24 | 18 | 22 | 4 |

All three ran with a 4,096-token context. Gemma (7.87 GiB in memory, 5.16 GiB on the
GPU) and Qwen 3.5 (8.68 / 5.58 GiB) were split between the CPU and an 8 GB GPU; Qwen 3
(5.54 GiB) fit entirely on the GPU. That difference alone could explain Qwen 3's
speed, so it doesn't mean Qwen 3 would win on a bigger GPU.

In total: **222 sentence checks and 652 model requests**, not counting three
loading requests and a later browser test.

### Quality

Counts are **sentences per model**, using the labels from the
[per-sentence review](evaluation-results.md). They're one reviewer's judgements,
not calibrated scores. A withheld sentence (the check failed, so nothing was shown)
isn't counted as a safe correction.

| Configuration | No clear issue (OK) | Definite meaning change (F) | Uncertain (U) | Weak/needless edit (R) | Withheld (W) | Valid prose unchanged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 8 | 11 | 2 | 1 | 15 | 1/8 |
| Qwen 3.5 9B | 17 | 10 | 6 | 3 | 1 | 6/8 |
| Qwen 3 8B | 9 | 14 | 2 | 3 | 9 | 2/8 |

Examples of what went wrong:

- Qwen 3.5 turned "is designed to process" into a claim that the software does
  process, and a decision to postpone into an actual postponement.
- Gemma turned evidence that "suggests" a hypothesis was wrong into evidence that
  "refutes" it. Ten sentences got a request for text instead of an edit; the answer
  checks didn't catch that, though those checks ran out of rounds and were withheld.
- Qwen 3 removed "seemingly" and called a necessary check redundant, and dropped
  "me" from a grammar fix.
- The settling rounds sometimes started with a faithful fix and then stripped
  tense, roles or qualifiers before settling. Settling measures consistency, not
  faithfulness.

**Conclusion at the time:** keep every suggestion under your control, and keep
failures visible with a way to retry. No model here earns a claim of reliable
meaning preservation. Further tuning should use new, independent test text and
human review rather than these 37 sentences. (At the time of this run, failures
were only visible in the Debug panel; they've since got their own underline and
Retry card in the editor.)

### App checks made alongside this run

- `npm test`: 275 tests passed, none needing Ollama.
- `npm run build` passed, including a build with
  `VITE_OLLAMA_MODEL=gemma2:9b-instruct-q4_K_M` (with the usual warning that the
  main bundle is over 500 kB).
- All three evaluation runs finished without network errors.
- Headless Chromium on Linux used **real Gemma answers**, through both the
  development proxy and the built app talking to Ollama directly. It checked
  highlighting without automatic rewriting, comparing, accepting, undoing and
  rejecting, with no page errors, and that the Debug panel is absent from the built
  app. A direct cross-origin check from `http://127.0.0.1:4173` was allowed by
  Ollama without extra setup.

These browser checks covered one short correction, not the whole test set. macOS,
Windows, Firefox, Safari, a fresh machine, `https` hosting and other machines on the
network weren't tested.

## Earlier prompt development (2026-10-17)

Before this comparison, the instructions in `prompt.txt` were developed with
`qwen3.5:9b` (thinking off, temperature 0, 2,048 tokens). These runs are kept as
history; the current instructions encourage shortening that keeps meaning, and the
earlier "change as little as possible" rules no longer apply.

**First run (26 sentences, two rounds).** Every answer was plain text. 20
suggestions stayed the same when checked again and 6 changed again: `tests.txt`
samples 6, 9, 11, 13 and 20, and the long prerequisites sentence. The changes were
often needless swaps such as "wrong" → "incorrect", "several" → "multiple", and "a
lot of confusion" → "significant confusion"; the two-round check then in place held
these back. Even settled answers had problems: the long "Irregardless…" sentence
only lost one "about", and the "somewhat unconventional" sample lost "somewhat" and
"nevertheless".

**After tightening the rules against rewriting (31 sentences, Ollama 0.18.2).**
Every answer was usable. 24 of the original 26 sentences settled (up from 20), and
28 of 31 overall. All eight correct sentences at the end of `tests.txt` came back
unchanged, and the meeting, workshop and measurement examples kept their tense,
clauses and qualifiers. Three still didn't settle: sample 6 kept swapping "wrong"
for "incorrect", the prerequisites sentence kept getting shorter, and the original
meeting sentence lost "each and every" and then "different".

**With shortening enabled and up to five rounds (37 sentences).** 36 of 37 settled:
7 unchanged on the first answer, 15 after two rounds, 10 after three, 3 after four
and 1 after five. Sample 13 (deployment and configuration) went back to an earlier
wording and was recorded as a cycle. The researcher sentence went from 40 to 26
words and kept "ultimately" and "the entire team's overall productivity"; the
software-update example went from 47 to 20 words. Reading the results still found
meaning drift: "is designed to process" became actual processing, "decided to
postpone" became "postponed", some "has been"/"is doing" forms became simple tense,
"somewhat" disappeared, the workshop example lost the employee role, and the
software update's "has reported" and "is causing" became simple present. The
instructions ask the model to keep these distinctions; this model didn't always do so.
