# Editing-v1: newly installed local models

[Benchmark and review rubric](../benchmarks/editing-v1/rubric.md) ·
[Earlier 37-case comparison](evaluation.md)

## Scope

**Outcome:** Gemma 4 E4B is the strongest next development baseline on this
synthetic suite, not a reliably meaning-preserving editor. All four configurations
publish meaning-changing suggestions. The application's default remains unchanged.
See the [complete per-case review](editing-v1-results.md) for judgments and traces
of failures. No prompt or dataset was changed in response to these results.

This comparison runs the frozen **60-case editing-v1 suite twice per model**.
The new installed configurations are compared against `qwen3.5:9b` on the same
suite and runtime. No prompt, case, rubric, model default, or inference setting
is tuned during the experiment. Each sentence is checked independently through
the existing shared application checker; annotations and references are not
submitted to the model.

| Configuration | Reported parameters / quantization | Role |
| --- | --- | --- |
| `gemma2:9b-instruct-q5_K_M` | 9.2B / Q5_K_M | Newly installed higher-precision Gemma 2 tag |
| `gemma4:e4b` | 7.5B / Q4_K_M | Newly installed Gemma 4 configuration; E4B is the tag, not a claim of 4B total stored parameters |
| `llama3.1:8b-instruct-q5_K_M` | 8.0B / Q5_K_M | Newly installed Llama 3.1 configuration |
| `qwen3.5:9b` | 9.7B / Q4_K_M | Same-suite baseline |

The prior Gemma 2 Q4 and Qwen 3 results used a different corpus and Ollama
version. They are not direct controls for this experiment. In particular, this
run cannot isolate the effect of changing Gemma 2 from Q4 to Q5.

## Environment and protocol

Linux x86-64; Intel Core i5-13400F; approximately 30 GiB system RAM; NVIDIA
GeForce RTX 4060 with 8,188 MiB VRAM; driver 595.99.02. Node 22.14.0 and npm
11.6.2. Ollama is now **0.40.6**, rather than the **0.18.2** used in the earlier
comparison. Runs start on the local evening of **2026-10-18** (UTC **2026-10-19**).
All inference is sequential on loopback, with one model batch at a time.

Settings remain `temperature: 0`, `max_tokens: 2048`, `reasoning_effort: 'none'`,
non-streaming requests, five passes including unchanged confirmation, and a
120-second timeout per request. Loading uses an empty-prompt warm-up and is timed
separately. Sentence latency includes all refinement passes and trace capture,
not editor debounce/queue wait. These are workstation observations, not isolated
hardware benchmarks; model templates, inherited samplers, runner backends,
CPU/GPU offload, prefix caching, and first-use costs can differ.

Tag metadata and runtime residency can report different runner identifiers; the
actual post-load `/api/ps` snapshots, not tag metadata, determine the residency
figures below. Gemma 4 declares `draft_num_predict: 3`; this is not overridden.
Compare deployable configurations, not architecture or quantization alone.
Full model metadata and raw JSONL traces
are retained locally in `/tmp/opencode/typewriter-editing-v1-2026-10-18/`.
These temporary files are not distributed with the repository.

Frozen content SHA-256 hashes:

```text
cases.jsonl: 465ad0cfa31870343c6c2d3f20a793a3ba29fb768db3c034e6589569b051ab84
rubric.md:   c7ad8d78e4096ab56b919ede474c526f162e4f25d6185a236dad5b60129ff559
case list:   0cdfc147c57f80fe5fb864cfdc5e85cbb445ca38ad796a69df2662ff60523632
prompt.txt:  de523dcdff7cc68b0c6a07e52eeee548244326fc4c17c7f875065ca6120ab5be
```

Exact installed model digests:

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

Use the installed exact tags below; the evaluator checks availability and does
not download models. Follow [server setup](../README.md#model-server-setup) first.
Run these commands one at a time, without simultaneous editor inference:

```sh
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=qwen3.5:9b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3.5-9b.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=gemma2:9b-instruct-q5_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma2-9b-q5.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=gemma4:e4b EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma4-e4b.jsonl
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=llama3.1:8b-instruct-q5_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > llama3.1-8b-q5.jsonl
npm run evaluate:summarize -- qwen3.5-9b.jsonl gemma2-9b-q5.jsonl gemma4-e4b.jsonl llama3.1-8b-q5.jsonl
```

PowerShell environment syntax and trace schema are in the
[rubric](../benchmarks/editing-v1/rubric.md#reproduction-and-versioning).

## Review method

Linguistic review uses the predeclared rubric: required grammar repair, faithful
useful compression, unchanged controls, semantic contrast preservation, harmful
published suggestions, output-contract compliance, and availability remain
separate axes. A withheld check is not a successful repair or a harmful published
suggestion. Reference text is illustrative, not an equality oracle. Exact equality
is used only for the explicit unchanged controls; pair-output collisions are
diagnostics, not semantic grades.

This is assistant review of synthetic development cases, not an independent
human panel or a held-out benchmark. Concrete meaning errors and uncertain
equivalence are kept separate. Final outcomes and per-pass drift are assessed
against the original input, including failed attempts. Model identifiers are
removed and result groups shuffled for the linguistic review; this reduces label
exposure but cannot make the assistant independent of the model-selection task.

## Availability and runtime observations

Counts are shown **repeat 1, repeat 2**, each out of 60 inputs. Two repetitions
are not 120 independent linguistic examples. “Stable” includes wrong suggestions;
the quality review below is separate.

| Configuration | Stable | Cycles | Limits | Invalid | Transport errors | N controls unchanged (out of 12) |
| --- | --- | --- | --- | --- | --- | --- |
| Qwen 3.5 9B | 54, 54 | 6, 6 | 0, 0 | 0, 0 | 0, 0 | 3, 3 |
| Gemma 2 9B Q5 | 49, 49 | 11, 11 | 0, 0 | 0, 0 | 0, 0 | 5, 5 |
| Gemma 4 E4B | 59, 59 | 1, 1 | 0, 0 | 0, 0 | 0, 0 | 6, 6 |
| Llama 3.1 8B Q5 | 52, 52 | 8, 8 | 0, 0 | 0, 0 | 0, 0 | 3, 3 |

Latency is over all 120 sentence checks per configuration, including unsuccessful
attempts. Loading is excluded, but first-use prompt processing remains included.

| Configuration | Generation requests | Median | p95 | Maximum | Stable-only median / p95 | Loading warm-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen 3.5 9B | 265 | 1.44 s | 2.58 s | 22.26 s | 1.37 / 2.52 s | 45.81 s |
| Gemma 2 9B Q5 | 278 | 2.97 s | 9.28 s | 14.15 s | 2.85 / 5.56 s | 11.36 s |
| Gemma 4 E4B | 206 | 0.24 s | 1.92 s | 7.55 s | 0.23 / 1.99 s | 18.62 s |
| Llama 3.1 8B Q5 | 276 | 0.81 s | 1.86 s | 2.46 s | 0.76 / 1.79 s | 12.39 s |

Post-load snapshots for Qwen and Gemma 2 Q5 report the actual runtime
runner as `llamacpp` and context length as 4,096. Qwen's reported resident / VRAM
sizes are 5.73 / 4.38 GiB; Gemma 2 Q5's are 4.96 / 4.35 GiB. These are API-reported
allocations, not a measurement of the full model file's memory footprint. Do not
infer that either model is fully GPU-resident just from its download size.
Qwen's first G01 check accounts for its 22.26-second maximum; the empty-prompt
loading warm-up does not eliminate first-use latency. Neither batch returned
nonempty reasoning fields, consistent with the requested no-thinking setting.
Gemma 4 likewise reports `llamacpp`, a 4,096-token context, and no nonempty
reasoning fields. Its `/api/ps` size and VRAM size are both only 257,152,777 bytes
(0.24 GiB), implausibly small as a full accounting of a 6.6 GB model. Treat that
as an API-accounting limitation, not evidence of extraordinary memory efficiency
or full GPU residency. Its measured HTTP latency is still reported as observed;
the experiment does not explain the performance difference.
Llama likewise reports `llamacpp`, a 4,096-token context, and no nonempty
reasoning fields; its reported resident / VRAM sizes are 6.01 / 4.99 GiB.

There were **480 sentence checks and 1,025 generation requests** across the four
batches, plus four separate loading warm-ups. All 120 expected case/repetition
identities are present per configuration. No transport failure or checker-classified
invalid response occurred; this does **not** establish linguistic or output-only
compliance (see below).

Pass distributions (counts of checks taking **1 / 2 / 3 / 4 / 5** requests),
including unsuccessful attempts:

| Configuration | Repeat 1 | Repeat 2 |
| --- | --- | --- |
| Gemma 4 E4B | 24 / 29 / 7 / 0 / 0 | 24 / 29 / 7 / 0 / 0 |
| Gemma 2 9B Q5 | 11 / 32 / 7 / 7 / 3 | 11 / 31 / 8 / 8 / 2 |
| Llama 3.1 8B Q5 | 13 / 27 / 12 / 5 / 3 | 13 / 27 / 12 / 5 / 3 |
| Qwen 3.5 9B | 13 / 25 / 19 / 2 / 1 | 13 / 25 / 20 / 1 / 1 |

## Linguistic quality

Each cell is **repeat 1, repeat 2**, not pooled independent evidence. G and C
success requires the annotated repair/compression, acceptable grammar, preserved
meaning, and output-only compliance. P preservation permits faithful paraphrases.
Uncertain equivalence is excluded from success and from definite harm. The frozen
annotations protect tense/aspect and explicit exactness, not merely the event's
broad topic; see [judgment boundaries](editing-v1-results.md#shared-judgment-boundaries).

| Configuration | Faithful grammar /12 | Faithful useful compression /12 | Unchanged N /12 | Preserved P /24 | Harmful / all published suggestions |
| --- | --- | --- | --- | --- | --- |
| Gemma 4 E4B | 10, 10 | 9, 9 | 6, 6 | 22, 22 | 8/35, 8/35 |
| Gemma 2 9B Q5 | 9, 9 | 8, 8 | 5, 5 | 9, 9 | 11/38, 11/38 |
| Llama 3.1 8B Q5 | 6, 6 | 7, 7 | 3, 3 | 15, 15 | 12/39, 12/39 |
| Qwen 3.5 9B | 6, 6 | 4, 5 | 3, 3 | 14, 14 | 20/41, 19/41 |

P-case accounting, **preserved / changed / uncertain / withheld**, out of 24:

| Configuration | Repeat 1 | Repeat 2 | Comparable pairs /12 | Colliding pairs |
| --- | --- | --- | --- | --- |
| Gemma 4 E4B | 22 / 2 / 0 / 0 | 22 / 2 / 0 / 0 | 12, 12 | None |
| Gemma 2 9B Q5 | 9 / 4 / 3 / 8 | 9 / 4 / 3 / 8 | 6, 6 | None |
| Llama 3.1 8B Q5 | 15 / 7 / 1 / 1 | 15 / 7 / 1 / 1 | 11, 11 | P06 and P10, both repeats |
| Qwen 3.5 9B | 14 / 6 / 1 / 3 | 14 / 6 / 1 / 3 | 10, 10 | P03 and P08, both repeats |

Gemma 2's absence of collisions is partly a consequence of withholding: only six
pairs have both outputs available per repetition. Llama collapses possible versus
asserted prevention into design intent and strict-over-18 into inclusive-18.
Qwen collapses intended versus actual filtering and compatible versus conclusive
leak evidence. Gemma 4 preserves those contrasts, but still removes present-perfect
aspect in both P01 variants. Different final strings alone are not a fidelity pass.

### Output-only compliance and refinement drift

Counts below assess **returned pass responses**, not stable checks. A response can
pass the HTTP checker's structural validation while failing the editing-only task.
For example, Gemma 2 sometimes asks for text despite receiving a complete input,
and its N11 request for text even stabilizes and becomes a published suggestion.
Gemma 4 inserts a literal Markdown escape into the protected `retry_count` identifier;
Llama answers a question with an invented neighbor and prepends an editing heading.
Semantic errors without such task/format violations are counted separately as harm.

| Configuration | Compliant responses / returned responses (R1, R2) | Cases with any contract violation (R1, R2) | Definite drift after earlier faithful candidate (R1, R2) |
| --- | --- | --- | --- |
| Gemma 4 E4B | 101/103, 101/103 | 1, 1 | 2, 2 |
| Gemma 2 9B Q5 | 116/139, 118/139 | 6, 5 | 4, 4 |
| Llama 3.1 8B Q5 | 134/138, 134/138 | 2, 2 | 1, 1 |
| Qwen 3.5 9B | 133/133, 132/132 | 0, 0 | 9, 9 |

The last column includes withheld checks and does not claim a full alternative
single-pass quality evaluation. Llama's sole such case (G05) is withheld; Gemma
2's R1 C01 is withheld, while its other three are published. Both Gemma 4 cases
and all nine Qwen cases publish the later drift. In these cases the drift persists
or is amplified; no definite drift followed by a fully repaired final candidate
was identified. Uncertain changes are not counted in this column.

Examples:

- Gemma 4 G10 first repairs “Nadia asked where the nearest exit was,” then changes
  it to “Nadia asked for the nearest exit.” C06 first keeps “Exactly twelve,” then
  strips the protected qualifier. Stability confirms the later, worse candidate.
- Gemma 2 P12B starts with the faithful “The repair revealed the leak,” then says
  it “fixed” and finally “stopped” the leak—discovery is not successful repair.
- Qwen C12 starts with faithful review/nonapproval, then publishes “We rejected
  the draft.” Nonapproval does not establish rejection, and the review disappears.
- Llama N02 publishes “I gave the spare key to my neighbor,” answering rather than
  correcting the input question. An unchanged confirmation does not validate it.

### Repeatability

Gemma 4 and Llama have identical final outcomes and text on all 60 cases.
Gemma 2 differs on C01 (withheld versus faithful compression), C12 (faithful
compression versus lost review), and N11 (published request versus withheld
requests). Qwen differs on C11 (lost average versus preserved average pressure).
Aggregate success totals can match while different individual cases pass/fail.
Whitespace in raw responses and intermediate traces can differ even when the
summary's final-text/outcome comparison matches; Qwen G04 and C07 are examples
of intermediate path/pass-count variation. Temperature zero did not ensure
identical behavior across every repetition.

## Recommendation and limitations

Use **Gemma 4 E4B as the next development baseline to investigate**: it has the
best availability, faithful G/C results, P preservation, exact-control restraint,
and observed median latency in this run. It still changes half the valid controls
(including one withheld control) and publishes eight definite meaning violations
per repetition. It is not safe for automatic rewriting; keep version checks,
explicit accept/reject, and visible errors. This evaluation changes no default.

Gemma 2 Q5 does relatively well on G/C but frequently abandons the task or withholds
semantic cases. Llama is comparatively quick but invents answers and collapses
contrasts. Qwen 3.5's previous legacy advantage does not carry over to this suite:
its iterative shortening often strips protected meaning. This is not evidence
of a general model ranking or a Q4/Q5 quantization effect.

The dataset is only 60 synthetic draft English sentences, with 12 examples per
main G/C/N task and 12 hand-written contrast pairs. This assistant authored and
reviewed the benchmark and authored this review, despite hiding model labels
during grading. Tense/aspect, damage timing, agreement/decision, intensification,
and modal interpretations need independent human adjudication before strong
claims. There are only two sequential repeats, one machine, one model order, one
runtime/configuration per model, no sampling confidence estimate, no randomization
of sentence order, and no controlled cache or GPU-residency experiment. The shared
five-pass policy is part of the treatment; first-pass quality was not separately
scored as an alternative deployment. No additional live browser validation or
macOS/Windows inference was performed for these models. Local raw traces are
temporary, not a permanently archived public dataset.

## Repository validation

- `npm test -- --run`: all **296 tests** pass across 15 files.
- `npm run build`: passes; existing minified-chunk size warning remains.
- `git diff --check`: passes.
- Relative documentation links resolve; the reproduced npm commands use existing
  scripts and all four model commands were run. All run identities and frozen
  corpus/rubric hashes were checked, and quoted final outputs were audited against
  raw traces (transcription discrepancies corrected before the final check).
- No prompt, fixtures, checker, application default, or benchmark annotations
  changed. No new browser or non-Linux checks were run.
