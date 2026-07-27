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

### The decision this bears on

D-013 made Llama-3.2-1B the v1 target with reliability explicitly unmeasured,
and its revisit trigger reads: measured reliability of the 1B model is too low
to ship any useful capability. 0.62 overall, with two capabilities at or near
zero, is the first evidence against that record. It is not yet enough to fire
the trigger, because the remaining failures are concentrated in prompt problems
that have not had one honest attempt at a fix.
