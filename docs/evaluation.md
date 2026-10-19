# Local model evaluation

[Back to the README](../README.md)

## Scope and model matrix

This evaluation compares the application's existing sentence-checking contract,
not generic chatbot quality. The prompt, sentence inputs, temperature, token
budget, response validation, and five-pass refinement rule are held fixed.
Model-specific templates and inherited Ollama parameters remain those of each
installed model; this is a comparison of deployable configurations, not isolated
model weights under identical samplers.

| Ollama tag | Quantization | Role |
| --- | --- | --- |
| `gemma2:9b-instruct-q4_K_M` | Q4_K_M | Project's target/default; approximately 5.8 GB download |
| `qwen3.5:9b` | Q4_K_M on this machine | Previously tested baseline; approximately 6.6 GB installed |
| `qwen3:8b` | Q4_K_M on this machine | Smaller installed comparator; approximately 5.2 GB installed |

Tags can change. Run manifests record full model digests and quantization rather
than assuming that a future pull of a tag identifies the same weights. No cloud
models, vision inputs, embedding models, or `llama-server` are evaluated. The
default model is not automatically changed by the comparison.

## Cases and review rubric

The recorded results on this page use the **legacy 37-case suite**, still the
default. The newer [60-case editing-v1 benchmark](../benchmarks/editing-v1/rubric.md)
adds predeclared correction requirements, protected meaning, valid-prose controls,
and semantic contrast pairs. Select it with `EVALUATION_SUITE=editing-v1`.
The dataset addition itself included no live runs; the subsequent
[new-model comparison](editing-v1-evaluation.md) uses that suite and a newer Ollama
runtime. It is synthetic development material, not a held-out corpus. Do not mix
its scores with the legacy runs on this page.

[`tests.txt`](../tests.txt) is unchanged: samples 1–8 primarily test grammar,
9–16 compression, and 17–24 valid prose. These categories are review aids, not
exclusive linguistic labels. [`scripts/evaluation-cases.mjs`](../scripts/evaluation-cases.mjs)
adds 13 existing regression inputs: two long grammar/redundancy examples, three
meeting variants, employee attribution, qualified measurements, the researcher
example, not-yet modality, scoped attribution, negation, numerical precision, and
the software-update example. There are **37 inputs**, each with a stable ID.

Review every original against its final published candidate, and inspect all
intermediate responses when a case is withheld or meaning changes. Review axes:

- **Fidelity:** preserve actors/roles, facts, tense/aspect, causality, negation,
  attribution, numerical precision, uncertainty, degree, scope, and emphasis.
  Mark a concrete change as a failure; mark debatable changes as uncertain rather
  than silently treating them as correct.
- **Grammar:** identify corrected errors, remaining errors, or newly introduced
  errors. Some fixtures admit dialect/style variation; there is no exact-output
  answer key.
- **Compression:** distinguish useful shortening, missed obvious padding, and
  destructive compression. Word count alone is not quality.
- **Restraint:** valid concise inputs should remain unchanged. Record needless
  synonyms and tone changes separately from semantic errors.
- **Contract and availability:** distinguish stable clean/suggestion, cycle,
  pass-limit exhaustion, unusable envelope/content, and transport/server errors.

The reviewer is the coding assistant, not an independent blinded human panel or
an LLM-as-judge service. Findings are a small, prompt-development-influenced local
evaluation, not a held-out benchmark or a guarantee of semantic preservation.

## Reproduce

Use the Node/npm versions supported by [`package.json`](../package.json), install
dependencies, and install/start Ollama as described in the README. Keep the server
on loopback; do not start `ollama serve` if its service/application is already
running. Download the target explicitly:

```sh
ollama pull gemma2:9b-instruct-q4_K_M
```

The comparison also needs `qwen3.5:9b` and `qwen3:8b` installed. If absent:

```sh
ollama pull qwen3.5:9b
ollama pull qwen3:8b
```

Only one evaluation process should run at a time on the model server;
avoid editor inference or unrelated GPU workloads during measurement.

Linux/macOS, from the repository root:

```sh
OLLAMA_MODEL=gemma2:9b-instruct-q4_K_M EVALUATION_REPEATS=2 npm run evaluate:model --silent > gemma2-9b.jsonl
OLLAMA_MODEL=qwen3.5:9b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3.5-9b.jsonl
OLLAMA_MODEL=qwen3:8b EVALUATION_REPEATS=2 npm run evaluate:model --silent > qwen3-8b.jsonl
npm run evaluate:summarize -- gemma2-9b.jsonl qwen3.5-9b.jsonl qwen3-8b.jsonl
```

PowerShell (repeat for each tag/file):

```powershell
$env:OLLAMA_MODEL = 'gemma2:9b-instruct-q4_K_M'
$env:EVALUATION_REPEATS = '2'
npm run evaluate:model --silent | Out-File -Encoding utf8 gemma2-9b.jsonl
npm run evaluate:summarize -- gemma2-9b.jsonl
```

Use modern PowerShell (7+) for UTF-8 output without a BOM. Platform-specific
shell syntax is provided for reproduction, not a claim of macOS/Windows testing.
Large raw JSONL traces are local evaluation artifacts, not files to commit.

`OLLAMA_SERVER_URL` optionally changes the server base URL (no `/v1` suffix);
the default is `http://127.0.0.1:11434`. `OLLAMA_MODEL` defaults to the Gemma tag.
`EVALUATION_REPEATS` accepts 1–3 and defaults to 1. The evaluator **does not read
`.env.local` or `VITE_*` settings**. Those configure the browser application only.
`EVALUATION_SUITE` accepts `legacy` (default, the 37 inputs recorded here) or
`editing-v1` (60 annotated inputs). Unknown names are rejected before server
requests. For editing-v1 commands, schema, and manual scoring, see its
[rubric](../benchmarks/editing-v1/rubric.md#reproduction-and-versioning).
Node 22.14 uses `--experimental-strip-types` to load the shared TypeScript checker;
its experimental warning is written to stderr, not the JSONL stream.

The evaluator checks installation before inference, records model/runtime metadata
and SHA-256 hashes of the prompt, fixture, and complete case list, then performs
one model-loading warm-up. All cases and repetitions run sequentially. Each check
uses the same implementation as the app: `temperature: 0`, `max_tokens: 2048`,
`reasoning_effort: 'none'`, no streaming, at most five passes, and a 120-second
timeout per request. Temperature zero is not a determinism guarantee. Two complete
repetitions reveal observed variation, not its true probability.

Warm-up requests/latency are reported separately. The manifest records residency
after loading; check CPU/GPU offload before interpreting performance. Sentence
latency includes every refinement pass, validation, and trace capture, but excludes
editor debounce, queue wait, browser rendering, and warm-up. Report median,
nearest-rank p95, maximum, request count, pass-count distribution, and repeat
differences. Do not compare token throughput across tokenizers as a quality score.
Warm-up loads the model with an empty prompt, not a full correction, so first-use
prompt processing remains in the first case. Ollama prefix caching may benefit
later cases/repetitions; this is not a set of independent cold-start measurements.

## Output structure

Each stdout line is JSON:

1. **`run`:** schema version, date, exact tag/digest, model details and inherited
   parameters, Node/platform/Ollama versions, content hashes, settings, repeat count,
   and case count.
   New runs use schema version 2 and include a `suite` object with name/version;
   editing-v1 also records dataset and rubric SHA-256 hashes in that object.
   Legacy runs retain `testsSha256`; `casesSha256` hashes the selected complete
   case list in either suite. The summarizer also accepts the earlier schema-1
   manifests without a suite field, treating them as legacy.
2. **`warmup`:** elapsed loading time and Ollama's residency snapshot.
3. **`case`:** model, repeat, stable case ID/category, original input, outcome,
   published result or `null`, elapsed milliseconds, word counts on success,
   diagnostics on failure, and ordered per-pass inputs, raw response envelopes,
   HTTP statuses, and timings.

The summary command rejects missing/duplicate case/repeat records. It reports
counts and timings, not a linguistic score. Invalid/cyclic/nonconvergent responses
are measured model outcomes, not script failures; transport errors set a nonzero
exit status. Neither exit status zero nor convergence certifies correction quality.
Latency summaries include failures and also provide stable-result-only median/p95,
so fast failures cannot masquerade as fast usable suggestions.
For editing-v1 it additionally reports exact equality on explicit unchanged
controls and identical final texts for stabilized contrast-pair members. Those
collision flags are diagnostic, not automatic judgments of semantic fidelity.
The annotations are retained in case records for review, but never sent to Ollama.

## Decision rule

Rank observed fidelity first, then grammar/contract compliance and restraint,
then useful compression, availability, and end-to-end latency. Never trade a
known meaning error for a higher compression ratio. A model with observed
meaning-changing suggestions must not be described as meaning-safe, even when
it wins the comparison. Report unsupported cases and uncertainty explicitly.

Completing this TODO means providing reproducible measurements and reviewed
limitations, not forcing a model to pass. Prompt tuning, changing model defaults,
adding more runtimes/models, and production UI changes are separate work.

## Recorded results

### Environment and provenance

Evaluation date: **2026-10-18**, Linux x86-64, Intel Core i5-13400F, about 30 GiB
system RAM, NVIDIA GeForce RTX 4060 with 8,188 MiB VRAM, driver 595.99.02,
Ollama **0.18.2**, Node **22.14.0**, npm **11.6.2**. Two complete repetitions
per model use the exact same prompt and corpus. Models run one at a time in
separate batches; no simultaneous inference is intentionally issued. This is a
normal development workstation, not an isolated performance laboratory, and
some test/build work occurred during evaluation. Timings are illustrative local
observations, not portable hardware benchmarks.

Content identity (SHA-256):

```text
prompt.txt: de523dcdff7cc68b0c6a07e52eeee548244326fc4c17c7f875065ca6120ab5be
tests.txt:  21eab27c81346e8db498e5ac06a39d11c429fa422bc208703f6345ccfc6701c2
case list:  ccaddc60db9c984561f862c9383fb9fbc8e63604fbf7ebfa02331deb05b30287
```

The full per-case published text and reviewer observations are in
[the case review](evaluation-results.md). Raw response envelopes and timing
traces are retained locally under
`/tmp/opencode/typewriter-evaluation-2026-10-18/`; these temporary artifacts are
not distributed with the repository. Reproduce them with the commands above.

Exact model digests:

```text
gemma2:9b-instruct-q4_K_M
  c20bec88025f3aefa420efd64dca0ee4abc8e36078d6b74b0f660cdcbd5d1982
qwen3.5:9b
  6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7
qwen3:8b
  500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41
```

All three use Q4_K_M. Inherited model settings differ: Qwen 3.5 declares
presence penalty 1.5, top-k 20, and top-p 0.95; Qwen 3 declares repeat penalty 1
plus top-k 20, top-p 0.95, and its chat stop tokens; Gemma declares its
start/end-of-turn stop tokens.
The request overrides each model's temperature to zero, but does not override
other model defaults. The manifests retain the exact declared parameter strings.

Template inspection with Ollama `/api/show` found that the pinned Gemma tag uses
a legacy template that folds the system instruction and `.Prompt` into one user
turn. Qwen 3 uses a multi-message template with thinking control; Qwen 3.5 reports
the runtime-handled `{{ .Prompt }}` template. Gemma's requests for input may involve
template/prompt/runtime interaction; this experiment does not isolate the cause
or establish that Gemma weights are intrinsically worse at editing. Do not silently
substitute a different template and combine those results with this batch.

### Availability and performance

Each model receives 37 cases twice (74 sentence checks); the two repetitions
within each batch have identical final texts/outcomes. Availability below counts
**unique cases in either repetition**, not 74 independent examples.

| Configuration | Stable | Clean | Suggestions | Cycles | Limits | Invalid / transport errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 22/37 | 4 | 18 | 5 | 10 | 0 / 0 |
| Qwen 3.5 9B | 36/37 | 7 | 29 | 1 | 0 | 0 / 0 |
| Qwen 3 8B | 28/37 | 3 | 25 | 7 | 2 | 0 / 0 |

All-attempt timings include failed attempts. Stable-only timings exclude them,
but “stable” is not synonymous with linguistically correct.

| Configuration | Requests across 74 checks | Median | p95 | Maximum | Stable-only median / p95 | Loading warm-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 258 | 5.02 s | 9.20 s | 11.38 s | 3.11 / 9.03 s | 5.37 s |
| Qwen 3.5 9B | 178 | 1.88 s | 4.51 s | 5.17 s | 1.84 / 4.51 s | 3.00 s |
| Qwen 3 8B | 216 | 0.96 s | 2.73 s | 3.00 s | 0.77 / 2.01 s | 24.04 s |

Pass-count distribution across all 74 checks, including confirmation passes and
unsuccessful attempts:

| Configuration | 1 pass | 2 passes | 3 passes | 4 passes | 5 passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 8 | 16 | 8 | 16 | 26 |
| Qwen 3.5 9B | 14 | 30 | 18 | 10 | 2 |
| Qwen 3 8B | 6 | 24 | 18 | 22 | 4 |

Warm-up snapshots report a 4,096-token context for all configurations. Gemma's
reported resident size / VRAM size was 7.87 / 5.16 GiB; Qwen 3.5's was
8.68 / 5.58 GiB. These are mixed CPU/GPU configurations on an 8 GB card. Qwen 3's
reported resident and VRAM sizes were both 5.54 GiB, indicating full GPU residency
for this run. That difference confounds comparisons of model architecture or size:
Qwen 3's faster checks are not evidence that it would win on a larger GPU.

Across all batches: **222 sentence checks and 652 generation requests**, excluding
three loading requests and the later browser smoke test. All 37 final case outcomes
and texts matched between repetitions for each model. This does not imply that
fresh runs, different hardware, or different Ollama versions will be identical.

### Linguistic review and recommendation

Counts below are **unique cases per model**, with the categories defined in the
[full per-case review](evaluation-results.md). They are assistant-reviewed
observations, not calibrated model scores. Withheld cases are not graded as safe
corrections, and fewer observed errors alongside more withholding is not a win.

| Configuration | No clear issue (OK) | Definite meaning change (F) | Uncertain (U) | Weak/needless edit (R) | Withheld (W) | Valid prose unchanged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemma 2 9B | 8 | 11 | 2 | 1 | 15 | 1/8 |
| Qwen 3.5 9B | 17 | 10 | 6 | 3 | 1 | 6/8 |
| Qwen 3 8B | 9 | 14 | 2 | 3 | 9 | 2/8 |

**None of these configurations validates the promise of meaning-preserving
editing.** All three publish stable meaning-changing suggestions. Qwen 3.5 is
the strongest development baseline in this small corpus: highest availability,
most valid prose left unchanged, and fewer clear fidelity failures than the
comparators. It is still unsuitable for claims of reliable semantic preservation.
Qwen 3 is faster here but rewrites more valid prose and has more cycles/fidelity
failures. The pinned Gemma configuration has substantial contract/availability
problems as well as semantic errors; it should not be promoted as validated v1
editing quality on the basis of this run.

Examples show why the axes must stay separate:

- Qwen 3.5 turns “is designed to process” into actual processing, and a decision
  to postpone into an executed postponement.
- Gemma turns evidence that “suggests” a hypothesis was wrong into evidence that
  “refutes” it. Ten inputs lead to requests for text rather than editing; the
  validator misses that commentary, although the pass limit withholds it here.
- Qwen 3 removes “seemingly” and asserts that a necessary check is redundant;
  it also drops the recipient “me” from a grammar correction.
- Refinement sometimes starts with a faithful correction and then strips tense,
  roles, or qualifiers before converging. It measures repeatability, not fidelity.

Keep all suggestions user-controlled and retain visible failure/retry behavior.
The existing production limitation still applies: failures/retry are only exposed
in the development inspector, not production UI. This evaluation does not fix it.
No prompt, input fixture, historical output, model default, queue, or editor behavior
was changed. Any switch from the configured Gemma default, prompt/template tuning,
stronger contract checks, or refinement-policy changes need separate review and
a fresh comparison. A further quality assessment should use new held-out prose
and independent human review rather than tune indefinitely on these 37 cases.

### Application and tooling validation

- `npm test`: **275 tests passed**, including mocked shared-checker regressions
  and a real Node CLI subprocess against a fake local HTTP server. Tests do not
  require Ollama or downloaded weights.
- `npm run build`: TypeScript checks and production build passed, including a
  build with `VITE_OLLAMA_MODEL=gemma2:9b-instruct-q4_K_M`. Vite reports the existing
  greater-than-500-kB chunk-size warning; no bundle-size change was attempted.
- All three evaluation processes completed without transport failures; the summary
  command accepted all three complete JSONL runs. Model cycles/limits and the
  linguistic failures above are recorded findings, not hidden as passing quality.
- Headless Chromium on Linux used **real Gemma inference**, not routed/mock model
  responses, through both Vite's development proxy and preview's direct Ollama
  connection. It verified sentence highlighting without automatic rewriting,
  comparison, acceptance, undo, rejection, no page errors, the expected model and
  URL on requests, and absence of the development inspector in preview. Test
  servers used loopback ports 5180/4180; the default server remains 11434.
- A direct CORS preflight from `http://127.0.0.1:4173` returned HTTP 204 and the
  exact allowed origin. The browser smoke also exercised actual cross-origin
  requests from preview. No service/environment CORS changes were needed locally.
- README section order, package-script references, and relative Markdown links
  were checked. Existing `.env.local` was not changed; explicit shell overrides
  selected Gemma for validation.

Browser checks cover one short grammar correction and user actions, not the entire
linguistic corpus through the UI. macOS, Windows, Firefox, Safari, cold-machine
installation, HTTPS hosting, and non-loopback deployment remain unvalidated.
