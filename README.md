# Typewriter

A local-first grammar editor in development, built with React, TypeScript, and
Vite. The goal is to check completed sentences with a local model and let you
accept or reject conservative corrections.

## What works today

- Write or paste plain text into a controlled editor. Canonical text and whitespace
  are preserved; drafts live in the current page session and are lost on reload.
- Sentences are segmented with `Intl.Segmenter` and tracked by occurrence ID and
  version. Edits reconcile their ranges and invalidate changed results; a
  development-only **Debug state** inspector exposes the live state.
- Completed sentences go through a 400 ms debounced, sequential queue to Ollama
  using `prompt.txt`. Results are cached without rewriting text; development JSON
  shows suggestions. Failures stay unchecked and have per-sentence Retry buttons;
  suggestion review controls are not available yet.

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

## Model server setup

1. Install **[Ollama](https://ollama.com/download)** separately: use its Linux
   installer or the macOS/Windows application. Start the Linux service or open the
   application; the default server is `http://127.0.0.1:11434`. Keep it on loopback.
2. Use Ollama's pull command with the tag
   **[`gemma2:9b-instruct-q4_K_M`](https://ollama.com/library/gemma2:9b-instruct-q4_K_M)**
   to obtain the target model (about 5.8 GB). Weights are not included here.
3. Optionally copy [`.env.example`](.env.example) to `.env.local` and set
   `VITE_OLLAMA_MODEL` and `VITE_OLLAMA_SERVER_URL` (server base URL, **without `/v1`**).
   Restart Vite after changes; rebuild for production. These are public settings,
   not credentials. Completed sentence text is sent to the configured server.

Development forwards `/ollama/v1/chat/completions` through Vite, avoiding browser
CORS setup. Production and preview connect directly: Ollama must allow the page's
origin via `OLLAMA_ORIGINS` if it is not already allowed. HTTPS pages need an HTTPS
server. See [configuration and platform notes](docs/architecture.md#model-configuration-and-development-proxy).

Linux live API/proxy checking was validated with an already-installed `qwen3.5:9b`
model, and loopback preview CORS was checked. The target Gemma model's correction
quality and macOS/Windows integration remain unvalidated. `llama-server` is deferred.

## Current architecture

```text
React textarea
  └── canonical document text + inferred edit range
        └── Intl.Segmenter + occurrence reconciliation
              └── versioned sentence records / result cache
                    └── 400 ms debounce → FIFO queue → HTTP client → Ollama
                          └── version-safe results → cache / development inspector
```

Editor text is the source of truth. Sentence records are derived state with
UTF-16 ranges; duplicate sentences have independent identities. The cache retains
results only for unchanged occurrence versions, and pending queue work is separate
from cached results. Model responses must never silently replace editor text.

## Further reading

See [architecture and module details](docs/architecture.md) for data flow, testing,
configuration, and remaining work. [`TODO.md`](TODO.md) tracks implementation.
