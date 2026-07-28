# Model loop measurements

Llama-3.2-1B-Instruct-q4f16_1-MLC on WebGPU, DELPHI live in the same tab, real
`/data`. Run with `(await import('/assistant/diagnose.js')).run()`.

Reported per capability, never pooled into one headline, per D-029.

---

## Correction: every latency figure below runs 4 was measured on the wrong GPU

Runs 2, 3 and 4 were all run on the discrete NVIDIA chip, not the integrated
Intel chip D-031 makes the design target. This was not known when they were
recorded. Their **accuracy** numbers stand, since greedy decoding on the same
weights does not depend on which GPU runs it. Their **latency** numbers do not
apply to the target hardware and must not be quoted.

The specific claim to strike is mine: that D-029's 2.3 tok/s produced a 9-14s
projection "wrong by a factor of three". On the Intel chip that projection now
looks roughly correct, and D-031 already said as much. A measured number from
the wrong machine was used to overrule a recorded figure from the right one.

Two conclusions built on those timings are withdrawn until re-measured on
Intel:

- that latency is not the binding constraint;
- that a second round trip is affordable, which is what made the two-call
  design look cheap.

D-031's revisit trigger reads: integrated-GPU throughput cannot meet the
20-second target even with fixed per-call cost removed. Whether it has fired is
now an open measurement, not a settled question.

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

## Run 5 protocol, recorded before the run

Written down first on purpose. Every earlier round decided what counted after
seeing numbers, and run 1 was void because of it.

**Two sets, and they do different jobs.**

- `SELECTION_SET`, 128 utterances, 16 per capability, in
  `assistant/eval_selection.js`. Models are compared on this, and any tuning
  that follows is measured on this. It is expected to be spent.
- `FINAL_SET`, 200 utterances, 25 per capability, in `assistant/eval_final.js`.
  Run once, on the configuration already chosen, and not looked at before that
  choice. 25 per capability is D-022's floor and the first set in this project
  to reach it.

Selecting on one set and reporting on the other is the whole point. A model
picked as best of three on a set will score high on that set whether or not it
is better, and quoting that number would repeat run 1's error with more
arithmetic on top.

**Both sets were verified mechanically, not by eye.** Every gene symbol exists
in the real gencode19 name map (55,765 entries), every population label exists
in the real 147-entry catalogue, every region lies inside `CHR_LENGTHS`, the
per-capability counts are exactly even, and the overlap with `DEV_SET`,
`HELD_OUT_SET` and `TEST_SET` is zero. A classification pass is therefore also
a request that would have resolved.

**Three arms**, in `assistant/bench.js`:

| model | status |
|---|---|
| Llama-3.2-1B-Instruct-q4f16_1 | incumbent, named by D-013 |
| Qwen2.5-1.5B-Instruct-q4f16_1 | candidate, same memory class, different family |
| Llama-3.2-3B-Instruct-q4f16_1 | ceiling reading only, out of scope by D-013 |

The 3B arm is diagnostic and is not a shipping candidate. It answers one
question the other two cannot: whether the weak categories move with model
capability at all. If 3B fails `gene` and `question` too, then no model swap
fixes them and the design is what is wrong, which would settle the open
question left at the end of run 4.

**One variable.** Same prompt, same schema, same no-state router, same
utterances in the same order, temperature 0. Only the model id changes. Run 4's
confounded change is the reason this is stated explicitly.

**What gets reported.** Per capability, never pooled into a single headline
alone (D-029), plus a confusion breakdown of what each failure was classified
as. Run 3 and run 4 had similar overall rates while failing different
categories, and the rates alone could not show that.

## Run 5 arm 1: Llama-3.2-1B on SELECTION_SET, 128 utterances

Overall 0.65. Loaded in 3273ms. **Ran on the NVIDIA chip again**, reported by
WebLLM itself as `Finish loading on WebGPU - nvidia`, so the p50 of 5537ms is
once more not a target-hardware number. The max of 14169ms is the first few
calls warming up, not a steady-state figure.

| capability | rate |
|---|---|
| sort | 16/16 = 1.00 |
| region | 15/16 = 0.94 |
| statistic | 15/16 = 0.94 |
| add_population | 14/16 = 0.88 |
| question | 8/16 = 0.50 |
| clarify | 8/16 = 0.50 |
| replace_population | 7/16 = 0.44 |
| **gene** | **0/16 = 0.00** |

Where the 45 failures went:

```
gene               -> statistic x7, region x2, sort x2, add_population x2,
                      replace_population x2, question x1
replace_population -> clarify x4, question x2, sort x2, add_population x1
question           -> statistic x4, sort x3, clarify x1
clarify            -> statistic x5, add_population x2, question x1
add_population     -> replace_population x1, question x1
region             -> sort x1
statistic          -> replace_population x1
```

### gene is not weak, it is absent

Zero of sixteen, on a set three times the size of the one that measured 0.17.
`find the LDLR gene` returns statistic while containing the word gene, and the
bare symbol `MC1R` returns statistic. The model is not discriminating this
category at all.

The dominant sink is statistic, 7 of 16. A mechanism worth testing: `fst` is
the salient short uppercase token in the prompt and the guide describes a gene
symbol as short capitalised letters and digits, so the two descriptions
compete and the enum-constrained branch wins.

Only 4 of the 16 gene failures went to a population action, so cross-catalogue
disambiguation is worth having but is not the fix for this.

### The prompt's own example names are being emitted

Four failures returned a name that appears nowhere in the utterance and comes
straight out of the prompt examples:

```
move over to fulif                        -> replace_population (Papuan)
go to PSEN1                               -> replace_population (Papuan)
make the tracks purple                    -> add_population (Papuan)
create a new population from these samples -> add_population (Sardinian)
```

This is the borrowed-name failure from run 1, which removing the state block
was thought to have closed. It did close the data-provenance route, which is
what mattered for T-2. The remaining route is the prompt's own examples, and it
means the examples are being copied rather than read as patterns. The
copy-exactly instruction is not holding.

## Run 5 arm 2: Qwen2.5-1.5B on SELECTION_SET

Overall **0.77** against Llama-1B's 0.65, on the same 128 utterances in the same
order with only the model id changed. Also on NVIDIA, so the p50 of 7405ms is
again not a target-hardware figure; it is 34 percent slower than Llama-1B on
the same chip, which is the only latency statement these two runs support.

| capability | Llama-3.2-1B | Qwen2.5-1.5B |
|---|---|---|
| gene | 0.00 | **0.75** |
| region | 0.94 | **1.00** |
| statistic | **0.94** | 0.75 |
| add_population | **0.88** | 0.38 |
| replace_population | 0.44 | **0.75** |
| sort | 1.00 | 1.00 |
| question | 0.50 | **1.00** |
| clarify | 0.50 | 0.56 |
| **overall** | 0.65 | **0.77** |

Qwen wins five capabilities, loses two, ties one. The two it wins largest are
the two that three prompt rewrites could not move: gene from nothing to 0.75,
and question from a coin flip to 16 out of 16. That is the answer to whether
these categories are reachable by a 1B-class model on this prompt. They are
not, and they are reachable one size up.

### The add/replace bias is systematic and one-directional

Qwen's single bad capability is add_population at 0.38, and 7 of its 10 failures
are the same mistake: it chooses replace_population for a plainly additive
request.

```
bring in the Balochi     -> replace_population
show the Biaka as well   -> replace_population
I want Burusho on there  -> replace_population
also include Dai         -> replace_population
put Daur up              -> replace_population
stick Mongolian in       -> replace_population
include Sindhi           -> replace_population
```

`as well` and `also` are additive in so many words. Meanwhile every one of the
16 replace utterances in this set carries an explicit exclusivity marker: only,
just, alone, nothing but, instead, except, wipe, swap, clear, by itself, drop
the others.

That asymmetry is worth acting on in code rather than in the prompt, because
the two errors do not cost the same. Replacing when the user meant add destroys
a selection they built. Adding when they meant replace leaves one extra track.
D-034 already says adding is the default and replacing happens only when asked;
requiring an exclusivity marker before a replace is that decision enforced
rather than delegated to a model that is measurably bad at it.

Applied to this set it would move add_population from 6/16 to 13/16 and break
none of the 16 replace cases. That is a projection on the set it was derived
from, so it needs FINAL_SET to mean anything.

### Classification is not end-to-end, and the harness only measures the first

`take a look at OCA2` was scored a pass: the action was gene, which is correct.
The extracted name was **OCAB2**, which is not a gene. It would have reached the
resolver, failed, and produced a clarification. The harness counted it as a
success.

Other outputs show the same class of defect, though they were already failing
on classification:

```
run fst instead of what is up              -> replace_population (run fst instead of what is up)
stick Mongolian in                         -> replace_population (Stick Mongolian)
create a new population from these samples -> replace_population (new_population_label)
make the tracks purple                     -> replace_population (tracks)
```

`new_population_label` is a schema field name emitted as a value. `Stick
Mongolian` is a capitalised fragment of the utterance rather than the label
inside it.

So every rate above is an upper bound on what a user experiences. Before
FINAL_SET runs, the harness has to check that an extracted gene or population
name actually resolves, and report classification and end-to-end separately.

### The borrowed-name failure has a second form

Llama emitted the prompt's example names, Papuan and Sardinian. Qwen emits
schema field names and utterance fragments. Neither borrows from data any more,
so T-2 stays closed, but "copy the name letter for letter from the request" is
not holding on either model.

## Run 5 arm 3: Qwen2.5-1.5B on the integrated Intel chip

The first measurement in this project taken on the hardware D-031 names as the
target. Confirmed by WebLLM's own line, `Finish loading on WebGPU - intel`.

| | NVIDIA | **Intel** |
|---|---|---|
| overall | 0.77 | **0.77** |
| latency p50 | 7405ms | **5047ms** |
| latency max | 9682ms | 10957ms |
| load, cold | 21976ms | 38645ms |

### The integrated chip is faster per request, not slower

p50 5047ms against 7405ms on the discrete card: 32 percent **quicker**. This
contradicts the expectation the whole latency worry rested on, including the
owner's impression that Qwen was significantly slower on Intel.

What is slower is loading: 38.6s against 22.0s. Both were cold and
download-dominated, so that gap is mostly network rather than hardware, but the
first open is where the delay is felt, and it is a one-off per model.

Single-token decode is bound by memory latency and per-dispatch overhead rather
than arithmetic, so a discrete card's advantage does not show up at batch size
one and its transfer costs do. That is a plausible reading, not a measured
cause; nothing here isolates it.

**D-033 is met on target hardware with a fourfold margin.** The claim withdrawn
in the correction above is restored for Qwen on Intel, this time from the right
chip. D-031's revisit trigger has not fired.

The slowest requests are region jumps, 7-11s, which emit the most tokens: a
chromosome plus two integers. That is D-033's cost model behaving exactly as
stated, and the tail still sits at half the budget.

### Accuracy does not depend on the GPU

0.77 on both chips. Seven of eight capabilities scored identically; only
add_population moved, 6/16 to 5/16, a single utterance flipping. The
assumption behind the correction above, that accuracy carries across GPUs while
latency does not, is now measured rather than assumed.

### add_population is the one bad capability, and it got worse

0.31 here, with 8 of 11 failures being replace_population chosen for an
additive request. On NVIDIA it was 7. The case for enforcing D-034 in code
rather than in the prompt is unchanged and slightly stronger.

## Run 5 arm 4: Qwen2.5-1.5B on a second, weaker Intel machine

Same model, same set, same order. Accuracy identical to the first Intel run
down to the individual failure: 0.77, the same 30 failures, the same confusion
counts. Latency is another matter entirely.

| | NVIDIA | Intel A | **Intel B** |
|---|---|---|---|
| overall | 0.77 | 0.77 | 0.77 |
| p50 | 7405ms | 5047ms | **47785ms** |
| fastest call | - | 3447ms | 45599ms |
| slowest call | 9682ms | 10957ms | 55778ms |

**Intel B misses D-033's 20-second target by a factor of 2.4, on every single
request.** The fastest thing it did all run was 45.6 seconds.

### Accuracy does not depend on hardware. This is now measured, not assumed.

Three machines, two GPU vendors, one score: 0.77. Intel A and Intel B produced
byte-identical results. NVIDIA differed by one utterance out of 128. Any future
accuracy work can be done on whatever machine is free.

### The cost is prefill, not decode, and that is fixable

Splitting each machine into the fixed cost every call pays and the part that
scales with output length:

| | Intel A | Intel B | ratio |
|---|---|---|---|
| fixed (fastest call) | 3447ms | 45599ms | **13.2x** |
| variable (slowest minus fastest) | 7510ms | 10179ms | **1.35x** |

Decode is barely slower on Intel B. The fixed cost is thirteen times worse.

That is the signature of a weak-compute integrated GPU. Prefill multiplies
matrices and is compute-bound; decode multiplies a matrix by a vector and is
memory-bandwidth-bound. Intel B has comparable bandwidth and far less compute,
so it pays enormously for prefill and almost nothing extra for generation.

What is being prefilled is our own system prompt: **585 tokens, re-prefilled on
every message.** At Intel B's rate that is roughly 13 tokens per second, which
accounts for essentially the whole 45.6-second floor.

Neither the pinned WebLLM 0.2.79 nor 0.2.84 exposes prefix caching, checked by
searching both builds. So the same 585 tokens are recomputed for every turn and
nothing in the runtime will reuse them.

D-033 says setup work happens once at startup and never inside a request. The
system prompt is setup, it is identical on every call, and it is being paid for
per request. That went unnoticed because every earlier measurement was taken on
hardware fast enough to hide it.

### What this does not settle

There is still no Llama-1B measurement on either Intel machine. Without it we
cannot separate how much of Intel B's 45.6-second floor is model size and how
much is prompt length. That one run is the highest-value measurement left.

## Run 6: the 50-prompt user test, and what it caught

`assistant/user_test.js` drives route() rather than the model, and scores on the
option values the browser ends up with. First run: **35/50**.

| group | rate |
|---|---|
| add population | 7/7 |
| region | 5/5 |
| statistic | 5/5 |
| sort | 5/5 |
| conversation | 5/5 |
| state question | 3/6 |
| gene | 3/8 |
| near miss | 1/2 |
| off topic | 1/3 |
| replace population | 0/4 |

Model turns p50 5434ms, code-only turns 0ms, first turn 29115ms including the
load.

### It caught that the shipping path was never switched

The stack trace runs route() to startModel() to the MODEL_ID constant, which was
still Llama-3.2-1B. Every Qwen measurement had gone through startNamedModel in
the bench and session probes. So this 35/50 is the old model, and gene at 3/8
and replace_population at 0/4 are its known collapse points. MODEL_ID is now
Qwen2.5-1.5B.

Worth keeping in mind: three runs of accuracy measurement never touched the code
path a user actually reaches. Only a test written against route() found it.

### A defect, not a score: read-only requests are writing state

```
how is it sorted                -> Sort set.
what statistic am I looking at  -> Statistic set.
write me a poem                 -> Statistic set.
```

Asking a question changed the view, and so did a request to write a poem. A
misclassification that only produces a wrong answer is tolerable; one that
mutates the browser is not. Nothing in the action layer distinguishes a question
from a command, because the model is trusted to have made that call.

### The two models have opposite population biases

Llama turned all four replace requests into adds. Qwen turns adds into replaces:
8 of 11 add failures on the 128-set. This kills the guard proposed after run 5,
which forced add when no exclusivity marker was present: that fixes Qwen and
does nothing for Llama. The rule has to run both ways, marker present meaning
replace and marker absent meaning add, decided in code from the user's own
words.

### The near-miss path did not fire, because the model tidied the name

`add Basqe` returned Populations added. The model emitted a label that resolved
rather than copying what the user typed, so the resolver never failed and the
did-you-mean question never happened. The user got what they wanted by way of
the model doing exactly what D-024 forbids. Silent correction is not free: the
same behaviour on a name that is close to two real labels picks one without
asking.

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
