# Typewriter

A local-first grammar editor: write in a React editor, check completed sentences
with a local language model, and accept or reject suggested corrections.

## Current status

The React + TypeScript + Vite scaffold, test tooling, plain-text editor, sentence
segmentation, and versioned sentence-occurrence reconciliation are implemented.
Canonical document text and edit ranges live in a pure state module; the editor
derives sentence records on each update. Checking-result caching, the request
queue, and server integration are **planned, not implemented**.

Write or paste into the editor; drafts live only in the current page session and
are lost on reload. No text is sent to a model server yet.

| File | Purpose |
| --- | --- |
| `prompt.txt` | Conservative copy-editing instructions for the model |
| `tests.txt` | Sample sentences with errors, verbal clutter, and valid prose |
| `output.txt` | Historical model output and run statistics, not a golden test fixture |
| `AGENTS.md` | Architecture constraints and guidance for coding agents |

## Frontend development

Use Node.js **22.12+ on the 22.x line, 24.x, or 26+**, with npm. The scaffold was
validated with Node 22.14.0 and npm 11.6.2. No model server is needed to run it.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check application, tests, and configuration; build into `dist/` |
| `npm run preview` | Serve the production build locally after building |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

Tests use Vitest, jsdom, React Testing Library, and jest-dom, with automatic DOM
cleanup between tests. Pure-state tests can select Node with a
`// @vitest-environment node` file comment. jsdom stays on the 26.x line to support
the validated Node version. Current tests cover pure document transitions,
sentence segmentation and completion, sentence IDs/versioning/reconciliation,
and editor component wiring; future inference tests should mock the server.

Application code lives in `src/`; shared test setup is in `src/test/setup.ts`.
There is no inference client or development proxy yet.

### Canonical document state (implemented)

`src/document/document.ts` has no React or DOM dependencies. `createDocument`
initializes `{ text, edit: null }`; `updateDocument(previous, text)` returns the
new canonical text and one contiguous replacement:

```ts
{ start: number, end: number, insertedText: string }
```

`[start, end)` addresses the **previous** text in JavaScript UTF-16 code units,
not Unicode code points. Applying that replacement reconstructs the new text.
Unchanged input returns `edit: null`. Transitions do not mutate previous state,
trim whitespace, or normalize Unicode; ranges avoid splitting intact surrogate
pairs. The controlled textarea uses these transitions for every change.

The range is inferred from the common prefix and suffix of two snapshots, not
from a browser edit operation. Equivalent edits within repeated text can be
ambiguous; multiple changed portions are enclosed in a single replacement.
Only the latest transition is retained, not an edit history. The sentence-state
module uses this transition for reconciliation, as described below.

### Sentence segmentation (implemented)

`src/document/segmentation.ts` is independent of React and the DOM. It requires
native `Intl.Segmenter` support (no punctuation-only fallback) and uses
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

### Sentence occurrence reconciliation (implemented)

`src/document/sentences.ts` is also independent of React and the DOM.
`createSentenceDocument(text)` initializes canonical document state and derived
sentence records; `updateSentenceDocument(previous, text)` updates both in one
pure transition. The textarea uses these functions for every change. State has
`document`, `sentences`, and a session-local `nextSentenceId` counter. Each record
contains the segment's `start`, `end`, `text`, and `complete` fields plus:

```ts
{ id: string, version: number, status: 'idle' }
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
by sentence strings. It currently stores only idle records: clean-result caching,
suggestions, rejection state, and scheduling remain separate TODOs.

## Planned architecture

```text
React editor
  ├── canonical document text
  └── versioned sentence-state cache
        ├── clean records
        ├── pending sentence IDs
        ├── one active check
        └── suggestions → highlights → accept / reject
                          │
                          ▼
                    local HTTP API
                          │
                          ▼
                     llama-server
                          │
                          ▼
                 Gemma 2 9B Q4_K_M
```

The intended frontend stack is **React + TypeScript + Vite**. Inference runs in
`llama-server`; v1 needs no Python service, database, Redis, or worker system.

### Canonical text and sentence records

The editor text is the source of truth. A separate cache tracks each sentence
occurrence using a record shaped like:

```ts
type SentenceState = {
  id: string
  start: number
  end: number
  text: string
  version: number
  status: "idle" | "queued" | "checking" | "clean" | "suggestion"
  suggestion?: string
  dismissed?: boolean
}
```

Sentence text is **not** its identity: `It worked. It worked.` contains two
independent occurrences. Editing one sentence must not invalidate another merely
because its offsets move. Reconciliation must also handle splits and merges.

Clean records remain cached during the document session so unchanged sentences
are not checked again after unrelated edits. The queue is separate and transient.

### Segmentation and scheduling

- Use the implemented segmentation and completion policy described above.
- Schedule completed sentences after approximately **400 ms** without an edit.
- Keep only the latest pending version of each sentence.
- Process checks sequentially: **concurrency = 1**.

Segmentation is not completion detection. The implemented module retains
unfinished segments with `complete: false`; future scheduling must use that flag
instead of sending every segment or firing on every period.

### Checking and stale responses

For each request, capture the sentence ID, version, and input text. Send the
sentence with the instruction in `prompt.txt` and request only corrected text.

When the response arrives:

1. Discard it if the sentence was deleted or its version/input changed.
2. If the returned text matches the input, mark the record clean.
3. Otherwise, store a suggestion and highlight the sentence.

Preserve surrounding document whitespace independently of the model request.
Server failures or unusable responses should offer a retry, not mark the sentence
clean.

### Reviewing suggestions

Click a highlighted sentence to see its original and proposed text.

- **Accept:** verify the current version, replace only its current range, and
  reconcile the updated document.
- **Reject:** dismiss the suggestion for that version. An edit makes the sentence
  eligible for checking again.

Start with whole-sentence highlights. A later enhancement can compute word-level
diffs locally. The model should not produce character offsets or edit metadata.

## Local model server

The target model is a **Gemma 2 9B Q4_K_M GGUF** served by `llama.cpp`.
Model weights and the server binary are not included in this repository.

Once `llama-server` is installed and a compatible model is available, a basic
launch command is:

```sh
llama-server \
  -m /path/to/gemma-2-9b-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8080
```

Adjust hardware-specific flags for your machine. The planned client will use the
server's chat-completions API at `/v1/chat/completions`, with a development proxy
to avoid browser CORS configuration. Keep the inference server bound to loopback
unless you deliberately configure secure remote access.

## Editing policy

`prompt.txt` asks the model to correct spelling, grammar, punctuation, and
objectively incorrect word usage with minimal changes. It also permits removing
obvious verbal clutter when meaning and nuance are preserved.

The goal is conservative copy editing, not stylistic rewriting. Correct, clear
sentences should be returned unchanged; suggestions always require user approval.

## Implementation milestones

1. Build the plain-text editor and sentence segmentation.
2. Add stable sentence identities, versioning, and reconciliation tests.
3. Add debounced scheduling and the sequential inference queue.
4. Integrate `llama-server` and handle stale responses and failures.
5. Add sentence highlights and accept/reject interactions.
6. Evaluate behavior against `tests.txt` before considering word-level diffs.

Tests should cover duplicate sentences, shifted offsets, splits/merges, unfinished
text, stale responses, queued-version replacement, suggestion actions, and server
failures. Mock inference in unit tests; use the local model for separate manual
evaluation. Historical timings in `output.txt` do not establish performance for
the planned server configuration.
