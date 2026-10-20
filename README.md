# Typewriter

Typewriter is a plain-text writing editor that runs on your own computer. As you
write, a local language model (through [Ollama](https://ollama.com)) reads each
finished sentence and suggests a corrected or tighter version that keeps your
meaning. Nothing changes until you accept a suggestion.

## What works today

- **Writing and drafts.** Type or paste into a single editor. Your text is kept
  exactly as written, spaces and line breaks included. Each browser tab has its
  own draft, saved in the browser every three minutes and whenever you leave or
  reload the page. The bar beside the title shows when the draft was last saved,
  or **Not saved** if the browser refused to store it. **Open** lets you switch to,
  or delete, any other saved draft that no open tab is using.
- **Suggestions.** When you finish a sentence (end it with `.`, `?` or `!`), it is
  sent to the model a moment after you stop typing, one sentence at a time.
  Sentences with a suggestion are highlighted. Click one, or put the cursor in it
  and press **Alt+Enter**, to compare the original with the suggestion and
  **Accept** or **Reject** it. Accepting is an ordinary edit you can undo. A
  rejected suggestion stays dismissed for that sentence, even after a reload,
  until you edit the sentence.
- **Errors.** If a check fails (for example, Ollama isn't running), the sentence
  gets an amber wavy underline. Open it to read the error and press **Retry**.
  Editing never waits for the model.

## Quickstart

You need Node.js 22.12 or later on the 22.x line, 24.x, or 26+, with npm. The project
was tested with Node 22.14.0 and npm 11.6.2.

```sh
npm install
npm run dev
```

Open the address Vite prints, normally `http://localhost:5173`. You can write
without a model server; suggestions need the setup below. In development, a
**Debug state** panel under the editor shows what the app is tracking for each
sentence.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app for everyday use or development |
| `npm run build` | Type-check everything and build the app into `dist/` |
| `npm run preview` | Serve the built app (run `npm run build` first) |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Rerun tests as files change |
| `npm run evaluate:model` | Measure a model on the 37 original test sentences; add `EVALUATION_SUITE=editing-v1` for the 60-case benchmark |
| `npm run evaluate:summarize -- <run.jsonl>` | Summarize an evaluation run |

## Model server setup

1. Install [Ollama](https://ollama.com/download): the installer on Linux, or the
   desktop app on macOS and Windows. Start the service (Linux) or open the app. It
   listens on `http://127.0.0.1:11434`. Keep it on this local address.
2. Download the default model, Gemma 4 E4B (about 6.6 GB; models are not part of
   this repository):

   ```sh
   ollama pull gemma4:e4b
   ```
3. Optional: to use another model or server, copy [`.env.example`](.env.example) to
   `.env.local` and edit `VITE_OLLAMA_MODEL` or `VITE_OLLAMA_SERVER_URL` (the
   server address, **without** `/v1`). Restart `npm run dev` afterwards, or rebuild
   for `npm run preview`. These values end up in the page, so never put passwords
   in them. Every finished sentence is sent to the server you configure.

With `npm run dev`, the app reaches Ollama through Vite, so no extra setup is
needed. The built app (`npm run preview`) talks to Ollama directly, so Ollama must
allow the page's address; see [Ollama's CORS setting](docs/architecture.md#model-settings-and-the-development-proxy).

Gemma 4 E4B became the default because it did best in the
[60-case comparison](docs/editing-v1-evaluation.md). It still changes the meaning
of some sentences, so read each suggestion before accepting it. Checking in the
browser has been tested on Linux only, with the previous default model; Gemma 4
E4B has so far been measured with the evaluation tool, not yet used in the browser.

## Current architecture

```text
Editor (CodeMirror)          your text is the single source of truth
  ├── Drafts                 one saved draft per tab, in browser storage
  └── Sentence tracker       splits text into sentences, gives each an ID and version
        └── Queue            waits 400 ms after typing, checks one sentence at a time
              └── Ollama     returns a corrected sentence, or the same one if it's fine
        ← results are applied only if the sentence hasn't changed since it was sent
```

The model never edits your text directly. A suggestion is stored next to the
sentence it belongs to, and it is thrown away as soon as you change that sentence.

## Further reading

- [How Typewriter works](docs/architecture.md): every module, how drafts are
  stored, and how the tests are organized.
- [First model comparison](docs/evaluation.md) (37 sentences, three models) and its
  [per-sentence review](docs/evaluation-results.md).
- [Second model comparison](docs/editing-v1-evaluation.md) (60 cases, four models),
  its [per-case review](docs/editing-v1-results.md), and the
  [benchmark rubric](benchmarks/editing-v1/rubric.md).
- [`TODO.md`](TODO.md): planned work.
- [`LICENSE`](LICENSE): Typewriter is open source under the MIT License.
