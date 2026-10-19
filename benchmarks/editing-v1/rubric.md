# Editing benchmark v1

## Status, scope, and provenance

[`cases.jsonl`](cases.jsonl) contains **60 synthetic English sentence-level
cases**, authored before running models on this suite. This is a development and
regression benchmark, **not a held-out or independently validated test set**. The
inputs were proposed publicly in the development conversation; failure families
were informed by the earlier 37-case evaluation. References and annotations were
reviewed by the coding assistant, not an independent human panel. All entries
therefore carry `source: "synthetic"` and `reviewStatus: "draft"`.

No new model-quality results are claimed when adding this dataset. The existing
`tests.txt`, `prompt.txt`, and historical results remain unchanged. The suite uses
the application's current prompt, HTTP checker, and refinement policy, rather
than supplying annotation-derived instructions to the model.

| IDs | Count | Primary task |
| --- | ---: | --- |
| G01–G12 | 12 | Repair a specified grammar error without collateral changes |
| C01–C12 | 12 | Remove identifiable padding without changing meaning |
| N01–N12 | 12 | Return valid, concise prose exactly unchanged |
| P01A/P01B–P12A/P12B | 24 | Preserve distinctions in 12 semantic contrast pairs |

The domains include everyday, workplace, narrative, and technical prose. This
small, deliberately diagnostic corpus is not representative of all writing,
dialects, or error distributions. It does not test paragraph-context reasoning,
editor segmentation, reconciliation, or asynchronous UI behavior.

## Case structure

Each JSON line is one case:

- `id`: stable occurrence ID, not a sentence-string identity.
- `family`: related semantic/linguistic cases that must stay together in any
  future development/holdout split. For example, C02 and both P01 variants share
  `decision-versus-action`; G04 and P02 share `progressive-aspect`.
- `category`: `grammar`, `compression`, `valid-prose`, or `fidelity`.
- `intent`: `repair`, `compress`, or `preserve`.
- `input`: the **only** case content submitted to the model, as its user message.
- `requiredImprovements`: concrete repairs or useful shortening to look for.
- `mustPreserve`: facts, roles, qualifications, and relationships that must survive.
- `mustNotImply`: unsupported strengthening, weakening, or substitutions to reject.
- `referenceExamples`: illustrative acceptable edits, **not an exhaustive answer
  key or an exact-match oracle**. Preserve cases have no reference rewrite.
- `expectUnchanged`: `true` only for N controls; exact equality is appropriate
  here because the current prompt explicitly requires unchanged valid prose.
- `pairId`, `variant`, `pairDistinction`: shared pair identity, A/B membership,
  and the distinction to preserve, present only for P cases.
- `source`, `reviewStatus`: provenance and review status; draft is not a claim of
  expert adjudication.

The loader rejects malformed JSON, duplicate IDs/inputs, missing meaning
constraints, inconsistent intent/category annotations, and incomplete/mismatched
pairs **before any server request**. The rubric and source data are hashed in the
run manifest so changed annotations cannot silently reuse an old benchmark identity.

## Review procedure

1. Freeze the input annotations and rubric before examining outputs. Record the
   suite name/version, dataset/rubric/case-list hashes, prompt hash, model digest,
   generation settings, runtime, and hardware used.
2. Review all attempted cases, including unchanged and withheld results. Do not
   review only the attractive suggestions or silently discard failed checks.
3. For linguistic review, hide model names and shuffle anonymized result groups.
   Keep a private mapping back to run/model IDs. This is a reviewer procedure,
   not an anonymization feature of the CLI; raw runs contain model identifiers.
4. Judge each result against the input and explicit requirements. More than one
   correction can be valid; a reference mismatch is not inherently a failure.
5. Record clear violations and uncertain equivalence separately. Do not silently
   accept borderline compression, nor treat reviewer uncertainty as a definite
   model error. Use independent human adjudication before making strong claims.
6. Inspect the full pass trace if a case is withheld or a final candidate changes
   meaning. Compare each pass against the **original**, not only its predecessor.
7. For each pair, review A and B separately before comparing their outputs.
   Different outputs can both be wrong; identical outputs flag a likely collapsed
   distinction, but are not an automatic linguistic verdict.

### Review record

Record one review per case/repetition (each pass assessment can be attached):

```json
{
  "id": "C02",
  "repeat": 1,
  "requiredEdit": "complete | partial | missed | not_applicable",
  "meaning": "preserved | changed | uncertain | not_applicable",
  "grammar": "acceptable | residual_error | introduced_error | uncertain | not_applicable",
  "compression": "useful | missed | destructive | not_applicable",
  "contract": "compliant | violated | uncertain | not_applicable",
  "firstMeaningChangingPass": null,
  "earlierFaithfulCandidate": null,
  "laterDrift": "repaired | amplified | persisted | not_applicable",
  "notes": "Evidence from the original, output, and trace."
}
```

The enum alternatives above describe a template, not literal values to submit.
Use `not_applicable` for final-text assessments of withheld cases, and record
their intermediate problems in notes/pass assessments. Use null for the first
meaning-changing pass when no definite drift was found, including uncertainty;
use a 1-based integer otherwise. `earlierFaithfulCandidate` is true/false when
adjudicated and null when unavailable/uncertain. Keep reviewer identity and the
run identity alongside review records. The CLI does not ingest or automatically
score these linguistic annotations.

## Scoring and denominators

Report each axis separately; do not collapse it into a compression-weighted score.
For repeated runs, report per-repetition scores and observed differences. Do not
treat repeats of the same 60 inputs as independent linguistic examples.

| Measurement | Definition |
| --- | --- |
| Faithful grammar repair | G cases with all required repairs complete, acceptable grammar, preserved meaning, and compliant output / **12** |
| Faithful useful compression | C cases with the targeted padding shortened, acceptable grammar, preserved meaning, and compliant output / **12** |
| Unchanged-control rate | N cases with stable output literally equal to input / **12**; withheld controls do not pass |
| Semantic preservation | P inputs with preserved distinctions and compliant output / **24**; report changed, uncertain, and withheld counts separately |
| Harmful published suggestions | Published changes with a definite meaning violation / all published changes; report numerator and denominator, and use N/A when no changes are published |
| Availability | All stable results / **60**; this includes linguistically wrong stable text |
| Output-contract compliance | Response-only editing compliance, assessed over returned pass responses; report cases with any violation too, and keep transport failures separate |
| Performance | Full-check median/p95/max latency, request count, and pass distribution, separately from loading and queue/debounce time |

Failed or withheld G/C cases do not count as successful repair/compression, but
are not harmful *published* suggestions. A stable unchanged G/C result can count
as available while missing the required improvement. A faithful edit need not
match a reference exactly. Fewer words are not sufficient for a compression pass;
require an actual useful improvement while preserving meaning. Word counts are
descriptive and are tokenizer/language dependent.

The summary CLI automatically reports outcomes, latency, N-control equality, and
P-pair final-text collisions. It **does not** calculate the linguistic metrics in
this table. Its pair counts are across pair/repetition units: `comparable` means
both members stabilized, `withheld` means at least one did not stabilize, and
`collisions` lists equal final texts. Missing pair members are invalid run data,
not legitimate withholding. No collisions does not demonstrate preserved meaning.

## Ambiguity and adjudication notes

- Repair the error actually supplied; do not infer a new story to justify a rewrite.
  G11 permits a semicolon or two sentences without inventing a cause for damage.
- “Has been repairing” can describe ongoing or recently stopped work. P02A must
  not acquire an assertion of successful completion or of activity at this instant.
  P02B retains the ordinary simple-past repair claim rather than a progressive one.
- “Not every” does not establish that anyone passed. P04A cannot become either
  “none passed” or “some passed” as an unsupported strengthening.
- P05 distinguishes opening → valid code from valid code → opening. Replacing
  “only if” with “if” reverses the required implication.
- P10 describes who the sentence permits, not an exhaustive registration policy.
  “Users older than 18 can register” does not by itself prove that everyone else
  is prohibited; preserve the stated age group without inventing that prohibition.
- In P12B the repair causes **discovery**, not the leak. Temporal order in P12A
  must not be promoted to causality.
- N02's preposition stranding, N04's singular they, and N06's split infinitive
  are valid constructions, not errors to impose prescriptive rewrites on.
- Preserve Unicode, identifiers, versions, quoted instructions, units, and scope.
  N10 is quoted prose, not an instruction for the model to follow.
- Meaning constraints refer to propositions, not exact keywords. For example,
  replacing “at least 18” with “18 or older” can preserve the inclusive bound.
- Adding an opposite assertion is not justified merely because a source claim
  does not entail it. Intended function does not establish failure, for example.

## Reproduction and versioning

Follow [model-server setup](../../README.md#model-server-setup) first. From the
repository root, use the existing evaluator with explicit suite selection:

```sh
EVALUATION_SUITE=editing-v1 OLLAMA_MODEL=qwen3.5:9b EVALUATION_REPEATS=2 npm run evaluate:model --silent > editing-v1-qwen3.5.jsonl
npm run evaluate:summarize -- editing-v1-qwen3.5.jsonl
```

PowerShell 7+:

```powershell
$env:EVALUATION_SUITE = 'editing-v1'
$env:OLLAMA_MODEL = 'qwen3.5:9b'
$env:EVALUATION_REPEATS = '2'
npm run evaluate:model --silent | Out-File -Encoding utf8 editing-v1-qwen3.5.jsonl
npm run evaluate:summarize -- editing-v1-qwen3.5.jsonl
```

`EVALUATION_SUITE=legacy` (the default) runs the original 37 inputs. Other values
are rejected. `OLLAMA_SERVER_URL` and model/repeat configuration behave as
[documented for the evaluator](../../docs/evaluation.md#reproduce). The suite adds
no model-specific prompt, reference answers, constraints, or pair context to a
request: each sentence is checked independently. Only review output contains
annotations. Benchmark runs must use the same suite/rubric/prompt hashes before
comparing model outcomes; the legacy and editing-v1 scores are not interchangeable.

Before using this suite for a model-quality claim, independently review ambiguous
cases and record any decisions. Keep all members of a family together in future
splits. Collect a separate, independently sourced held-out corpus (with documented
permissions/provenance) before tuning further; no such holdout is supplied here.
Do not call edited versions of these public examples held-out tests. Freeze a new
suite version for intentional input/expectation changes after published results;
even annotation-only edits change manifest hashes and must be disclosed.
