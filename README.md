# Typewriter

A local-first grammar editor: write in a React editor, check completed sentences
with a local language model, and accept or reject suggested corrections.

## Current status

This repository currently contains prompt and evaluation material. The editor,
sentence-state cache, request queue, and server integration are **planned, not
implemented**. There are no frontend install, development, or test commands yet.

| File | Purpose |
| --- | --- |
| `prompt.txt` | Conservative copy-editing instructions for the model |
| `tests.txt` | Sample sentences with errors, verbal clutter, and valid prose |
| `output.txt` | Historical model output and run statistics, not a golden test fixture |
| `AGENTS.md` | Architecture constraints and guidance for coding agents |

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

- Segment with `Intl.Segmenter("en", { granularity: "sentence" })`.
- Schedule completed sentences after approximately **400 ms** without an edit.
- Keep only the latest pending version of each sentence.
- Process checks sequentially: **concurrency = 1**.

Segmentation is not completion detection. `Intl.Segmenter` returns unfinished
trailing text too, and abbreviations can still be ambiguous. V1 needs an explicit
completion policy instead of sending every segment or firing on every period.

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
