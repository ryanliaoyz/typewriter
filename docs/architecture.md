# How Typewriter works

[Back to the README](../README.md)

This page explains how the app is put together, module by module. It is written
for someone who wants to understand or change the code, but it avoids assuming
you know React or TypeScript. Each module section says what the module is
responsible for, what goes in, what comes out, and which ground rules it upholds.

## The big picture

```text
You type in the editor
  │
  ▼
Editor session (useSentenceEditor) ── keeps the one true copy of your text
  │      │
  │      └──► Drafts (draft.ts) ── saves the text in browser storage
  ▼
Sentence tracker (sentences.ts) ── splits the text into sentences, each with an ID and version
  │
  ▼
Queue (queue.ts) ── waits 400 ms after the last edit, then checks one sentence at a time
  │
  ▼
Ollama client (ollama.ts) ── sends the sentence with prompt.txt, validates the answer
  │
  ▼
Back in the session ── keeps the answer only if that sentence hasn't changed meanwhile
  │
  ▼
Editor ── highlights the sentence; you accept or reject the suggestion
```

What happens when you write a sentence:

1. Every keystroke goes from the editor to the editor session, which updates the
   text and works out which sentences changed.
2. A sentence that changed gets a new **version**. Any old suggestion for it is
   dropped.
3. Once a sentence is **complete** (it ends with `.`, `?` or `!`), it joins the
   queue. The queue waits until you've paused for 400 ms and then sends one
   sentence at a time to Ollama.
4. The model answers. If the answer is the same as your sentence, the sentence is
   marked **clean**. If it's different, the model is asked to review its own
   answer again (up to five rounds) until it stops changing. The settled answer
   becomes a **suggestion**.
5. Before storing the answer, the session checks that the sentence still has the
   same ID, version and text as when it was sent. If you edited it in the
   meantime, the answer is thrown away and the new version is checked instead.
6. The editor highlights sentences with suggestions. You decide what happens to
   each one.

## Ground rules

These ten rules shape the whole design. The authoritative wording lives in the
project's agent guidance (`AGENTS.md`, kept locally and not committed); this is
a summary so the references below make sense.

1. **Your text is the source of truth.** Everything else (sentences, highlights,
   pending checks) is derived from it. A model answer never changes your text on
   its own.
2. **Sentences are tracked by position, not by wording.** Two identical sentences
   in different places are separate sentences.
3. **Edits are reconciled carefully.** A sentence that only moved keeps its
   identity and result; a sentence whose words changed loses its result.
   Inserting, deleting, splitting and merging sentences are all handled.
4. **Model work is versioned.** Each check remembers the sentence's ID, version
   and text. An answer is used only if all three still match.
5. **Results and pending work are kept apart.** Results live on the sentences;
   the queue only holds the latest unchecked version of each sentence.
6. **One model request at a time**, after a 400 ms pause in typing.
7. **The browser does the sentence splitting** (`Intl.Segmenter`). The rule for
   when a sentence counts as finished is our own and is kept separate.
8. **The model gets the sentence and the instructions, nothing else**, and returns
   only the corrected sentence. Any word-level comparison is done locally.
9. **You stay in control of every change.** Accepting checks that the sentence
   hasn't changed. Rejecting dismisses the suggestion for that version only.
10. **A failure is never treated as success.** Server errors and unusable answers
    are shown as failures, with a way to retry.

Text positions follow JavaScript strings (UTF-16 code units), and whitespace
around sentences is kept in the document but not sent to the model.

## Words used in this document

| Term | Meaning |
| --- | --- |
| **Document text** | Exactly what's in the editor, including every space and line break. |
| **Sentence record** | What the app knows about one sentence: where it is, its text, ID, version and status. |
| **ID** | A label such as `sentence-7` that stays with a sentence while you edit around it. IDs are never reused. |
| **Version** | Starts at 1 and goes up each time the sentence's words change. |
| **Complete** | The sentence ends with `.`, `?` or `!` (closing quotes or brackets allowed after it) and has at least one letter or digit. Only complete sentences are checked. |
| **Status** | `idle` (not checked yet), `clean` (the model had no change), `suggestion` (the model proposed a change), `rejected` (you dismissed the suggestion), or `failed` (the check went wrong). |
| **Check** | One trip to the model for one sentence version, which may include up to five rounds. |
| **Draft** | The saved copy of one tab's text plus which sentences you rejected. |

## Modules

### Document text

**File:** [`src/document/document.ts`](../src/document/document.ts)

**What it does.** Holds the document text and describes the latest change to it
as a single replacement: "characters `start` to `end` of the old text were
replaced with `insertedText`".

- **Takes in:** the previous text and the new text, or an exact replacement from
  the editor.
- **Gives back:** `{ text, edit }`, where `edit` is the replacement, or `null` if
  nothing changed.
- **Rules:** 1.

When only two snapshots of the text are available, the replacement is guessed from
the longest shared beginning and end. That guess can be ambiguous when text repeats,
so the editor always supplies the exact replacement instead. Text is never trimmed
or normalized, and positions never split an emoji or other two-unit character.

### Sentence splitting

**File:** [`src/document/segmentation.ts`](../src/document/segmentation.ts)

**What it does.** Splits text into sentences with the browser's built-in
`Intl.Segmenter` (English, sentence mode) and decides whether each one is finished.

- **Takes in:** the document text.
- **Gives back:** a list of `{ start, end, text, complete }`, one per sentence.
- **Rules:** 2, 7.

Whitespace around a sentence isn't part of it, and whitespace-only pieces are
skipped. A sentence is **complete** when it ends with `.`, `?` or `!`, optionally
followed by closing quotes or brackets, and contains a letter or digit. Trailing
ellipses (`..`, `...`, `…`) don't count as an ending. The browser's splitting
isn't perfect: some browsers split after abbreviations such as `Dr.`, and results
can vary between browser versions. This is tuned for English prose.

### Sentence records

**File:** [`src/document/sentences.ts`](../src/document/sentences.ts)

**What it does.** Keeps a record for every sentence and updates the records after
each edit. It is also where model results, accepts, rejects and failures are
applied. Every function here returns new state and leaves the old state untouched.

- **Takes in:** the current state plus an edit, a model result, or one of your
  actions.
- **Gives back:** the new state: the document, the sentence records, and a counter
  for the next ID.
- **Rules:** 1–6, 9, 10.

**After an edit**, the module re-splits the whole text and matches the new sentences
to the old ones:

- Sentences before and after the edited area keep their ID, version and result,
  even if their position moved.
- If only whitespace between sentences changed, every sentence keeps everything.
- A sentence edited in place keeps its ID and gets a new version. Its result is
  cleared and its status goes back to `idle`. Changing it back to the old wording
  still counts as a change.
- New sentences get new IDs; deleted sentences' IDs are retired. Splitting,
  merging, or an edit too tangled to match one-to-one gives the affected sentences
  fresh IDs.
- Sentences are never matched just because their wording is the same, so
  inserting a duplicate sentence never steals another sentence's identity.

**Statuses and how they change:**

| Function | Changes | Notes |
| --- | --- | --- |
| `cacheSentenceResult` | `idle` → `clean` or `suggestion` | Ignored if the ID, version or text no longer match. |
| `acceptSentenceSuggestion` | replaces the sentence's text | Uses the sentence's current position, so surrounding spaces stay. The result is checked again like any edit. |
| `rejectSentenceSuggestion` | `suggestion` → `rejected` | The text doesn't change. Survives moves and whitespace changes; editing the words clears it. |
| `markSentenceFailed` | `idle` → `failed` | Kept while the sentence only moves; editing the words returns it to `idle`. |
| `retrySentenceCheck` | `failed` → `idle` | The queue then checks it again. |

Accept and reject also confirm that the suggestion is still on screen as shown,
so a stale click does nothing.

**Saving and restoring:** `rejectedOccurrences` lists the rejected sentences
(position and text) for the draft. `restoreSentenceDocument` rebuilds the records
from saved text and marks a sentence rejected only if its position and text match
exactly. Failures and suggestions aren't saved; after a reload those sentences are
simply checked again.

### Drafts

**File:** [`src/document/draft.ts`](../src/document/draft.ts)

**What it does.** Saves each tab's draft in the browser, restores it on reload,
and lists, opens and deletes other drafts.

- **Takes in:** a function that reads the current text and rejected sentences,
  and a callback for save status.
- **Gives back:** a draft session with `stop`, `list`, `open` and `remove`, plus
  `readDraft()` for the initial text and `readDraftSavedAt()` for the last save
  time.
- **Rules:** 1, 2, 9.

**When it saves.** Every three minutes (typing doesn't reset the timer), when the
tab is hidden, when the page is left or reloaded, and when the editor closes. It
only writes when the text or the rejected sentences changed, and an empty
document is saved as an empty draft rather than ignored. If the browser crashes
before any of these moments, up to three minutes of typing can be lost; that's a
deliberate trade-off. If storage refuses the write (for example, it's full), the
change stays pending, the bar shows **Not saved**, and the next save tries again.

**What's stored.** Everything is in `localStorage` for this browser profile and
this exact address (including the port):

| Key | Contents |
| --- | --- |
| `typewriter:snapshot:<tab ID>` | The draft: `{ schema: 1, text, rejected }`, written in one go. |
| `typewriter:saved:<tab ID>` | Time of the last successful save. |
| `typewriter:preview:<tab ID>` | First non-blank line, shortened to 60 characters, for the Open list. |
| `typewriter:lease:<tab ID>` | "This draft is open in a page", used only where Web Locks aren't available (see below). |
| `typewriter:draft:<tab ID>` | Older text-only format, still read; replaced by a snapshot on the next save. |
| `typewriter:draft` | The single draft from before drafts were per tab (see below). |

The tab ID itself lives in `sessionStorage` (`typewriter:tab`), which survives
reloading a tab but not opening a new one. So **each tab is its own draft**: reload
and you get your text back; a new tab starts empty. If `sessionStorage` isn't
available, the ID lasts until the page is closed.

**Two pages on one draft.** Duplicating a tab copies its `sessionStorage`, so the
copy would start with the same tab ID and the two would overwrite each other. To
prevent this, each page claims its draft ID while it's open. A page that finds its
ID already claimed **forks**: it takes a new ID, keeps the copied text, and saves it
under the new ID at its next save (until then, its last-save time shows "—").

- On `https://` and `localhost` the claim is a browser **Web Lock**, released
  automatically when the page closes or crashes.
- On plain `http://` addresses other than localhost (for example, another device
  on your network), Web Locks don't exist. The claim is then a **lease** in
  `localStorage`, renewed every time the page saves or tries to save, and removed
  when you leave the page. A lease older than seven minutes counts as abandoned,
  so a crashed page's draft becomes available again. Before writing, a page using
  leases checks that its lease hasn't been taken over; if it has, it forks rather
  than overwrite.

**Open and delete.** `list()` shows every other saved draft that isn't blank and
isn't claimed by an open page, using the stored preview. While listing, it also
cleans up: it removes unclaimed blank drafts, leftover keys without a draft, and
old text-only copies that a snapshot has replaced. `open(id, apply)` first saves
your current draft (and refuses if that save fails), claims the chosen draft,
switches the tab to it, releases the old one so it shows up in Open, and hands the
chosen draft to the editor through `apply`. Opening a draft doesn't save it again
until you change something. `remove(id)` deletes all keys of an unclaimed draft;
it never deletes the current tab's draft.

**Upgrading old drafts.** A tab with no draft of its own adopts the old single
`typewriter:draft` if one exists, and removes it once the move succeeds. If the
move fails, the text is still shown and the move is retried at the next save or
reload.

### Check queue

**File:** [`src/checking/queue.ts`](../src/checking/queue.ts)

**What it does.** Decides which sentence to check next and makes sure only one
check runs at a time. It doesn't know about React, HTTP or your text beyond the
sentence records.

- **Takes in:** every new state of the sentence records, and a `check` function
  that sends one sentence to the model.
- **Gives back:** results and errors through `onResult` and `onError`, plus a
  snapshot of what's pending and running (for tests).
- **Rules:** 4, 5, 6, 10.

How it behaves:

- Only complete sentences with status `idle` are checked. Clean, suggestion,
  rejected and failed sentences are left alone.
- An actual edit restarts a 400 ms wait for the whole document. Results arriving
  don't restart it.
- Pending sentences are checked first in, first out. If a pending sentence is
  edited again, its newest version replaces the old one in the same place in line.
  Deleted or no-longer-complete sentences drop out.
- Only one check runs at a time. Editing the sentence being checked doesn't cancel
  that check; its answer is simply discarded when it comes back stale.
- The queue remembers which version of each sentence it already tried, so a
  sentence isn't checked twice without a change. A failed sentence is retried only
  when the session sets it back to `idle` (`retrySentenceCheck`); it then goes to
  the back of the line.
- `dispose()` stops everything when the editor closes. The queue doesn't cancel a
  check already running (the session cancels the network request separately), and
  any answer that still arrives is ignored.

### Model settings and the development proxy

**Files:** [`src/checking/config.ts`](../src/checking/config.ts), [`vite.config.ts`](../vite.config.ts)

**What it does.** Works out which model to use and where Ollama is.

- **Takes in:** `VITE_OLLAMA_MODEL`, `VITE_OLLAMA_SERVER_URL`, and whether the
  app runs in development.
- **Gives back:** the model name, the server address, and the address the browser
  should call.
- **Rules:** 8.

The defaults are `gemma4:e4b` and `http://127.0.0.1:11434`. Empty values fall back
to the defaults; extra spaces and trailing slashes are removed. The server address
must be `http` or `https` without a username, password, query or fragment, and
without `/v1`. To change these, copy [`.env.example`](../.env.example) to
`.env.local`:

```dotenv
VITE_OLLAMA_SERVER_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=gemma4:e4b
```

Vite reads these when it starts or builds, so restart `npm run dev` or rebuild after
changing them. They are built into the page, so they must never contain secrets.
Pointing them at another machine or a cloud model sends your sentences there.

**In development** (`npm run dev`), the browser calls `/ollama/v1/chat/completions`
on the Vite server, and [`vite.config.ts`](../vite.config.ts) forwards it to Ollama
as `/v1/chat/completions`. Because the browser only talks to Vite, no cross-origin
setup is needed.

**In the built app** (`npm run preview` or any static hosting), there's no proxy:
the page calls Ollama directly. Ollama must then allow the page's exact address
through its `OLLAMA_ORIGINS` setting (don't use a wildcard, and don't expose
Ollama to the internet). An `https` page can't call an `http` Ollama, and
`127.0.0.1` always means the machine running the browser. See Ollama's
[configuration guide](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)
for how to set environment variables on each system, and restart Ollama afterwards.

Setting up Ollama itself:

```sh
ollama pull gemma4:e4b
ollama serve   # only if the Ollama service or app isn't already running
```

Checking in the browser has been tested on Linux, through both the development
proxy and the built app, using the previous default model. macOS and Windows
haven't been tested.

### Talking to Ollama

**Files:** [`src/checking/ollama.ts`](../src/checking/ollama.ts), [`src/checking/ollamaCore.ts`](../src/checking/ollamaCore.ts)

**What it does.** Sends one sentence to Ollama, checks that the answer is usable,
and repeats until the answer settles.

- **Takes in:** the model name, server address, a cancel signal, and the sentence
  (ID, version, text).
- **Gives back:** `clean`, or a `suggestion` with the new text, or an error.
- **Rules:** 4, 8, 10.

`ollama.ts` is the browser version: it loads [`prompt.txt`](../prompt.txt) and
passes it to `ollamaCore.ts`, which does the actual work. The evaluation scripts use
the same core, so the app and the measurements follow identical rules.

**The request.** One non-streaming call to Ollama's OpenAI-compatible
`/v1/chat/completions`: `prompt.txt` as the system message and the sentence as the
user message. Nothing else is sent: no IDs, positions or surrounding text.
Temperature is 0, the answer may be up to 2,048 tokens, and `reasoning_effort` is
`none` so models that can "think" spend their budget on the answer.

**Is the answer usable?** It must be a single, completed answer
(`finish_reason: stop`) with real text, and no error, tool call, refusal or code
block. New headings such as "Corrected:" or new bullet lists are rejected as
commentary, unless your sentence already had them. Only spaces at the very start
and end of the answer are trimmed. These checks catch obviously broken answers,
not wrong corrections; those still arrive as suggestions for you to judge.

**Settling the answer:**

```text
your sentence → ask the model → valid answer?
                     ↑               │
                     └── changed ────┤ (and not seen before, rounds left)
                                     ├── same as what was sent → done
                                     └── invalid, repeats an earlier version, or
                                         five rounds used → failure
```

If the first answer equals your sentence, it's `clean`. Otherwise the answer is
sent back with the same instructions, and this repeats until an answer matches the
text it was given; that settled text becomes the suggestion. Coming back to any
earlier version (including your original) is a **cycle**, and using all five rounds
is a **limit**; both count as failures you can retry. Settling means the model is
consistent, not that it is right.

Each request times out after 120 seconds. Closing the editor cancels the request
in flight. Failures carry the reason and the raw answers, which the Debug panel can
show; these details are never turned into suggestions.

### Editor session

**File:** [`src/checking/useSentenceEditor.ts`](../src/checking/useSentenceEditor.ts)

**What it does.** Ties everything together for one editor: it owns the text and
sentence records, the draft session, the queue, and the list of failures.

- **Takes in:** edits from the editor, your accept, reject and retry clicks, model
  answers, and draft choices from the navigation bar.
- **Gives back:** the current state, the actions `updateText`, `accept`, `reject`
  and `retry`, the failure details, `listDrafts`, `openDraft`, `removeDraft`,
  `saveStatus` (last save time and whether the last save failed), `draftId`, and
  the model name.
- **Rules:** 1, 4–6, 9, 10.

Every change goes through one path: update the records, remember the new state
immediately (so a model answer arriving a moment later sees it), show it, and
give it to the queue.

- A model **result** is stored with `cacheSentenceResult`, which ignores stale
  answers.
- A model **error** marks the sentence `failed` (if it's still current and
  unchecked) and stores the message and any raw answer. The sentence's status is
  what counts; the stored details only describe it. Details for sentences that are
  no longer failed are dropped, and the failure list keeps the same identity when
  nothing in it changed, so typing doesn't redraw it.
- **Retry** sets a current failed sentence back to `idle`, which puts it back in the
  queue, and returns `false` for a stale one.
- **Accept** and **reject** return whether they applied.
- **Opening a draft** replaces the document. New sentence IDs continue from the
  previous counter, so a late answer for the old draft can never match a sentence
  in the new one.

The model settings are read once and shared by the request code and the navigation
bar, so the model shown is the model used.

### Page layout

**File:** [`src/App.tsx`](../src/App.tsx)

**What it does.** Puts the title, navigation bar, editor and (in development) the
Debug panel on the page, and passes the session's state and actions to them.

The editor is recreated whenever you open a different draft, so undo can never take
you back into the previous draft's text.

### Navigation bar

**File:** [`src/AppNav.tsx`](../src/AppNav.tsx)

**What it does.** Shows **Last save**, **Open**, **Model** and **Latency** next to
the title; it moves below the title on narrow screens.

- **Takes in:** `saveStatus`, the model name, and the draft actions.
- **Gives back:** nothing directly; it calls the draft actions.

- **Last save** shows the time of day for today's saves and the date and time for
  older ones, or "—" before the first save. After a failed save it shows **Not
  saved** in amber. Hover over it for an explanation; screen readers announce the
  change.
- **Open** opens a list straight away ("Loading drafts…"), then shows a one-line
  preview of each other saved draft, or "No other saved drafts." Choosing one
  switches to it and returns focus to **Open**. If another tab took it in the
  meantime, the list refreshes. The **×** next to a draft deletes it after you
  confirm. Escape, clicking **Open** again, or clicking elsewhere closes the list,
  and a list that finishes loading after you closed it stays closed.
- **Model** shows the configured model. It's display only; you can't switch models
  here.
- **Latency** is a placeholder ("—") for now.

### Editor and review card

**File:** [`src/SentenceEditor.tsx`](../src/SentenceEditor.tsx)

**What it does.** The writing area. It's a [CodeMirror](https://codemirror.net)
editor showing your text, with highlights on sentences that have a suggestion or a
failure, and a small card for reviewing one of them.

- **Takes in:** the session state, failure details, and the edit, accept, reject and
  retry actions.
- **Gives back:** exact edits (position and inserted text) for every change you make.
- **Rules:** 1–4, 9, 10.

CodeMirror handles typing, wrapping, undo and the card's positioning; the app keeps
track of sentences itself. Every change is sent as an exact replacement, and
several changes at once (for example, one undo) are sent in order. Line breaks are
kept exactly, including Windows-style ones. Model results only change highlights,
never your text, cursor or undo history. Accepting a suggestion is a single undo
step; undo and redo are ordinary edits, so the sentence is simply checked again.

**Reviewing a sentence.** Click a highlighted sentence, or put the cursor in it and
press **Alt+Enter** (which also focuses the first button). The card shows:

- for a **suggestion**: the original, the suggestion, **Accept suggestion** and
  **Reject suggestion**;
- for a **failure**: the sentence, the error, and **Retry**. If the retry is
  refused (the sentence changed), the card stays open.

Escape, the × button, or clicking ordinary text closes the card and returns focus
to the editor. The card follows its sentence if text around it moves, and closes
for good if that sentence is edited, deleted, split, merged, or loses its
suggestion or failure. Highlights for a sentence disappear as soon as you edit
it. All text in the card is shown as plain text, never as HTML.

### Debug panel

**File:** [`src/DebugInspector.tsx`](../src/DebugInspector.tsx)

**What it does.** In development only (`npm run dev`), **Debug state** under the
editor shows what the app is tracking. It isn't included in built versions.

It lists each failure with its sentence, error, **Retry**, and **Show response**
(the raw model answer and why it was rejected). Then it shows the document length,
how many sentences are complete, and a table of every sentence: ID, version,
position, text (with whitespace made visible), whether it's complete, and its
status. **Raw state JSON** shows the whole state, including the latest edit and the
next-ID counter.

To see sentence tracking in action:

1. Type `First. Last.` and note both IDs and versions.
2. Insert `Inserted.` between them: the existing IDs and versions stay while their
   positions move.
3. Change `Inserted.` to `Inserted!`: same ID, higher version.
4. Change only spaces between sentences: nothing changes.
5. Type `Same. Same.`: the two sentences get different IDs. Split or merge a
   sentence and watch the affected ones get new IDs.
6. Add unfinished text: it shows `complete: false`. Try emoji, tabs and new lines
   to see positions and escaped whitespace.
7. Delete everything: the sentences disappear, but the ID counter keeps counting.

### Styles

**File:** [`src/styles.css`](../src/styles.css)

The look of the page: a warm off-white background, a white writing surface, a muted
green accent, 18 px text with generous line spacing, and tighter padding on small
screens. Suggestions get a soft highlight and underline; failures get an amber wavy
underline (also visible in high-contrast modes). Focus outlines are always visible.
No web fonts, animations or extra UI libraries are used.

## What the model is asked to do

[`prompt.txt`](../prompt.txt) asks the model to act as a copy editor: fix spelling,
grammar, punctuation and wrong word choices, and actively shorten wordy writing,
while keeping the full meaning. For example, "a person who participated in the
meeting" can become "a meeting participant". Meaning always comes first: facts,
who did what, tense, negation, conditions, numbers, uncertainty, emphasis and
technical terms must survive. Correct, concise sentences should come back
unchanged. These are instructions, not guarantees, which is why every change is a
suggestion you accept or reject.

## Tests

Tests run with [Vitest](https://vitest.dev) in a simulated browser (jsdom) with
React Testing Library. None of them need Ollama: model answers are faked. Shared
setup is in [`src/test/setup.ts`](../src/test/setup.ts); it clears browser storage
before each test.

| Test file | What it covers |
| --- | --- |
| `src/document/document.test.ts` | Describing changes between two versions of the text |
| `src/document/segmentation.test.ts` | Sentence splitting and when a sentence counts as complete |
| `src/document/sentences.test.ts` | IDs and versions through inserts, deletes, splits, merges and whitespace edits |
| `src/document/sentence-cache.test.ts` | Keeping and clearing results as sentences change |
| `src/document/suggestion-actions.test.ts` | Accept and reject, including stale and repeated clicks |
| `src/checking/queue.test.ts` | Waiting, ordering, one-at-a-time checking, failures and retries |
| `src/checking/config.test.ts` | Model and server settings |
| `src/checking/ollama.test.ts` | Requests, answer validation, settling rounds, timeouts and cancellation |
| `src/checking/integration.test.tsx` | The editor, queue and (faked) model working together, including races |
| `src/checking/autosave.test.tsx` | When drafts are saved, per-tab drafts, duplicated tabs, save times |
| `src/checking/rejection-persistence.test.tsx` | Rejected suggestions surviving reloads and opening drafts |
| `src/checking/draft-sessions.test.tsx` | Leases without Web Locks, cleanup and deletion, opening drafts, upgrading old drafts, save failures |
| `src/SentenceEditor.test.tsx` | Highlights, the review card, keyboard use, focus, undo and redo |
| `src/AppNav.test.tsx` | The navigation bar: last save, Not saved, Open, delete, model |
| `src/DebugInspector.test.tsx` | The Debug panel |
| `src/App.test.tsx` | The whole page, including restoring drafts exactly |
| `vite.config.test.ts` | The development proxy |
| `scripts/*.test.ts` | The evaluation tools, against a fake server |

Helpers: [`src/test/editor.ts`](../src/test/editor.ts) drives the real CodeMirror
editor with exact edits, and [`src/test/draft.ts`](../src/test/draft.ts) reads saved
drafts in either format and can make the next save fail.

Real-browser checks so far: headless Chromium on Linux, covering accept, undo,
keyboard focus, mobile wrapping and input methods with a faked model, live model
checking with the previous default, and drafts over plain `http`. Firefox, Safari,
macOS and Windows haven't been tested.

## Evaluation tools

These scripts measure how well a model does the editing job. They use the same
request code as the app and run from the command line, not in the browser.

| File | What it does |
| --- | --- |
| [`scripts/evaluation-cases.mjs`](../scripts/evaluation-cases.mjs) | Builds the original 37 test sentences: the 24 in [`tests.txt`](../tests.txt) plus 13 earlier problem cases. |
| [`benchmarks/editing-v1/cases.jsonl`](../benchmarks/editing-v1/cases.jsonl) | The 60-case benchmark: 12 grammar fixes, 12 sentences to shorten, 12 that should stay unchanged, and 12 pairs of sentences with a subtle difference in meaning. |
| [`scripts/evaluation-suites.mjs`](../scripts/evaluation-suites.mjs) | Loads either set (`legacy`, the default, or `editing-v1`), checks it for mistakes, and fingerprints it. |
| [`scripts/evaluate-model.mjs`](../scripts/evaluate-model.mjs) | Runs every case against a model and writes one JSON line per result, with timings and every round's raw answer. |
| [`scripts/summarize-evaluation.mjs`](../scripts/summarize-evaluation.mjs) | Turns one or more runs into counts and timings. It doesn't judge meaning; that's done by reading the results. |

The evaluator is configured with `OLLAMA_MODEL` (default: the app's default model),
`OLLAMA_SERVER_URL`, `EVALUATION_SUITE` and `EVALUATION_REPEATS` (1–3). It doesn't
read `.env.local`. See the [first comparison](evaluation.md) and the
[second comparison](editing-v1-evaluation.md) for the results, and the
[benchmark rubric](../benchmarks/editing-v1/rubric.md) for how cases are scored.
[`output.txt`](../output.txt) is old model output kept for reference; it isn't an
answer key.
