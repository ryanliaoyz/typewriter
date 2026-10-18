# Architecture and module details

[Back to the README](../README.md)

Typewriter uses React + TypeScript + Vite. The editor, segmentation,
reconciliation, result cache, sequential queue, and Ollama HTTP integration are
implemented. Response validation, version-safe caching, and per-sentence failure
notices with retry controls are connected. Sentence highlights and original/suggested
comparisons and version-safe accept/reject actions are available.

## Canonical document state

[`src/document/document.ts`](../src/document/document.ts) has no React or DOM
dependencies. `createDocument` initializes `{ text, edit: null }`;
`updateDocument(previous, text)` returns the new canonical text and one contiguous
replacement:

```ts
{ start: number, end: number, insertedText: string }
```

`[start, end)` addresses the **previous** text in JavaScript UTF-16 code units,
not Unicode code points. Applying that replacement reconstructs the new text.
Unchanged input returns `edit: null`. Transitions do not mutate previous state,
trim whitespace, or normalize Unicode; ranges avoid splitting intact surrogate
pairs. The controlled textarea uses these transitions for every change through
the sentence-state module.

The range is inferred from the common prefix and suffix of two snapshots, not
from a browser edit operation. Equivalent edits within repeated text can be
ambiguous; multiple changed portions are enclosed in a single replacement.
Only the latest transition is retained, not an edit history.
Suggestion acceptance supplies its known replacement range directly to sentence
reconciliation instead of inferring a range from snapshots.

## Sentence segmentation

[`src/document/segmentation.ts`](../src/document/segmentation.ts) is independent
of React and the DOM. It requires native `Intl.Segmenter` support (no
punctuation-only fallback) and uses
`Intl.Segmenter('en', { granularity: 'sentence' })`. `segmentSentences(text)`
returns occurrences shaped like:

```ts
{ start: number, end: number, text: string, complete: boolean }
```

Each `[start, end)` range uses UTF-16 code units and exactly addresses its `text`
in the canonical document. Surrounding whitespace is excluded from content
ranges; whitespace-only segments are omitted. Whitespace remains untouched in
the document, including gaps between sentences. Internal whitespace and Unicode
are not normalized. Duplicate sentences produce separate ranges, not stable IDs.

Completion is a separate, conservative scheduling policy, exposed as
`isSentenceComplete(text)`:

- Require at least one Unicode letter or number and a final `.`, `?`, or `!`.
- Allow closing quotes or brackets after the terminal punctuation.
- Leave trailing ellipses (`..`, `...`, or `…`) incomplete, including before
  closing quotes or brackets.
- Whitespace, newlines, and native segment boundaries alone do not complete text.
  A punctuated final sentence needs no trailing whitespace.

Native boundaries are not repaired: abbreviations may split unexpectedly (for
example, some runtimes split after `Dr.`), and a terminal abbreviation may be
marked complete. ICU versions can differ. This policy is not linguistic certainty
and currently targets English prose with ASCII sentence-ending punctuation.
The module does not schedule checks, assign identities, or modify editor state.

## Sentence occurrence reconciliation

[`src/document/sentences.ts`](../src/document/sentences.ts) is also independent
of React and the DOM. `createSentenceDocument(text)` initializes canonical
document state and derived sentence records;
`updateSentenceDocument(previous, text)` updates both in one pure transition.
The textarea uses these functions for every change. State has `document`,
`sentences`, and a session-local `nextSentenceId` counter. Each record contains
the segment's `start`, `end`, `text`, and `complete` fields plus:

```ts
{ id: string, version: number, status: 'idle' | 'clean' | 'suggestion' | 'rejected' }
```

- New occurrences start at version 1 with independent IDs, including duplicates.
  Deleted IDs are never reused during the document session.
- Unchanged content ranges before/after the edit are mapped into the new document
  and verified against native segmentation. These positional anchors retain IDs
  and versions, even when offsets shift.
- If all sentence content is unchanged in occurrence order, changes affect only
  surrounding document whitespace; all IDs and versions are retained.
- Between anchors, a one-to-one sentence edit retains its ID and increments its
  version when content changes, including internal whitespace and completion
  punctuation. Reverting text increments the version again.
- Insertions get fresh IDs; deletions retire IDs. Splits, merges, and ambiguous
  many-to-many replacements retire the affected IDs and create fresh records.
- Unchanged input retains the sentence array and clears the document's edit range.

Reconciliation never rewrites document text. It resegments the whole document for
simplicity, keeping UTF-16 content ranges and the existing completion policy.
The counter is part of immutable state, not a random or global allocator.

Identity follows the **inferred edit**, not a browser edit operation: adding or
removing an identical duplicate can be indistinguishable from editing a different
occurrence. Multiple non-whitespace edits in one snapshot form one replacement;
unchanged sentences inside an ambiguous many-to-many neighborhood may also receive
fresh IDs. The module deliberately avoids matching arbitrary occurrences solely
by sentence strings. An ambiguous neighborhood does not transfer results to fresh
IDs even if some sentence strings happen to remain unchanged.

## Sentence result cache

The cache lives in the current sentence records, not a separate map keyed by text
or a history of old versions. `cacheSentenceResult(state, checked, result)` is a
pure transition in `src/document/sentences.ts`. `checked` captures the occurrence's
`id`, `version`, and input `text`; `result` is an already classified successful
result:

```ts
{ status: 'clean' }
// or
{ status: 'suggestion', suggestion: 'Corrected sentence.' }
```

Only suggestion records carry corrected text. A clean record remains lightweight
and marks that occurrence/version as checked without storing a redundant response.
Caching leaves canonical text, document whitespace, the latest edit, IDs, and
versions untouched. It uses current offsets and ignores a target whose ID,
version, or input text no longer matches. Different occurrences of identical text
can have independent results.

Reconciliation preserves results on unchanged input, offset shifts, and changes
to surrounding whitespace. A one-to-one content edit keeps the ID but increments
the version, resets status to `idle`, and removes any suggestion. Internal
whitespace, punctuation, and edits that make a sentence incomplete count as
content changes. Reverting to previously checked text does not restore a result.
Deletion retires the record; split, merge, and ambiguous replacement records start
unchecked with fresh IDs while untouched anchors retain their results.

The HTTP client validates and classifies responses before the editor-session
module passes them to this cache. Failed requests never reach the cache.

### Suggestion actions

`acceptSentenceSuggestion` and `rejectSentenceSuggestion` in
`src/document/sentences.ts` consume current state and a capture of the occurrence
ID, version, original text, and suggestion. They return immutable state, or the
original state for stale/repeated actions. Both verify suggestion status and the
canonical text slice as well as the captured fields (invariants 1–4 and 9).

Accept replaces only the current range, preserving surrounding whitespace, and
reconciles with that explicit edit. This avoids ambiguity when replacement text
repeats neighboring sentences. Changed one-to-one records increment their version;
splits/merges follow normal reconciliation. Resulting unchecked complete sentences
use the normal queue rather than being assumed clean.

Reject removes the suggestion and marks that occurrence/version `rejected`, not
model-verified `clean`. It changes no document text or version. Reconciliation
retains rejection through offset/whitespace-only changes; content edits reset the
record to `idle`. The queue schedules only `idle` records, so rejected versions
do not get rechecked automatically (invariants 5–6 and 9).

## Debounced sequential queue

[`src/checking/queue.ts`](../src/checking/queue.ts) is independent of React and
HTTP. Create one queue per document session with
`createSentenceQueue({ check, onResult, onError })`. The injected `check` receives
only `{ id, version, text }` and returns a promise of an already classified
`SentenceCheckResult`. The editor-session module injects the Ollama HTTP checker;
unit tests inject a fake checker.

- Feed every document or cache transition to `queue.update(state)`. Only complete,
  unchecked (`idle`) records are eligible; clean, suggestion, and rejected records
  are skipped.
- Actual document edits restart a **400 ms** document-wide debounce. Unchanged
  input and cache-only updates do not restart it. Pending work is reconciled
  immediately, even while waiting for the timer or an active check.
- Pending entries are keyed by occurrence ID, including independent duplicates.
  Updating a queued version replaces it without changing its FIFO position.
  Deleted, incomplete, and checked records leave the queue; splits and merges use
  the reconciler's new IDs. Newly eligible occurrences join the tail.
- At most one checker is active. Editing or deleting its sentence does not release
  that slot; new work waits until its promise settles and any edit debounce ends.
  An edit to an active sentence queues only its latest eligible version.
- Callbacks receive the captured identity/input. The owner must validate responses
  against current state, using `cacheSentenceResult` for successful results, and
  feed updated state back to the queue. The queue never modifies canonical text or
  caches results itself; callbacks should not throw.
- Errors go to `onError`, never become clean results, and do not block other work.
  Current attempted versions are tracked to avoid duplicate requests and automatic
  retry loops on unchanged idle records. This bookkeeping stores no results or
   historical versions; an edit permits a new attempt. A separate map tracks only
   current failed captures, pruned on updates alongside attempted versions.
- `retry(capture)` accepts only a matching failed version, clears its failed and
   attempted markers, and appends it to the FIFO tail. It returns whether the retry
   was accepted. Active, repeated, stale, checked, and disposed retries are ignored.
   Retries respect the active slot and any edit debounce; otherwise they can start
   immediately. A failed retry requires another explicit action (invariants 4–6, 10).
- `getSnapshot()` exposes pending captures, the active capture, and whether the
  debounce timer is running. `dispose()` cancels the timer, clears pending work,
  and suppresses callbacks and further scheduling. It does not cancel an active
  checker; the active slot remains until settlement.

Unit tests use fake timers and deferred promises, not a running model. HTTP client
integration and editor wiring are described below. Queue activity is not stored as
`queued` or `checking` statuses in
the current sentence records.

## Model configuration and development proxy

[`src/checking/config.ts`](../src/checking/config.ts) takes model/server settings
and whether the app is running in development. It returns a model tag, server
base URL, and the URL the browser should call. Defaults are
`gemma2:9b-instruct-q4_K_M` and `http://127.0.0.1:11434`. Empty settings use defaults;
surrounding whitespace and trailing URL slashes are removed. Server URLs must use
HTTP(S), without credentials, query strings, or fragments. Do not append `/v1`.
This module supplies the simple runtime boundary for invariant 8 in `AGENTS.md`.

Copy [`.env.example`](../.env.example) to `.env.local` to set:

```dotenv
VITE_OLLAMA_SERVER_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=gemma2:9b-instruct-q4_K_M
```

Vite reads these settings at startup/build time. Restart development after changes
and rebuild production assets. `.env.local` is ignored by Git. Both values are
public, included in browser builds; do not put credentials in them. A custom
server/model may send prose off the machine, including if a cloud model is chosen.

[`vite.config.ts`](../vite.config.ts) reads the same configuration and forwards
development requests beginning with `/ollama` to the selected server, stripping
that prefix. The browser sends `/ollama/v1/chat/completions`; the server receives
`/v1/chat/completions`. The proxy changes the Host header to the target and avoids
cross-origin browser requests. It only exists in development, not preview or a
production static deployment. Its input is the environment and request path; its
output is a forwarded request/response (runtime boundary, invariant 8).

Production/preview call the configured server directly. Allow the page's exact
origin with Ollama's `OLLAMA_ORIGINS` setting if necessary; do not use a wildcard
or expose unauthenticated inference publicly. An HTTPS page cannot call an HTTP
server because of mixed-content restrictions. Loopback addresses then refer to
the browser's machine, not the machine hosting the frontend.

For platform setup, install from [Ollama's downloads](https://ollama.com/download),
pull `gemma2:9b-instruct-q4_K_M`, and start the runtime:

```sh
ollama pull gemma2:9b-instruct-q4_K_M
ollama serve
```

These are upstream setup instructions, not a claim that Gemma was evaluated here.
Do not start a second server when the Ollama app/service is already running.
Linux's installer normally creates a service; macOS and Windows run the desktop
application. Ollama's [environment configuration guide](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)
describes Linux systemd settings, macOS `launchctl`, and Windows user environment
variables. Restart the service/application after CORS changes. Hardware support
and performance vary; no installation or service configuration is managed by the
frontend. The target tag is listed upstream as 9B Q4_K_M (approximately 5.8 GB).

Validation so far: Linux live chat through Vite using an installed `qwen3.5:9b`
model, plus a successful CORS preflight from `http://127.0.0.1:4173`. No Gemma
download/evaluation, macOS, or Windows live validation has been performed.

## Ollama HTTP client

[`src/checking/ollama.ts`](../src/checking/ollama.ts) consumes a model tag, request
base URL, optional session cancellation signal, and a captured sentence. It
produces a successful `clean`/`suggestion` result or rejects with an error. It has
no React, queue, or document-state dependencies beyond shared types (invariants
8 and 10).

`createOllamaChecker` sends a non-streaming POST to `/v1/chat/completions`, with
the exact contents of [`prompt.txt`](../prompt.txt) imported as a raw system
message and the sentence as the user message. IDs, versions, document whitespace,
and offsets are not sent. Temperature is 0 and the response limit is 2048 tokens.
Requests set `reasoning_effort: 'none'` to disable thinking on supported models
through Ollama's OpenAI-compatible API, leaving the token budget for corrected text.
Live verification with local `qwen3.5:9b` returned a completed correction for the
previously truncated prerequisites sentence in 36 output tokens, with no reasoning
field and `finish_reason: 'stop'`.
No API key, model-management API, or Python service is needed.

The client requires one assistant choice with `finish_reason: 'stop'`, nonempty
text containing a letter/number, and no error, tool call, refusal, or code fence.
Newly introduced correction/explanation headings and numbered or bulleted lists
are also rejected as obvious commentary. Existing labels/lists in the input are
allowed; this is a conservative heuristic, not a complete output-contract parser.
Truncated responses, invalid JSON, failed HTTP status codes, and network failures
reject rather than produce clean results. This checks the envelope and obvious
unusable output, not grammar quality or every possible prompt violation; plausible
but wrong corrections remain suggestions, never automatic edits. Only surrounding
response whitespace is trimmed; internal whitespace and Unicode are preserved.
The client runs a bounded refinement state machine within one check:

```text
original input → request(current candidate) → validate response
                       ↑                          │
                       └── new candidate ──────────┤ changed, unseen, budget left
                                                  ├ unchanged → stable result
                                                  └ invalid / cycle / limit → failure
```

An unchanged first response is `clean`. A changed response becomes the next
candidate and is sent through the same prompt/settings again. Only a response
identical to its immediate input publishes the converged text as a suggestion.
Revisiting any earlier version (including the original) is a cycle, not a clean
result. `MAX_EDIT_PASSES` limits each attempt to five requests, including the
confirmation pass; convergence on pass five succeeds. Cycle and limit failures
have distinct messages and can be retried. HTTP or validation errors stop the
attempt immediately. No intermediate candidate enters the cache or editor, and
all passes retain the original sentence ID/version for stale-result checking.
Convergence measures consistency, not grammatical correctness or semantic fidelity.

Rejected chat envelopes raise `UnusableResponseError` with a validation reason and
the returned JSON; non-convergence raises the same error with the original input
and ordered pass outputs. The editor session retains those details with the current
failure capture. **Show response** beside Retry in Debug state toggles a literal,
read-only view of that reason and response, including finish reason and any returned
content. These diagnostics are discarded with the failure on retry, edit, or
deletion; they never become suggestions or modify the document.

A 120-second timeout per request aborts a hung fetch so the queue can move on.
All refinement passes occupy the same queue slot, sequentially; a check has at
most five requests, each with its own timeout. Edits during any pass still
invalidate the captured sentence version before publication. Session disposal
also aborts fetches; timers and cancellation listeners are cleaned up after each
request. Disposal is checked before and after every pass so no subsequent request
starts after unmount. Edits do not abort the active request or release its slot early.

## Editor session and checking lifecycle

[`src/checking/useSentenceEditor.ts`](../src/checking/useSentenceEditor.ts) owns
the canonical sentence-document state, one sequential queue, and current failures
by sentence occurrence. It consumes textarea edits, retry and suggestion actions,
and asynchronous client results, and produces state, `updateText`, `retry`,
`accept`, and `reject` actions, and a failure list for the UI (invariants 1, 4–6,
9, and 10).

Every edit reconciles state and immediately feeds it to the queue. A current-state
reference is updated before publishing React state, so a model response always
checks the latest document, including when React batches renders. Successful
responses use `cacheSentenceResult` and feed the resulting cache state back into
the queue without restarting the debounce. Stale results are discarded by the
cache's ID/version/text guard. Error notices are also restricted to matching
captures; they disappear when the failed occurrence changes or is deleted, not
when only its offsets move. No failure is stored as clean. Each failure contains
the captured ID, version, input text, and message, so identical sentences have
independent notices. Edits prune obsolete failures rather than hiding old notices.
Retry validates against the latest document and delegates to the queue; an accepted
retry removes that notice. Another failure restores it, and success clears it.
Accept/reject also validate against the latest state reference before publication,
prune obsolete failures, and update the queue. They return whether an action applied.
Acceptance restarts the normal edit debounce; rejection does not change the text.

The queue is created in a mount effect and disposed on unmount, with request
cancellation. React Strict Mode's initial effect replay creates no extra requests:
the first queue is disposed before its debounce can expire. Scheduling side effects
are not placed inside React state updaters. Failure references are also updated
before publishing React state so closely spaced callbacks preserve every failure.

## Editor and development inspector

[`src/App.tsx`](../src/App.tsx) renders a controlled textarea using the state and
actions from `useSentenceEditor`. It passes current sentence state to
the suggestion review component below the textarea. Drafts live
only in the current page session; no persistence is implemented. The textarea has
an accessible name without a visible label or instructional copy. The review and
inspector omit instructional prose while retaining controls, state data, and
concise empty states (invariants 1 and 9).
After fixing server setup, retry failed sentences without reloading or
changing the draft. Failure controls also implement invariant 10. For now, failure
details and Retry buttons live exclusively inside the collapsed **Debug state**
disclosure; production/preview do not expose them.

With `npm run dev`, expand **Debug state** below the editor to inspect the same
live state used by the textarea. [`src/DebugInspector.tsx`](../src/DebugInspector.tsx)
consumes session state, failures, and the retry action. It shows one alert per
failed occurrence with its input text, error, and a native **Retry** button,
followed by document length in UTF-16 units, sentence/completion counts, and each
sentence's ID, version, current end-exclusive range, JSON-escaped text, completion
flag, and status. Complete sentences can become `clean` or `suggestion` after a
successful check; failures remain `idle`. Suggestions also appear in raw JSON.
Completion means eligible for scheduling, not a grammar-check
result. This read-only view consumes session state without a separate cache or
segmentation pipeline (invariants 1 and 2).

The latest edit (inferred for typing, explicit for acceptance) references the
**previous** document's range; it is not an edit history. Expand **Raw state JSON**
to see the entire state, including
canonical whitespace and the session-local ID counter. The inspector adds no
separate segmentation pipeline. It is gated by Vite's `import.meta.env.DEV` and
is absent from production builds and `npm run preview`.

For manual validation:

1. Type `First. Last.` and note both IDs and versions.
2. Insert `Inserted.` between them: existing IDs/versions stay while offsets move.
3. Edit `Inserted.` to `Inserted!`: its ID stays and its version increases.
4. Change only surrounding whitespace: sentence IDs/versions stay unchanged.
5. Try `Same. Same.`: duplicates have independent IDs. Split or merge a sentence
   and watch affected records receive fresh IDs.
6. Append unfinished text: it appears with `complete: false`. Try emoji, tabs,
   and newlines to inspect UTF-16 ranges and escaped whitespace.
7. Delete all text: sentence records disappear while the ID counter remains.

## Suggestion review

[`src/SuggestionReview.tsx`](../src/SuggestionReview.tsx) consumes the current
sentence-document state and accept/reject/focus callbacks, and produces a read-only
document view plus an optional original/suggested comparison panel. The textarea remains the editable source of
truth. The view slices canonical text at current UTF-16 suggestion ranges, preserving
all intervening text, whitespace, and unfinished prose. Whole-sentence highlights
are native buttons with keyboard activation, visible focus, and expanded state.
Text is rendered literally, including model output (invariants 1, 2, and 9).

Selection stores only an occurrence ID and version. Each render resolves the
comparison from current records: offset shifts retain selection; content edits,
deletion, splits, merges, or loss of suggestion status clear it permanently.
Duplicate sentences remain independent. Closing the panel returns focus to the
highlight. An empty state does not imply that unchecked sentences are clean.
[`src/styles.css`](../src/styles.css) supplies whitespace-preserving layout,
wrapping, highlight colors, and focus styles. No document or cache changes are
made by closing the panel. Accept/reject buttons send the currently displayed
capture to the session; after a successful action the panel closes and focus
returns to the editor because the highlight is removed. `src/App.tsx` wires these
callbacks and owns the textarea focus reference. Native buttons and the existing
focus styles apply in both development and production.

## Connected model integration and suggestion actions

```text
Editor sentence state → sequential queue → HTTP client → Ollama
                                                        └── configured model
        ↑                                    │
        └── version-checked result cache ←───┘
              └── highlights → accept / reject
```

The HTTP client and development proxy are connected as described above. The
application uses Ollama directly without a Python service, database, Redis, or
worker system. See the [model server setup](../README.md#model-server-setup) for
platform validation limits. Highlighting and accept/reject controls in
the diagram are implemented.

Gemma 2 9B Q4_K_M remains the target model pending evaluation with Ollama; choosing
the runtime does not establish model availability or correction quality.
`llama-server` is a planned alternative for a later version, not a supported v1
runtime. Its shared chat API may allow client reuse, but compatibility and setup
must be implemented and tested before support is claimed.

For each request, capture the sentence ID, version, and input text. Send the
sentence with the instruction in [`prompt.txt`](../prompt.txt) and request only
corrected text. Preserve surrounding document whitespace independently of the
model request. When the response arrives:

1. Discard it if the sentence was deleted or its version/input changed.
2. If the valid returned text matches the input, mark the record clean.
3. Otherwise, store a suggestion and highlight its sentence in the review view.

Server failures or unusable responses remain unchecked and show per-sentence
notices with retry controls. Clicking a highlighted sentence shows its original
and proposed text. Available actions are:

- **Accept:** verify the current version, replace only its current range, and
  reconcile the updated document.
- **Reject:** dismiss the suggestion for that version. An edit makes the sentence
  eligible for checking again.

Start with whole-sentence highlights. A later enhancement can compute word-level
diffs locally. The model should not produce character offsets or edit metadata.
Model responses must never silently replace canonical editor text.

`prompt.txt` asks the model to correct grammar and actively compress wordy prose
while preserving its full meaning. Clause restructuring, shorter equivalents,
and replacing nominalizations or bloated verb strings with direct verbs are part
of the editing task. For example, “a person who participated in the meeting” can
become “a meeting participant,” and “ultimately resulted in having a beneficial
effect on” can become “ultimately improved.” Sentence-initial “Albeit” before a
full clause may become the more natural “Although.” This is a product editing
preference, not a claim that every finite use of “albeit” is ungrammatical.

Fidelity takes priority over word count: keep facts, causal relationships, tense
and aspect, negation, attribution, scope, quantities, degree, uncertainty, contrast,
technical terms, and deliberate emphasis. “Entire team's overall productivity”
expresses both whose productivity and aggregate productivity; compression should
preserve both. Already correct, clear, concise text should stay unchanged, without
equal-value synonym swaps. The final review should finish the useful compression
and repair remaining errors in one pass. These are model instructions, not a
proof of semantic equivalence. Suggestions remain user-controlled.

## Testing and evaluation

Tests use Vitest, jsdom, React Testing Library, and jest-dom, with automatic DOM
cleanup between tests. Shared setup is in
[`src/test/setup.ts`](../src/test/setup.ts). Pure-state tests can select Node with
a `// @vitest-environment node` file comment. jsdom stays on the 26.x line to
support the validated Node version.

Current tests cover pure document transitions, sentence segmentation and
completion, sentence IDs/versioning/reconciliation, result retention/invalidation,
debounced sequential queue behavior with a mocked checker, and editor/inspector
component wiring. HTTP tests mock fetch and cover the request prompt/payload,
configuration, clean/suggestion classification, invalid/truncated responses,
HTTP/network errors, invalid JSON, timeout, and cancellation. Editor integration
tests mock fetch with fake timers and deferred responses to cover duplicate
occurrences, incomplete text, shifted offsets, sequential execution, queued version
replacement, edited/deleted stale results, failure continuation, and Strict Mode
cleanup. Retry tests cover independent duplicate failures, repeated failure and
recovery, FIFO ordering, active-request and debounce constraints, stale retry
captures, failure invalidation, and preservation of canonical text. None of these
tests needs a running model. Review tests cover independent duplicate selection,
whitespace/Unicode preservation, offset shifts, selection invalidation after edits,
deletion, splits/merges or result removal, closing and focus restoration, and
integration with cached model responses without rewriting the editor. Refinement
tests cover multi-pass convergence, original/candidate cycles, exhaustion of the
pass budget, convergence at the limit, failure propagation, cancellation, queue
blocking until convergence, stale results, and retry after a cycle.
Suggestion-action tests cover guarded and repeated actions, duplicates, explicit
replacement ranges, offset shifts, whitespace and Unicode preservation, split
replacement text, per-version rejection, focus restoration, and actions during
active inference without concurrent requests.

Use [`tests.txt`](../tests.txt) for separate manual model evaluation. Multiple
meaning-preserving edits may be valid; [`output.txt`](../output.txt) is historical
model output and performance information, not an exact-output oracle or a
benchmark of the planned server setup. [`TODO.md`](../TODO.md) tracks the remaining
implementation work; [`AGENTS.md`](../AGENTS.md) records architecture constraints
and guidance for coding agents.

### Output-contract and stability evaluation

[`scripts/evaluate-model.mjs`](../scripts/evaluate-model.mjs) reads `prompt.txt`
and `tests.txt`, adds the long sentences reported during manual testing, the
meeting sentence and two corrected variants, and semantic-preservation cases
(37 inputs total). The latter cover tense, qualifiers, negation, attribution,
scope, uncertainty, and numerical precision. It sends each input and then its
candidate outputs to Ollama sequentially until unchanged, a cycle, or five passes.
It prints JSON lines containing all raw response envelopes (`passes`), an `outcome`
of `stable`, `cycle`, `limit`, or `invalid`, and whitespace-delimited word counts
for the input and stable result (`null` without a stable result). Transport errors
include the partial trace. These
support manual review; the script does not change editor state or use `output.txt`
as an oracle.
Run `OLLAMA_MODEL=qwen3.5:9b npm run evaluate:model` on Linux/macOS; in PowerShell,
set `$env:OLLAMA_MODEL = 'qwen3.5:9b'` then run `npm run evaluate:model`.
`OLLAMA_SERVER_URL` optionally overrides `http://127.0.0.1:11434`; the default
model is the target Gemma tag. These script settings are separate from Vite's env
files. Stability and word count do not validate meaning, formatting, or grammar.
Review each original/candidate pair for useful compression, complete corrections,
and preservation of the facts and qualifiers above. Stable but unchanged bloated
prose is a missed opportunity; a shorter result that loses meaning is a bad edit.
Refinement can converge after several useful compressions. It is a consistency
guard, not a semantic judge; it can exhaust the budget on usable text or accept a
stable semantic error. The script checks completed, nonempty responses and leaves
full output-contract and meaning assessment to manual review.

The runs below record prompt development. The latest contract encourages
meaning-preserving compression; the earlier minimal-edit restrictions are historical.

Before tightening the prompt's anti-rewriting rules, local evaluation on
2026-10-17 with `qwen3.5:9b`, thinking disabled, temperature 0,
and a 2048-token limit: all 26 cases returned completed, plain-text responses on
both passes; 20 candidates were unchanged on verification and 6 were revised again.
The unstable cases were `tests.txt` samples 6, 9, 11, 13, and 20, plus the long
prerequisites sentence. Examples included unnecessary substitutions of “wrong”
with “incorrect,” “several” with “multiple,” and “a lot of confusion” with
“significant confusion.” The then-current two-pass guard rejected those candidates.
No commentary appeared in this run; this does not prove
the model always follows the output-only contract.

That run also exposed quality issues even for stable responses: the long
“Irregardless…” input only lost “about” after “discussing,” retaining its other
clutter; the otherwise valid “somewhat unconventional” sample lost “somewhat” and
“nevertheless,” reducing nuance. The target Gemma model has not been evaluated
here. An unchanged second pass is a consistency check, not a guarantee that an
edit is correct or conservative.

After tightening the anti-rewriting rules on 2026-10-17, the expanded evaluation
ran with local Ollama 0.18.2 and the same model/settings. All 31 cases returned
completed plain-text responses on both passes. Stability improved from 20/26 to
24/26 on the original inputs, and was 28/31 across the expanded set. The two
corrected meeting variants stayed unchanged; the original meeting sentence kept
“has given” and its relative clause instead of changing tense or shortening to
“each participant.” The independent workshop and measurement examples also kept
their tense, clauses, and qualifiers. All eight valid-prose inputs at the end of
`tests.txt` were returned unchanged on both passes.

Three inputs still failed stability: sample 6 continued swapping “wrong” for
“incorrect”; the prerequisites sentence shortened phrases on verification; and
the original meeting sentence removed “each and every” on the first pass, then
removed “different” from “their own different opinion” on the second. The then-current
two-pass guard withheld these candidates. That prompt reduced rewriting, but did not
eliminate incremental edits or establish that a stable response was error-free.

With meaning-preserving compression enabled and refinement allowed up to five
passes, a subsequent 2026-10-17 run with the same local model/settings converged
on 36/37 inputs. Seven were unchanged on the first pass; 15 converged on pass two,
10 on pass three, three on pass four, and one on pass five. The deployment/config
sentence (`tests.txt` sample 13) repeated an earlier wording on pass four and was
classified as a cycle. No input exhausted the limit or returned an incomplete
envelope in this run.

The researcher sentence shortened from 40 to 26 whitespace-delimited words and
converged on pass two, retaining “ultimately” and “the entire team's overall
productivity.” The software-update example converged on pass four, from 47 to
20 words. These demonstrate useful structural compression and multi-pass completion,
not proof that every change was faithful.

Manual review still found semantic drift: “is designed to process” became a claim
that software actually processes data; “decided to postpone” became “postponed”;
some present-perfect/progressive forms became simple tense; “somewhat” disappeared
from the unconventional-implementation example; and the workshop example lost
the explicit employee role. The software-update result also changed “has reported”
and “is causing” to simple-present wording. The instructions ask to preserve these
distinctions, but this Qwen run did not consistently comply. Convergence is therefore
a bounded completion rule, not an automated semantic-fidelity check.
