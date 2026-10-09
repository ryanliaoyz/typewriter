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
- Pure-state result caching and a tested, 400 ms debounced queue support one check
  at a time. The queue is **not connected to the editor**: no model requests,
  grammar suggestions, or accept/reject controls are available yet.

## Quickstart

Use Node.js **22.12+ on the 22.x line, 24.x, or 26+**, with npm. The project was
validated with Node 22.14.0 and npm 11.6.2. No model server is needed to run it.

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

The target model is **Gemma 2 9B Q4_K_M GGUF**, served by `llama.cpp`.
Install `llama-server` and obtain compatible model weights separately; neither is
included in this repository. Then run:

```sh
llama-server \
  -m /path/to/gemma-2-9b-Q4_K_M.gguf \
  --host 127.0.0.1 \
  --port 8080
```

Replace the model path and adjust hardware-specific flags for your machine. Keep
the server bound to loopback unless you deliberately configure secure remote
access.

**Frontend integration is not implemented.** Starting the server does not enable
checking in the editor. The planned client will use `/v1/chat/completions`, the
instructions in [`prompt.txt`](prompt.txt), and a development proxy for browser
CORS. Responses will contain only corrected text, never model-generated offsets.

## Current architecture

```text
React textarea
  └── canonical document text + inferred edit range
        └── Intl.Segmenter + occurrence reconciliation
              └── versioned sentence records / result cache
                    └── development-only state inspector

Separate, tested module (not wired into the editor):
  sentence state → 400 ms debounce → FIFO queue → one injected checker
```

Editor text is the source of truth. Sentence records are derived state with
UTF-16 ranges; duplicate sentences have independent identities. The cache retains
results only for unchanged occurrence versions, and pending queue work is separate
from cached results. Model responses must never silently replace editor text.

The remaining integration will connect the queue to `llama-server`, validate
responses against current sentence versions, expose errors and retries, and add
user-controlled suggestions. V1 needs no Python service, database, Redis, or
worker system.

See [architecture and module details](docs/architecture.md) for APIs, completion
and reconciliation policies, queue behavior, testing, and planned integration.
[`TODO.md`](TODO.md) tracks implementation work. [`tests.txt`](tests.txt) contains
model-evaluation inputs; [`output.txt`](output.txt) is historical output, not an
exact-output test oracle or a benchmark of the planned server setup.
