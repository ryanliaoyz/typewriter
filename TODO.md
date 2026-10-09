# V1 TODO

- [x] Scaffold React + TypeScript + Vite with test tooling.
- [x] Build a plain-text editor with canonical document state.
- [x] Add `Intl.Segmenter` segmentation and a sentence-completion policy.
- [x] Implement stable sentence IDs, versioning, and edit reconciliation.
- [ ] Retain clean records; invalidate results only when sentence text changes.
- [ ] Add a 400 ms debounce and a deduplicated queue with concurrency = 1.
- [ ] Integrate `llama-server` using `prompt.txt` and a development proxy.
- [ ] Discard stale responses; expose failures with a retry action.
- [ ] Highlight sentences with suggestions and show original/corrected text.
- [ ] Implement version-safe accept and per-version reject actions.
- [ ] Test duplicates, shifted offsets, splits/merges, stale responses, and queue behavior.
- [ ] Evaluate corrections with `tests.txt` and document runnable setup commands.

## Later

- [ ] Add deterministic word-level diffs and finer highlights.
