# Per-case model review

[Method, reproduction, and aggregate results](evaluation.md)

Review labels describe the final published suggestion, not whether it converged:
**OK** = no clear grammar/fidelity problem observed; **F** = identifiable meaning
change; **U** = uncertain equivalence, residual wording, or emphasis worth human
review; **R** = needless rewriting/weak compression, without a clear meaning
error; **W** = withheld by the checker. OK is not a proof of equivalence. Counts
are descriptive reviewer judgments, not exact-output tests.

`sample-NN` maps to the corresponding paragraph in unchanged `tests.txt`. Other
IDs map to `scripts/evaluation-cases.mjs`. “Unchanged” means literal original
text. Both full repetitions are reviewed; differing final results are called out
explicitly. Pass counts include the unchanged confirmation request.

## Qwen 3.5 9B Q4_K_M

Both repetitions produced the same final text/outcome and pass counts for every
case. These rows describe both; each represents two measured checks.

| Case | Passes | Published text | Review |
| --- | ---: | --- | --- |
| sample-01 | 2 | She goes to the office every morning. | OK: agreement repaired. |
| sample-02 | 2 | I have been there three times already. | OK: repairs verb form, retains present perfect and count. |
| sample-03 | 2 | Neither answer is correct. | OK: agreement and concise wording. |
| sample-04 | 2 | He explained the system to me. | U: fixes indirect-object construction but broadens “how the system works.” |
| sample-05 | 3 | I have lived here for three years. | F: repairs “since” but changes present-perfect progressive to simple perfect. |
| sample-06 | 4 | The results suggest our hypothesis was incorrect. | F: drops explicit experiment context; also swaps “wrong” for “incorrect.” |
| sample-07 | 5 | The software efficiently processes large data volumes. | F: turns intended design into asserted behavior. |
| sample-08 | 3 | This approach fails for several reasons. | OK: repairs agreement and shortens existential wording. |
| sample-09 | 2 | We currently cannot determine the cause. | OK: useful compression with current-time qualification. |
| sample-10 | 4 | The request failed due to server unavailability. | OK: retains cause; repeated rephrasing costs four requests. |
| sample-11 | 3 | The application can process multiple requests concurrently. | R: useful “can,” but gratuitous “several” → “multiple.” |
| sample-12 | 2 | To reduce latency, we cached the results locally. | OK: purpose, tense, actor, and locality retained. |
| sample-13 | 4 | None (cycle). | W: revisits “The deployment failed due to a missing configuration file.” after two other variants; no candidate published. |
| sample-14 | 2 | The values below are estimates only. | U: retains estimates/only but removes explicit importance; whether that is padding or deliberate emphasis is contextual. |
| sample-15 | 2 | The two systems behave identically. | U: concise, but “exactly” emphasis is removed. |
| sample-16 | 3 | We postponed the migration until next week. | F: a decision becomes an executed postponement. |
| sample-17 | 1 | Unchanged. | OK: restraint on valid prose. |
| sample-18 | 3 | Although unconventional, the implementation is correct. | F: loses “somewhat” degree and explicit “nevertheless” emphasis. |
| sample-19 | 1 | Unchanged. | OK: approximation retained. |
| sample-20 | 3 | The model uses sparse representation to reduce memory usage. | R: rewrites a valid technical sentence across two changed passes. |
| sample-21 | 1 | Unchanged. | OK: technical assumptions retained. |
| sample-22 | 1 | Unchanged. | OK: necessity, cause, and negation retained. |
| sample-23 | 1 | Unchanged. | OK: hedging and contrast retained. |
| sample-24 | 1 | Unchanged. | OK: forward reference and actor retained. |
| long-redundancy | 3 | Despite six hours of discussion, little progress was made due to a slow internet connection. | F: useful compression, but explicit “we” attribution and “six whole hours” emphasis disappear. |
| prerequisites | 3 | Although the team had all necessary prerequisites to begin the task, none of the managers could clearly define the main objective, causing significant confusion. | U: useful spelling/grammar repairs; “a lot” → “significant” and loss of “exact” deserve emphasis review. |
| meeting-original | 2 | Furthermore, every meeting participant has offered a distinct opinion on how best to resolve the pending issue. | U: preserves present perfect, meeting, and distinct opinions, but collapses emphatic “each and every” and changes synonyms. |
| meeting-simple-past | 2 | Furthermore, each meeting participant offered a different opinion on how best to solve the pending issue. | OK: useful clause compression with tense/context retained. |
| meeting-present-perfect | 3 | Furthermore, each meeting participant offered a different opinion on how best to solve the pending issue. | F: “has given” becomes simple past “offered.” |
| workshop | 4 | Every attendee submitted a separate proposal to resolve the outstanding problem. | F: loses explicit employee role, workshop context, and present-perfect aspect; “shared” becomes “submitted.” |
| measurements | 2 | The measurements were somewhat unusual but have remained approximately consistent. | OK: qualifiers/aspect retained; removes repeated subject and comma only. |
| researcher | 2 | Although the lead researcher and his primary assistants were unaware of the new criterion, they completed the assessment promptly, ultimately improving the entire team's overall productivity. | U: useful restructuring and retained scopes; “managed to” success/emphasis is compressed and merits contextual review. |
| not-yet | 1 | Unchanged. | OK: modality, timing, and both productivity scopes retained. |
| attribution | 2 | Only some participants said the change might improve overall productivity. | F: present perfect becomes simple past; attribution/scope/modality otherwise retained. |
| negation | 2 | The treatment did not reduce mortality, though it may have improved comfort. | R: only “although” → “though”; no meaningful improvement observed. |
| precision | 2 | The new process reduced average latency by approximately 10% but did not improve overall throughput. | OK: precision and contrast retained; only comma removed. |
| software-update | 4 | Although the software update was intended to improve system security, many current users report that it hinders their daily workflow. | F: present-perfect reporting and ongoing impact become simple-present claims. |

On this rubric: **17 OK, 10 F, 6 U, 3 R, 1 W** unique cases. In the eight
valid-prose fixture samples, six stayed unchanged; sample 18 lost meaning and
sample 20 was rewritten. Identical repetition outcomes do not reduce the
severity of these errors.

Intermediate traces show that refinement can **introduce** drift after a useful
first correction: sample 5 first returned “I've been living here for three years”
before switching aspect; sample 7 first repaired only “amounts” before asserting
actual processing; sample 16 first returned “We decided to postpone…” before
claiming postponement. The present-perfect meeting variant similarly lost its
aspect on pass two. Thus publishing only stable candidates is not a semantic
safety mechanism, and extra passes are not necessarily quality improvements.

## Gemma 2 9B Q4_K_M

Both repetitions produced identical final text/outcomes and pass counts. These
rows describe both. “Requests text” refers to the unrecognized commentary
“Please provide the text you would like me to edit,” followed by changing variants.

| Case | Passes | Published text | Review |
| --- | ---: | --- | --- |
| sample-01 | 2 | She goes to the office every morning. | OK: agreement repaired. |
| sample-02 | 4 | I have been there three times. | F: repairs verb form, but removes “already” timing/emphasis. |
| sample-03 | 5 | None (limit). | W: asks for text instead of editing supplied prose; five changing requests for text exhaust refinement. |
| sample-04 | 4 | He explained the system to me. | U: fixes construction but broadens “how the system works.” |
| sample-05 | 3 | I've lived here for three years. | F: repairs duration preposition but changes progressive aspect. |
| sample-06 | 5 | The experiment's results refute the hypothesis. | F: “suggests … was wrong” becomes stronger “refute,” past assessment becomes present, and “our” attribution disappears. |
| sample-07 | 2 | The software is designed to process large amounts of data efficiently. | OK: repairs plural without changing intended design into observed behavior. |
| sample-08 | 2 | There are several reasons why this approach fails. | OK: agreement repaired. |
| sample-09 | 1 | Unchanged. | R: misses obvious “at this point in time” padding. |
| sample-10 | 2 | The request failed because the server was unavailable. | OK: useful cause-preserving compression. |
| sample-11 | 5 | None (limit). | W: requests text instead of editing. |
| sample-12 | 5 | None (limit). | W: requests text instead of editing. |
| sample-13 | 4 | None (cycle). | W: configuration-file wording oscillates, as with Qwen 3.5. |
| sample-14 | 5 | None (limit). | W: requests text instead of editing. |
| sample-15 | 5 | None (limit). | W: requests text instead of editing. |
| sample-16 | 2 | We decided to postpone the migration until next week. | OK: useful compression preserves decision rather than asserting completed postponement. |
| sample-17 | 1 | Unchanged. | OK: restraint. |
| sample-18 | 2 | Although the implementation is somewhat unconventional, it is correct. | U: degree retained, but removes “nevertheless” emphasis. |
| sample-19 | 5 | None (limit). | W: requests text instead of returning valid prose. |
| sample-20 | 5 | None (limit). | W: first candidate changes “utilizes” to “uses,” then asks for text on refinement. |
| sample-21 | 5 | None (limit). | W: requests text instead of returning valid prose. |
| sample-22 | 5 | None (limit). | W: requests text instead of returning valid prose. |
| sample-23 | 2 | The results were surprising but not entirely unexpected. | F: drops “in a sense” hedge. |
| sample-24 | 5 | None (limit). | W: requests text instead of returning valid prose. |
| long-redundancy | 4 | None (cycle). | W: alternates “due to” / “because of” wording after useful initial compression. |
| prerequisites | 4 | Although the team had all the necessary prerequisites to begin the task, the managers' inability to clearly define the main objective caused confusion. | F: removes “a lot” degree and changes explicit “none of the managers” to collective inability; repairs spelling but loses precision. |
| meeting-original | 4 | Each meeting participant offered a distinct opinion on resolving the issue. | F: loses present-perfect aspect, additive “Furthermore,” “pending” status, and “best” objective. |
| meeting-simple-past | 4 | None (cycle). | W: oscillates between “on solving” and “on how to solve.” |
| meeting-present-perfect | 3 | Each meeting participant has given a different opinion on solving the pending issue. | F: retains present perfect but removes additive “Furthermore” and explicit “best” objective. |
| workshop | 3 | Every workshop attendee submitted a separate proposal to resolve the outstanding problem. | F: drops employee role, changes perfect to past, and changes “shared” to “submitted.” |
| measurements | 1 | Unchanged. | OK: tense and degree retained. |
| researcher | 5 | Although unaware of the new criterion, the lead researcher and his assistants completed the assessment promptly, which ultimately improved the team's productivity. | F: loses “primary” role qualification plus “entire” and “overall” scopes across refinement. |
| not-yet | 1 | Unchanged. | OK: qualifications retained. |
| attribution | 3 | Some participants suggest the change could improve overall productivity. | F: removes “Only,” changes reported speech to a current suggestion, and changes perfect tense/modality. |
| negation | 2 | None (cycle). | W: swaps “although” / “though” and returns to original. |
| precision | 5 | None (cycle). | W: revisits earlier punctuation/contrast wording; intermediate “increase” also narrows “improve.” |
| software-update | 4 | Although the software update was intended to improve system security, many current users report that it negatively impacts their daily workflows. | F: changes perfect reporting and ongoing effect to simple-present assertions. |

On this rubric: **8 OK, 11 F, 2 U, 1 R, 15 W** unique cases. Of eight valid-prose
fixture inputs, only one stayed unchanged, two became suggestions, and five were
withheld. Ten unique cases hit the pass limit after requests for input; five
others cycled. These are user-visible availability/contract problems, even though
no response was mechanically classified `invalid` and no HTTP error occurred.

The refinement trace for `researcher` is particularly revealing: it initially
retained “the entire team's overall productivity,” then removed “overall” on
pass three and “entire” on pass four before converging. The final text therefore
violates an explicit preservation example in the unchanged prompt.

## Qwen 3 8B Q4_K_M

Both repetitions produced identical final text/outcomes and pass counts; the rows
describe both.

| Case | Passes | Published text | Review |
| --- | ---: | --- | --- |
| sample-01 | 2 | She goes to the office every morning. | OK: agreement repaired. |
| sample-02 | 3 | I've been there three times already. | OK: verb form repaired, count/timing/aspect retained. |
| sample-03 | 2 | Neither answer is correct. | OK: concise agreement repair. |
| sample-04 | 2 | He explained how the system works. | F: deletes “me,” the recipient of the explanation. |
| sample-05 | 3 | I've lived here for three years. | F: changes progressive aspect while repairing the duration preposition. |
| sample-06 | 3 | None (cycle). | W: swaps “wrong” / “incorrect.” |
| sample-07 | 4 | None (cycle). | W: repeats processing wording; intermediate candidates also turn design intent into asserted behavior. |
| sample-08 | 3 | This approach fails for several reasons. | OK: repairs agreement and compresses. |
| sample-09 | 2 | At this point, we cannot determine the cause. | OK: preserves current-time qualification. |
| sample-10 | 2 | The server was unavailable, so the request failed. | OK: cause and past tense retained. |
| sample-11 | 4 | None (cycle). | W: cycles between “at the same time” and “simultaneously.” |
| sample-12 | 2 | To reduce latency, we cached results locally. | U: useful purpose compression, but removes the definite reference “the results.” |
| sample-13 | 4 | None (cycle). | W: same configuration-file wording cycle seen in the other models. |
| sample-14 | 4 | Note that the following values are estimates. | F: removes explicit “only” qualification and importance. |
| sample-15 | 2 | The two systems behave identically. | U: removes “exactly” emphasis. |
| sample-16 | 4 | None (cycle). | W: intermediate decision becomes executed postponement before a wording cycle. |
| sample-17 | 2 | I don't think there's anything wrong with this sentence. | R: contracts valid prose without a meaningful improvement. |
| sample-18 | 2 | Although unconventional, the implementation is correct. | F: removes “somewhat” degree and “nevertheless” emphasis. |
| sample-19 | 1 | Unchanged. | OK: approximation retained. |
| sample-20 | 4 | None (cycle). | W: cycles “save” / “conserve” memory on already-valid technical prose. |
| sample-21 | 1 | Unchanged. | OK: assumptions/technical claim retained. |
| sample-22 | 3 | The redundant check is needed because the operation is not idempotent. | F: “seemingly redundant” becomes an assertion of actual redundancy. |
| sample-23 | 2 | The results were surprising, though not entirely unexpected. | F: removes “in a sense” hedge. |
| sample-24 | 2 | None (cycle). | W: “retain” / “keep” swap returns to original. |
| long-redundancy | 5 | None (limit). | W: keeps rewriting without convergence; intermediate versions also lose “we” attribution. |
| prerequisites | 3 | Although the team had all the necessary prerequisites to start the task, none of the managers could clearly define the main objective, causing confusion. | F: repairs spelling and compresses, but removes “a lot” degree and “exact” qualification. |
| meeting-original | 4 | Each meeting participant has offered a distinct opinion on resolving the pending issue. | F: preserves perfect aspect but drops additive “Furthermore,” “best” objective, and emphatic “each and every.” |
| meeting-simple-past | 4 | Each meeting participant offered a different opinion on resolving the pending issue. | F: drops additive “Furthermore” and “best” objective. |
| meeting-present-perfect | 4 | Each meeting participant has offered a distinct opinion on resolving the pending issue. | F: preserves perfect aspect but drops additive “Furthermore” and “best” objective. |
| workshop | 3 | Every workshop attendee has submitted a separate proposal to address the outstanding issue. | F: drops employee role; “shared” becomes “submitted,” and resolving becomes broader addressing. |
| measurements | 3 | The measurements were somewhat unusual but have remained roughly consistent. | R: keeps degree/aspect, but needlessly swaps “approximately” for “roughly.” |
| researcher | 4 | Although unaware of the new criterion, the lead researcher and his assistants completed the assessment promptly, which ultimately improved the team's overall productivity. | F: loses “primary” role and “entire” scope. |
| not-yet | 2 | The change may ultimately improve the team's overall productivity, but it has not yet done so. | F: removes “entire” scope from a deliberately qualified input. |
| attribution | 4 | Some participants suggested the change could improve overall productivity. | F: removes “Only,” changes reported speech to suggestion, and changes tense/modality. |
| negation | 1 | Unchanged. | OK: negation, modality, and tense retained. |
| precision | 3 | The new process reduced average latency by about 10%, but did not improve overall throughput. | R: precision retained; unnecessary “approximately” → “about” substitution and comma editing. |
| software-update | 5 | None (limit). | W: successive rewrites lose reporting aspect and context without reaching stability. |

On this rubric: **9 OK, 14 F, 2 U, 3 R, 9 W** unique cases. Only two of the
eight valid-prose fixture inputs stayed unchanged; three received meaning-changing
suggestions, one a contraction-only change, and two were withheld.
