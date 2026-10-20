# To do

## Version 1

Everything needed to start writing with Typewriter every day.

### Editor

- [x] Set up the project (React, TypeScript, Vite) with tests.
- [x] A plain-text editor that keeps your text exactly as typed.
- [x] Split text into sentences with the browser, and decide when a sentence is finished.
- [x] Give every sentence a lasting ID and a version that goes up when its words change, and keep them correct through edits.
- [x] A development-only Debug panel showing what the app tracks for each sentence.
- [x] One editor surface with inline highlights, a review card next to the sentence, and undoable accepts.
- [x] A simple, calm writing layout with comfortable type, spacing and colours.
- [x] No instruction text in the interface, while staying accessible.

### Checking with a model

- [x] A queue that waits 400 ms after typing and checks one sentence at a time, without duplicates.
- [x] Keep results for sentences that haven't changed; drop them when a sentence's words change.
- [x] Connect to Ollama on Linux, macOS and Windows, using `prompt.txt`, a configurable model and server, and a development proxy.
- [x] Ignore answers for sentences that changed while they were being checked.
- [x] Ask the model again until its answer stops changing (up to five rounds), and hold back answers that never settle.
- [x] Shorten wordy writing while keeping the full meaning.
- [x] Highlight suggestions and show the original next to the suggestion.
- [x] Accept and reject that only apply to the version you saw.
- [x] Show failed checks with an amber wavy underline and a Retry card, in development and in the built app.
- [x] Track a failed check as a `failed` status on the sentence; Retry simply sets it back to unchecked.
- [x] Use Gemma 4 E4B (`gemma4:e4b`) as the default model, and keep the model comparisons in `docs/`.

### Drafts

- [x] Save the draft every three minutes, even while typing, and when leaving or reloading the page; restore it when you come back.
- [x] Give each browser tab its own draft, so tabs never overwrite each other.
- [x] A bar next to the title with the last save time, the model, a Latency placeholder, and **Open** to switch to another saved draft.
- [x] Remember rejected suggestions across reloads and when reopening a draft.
- [x] Make drafts safe without Web Locks (plain `http` addresses), clean up and delete old drafts, and show **Not saved** when saving fails.

### Testing and measurement

- [x] Tests for duplicate sentences, moved text, splits and merges, stale answers, and the queue.
- [x] Measure models on the 37 sentences in `tests.txt` and document how to run it.
- [x] A 60-case benchmark with pairs of sentences that differ subtly in meaning.
- [x] Compare newly installed models on that benchmark and document the results.

### Documentation

- [x] Keep the README short and put module details in `docs/architecture.md`.
- [x] Document Ollama as the v1 model server; leave `llama-server` for later.
- [x] Rewrite the documentation in plain language.
- [x] Release the code under the MIT License.

## Later

- [ ] Show real numbers in the Latency slot.
- [ ] Support and test `llama-server` as an alternative to Ollama.
- [ ] Highlight the changed words, not just the whole sentence, using a local word-by-word comparison.
