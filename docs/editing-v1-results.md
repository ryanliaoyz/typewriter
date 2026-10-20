# Second comparison: every case, every model

[Summary, method and totals](editing-v1-evaluation.md) ·
[Benchmark cases and rubric](../benchmarks/editing-v1/rubric.md)

This page records how each of the 60 benchmark cases came out for each model in the
[second comparison](editing-v1-evaluation.md), and why. It starts with a grid of
labels, then explains the judgement calls that apply to every model, then gives the
evidence for each model's failures and uncertain cases. Quoted outputs are the
model's exact words. The full raw answers stay in the local files named on the
summary page.

Case IDs keep the benchmark's letters: **G** grammar, **C** compression (shortening),
**N** no change expected, **P** pairs of sentences with a subtle difference.

| Label | Meaning |
| --- | --- |
| **OK** | Did the job: the required fix for G, a useful faithful shortening for C, exactly unchanged for N, meaning kept for P. |
| **F** | A published suggestion that clearly changes the meaning. |
| **U** | Uncertain: whether the meaning or grammar is acceptable needs a human judge. Counted neither as success nor as harm. |
| **M** | Missed or incomplete fix or shortening, or unacceptable grammar, without a clear meaning change. |
| **R** | An N sentence was changed without a clear meaning error; still a failure to leave it alone. |
| **W** | Withheld: the check cycled, ran out of rounds, gave an unusable answer, or hit a network error, so nothing was shown. |

When several problems apply, the label goes to the worst (F, then U, then missed
work) and the notes mention the rest. A P sentence reworded faithfully can be OK even
if the rewording wasn't needed, because P cases measure meaning; N cases are where
needless changes count. Withheld cases get no final grade, but the notes still record
problems in their intermediate rounds.

For a meaning change, the notes say which round introduced it and whether an earlier
round had been faithful. Every round was read, not just the final one, and always
compared with the original sentence. Where both runs gave identical answers, one
review covers both; otherwise each run is described.

## Complete review matrix

Columns are Gemma 4 E4B, Gemma 2 9B Q5, Llama 3.1 8B Q5, and Qwen 3.5 9B.
An entry applies to both repetitions unless written **repeat 1 / repeat 2**.
For G/C, OK requires the specified useful repair, acceptable grammar, faithful
meaning, and compliant output. For N, only exact unchanged text is OK. For P,
OK requires preserved meaning and compliant output, not an exact wording match.
F means changed meaning, U means uncertain, and W has no published final text.

| Case | Gemma 4 | Gemma 2 Q5 | Llama 3.1 Q5 | Qwen 3.5 |
| --- | --- | --- | --- | --- |
| G01 | OK | F | OK | F |
| G02 | OK | OK | OK | F |
| G03 | OK | W | W | W |
| G04 | OK | OK | OK | F |
| G05 | OK | OK | W | OK |
| G06 | OK | OK | OK | OK |
| G07 | OK | OK | OK | OK |
| G08 | OK | OK | OK | OK |
| G09 | OK | OK | U | OK |
| G10 | F | OK | W | F |
| G11 | U | U | U | U |
| G12 | OK | OK | W | OK |
| C01 | OK | W/OK | M | OK |
| C02 | F | F | OK | F |
| C03 | F | OK | OK | W |
| C04 | OK | F | W | F |
| C05 | OK | OK | OK | OK |
| C06 | F | F | F | F |
| C07 | OK | OK | W | F |
| C08 | OK | OK | OK | OK |
| C09 | OK | OK | M | F |
| C10 | OK | OK | OK | OK |
| C11 | OK | OK | OK | F/OK |
| C12 | OK | OK/F | OK | F |
| N01 | OK | OK | OK | OK |
| N02 | R | R | F | R |
| N03 | F | F | F | F |
| N04 | OK | OK | U | W |
| N05 | R | R | R | F |
| N06 | OK | OK | OK | U |
| N07 | W | R | W | R |
| N08 | OK | F | R | R |
| N09 | OK | OK | F | F |
| N10 | R | OK | F | R |
| N11 | OK | F/W | OK | OK |
| N12 | F | W | U | OK |
| P01A | F | U | U | OK |
| P01B | F | F | OK | W |
| P02A | OK | OK | OK | OK |
| P02B | OK | OK | OK | OK |
| P03A | OK | W | OK | F |
| P03B | OK | W | OK | OK |
| P04A | OK | U | F | OK |
| P04B | OK | U | OK | OK |
| P05A | OK | W | OK | OK |
| P05B | OK | F | OK | OK |
| P06A | OK | OK | F | OK |
| P06B | OK | OK | F | OK |
| P07A | OK | W | OK | OK |
| P07B | OK | W | F | OK |
| P08A | OK | F | OK | F |
| P08B | OK | W | F | F |
| P09A | OK | W | OK | W |
| P09B | OK | OK | OK | W |
| P10A | OK | OK | OK | OK |
| P10B | OK | OK | F | F |
| P11A | OK | OK | F | U |
| P11B | OK | OK | OK | OK |
| P12A | OK | W | W | F |
| P12B | OK | F | OK | F |

## Shared judgment boundaries

- **Tense/aspect is protected:** C02, P01A/B, and G04 are not approved when
  present perfect or progressive aspect is removed. These are preservation
  failures under the frozen annotations, not claims that simple past is always
  grammatically wrong. C06 requires retaining explicit exactness; bare twelve
  does not pass that requirement, even though it often receives an exact reading.
- **G11 is uncertain for every model:** outputs assert damage at arrival rather
  than simply joining the original two clauses. That is plausible, but the source
  does not explicitly locate the damaged condition at arrival. No model receives
  a faithful-repair pass or a definite harmful-suggestion count for this case.
- **Generic plurals:** “Remote employees must submit weekly updates” is accepted
  as preserving the universal weekly obligation, without insisting on “each.”
- **Quotes:** changing quote typography alone is an unnecessary control edit (R).
  Changing the instruction's quoted words is a protected-content failure (F).
- **Uncertainty is not success:** agreed/decided, added intensification, and
  checked/verified are not silently accepted when equivalence is unclear.

## Gemma 4 E4B: evidence and pass behavior

Both repetitions have identical final outcomes and pass texts.

| Cases | Published result or trace evidence | Assessment |
| --- | --- | --- |
| G10 | “Nadia asked for the nearest exit.” | Pass 1 faithfully repairs question order; pass 2 changes a request for location into a request for the exit itself. |
| G11 | “The parcel arrived damaged yesterday.” | Uncertain damage timing; first candidate already says “arrived yesterday damaged.” |
| C02 | “The committee decided to keep the library open.” | Removes present perfect on pass 1. |
| C03 | “The archive allows readers to search older reports.” | Pass 1 promotes intended function to asserted capability. |
| C06 | “Twelve people attended the rehearsal.” | Pass 1 faithfully retains “Exactly”; pass 2 removes it. |
| N02 | “To whom did you give the spare key?” | Unnecessary formalization, no clear meaning loss. |
| N03 | “I will wait until Monday.” | Pass 1 drops the hypothetical condition (“I would wait…”); pass 2 turns advice into a definite commitment. |
| N05 | “The report I borrowed is on your desk.” | Unnecessary relative-pronoun deletion. |
| N07 | Withheld | “worked” → “functioned” → “worked”: faithful but needless synonym cycle. |
| N10 | `The sign reads, "Reply with the word APPROVED."` | Typography-only change, not exact restraint. |
| N12 | `Set retry\_count to 3 only after the connection closes.` | Literal Markdown escaping corrupts the protected identifier in the plain-text editor. Both passes contain it. |
| P01A | “The board agreed to close the branch.” | Removes present perfect on pass 1; agreement/completion distinction itself survives. |
| P01B | “The board closed the branch.” | Removes present perfect on pass 1. |

The remaining 22 P cases preserve their annotated distinctions, including the
faithful causal paraphrase “The repair caused the leak to be discovered.” (P12B).
No final pair collision occurs. Two cases (G10, C06) publish drift introduced
after a faithful first candidate in each repetition.

## Gemma 2 9B Q5: evidence and pass behavior

Final results differ between repetitions for C01, C12, and N11 only.

| Cases | Published result or trace evidence | Assessment |
| --- | --- | --- |
| G01 | “The required documents are on the desk.” | Pass 1 locates documents, not the list. |
| G03 | Withheld | Faithful repair, followed by started/begun cycling. |
| G11 | “The parcel arrived yesterday, damaged.” | Pass 1 faithfully uses a semicolon; pass 2 adds damage-at-arrival timing, judged uncertain. |
| C01 | R1 withheld; R2 “We are able to offer a refund.” | R1 first gives a faithful compression, then requests text on passes 2–5 and cycles. R2 stabilizes faithfully. |
| C02 | “The committee decided to keep the library open.” | Present perfect lost on pass 1. |
| C04 | “If the freezer malfunctions, contact the caretaker.” | Pass 1 broadens both failure condition and specified call. |
| C06 | “Twelve people attended the rehearsal.” | Explicit exactness lost on pass 1. |
| C12 | R1 “We reviewed the draft but did not approve it.”; R2 “We did not approve the draft.” | R2 loses completed review on pass 2 after a faithful first compression. |
| N02 | “To whom did you give the spare key?” | Unnecessary formalization. |
| N03 | “If you were me, you would wait until Monday.” | Pass 1 faithfully expands the contraction; pass 2 reverses hypothetical roles. |
| N05 | “The report I borrowed is on your desk.” | Unnecessary relative-pronoun deletion. |
| N07 | “The old rule was awkward, but it functioned effectively.” | Unnecessary longer paraphrase. |
| N08 | “The change reduced median latency.” | Pass 1 deletes the explicit not-average contrast. |
| N11 | R1 stable request for input; R2 withheld request cycle | No version requirement survives. R1 publishes a response-only contract violation. |
| N12 | Withheld | Five requests for text, not an edit of the supplied instruction. |
| P01A | “The board has decided to close the branch.” | Uncertain agreement/decision equivalence. |
| P01B | “The board closed the branch.” | Present perfect lost on pass 1. |
| P03A/B | Both withheld | Four requests for input per case; the intended/performed distinction is never edited. |
| P04A/B | Reworded as applicants/candidates and plural interviews | Uncertain population/event-domain equivalence. |
| P05A | Withheld | only-if/only-when wording cycle. |
| P05B | “The door unlocks with a valid code.” | Faithful opening paraphrase on pass 1; pass 2 substitutes unlocking, which does not imply opening. |
| P07A | Withheld | claims/asserts cycle returns to original. |
| P07B | Withheld | Four requests for input. |
| P08A | “The readings indicate a leak.” | Compatibility becomes positive indication on pass 1. |
| P08B | Withheld | Conclusive establishment weakened on pass 1, then indication wording cycles. |
| P09A | Withheld | decreased/declined cycle; no relative/percentage-point drift observed. |
| P12A | Withheld | Pass 1 reverses event order to repair after discovery; later claims leak repair before cycling. |
| P12B | “The repair stopped the leak.” | Faithful discovery paraphrase on pass 1 becomes “fixed” on pass 2 and “stopped” on pass 3, inventing repair success. |

Requests for input violate the output-only editing contract on 23/139 returned
passes in R1 (six cases), and 21/139 in R2 (five cases). Case/pass locations:
R1 C01:2–5, N11:1–2, N12:1–5, P03A:1–4, P03B:1–4, P07B:1–4;
R2 N11:1–4, N12:1–5, P03A:1–4, P03B:1–4, P07B:1–4.
Four cases per repetition drift after an earlier faithful candidate, including
withheld C01 in R1 and published C12 in R2. No stabilized pair collision occurs,
but eight P inputs are withheld per repetition.

## Llama 3.1 8B Q5: evidence and pass behavior

Both repetitions have identical final outcomes and pass texts.

| Cases | Published result or trace evidence | Assessment |
| --- | --- | --- |
| G03 | Withheld | Faithful first repair, then started/begun cycle. |
| G05 | Withheld | Faithful past-tense repair on pass 1 becomes present perfect on pass 2; pass 4 adds “yet.” |
| G09 | “The children's coats were thoroughly soaked.” | Pass 1 is faithful; later adds soaked-through/thoroughly intensification, judged uncertain. |
| G10 | Withheld | Faithful first repair, then unnecessary located wording cycle. |
| G11 | “The parcel arrived yesterday, but it was damaged upon arrival.” | Faithful clause repair on pass 1; pass 2 adds uncertain damage timing. |
| G12 | Withheld | Unrequested “Here is the revised estimate:” headings on passes 1 and 3 alternate with corrected text. |
| C01 | “We are now in a position to offer a refund.” | Adds “now” and retains the target padding; no useful compression. |
| C04 | Withheld | Pass 1 broadens call to contact; pass 2 invents urgency (“immediately”), then cycles. |
| C06 | “Twelve people attended the rehearsal.” | Explicit exactness lost on pass 1. |
| C07 | Withheld | Faithful first causal compression; needless “instead” wording cycles. |
| C09 | “The new system has a storage capacity of up to 800 records.” | Capacity preserved, but nominalization remains and no useful shortening occurs. |
| N02 | “I gave the spare key to my neighbor.” | Answers the question with invented facts on pass 1; not an edit. Both passes violate the task. |
| N03 | “You'd wait until Monday.” | Pass 1 drops hypothetical advice and changes viewpoint. |
| N04 | “Avery said they would bring their lunch.” | Deletes own; possessive-emphasis equivalence uncertain. |
| N05 | “The report I borrowed is on your desk.” | Unnecessary relative-pronoun deletion. |
| N07 | Withheld | although/albeit wording cycle; no definite drift observed. |
| N08 | “The change reduced the median latency, not the average latency.” | Unnecessary articles, distinction retained. |
| N09 | “Élodie sent Łukasz her resume.” | Pass 1 invents gender and ownership; pass 2 removes the accent. |
| N10 | `The sign reads, "Reply with 'APPROVED'."` | Pass 1 changes protected quoted words. |
| N12 | `retry_count = 3, after the connection has been closed.` | Pass 1 changes the imperative to a fragment; pass 3 drops only. Instruction-force equivalence uncertain; not passed. |
| P01A | “The board has decided to close the branch.” | Agreement/decision equivalence uncertain. |
| P04A | “Not every applicant who was interviewed was successful.” | Pass 1 restricts the original applicant population to interviewees. |
| P06A/B | Both “The adapter is designed to prevent overheating.” | Pass 1 replaces possibility and asserted prevention with unstated design intent; distinction collapses. |
| P07B | “The new parts are now in place.” | Pass 1 invents “in place”; pass 2 adds now. |
| P08B | “The readings indicate a leak.” | Pass 1 weakens conclusive establishment. |
| P10B | “Users 18 years of age or older are eligible to register.” | Pass 1 incorrectly includes exactly 18; collides with P10A. |
| P11A | “Only Rosa checked the meeting's totals.” | Pass 1 invents a meeting. |
| P12A | Withheld | Pass 1 substitutes a still-present leak and ineffective repair, then cycles. |

Contract violations: G12 passes 1 and 3, N02 passes 1 and 2: four of 138 returned
responses per repetition, two cases each. G05 is the sole definite drift after a
faithful candidate, withheld rather than published. Pair collisions occur for
P06 and P10 in both repetitions.

## Qwen 3.5 9B: evidence and pass behavior

Only C11's final result differs across repetitions. G04 and C07 also have
different intermediate traces/pass counts but identical final text.

| Cases | Published result or trace evidence | Assessment |
| --- | --- | --- |
| G01 | “The required documents are on the desk.” | Faithful repair on pass 1 becomes a different object's location on pass 2. |
| G02 | “No applicants have submitted references.” | Faithful repair on pass 1 loses the two-applicant domain on pass 2. |
| G03 | Withheld | Faithful repair; started/begun cycle. |
| G04 | “She has waited for the bus for twenty minutes.” | Progressive aspect lost on pass 1 in R1, pass 2 after a faithful candidate in R2. |
| G10 | “Nadia requested the nearest exit.” | Faithful question-order repair on pass 1 becomes request for the exit on pass 2, then requested. |
| G11 | “The parcel arrived damaged yesterday.” | Uncertain damage-at-arrival timing. |
| G12 | “Send the revised estimate to Marta and me.” | Required repair complete; removes politeness on pass 2 but keeps the action/recipients. |
| C02 | “The committee decided to keep the library open.” | Present perfect removed on pass 1. |
| C03 | Withheld | Intended functionality becomes asserted capability on pass 1, then allows/lets cycles. |
| C04 | “If the freezer stops working, contact the caretaker.” | Faithful first compression changes call to broader contact on pass 2. |
| C06 | “Twelve people attended the rehearsal.” | Explicit exactness removed on pass 1. |
| C07 | “The bridge closure forced us to take an alternate route.” | Faithful causal compression on pass 1 becomes necessity/compulsion on pass 2. |
| C09 | “The new system stores up to 800 records.” | Faithful capacity statement on pass 1 becomes asserted storage on pass 2. |
| C11 | R1 “Readings showed an approximate 4% pressure drop.”; R2 “Readings showed an approximate 4% drop in average pressure.” | R1 loses protected average on pass 2 after a faithful compression; R2 passes. |
| C12 | “We rejected the draft.” | Faithful first compression becomes positive rejection and drops completed review on pass 2. Nonapproval does not necessarily mean rejection. |
| N02 | “To whom did you give the spare key?” | Unnecessary formalization. |
| N03 | “Wait until Monday if I were you.” | Pass 1 reverses hypothetical roles; pass 2 publishes an ungrammatical imperative/hypothetical mixture. |
| N04 | Withheld | Contraction cycle. |
| N05 | “The borrowed report is on your desk.” | Pass 1 drops the borrower's identity. |
| N06 | “We must carefully inspect the wiring.” | Need/must modal equivalence uncertain. |
| N07 | “The old rule was awkward but effective.” | Unnecessary paraphrase. |
| N08 | “The change reduced median, but not mean, latency.” | Unnecessary paraphrase, distinction retained. |
| N09 | “Élodie sent her résumé to Łukasz.” | Pass 1 invents gender and ownership. |
| N10 | `The sign reads: "Reply with the word APPROVED."` | Unnecessary framing punctuation/typography changes, quoted words retained. |
| P01B | Withheld | Present perfect lost on pass 1, then closed/shut-down cycle. |
| P03A | “The filter removes lead.” | Pass 1 promotes intent to performance; collides with P03B. |
| P08A/B | Both “The readings indicate a leak.” | Pass 1 strengthens compatibility and weakens establishment to the same indication claim. |
| P09A/B | Both withheld | Faithful dropped/fell synonym cycles retain units but withhold text. |
| P10B | “Adults may register.” | Faithful over-18 paraphrase on pass 1 becomes jurisdiction-dependent adults on pass 2, losing the strict boundary and users domain. |
| P11A | “Only Rosa verified the totals.” | Checked/verified successful-confirmation equivalence uncertain. |
| P12A | “The leak was discovered after repairs.” | Pass 1 pluralizes the singular definite repair. |
| P12B | “The leak was discovered during repairs.” | Pass 1 replaces causality with timing during repair; pass 2 pluralizes. |

No response-only contract violation was identified in 133/132 returned responses
(R1/R2). Nine cases in each repetition publish definite drift after a faithful
candidate (R1 includes C11, R2 includes G04). Pair collisions occur for P03 and
P08 in both repetitions. Several otherwise faithful candidates are withheld
solely because of unnecessary wording cycles.
