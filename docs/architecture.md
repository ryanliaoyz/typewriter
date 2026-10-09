# Architecture and module details

[Back to the README](../README.md)

Typewriter uses React + TypeScript + Vite. The editor, segmentation,
reconciliation, result cache, and sequential queue are implemented. The queue is
not wired into the editor; HTTP integration, response validation, error/retry UI,
highlighting, and accept/reject actions remain planned.

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
{ id: string, version: number, status: 'idle' | 'clean' | 'suggestion' }
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

The editor does not produce checks or cached results yet. Future inference code
must validate and classify successful responses before caching them; failures
are not clean results. End-to-end stale-response handling remains part of that
integration.

## Debounced sequential queue

[`src/checking/queue.ts`](../src/checking/queue.ts) is independent of React and
HTTP. Create one queue per document session with
`createSentenceQueue({ check, onResult, onError })`. The injected `check` receives
only `{ id, version, text }` and returns a promise of an already classified
`SentenceCheckResult`. No fake checker is installed in the editor and no server
requests are made yet.

- Feed every document or cache transition to `queue.update(state)`. Only complete,
  unchecked (`idle`) records are eligible; clean and suggestion records are skipped.
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
  historical versions; an edit permits a new attempt. Explicit retry/error UI is
  a later TODO.
- `getSnapshot()` exposes pending captures, the active capture, and whether the
  debounce timer is running. `dispose()` cancels the timer, clears pending work,
  and suppresses callbacks and further scheduling. It does not cancel an active
  checker; the active slot remains until settlement.

Unit tests use fake timers and deferred promises, not a running model. HTTP client
integration, editor wiring, response validation, and error/retry actions remain
separate work. Queue activity is not stored as `queued` or `checking` statuses in
the current sentence records.

## Editor and development inspector

[`src/App.tsx`](../src/App.tsx) owns the sentence-document state and renders a
controlled textarea. Drafts live only in the current page session. No persistence
or network requests are implemented.

With `npm run dev`, expand **Debug state** below the editor to inspect the same
live state used by the textarea. [`src/DebugInspector.tsx`](../src/DebugInspector.tsx)
shows document length in UTF-16 units, sentence/completion counts, and each
sentence's ID, version, current end-exclusive range, JSON-escaped text, completion
flag, and status. Normal editor use produces only `idle` records because checking
is not wired up. The panel also supports cached `clean` and `suggestion` states;
suggestions appear in raw JSON. Completion means eligible for scheduling, not a
grammar-check result.

The latest inferred edit references the **previous** document's range; it is not
an edit history. Expand **Raw state JSON** to see the entire state, including
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

## Planned model integration and suggestion review

```text
Editor sentence state → sequential queue → HTTP client → Ollama
                                                        └── configured model
        ↑                                    │
        └── version-checked result cache ←───┘
              └── highlights → accept / reject
```

The HTTP client and development proxy are not implemented. V1 will use Ollama
directly on Linux, macOS, and Windows, without a Python service, database, Redis,
or worker system. See the [model server setup](../README.md#model-server-setup)
for the planned runtime and setup status.

The planned client will use Ollama's OpenAI-compatible `/v1/chat/completions`
endpoint, with a configurable server URL and model name. Ollama's default local
address is `http://127.0.0.1:11434`; a development proxy will forward browser
requests to it. Keep the HTTP client separate from the editor and queue, and do
not couple them to Ollama-specific model-management APIs. Runtime installation
and hardware acceleration differ across platforms; cross-platform support does
not promise identical performance.

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
3. Otherwise, store a suggestion and highlight the sentence.

Server failures or unusable responses should offer a retry, not mark the sentence
clean. Clicking a highlighted sentence will show its original and proposed text:

- **Accept:** verify the current version, replace only its current range, and
  reconcile the updated document.
- **Reject:** dismiss the suggestion for that version. An edit makes the sentence
  eligible for checking again.

Start with whole-sentence highlights. A later enhancement can compute word-level
diffs locally. The model should not produce character offsets or edit metadata.
Model responses must never silently replace canonical editor text.

`prompt.txt` asks the model to correct spelling, grammar, punctuation, and
objectively incorrect word usage with minimal changes. It also permits removing
obvious verbal clutter when meaning and nuance are preserved. The goal is
conservative copy editing, not stylistic rewriting. Correct, clear sentences
should be returned unchanged; suggestions always require user approval.

## Testing and evaluation

Tests use Vitest, jsdom, React Testing Library, and jest-dom, with automatic DOM
cleanup between tests. Shared setup is in
[`src/test/setup.ts`](../src/test/setup.ts). Pure-state tests can select Node with
a `// @vitest-environment node` file comment. jsdom stays on the 26.x line to
support the validated Node version.

Current tests cover pure document transitions, sentence segmentation and
completion, sentence IDs/versioning/reconciliation, result retention/invalidation,
debounced sequential queue behavior with a mocked checker, and editor/inspector
component wiring. Future HTTP tests should mock the server. Prioritize stale
responses, deletion during inference, suggestion actions after edits, server
failures, unusable responses, and retries as integration is implemented.

Use [`tests.txt`](../tests.txt) for separate manual model evaluation. Multiple
conservative corrections may be valid; [`output.txt`](../output.txt) is historical
model output and performance information, not an exact-output oracle or a
benchmark of the planned server setup. [`TODO.md`](../TODO.md) tracks the remaining
implementation work; [`AGENTS.md`](../AGENTS.md) records architecture constraints
and guidance for coding agents.
