# Model loop measurements

Llama-3.2-1B-Instruct-q4f16_1-MLC on WebGPU, DELPHI live in the same tab, real
`/data`. Run with `(await import('/assistant/diagnose.js')).run()`.

Reported per capability, never pooled into one headline, per D-029.

---

## Run 1, void. Tuned on its own test set.

Eight utterances, of which four were verbatim examples in the system prompt.
It measured recall of the prompt, not whether the mapping generalises. Recorded
here so the mistake is on the record and the numbers are not reused.

Its one real signal: two failures extracted a name out of the state block,
answering `DELPHI_STATE 1` and `gencode19_genes` as gene names.

## Run 2, 26 held-out utterances, two arms

Same engine, same utterances, one variable: whether the serialized state block
is in the prompt. Neither arm was tuned on these results, and the utterances
share no phrasing with the prompt and reuse none of its example names.

| capability | tasks | with state | without state |
|---|---|---|---|
| select_gene | 5 | 0.80 | **1.00** |
| navigate | 3 | 0.00 | **0.67** |
| select_statistic | 3 | 1.00 | 1.00 |
| add_population | 3 | 0.33 | 0.33 |
| replace_population | 2 | 0.00 | 0.00 |
| select_sort | 3 | 0.33 | **1.00** |
| answer_state | 4 | 0.25 | **0.50** |
| clarify | 3 | 0.00 | 0.00 |
| **overall** | 26 | **0.38** | **0.62** |
| borrowed names | | 6 | **0** |
| latency p50 / max | | 4903 / 5268 ms | **4103 / 4852 ms** |

Better on four capabilities, worse on none. Adopted: the router shows the model
no state.

**Latency is not the binding constraint.** p50 4.1s against the 20s target in
D-033. The earlier projection of 9-14s, extrapolated from D-029's 2.3 tok/s,
was wrong by a factor of three. A second round trip would fit if one were ever
needed.

### What run 2 leaves broken

- **clarify is never chosen, 0/3 in both arms.** The model always picks an
  action. This is the mirror of the bias D-029 recorded, produced by the fix
  for it: clarify was moved to the last branch and the prompt was told to
  prefer extracting a name.
- **Population actions are the weakest pair**, add 0.33 and replace 0.00. The
  failures go to `select_gene`: `also display Yoruba` and `just the Han and
  nothing else` were both read as gene requests. A population and a gene are
  both just a name, and nothing in the prompt distinguishes them.
- **`what statistic am I looking at` reads as `select_statistic`**, not
  `answer_state`. Asking about a field and setting it are not being told apart.
- **Bare coordinates without a verb** (`chr17:7500000-7600000`) go to
  `select_gene`.

### Status of these 26 utterances

They are now a development set, not a held-out set. They have been read and
their failures analysed, so any prompt change informed by them must be measured
on a fresh set generated without reference to them. The next measurement needs
that fresh set before it means anything.

### Sample size

2 to 5 tasks per capability. D-022 specifies 25-40. `select_statistic` at 3/3
and `select_gene` at 5/5 are not evidence of a 1.00 rate; they are evidence
those capabilities are not obviously broken. Nothing here should be quoted as a
capability number.

## Run 3, prompt rules stated as categories

Development set 0.65, held-out set 0.70. Held-out scoring above development is
the control passing: the rules generalised rather than memorised the failures
they were written against.

| capability | held-out, 5 each |
|---|---|
| navigate | 1.00 |
| select_statistic | 1.00 |
| add_population | 1.00 |
| select_sort | 1.00 |
| answer_state | 1.00 |
| select_gene | 0.20 |
| replace_population | 0.20 |
| clarify | 0.20 |
| **overall** | **0.70** |

Latency p50 5545ms, max 6331ms. Higher than run 2's 4103ms, from the longer
prompt; still a quarter of the 20s target.

Five capabilities at 5/5 is not five capabilities at 1.00. Five samples cannot
distinguish a rate of 1.00 from one near 0.6, and nothing here should be quoted
as a capability number.

### Two defects this exposed, both mine

**Three actions shared the select_ prefix.** Under a constrained grammar the
action string is emitted a token at a time, so select_gene, select_statistic
and select_sort put the entire decision on the token after select_. Three of
four gene failures went to select_statistic. Actions are renamed to gene,
region, statistic, sort, question, add_population, replace_population and
clarify, which separate at the first token.

**The answer_state rule was too broad as written.** Stated as any request
asking what something is right now, it covers what time is it and who won the
world cup; three of four clarify failures went to answer_state. The rule is now
scoped to what this browser is showing.

## Run 4, action rename plus scoped question rule. Current state.

Three sets, one engine, no state in the prompt. TEST is the only unburned set
and the only number to quote.

| capability | TEST, 6 each | held-out r2, 5 each |
|---|---|---|
| statistic | **1.00** | 1.00 |
| sort | **1.00** | 1.00 |
| region | 0.67 | 1.00 |
| add_population | 0.67 | 1.00 |
| replace_population | 0.67 | 0.20 |
| clarify | 0.67 | 0.60 |
| gene | **0.17** | 0.20 |
| question | **0.17** | 0.40 |
| **overall** | **0.63** | 0.68 |

Latency p50 5491ms, max 6154ms. The 20s target in D-033 is met with a wide
margin and is not the constraint on anything.

The per-action table printed for TEST in the round-4 console was the
development set's shape. The numbers above are recomputed from the per-utterance
lines. summarize now labels each line with its set name so the tables cannot be
confused again.

### The rename did not do what I claimed it would

The prefix theory was that three actions named select_gene, select_statistic and
select_sort put the whole decision on the token after select_. Held-out round 2
ran under both schemes and is the controlled comparison: gene scored 0.20 before
the rename and 0.20 after. The shared prefix was not the cause. The change is
kept because reverting it is another untested change, not because it was shown
to help.

### The question regression is confounded, and that is my error

On the same held-out set, question fell from 1.00 to 0.40 while clarify rose
from 0.20 to 0.60. The action rename and the scoping of the question rule landed
in the same run, so neither can be attributed. Separating them needs a set that
has not been spent.

### Failures have an attractor, and it moves

In run 3 misclassifications piled onto select_statistic. In run 4 they pile onto
sort: look at ADH1B, throw in the Yakut, how far am I zoomed in, remind me which
populations are up. The attractor changes with the naming, which suggests that
for the weak categories the model is not discriminating at all but falling to
whichever branch is cheapest that run. Prompt wording has not moved that, across
three attempts.

---

# Issues that persist and need attention

## 1. gene at 0.17 is the worst result on the board

Six TEST utterances, one pass. Failures scatter to statistic, sort and
replace_population, and get me to VDR produced replace_population with
population_label VDR, which is a gene symbol offered as a population.

Nothing is unsafe about it: exact-match resolution refuses VDR as a population
label and the user gets a clarify. But plain-language gene navigation does not
work, and it is the capability most likely to be tried first.

The deterministic path is unaffected. Typing `gene TP53` resolves and jumps
every time, and that path has no model in it.

## 2. question at 0.17, having been 1.00 one run earlier

which statistic is active right now goes to statistic; what is my current window
size goes to clarify; how far am I zoomed in goes to sort. Asking about a field
and setting it are not being told apart, and the run that had this at 1.00 is
the run before the confounded change.

## 3. Three attempts at prompt wording have not fixed the weak categories

clarify bias, then action bias, then a rename. Each moved which categories fail
without moving how many. This is the point at which D-013's revisit trigger
deserves a straight answer rather than a fourth attempt: measured reliability of
the 1B model may be too low for these two capabilities regardless of prompt.

Untried, in rough order of cost: a two-call design, which the 5.5s measurement
makes affordable inside the 20s budget and which D-029's schema fixes implied;
a larger model within the D-013 RAM budget, which the record puts out of scope
for v1; or cutting gene and question from the model path and leaving them to
typed commands.

## 4. Six samples per capability cannot support a rate

D-022 specifies 25-40 tasks per type. statistic and sort at 6/6 mean not
obviously broken, not 1.00. Nothing here should be quoted as a capability
number, and all three sets are now burned.

## 5. Three decision records are contradicted by the code

D-025, the sort option set. D-019, whose T-5 control cannot be implemented as
written because ESM imports take no SRI. D-020, whose ratified per-turn
serialization is no longer on the shipping path. Each needs a superseding
record, which is the owner's to write.

---

### The decision this bears on

D-013 made Llama-3.2-1B the v1 target with reliability explicitly unmeasured,
and its revisit trigger reads: measured reliability of the 1B model is too low
to ship any useful capability. 0.63 on the unburned set, with gene and
question at 0.17 after three separate attempts at the prompt, is real evidence
against that record. Five of eight capabilities are at 0.67 or better and two
are at 1.00 on six samples, so the trigger has not fired for the whole
assistant. For gene and question specifically it is close, and the next move
should be a design change or a scope cut rather than a fourth rewording.
