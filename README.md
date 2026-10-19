# Typewriter

A local-first writing editor in development, built with React, TypeScript, and
Vite. The goal is to offer grammar corrections and concise rewrites that preserve
meaning, with user-controlled acceptance or rejection.

## What works today

- Write or paste plain text into a CodeMirror editor. Canonical text and whitespace
  are preserved. Changed drafts autosave locally every three minutes, even while
  typing, and on page hide/reload. Each tab keeps a separate draft; reloading a tab
  restores its draft, including deletions. Navigation beside the title shows the last
  save time and configured model; **Open** switches to another saved draft that no open tab is using.
- Sentences are segmented with `Intl.Segmenter` and tracked by occurrence ID and
  version. Edits reconcile their ranges and invalidate changed results; a
  development-only **Debug state** inspector exposes the live state.
- Completed sentences go through a 400 ms debounced, sequential queue to Ollama
  using `prompt.txt`. Candidates are refined until unchanged, within five passes,
  before appearing as highlights directly in the editor. Click a highlight or press
  **Alt+Enter** with the caret in it to compare and accept/reject in a nearby card;
  **Escape** closes it. Accept replaces only that sentence as an undoable edit;
  reject suppresses that version until edited. Both work in development and production.
  Failed checks have amber wavy underlines; click or press **Alt+Enter** to see
  the error and **Retry** in development or production. Raw response diagnostics
  remain available through **Show response** in development **Debug state**.

## Quickstart

Use Node.js **22.12+ on the 22.x line, 24.x, or 26+**, with npm. The project was
validated with Node 22.14.0 and npm 11.6.2. Editing works without a model server;
checking requires the setup below.

```sh
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Write in the
editor and expand **Debug state** to inspect sentence IDs, versions, and ranges.
The inspector is absent from production builds.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check application, tests, and configuration; build into `dist/` |
| `npm run preview` | Serve the production build locally after building |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run evaluate:model` | Evaluate the default 37-case suite; select the 60-case benchmark with `EVALUATION_SUITE=editing-v1` |
| `npm run evaluate:summarize -- <run.jsonl>` | Summarize a complete evaluation run |

## Model server setup

1. Install **[Ollama](https://ollama.com/download)** separately: use its Linux
   installer or the macOS/Windows application. Start the Linux service or open the
   application; the default server is `http://127.0.0.1:11434`. Keep it on loopback.
2. Obtain the target model (about 5.8 GB; weights are not included here):

   ```sh
   ollama pull gemma2:9b-instruct-q4_K_M
   ```
3. Optionally copy [`.env.example`](.env.example) to `.env.local` and set
   `VITE_OLLAMA_MODEL` and `VITE_OLLAMA_SERVER_URL` (server base URL, **without `/v1`**).
   Restart Vite after changes; rebuild for production. These are public settings,
   not credentials. Completed sentence text is sent to the configured server.

Development forwards `/ollama/v1/chat/completions` through Vite, avoiding browser
CORS setup. Production and preview connect directly: Ollama must allow the page's
origin via `OLLAMA_ORIGINS` if it is not already allowed. HTTPS pages need an HTTPS
server. See [configuration and platform notes](docs/architecture.md#model-configuration-and-development-proxy).

Linux live Gemma checking was validated through the development proxy and direct
preview connection, including accept/undo/reject and loopback CORS. A
[37-case comparison](docs/evaluation.md) of Gemma 2 9B, Qwen 3.5 9B, and Qwen 3 8B
found meaning-changing suggestions in all three; convergence is not a quality
guarantee. macOS/Windows integration remains unvalidated; `llama-server` is deferred.

## Current architecture

```text
React + CodeMirror plain-text editor / inline suggestion card
  └── canonical document text + exact editor edit ranges
        ├── per-tab localStorage draft ↔ restore / autosave / page-hide flush / Open list
        └── Intl.Segmenter + occurrence reconciliation
              └── versioned sentence records / result cache
                    └── 400 ms debounce → FIFO queue → HTTP client → Ollama
                          └── version-safe results → cache → suggestion review
```

Editor text is the source of truth. Sentence records are derived state with
UTF-16 ranges; duplicate sentences have independent identities. The cache retains
results only for unchanged occurrence versions, and pending queue work is separate
from cached results. Model responses must never silently replace editor text.

## Further reading

See [architecture and module details](docs/architecture.md) for data flow and
configuration, the [earlier comparison](docs/evaluation.md), and the
[new-model benchmark results](docs/editing-v1-evaluation.md). The
[60-case rubric](benchmarks/editing-v1/rubric.md) defines cases and scoring.
[`TODO.md`](TODO.md) tracks work.
