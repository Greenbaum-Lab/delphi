# Decision Log

Owner: Agent 0. Append only. Never edit a past record; supersede it with a new
one and mark the old record superseded.

Format: ID, decision, driver, alternatives rejected, revisit trigger.

---

## D-001: Ship as a browser extension  [SUPERSEDED by D-008]

Recorded when the integration target was believed to be a general-purpose web
browser. Retained for history only.

---

## D-002: No account, ever

**Decision:** No login, no user identity, no server-side session for the
assistant. Permanent.

**Driver:** Owner requirement.

**Consequences accepted:** No server-side metering, revocation, rate limiting,
or audit trail for assistant usage. Any control that must live on the client can
be bypassed.

**Revisit if:** Never, per owner.

---

## D-003: Local inference only

**Decision:** The model runs on the user's device, in the browser. Hosted
inference, user-supplied API keys, and provider free tiers are all ruled out.

**Driver:** Owner decision, 2026-07-26. Combined with D-002 and the near-zero
cost requirement.

**Rejected explicitly by the owner:** Hosted inference on a project key,
user-supplied API keys, and provider free tiers.

**Cost accepted:** A model small enough to run in a browser tab on consumer
hardware is weak at multi-step tool use. This is a known constraint, not a
defect to be tuned away.

**Revisit if:** Owner reopens it. Closes Q-001.

---

## D-004: Confirmed actions only

**Decision:** The assistant proposes; the user confirms. Consequential actions
require explicit per-action confirmation showing the exact effect first.

**Driver:** Owner requirement.

**Open:** Which specific actions are automatic versus confirm-before. See Q-003.

---

## D-005: Hardware target is most modern machines, not all

**Decision:** Support most modern consumer hardware. Detect unsupported
hardware and say so honestly. Never silently degrade.

**Driver:** Owner requirement, and the memory ceiling of in-tab inference.

**Open:** The specific support matrix and the feature subset for machines that
fail the capability probe. Owned by Agent 3.

---

## D-006: Team shape  [SUPERSEDED by Q-007]

Recorded as three full-time engineers plus fractional design and security when
the target was a standalone product. The target is now a feature inside an
existing application, so team shape returns to open. See Q-007.

---

## D-007: Six-agent orchestration, web Projects in phase 1

**Decision:** Phase 1 runs as six separate Claude Projects, with the
architecture summary, decision log, and open questions list carried in every
project's knowledge. Agents do not see each other's conclusions; Agent 0 is the
only channel between them.

**Driver:** The current work is decisions, not code. Web chat has no
inter-project messaging, so durable state must live in files.

**Note:** A repository now exists, so the phase 2 trigger is met. Moving the
code-touching agents into Claude Code is available whenever the owner wants it.

---

## D-008: Integration target is DELPHI

**Decision:** The assistant is integrated into DELPHI, an existing interactive
genome browser web application, on branch bot2. Its UI renders into the
application's own DOM. There is no layer outside the page and no native code.

**Driver:** Owner statement of the actual integration target. Supersedes D-001.

**Consequences:**
- Constraint 7 is now the existing codebase (vanilla ES modules, no framework)
  rather than a browser support matrix.
- Agent 1 is an application integration engineer, not an extension engineer.
- Local inference runs in the page, sharing the tab with the application's data,
  caches, and any Python runtime.

**Closes:** Q-004.

---

## D-009: Assistant capability scope (Q-006)  [SUPERSEDED by D-011]

Superseded to correct two errors and record the phase-1 scope cut. Retained
for history only.

---

## D-010: Assistant may trigger Lambda jobs (Q-008)

**Decision:** The assistant may initiate on-demand Lambda compute.

**Driver:** Owner decision, 2026-07-26.

**Consequences accepted:** Under D-002 there is no server-side metering,
revocation, or rate limiting. Any spend ceiling that lives on the client can
be bypassed (D-002 consequence, restated). This decision therefore ships only
with:
- a hard client-side ceiling on assistant-initiated compute, understood to be
  bypassable and treated as blast-radius reduction, not prevention;
- mandatory per-action confirmation showing the exact job and its cost before
  any Lambda call (D-004 applies);
- constrained/allowlisted job parameters so a model-authored request cannot
  widen the job (constraint 6).

**Launch-blocking dependency:** Agent 5 owns a written control for
assistant-initiated spend before this capability ships. Under arbitration rule
1, security review governs whether and how this ships, and may not be
overruled by a capability argument.

**Revisit if:** Owner sets or changes the spend ceiling, or Agent 5's threat
model requires a tighter bound.

**Closes:** Q-008.

---

## D-011: Assistant capability scope (Q-006)

**Decision:** The assistant's intended goal scope is:
- Answer user questions about the browser and current display state.
- Navigate and select on the user's behalf from natural-language requests:
  population, statistic, gene, genomic position, metadata.
- Dispatch the application's refresh events so the user sees the result.
- (Goal, deferred from phase 1) Generate new populations from sample metadata.

**Driver:** Owner statement of scope, 2026-07-26, superseding D-009.

**Division of labor with the browser (owner-stated, corrects D-009):**
- The browser already fetches a population once chosen and already resolves
  genomic locations. The model does not compute either.
- Gene locations and population/sample metadata exist as annotations in the
  S3 bucket. The model reads and selects from these; it does not invent gene
  positions or locate them itself.
- The model's job is classify, extract parameters, and select from existing
  annotated metadata. Fetching and coordinate resolution are the browser's.

**Cost correction (corrects D-009):** Population generation is browser-local,
low compute. It carries no cost risk and does not fall under arbitration rule
1. Its difficulty is model reliability within the context budget, not spend.

**Phase-1 scope:** Population generation is deferred from the first version. It
remains a goal, last in queue, pulled forward if metadata-selection work makes
it cheap. It is not designed around as if absent. No other capability is
pre-cut; per-capability limitations are mapped and evaled rather than assumed.

**Consequences:**
- The binding constraint on metadata-driven selection is token/efficiency:
  per-sample metadata is rich, only a distilled subset fits the context
  budget. What is serialized and how is Agent 1 + Agent 2's shared question.
- Lambda-triggering (D-010) is unchanged and independent of population-
  generation compute.

**Open:** Per-capability reliability, to be measured (Agent 2). Confirmation
gating remains Q-003.

**Closes:** Q-006 (superseding D-009).

---

## D-012: 7-8B model class ruled out on memory  [AMENDED by D-013]

**Decision:** Models in the 7-8B parameter class are not viable for this
project. Weights plus KV cache exceed the 8GB RAM budget in-tab.

**Driver:** Agent 3 RAM arithmetic, session 1. Independent of reliability,
which is unmeasured.

**Alternatives rejected:** 7-8B local models. WASM/CPU as a primary runtime
(fallback/unsupported tier only).

**Revisit if:** Quantization advances enough to bring a 7-8B model under the
8GB budget with usable context.

**Note:** The 8GB floor is now owner-set. See D-013.

---

## D-013: 8GB supported floor, Llama-3.2-1B 4-bit as the v1 design target

**Decision:** The supported hardware tier requires a minimum of 8GB system RAM.
The first-version model is Llama-3.2-1B-Instruct at 4-bit quantization on
WebGPU. No larger model is in scope for v1. The 3B class is out of scope, not
deferred to a higher tier.

**Driver:** Owner decision, 2026-07-26, on Agent 3's session-1 measurements:
1B ~1.3GB resident, 3B ~2.2GB with observable browser slowdown, 7-8B over
budget. 8GB floor and the WebGPU coverage target are ratified as owner-set
working targets, not agent assumptions.

**Alternatives rejected:** 3B 4-bit (fits RAM but degrades the tab and buys
capability the owner does not require for v1). A 16GB floor to admit larger
models (rejected in favor of wider coverage).

**Consequences:**
- Fixes the RAM floor D-005 left open. Closes Q-009.
- Settles the model-size half of Q-002. Reliability remains unmeasured, so
  Q-002 stays open on that half alone.
- Agent 2 designs the loop against a 1B model. Context budget (Q-005) is
  bounded by 1B KV growth on an 8GB machine.

**Revisit if:** Measured reliability of the 1B model is too low to ship any
useful capability, or the owner raises the RAM floor.
**Session 7 memory confirmation (Agent 2):** Browser task manager 200MB -> 1.2GB,
i.e. ~1.0GB resident for Llama-3.2-1B q4f16, consistent with and slightly under
Agent 3's ~1.3GB session-1 figure. JS heap 111 -> 341 -> 596MB, confirming the
heap APIs do not see GPU-resident weights and that task-manager readings are the
correct instrument. Measured on the owner's machine, not on the 8GB floor, so
Q-010 remains open.
---

## D-014: Firefox and Linux (no WebGPU) are the unsupported tier for v1

**Decision:** Browsers and platforms without a WebGPU inference path, notably
Firefox and Linux configurations, are the unsupported tier for the first
version. They receive an honest capability-probe result and a clear message.
No CPU/WASM inference path is built for them in v1.

**Driver:** Owner decision, 2026-07-26. WebGPU is the only viable measured
path; WASM is fallback-only per D-012.

**Alternatives rejected:** A degraded CPU/WASM assistant for these users
(rejected: materially worse under the same UI, cuts against trust
calibration).

**Consequences:**
- Satisfies constraint 5: detect and tell honestly, never silently degrade.
- Closes Q-011.

**Revisit if:** WebGPU coverage on the target population proves unacceptable,
or a WASM path becomes fast enough to meet the interactivity bar.

---

## D-015: Assistant reads display state via getOptions; acts by mirroring handleSearch

**Decision:** The assistant integrates as a new top-level assistant/ module. It
reads display state through the existing getOptions() localStorage interface and
the existing assets.js/pops.js exports, and it acts by writing options and
dispatching the browser's own refresh/update events on [data-module="browser"],
mirroring the existing handleSearch path. The only new code touching DELPHI is
one thin parameterized, DOM-free action file equivalent to updateRegionFromInput.

**Driver:** Agent 1 interface map, session 2. The integration is additive and
touches no widely used low-level module, satisfying constraint 7 and arbitration
rule 4.

**Boundaries (do not modify):** /apc/common.js, /apc/cache.js, common.js (hg19
math), zoom.js, region.js, focal_window.js, the three track modules, helpers.js,
and browser.js. The assistant dispatches the events these already listen for
rather than editing them.

**Revisit if:** An intended capability cannot be reached through getOptions,
the named exports, or the refresh/update events without editing a listed module.

**Note:** Line-level references in the intake (browser.js:101, assets.js:453-466)
are Agent 1 first-hand reads, not independently verified against ARCHITECTURE.md.
**Session 3 verification note (Agent 1):** The read-only observer confirmed
D-015 holds as the *second* caller, with two exceptions. getOptions() in
/apc/common.js writes localStorage on a cold/absent key (a no-arg call would
write {} and wipe it); it is read-only only because browser.js init() calls it
first. listAnnotations() populates IndexedDB on a cold cache via
initializeAnnotationsTable(). Both are benign in a normally-initialized session
but mean "the assistant only reads state" is conditional on DELPHI having
initialized first. Effective y-axis bounds (defaultBounds() in browser.js) are
unexported and unreachable, same bucket as D-016. No module was edited.
---

## D-016: Per-bin signal values are out of scope for the assistant in v1

**Decision:** The assistant answers questions from general display state
(populations shown, coordinates, statistic, mode, zoom) only. It does not answer
"what is the value at this position." Per-bin signal values are not exposed
without touching a track module, and are not required.

**Driver:** Owner decision, 2026-07-26. Per Agent 1, per-bin values escape only
as each track's mean via the refresh CustomEvent; retrieving a specific value
would require re-calling getSignalTrack, which in adna mode is a billable Lambda
call (D-010).

**Consequences:**
- Removes a cost surface: the assistant never re-fetches signal data to answer a
  value question.
- Narrows the assert-vs-retrieve boundary (Agent 2): the assistant retrieves and
  selects from existing metadata and reports general state; it does not compute
  or fetch quantitative results.

**Revisit if:** The owner later wants positional value lookup, at which point its
cost profile (Lambda in adna mode) is designed in from the start.


**Session 7 correction (ARCHITECTURE (1).md):** This record's technical rationale
was wrong. Per-bin values ARE stored, as track.signal_bins (section 5), and are
read by browser/export.js exportPositionalData (section 10). They are reachable
without touching a track module and without re-calling getSignalTrack, so no
Lambda re-fetch is implied. The decision stands on owner preference (not needed,
low priority), not on unreachability. If revisited, the cost is reading
signal_bins from visible tracks as export already does, which is materially
cheaper than this record implies.
---

## D-017: Assistant-initiated Lambda carries no project cost  [SUPERSEDES D-010]

**Decision:** Assistant-initiated Lambda compute is unmetered and unbilled; it
carries no cost to the project. The spend-control dependency D-010 made
launch-blocking is withdrawn, having no subject.

**Driver:** Owner-stated fact, 2026-07-26, retracting the billable premise D-010
and D-011's cost correction rested on.

**Consequences:**
- Arbitration rule 1 no longer governs Lambda triggering. The adna mode flip is
  a latency and correctness question, not a cost or security one.
- Agent 5's T-1 (unauthorized spend) and the entire spend-control proposal are
  withdrawn as moot. Lambda triggering may ship in v1.
- The dead "Q-009" reference inside D-010 is closed as moot (Q-009 is the RAM
  floor, unrelated).
- Availability remains: an injection loop or retry storm can saturate the
  endpoint with no per-user kill switch (D-002). Rated low severity, not
  launch-blocking, handled as loop hygiene in Agent 2 (step/concurrency
  ceiling), not as a security control.

**Revisit if:** The owner reports Lambda cost or quota metering, or endpoint
saturation proves user-visible.

---

## D-018: assistant/ has no network egress except allowlisted actions  [property of D-015]

**Decision:** The assistant/ module is given no fetch and no dynamic import. Its
only outbound path is the allowlisted, parameter-validated action functions.
This makes the D-003 local-inference privacy property structural rather than
promised, and closes model-authored exfiltration (Agent 5 T-6) architecturally.

**Driver:** Agent 5 session, 2026-07-26.

**Revisit if:** Any capability requires the assistant to fetch directly, which
reopens the exfiltration surface and requires an allowlist review.

---

## D-019: CSP is out of scope for the bot2 branch in v1

**Decision:** No Content-Security-Policy work is done on the bot2 branch for the
first version. T-4 (DOM XSS) rests solely on the textContent-only output rule;
T-5 (supply-chain) rests solely on pinned-URL plus post-download hash
verification. Each is a single-layer defense with no backstop.

**Driver:** Owner decision, 2026-07-26.

**Consequences accepted:** No defense-in-depth second layer behind the
textContent rule or the weight-hash check. Agent 5 assessed this acceptable
given the reduced injection surface (user data local-only, only owner writes
S3), and flagged it as single-layer to the lead.

**Revisit if:** The injection surface widens, model-authored HTML/links become
necessary, or CSP becomes available on the branch.

## D-010: Assistant may trigger Lambda jobs (Q-008)  [SUPERSEDED by D-017]

---

## D-020: State serialization format ratified (v1)

**Decision:** Agent 1's line-oriented state serialization format is ratified as
the v1 format Agent 2's eval corpus is built against. Shape: key=value lines,
one concept per line; a BEGIN_UNTRUSTED_DATA/END_UNTRUSTED_DATA fenced region
holding every string of data provenance, one pipe-separated record per line;
header carries only numbers, flags, and strict-token-pattern strings; '-' means
absent, '?' means present-but-unusable; escaping maps backslash and pipe to
escaped forms and every non-printable ASCII (including newline) to '?';
fields truncate at 48 chars with trailing '~'.

**Driver:** Agent 1 session 3, verified against a label containing a literal
END_UNTRUSTED_DATA and a newline. Ratified now because the format is cheap to
change before an eval corpus exists and expensive after.

**Owned by:** state_serializer.js (pure, DELPHI-free). Quarantine membership is
decided by provenance, not by whether a value looks harmless (T-2).

**Open (not settled here):** whether the static available-annotation catalogue
is carried in per-turn state or moved to a consulted-on-demand lookup. This is
the shared Agent 1/Agent 2 serialization question; see Q-005.

**Revisit if:** Agent 2's selection framing requires a different structure, or
the catalogue-placement decision changes what the per-turn block contains.

---

## D-021: Available-annotation catalogue is consulted on-demand, not carried per-turn

**Decision:** The static available-annotation catalogue is not carried in the
per-turn serialized state. Per-turn state carries display state plus active
annotations and the gene track only. When the model is deciding an annotation
or gene selection, the list is presented that turn and the model returns an
index into it. This closes the D-020 open item.

**Driver:** Agent 1 measurement (catalogue is 63.8 pct of payload, byte-identical
across turns, tokenizes poorly) plus Agent 2 selection framing. Settled jointly
as D-011's consequences section required. The trusted header already carries the
active/available annotation counts, so count questions are answered without ids.

**Consequences:**
- Gene and annotation selection become two hops (classify, then present-and-
  select): one extra model call and one extra failure point, accepted under
  deterministic-first (code routes between hops; the model makes one selection
  per call).
- The quarantined id block is out of context except on selection turns, which
  narrows the injection window Agent 5 reasons about.

**Revisit if:** Two-hop selection measures materially worse than single-hop on
Agent 2's eval, or the KV budget (Q-005) proves loose enough to carry the
catalogue.
**Session 4 verification note (Agent 1):** Serializer updated and measured on the
same 3-population adna view: per-turn state 1123 chars / 37 lines down to 429
chars / 20 lines, a 62 pct reduction against the 63.8 pct predicted. The
selection list is 563 chars / 21 lines and was byte-identical across all four new
captures, confirming the catalogue is static as this decision assumed. Both
blocks reuse the D-020 fences deliberately (escaping, not marker naming, is what
makes a fence unforgeable) and are told apart by a trusted first line:
DELPHI_STATE 1 vs SELECT n. One selection function serves annotation, gene,
population and metadata selection.
---

## D-022: Gate-4 task-set schema ratified

**Decision:** The eval task set is seven types, one per D-011 decision:
T-classify, T-extract-position, T-select-statistic, T-select-gene,
T-select-population, T-select-metadata, T-answer-state. Every expected output is
checkable against a code-held set (enum match, integer equality, index or index-
set membership). Selection outputs are always an index into a fenced list, never
a header count; composing an id that was not presented that turn is a scored
failure (T-3 as a test). Per-type target ~25-40 tasks, roughly half nominal /
half edge, once capture lands.

**Driver:** Agent 2 session 5, built against D-011 scope and D-020 format.

**Revisit if:** A capability's real framing turns out not to reduce to an index/
integer/enum output, or the owner rules free-form narration into scored scope
(see Q-006-narration open item below).


**Session 6 amendment note:** T-select-gene, T-select-population and
T-select-metadata are re-scoped from index-into-presented-list to
extraction-plus-resolution per D-026. Output remains auto-scorable: the scored
unit is the resolved code-held entry. This is the revisit trigger in this record
firing as written.
---

## D-023: Free-form state narration is cut from v1

**Decision:** Open-ended "explain/summarize what I'm looking at" narration does
not ship in v1. Single-field state retrieval (T-answer-state) remains in scope
and covers the common case: "what statistic am I viewing?" returns measure,
"what mode am I in?" returns mode, and likewise for region, populations, zoom,
and the other header fields.

**Driver:** Owner decision, 2026-07-26, on Agent 2's recommendation. Narration
is not auto-scorable and would ship with no reliability number, cutting against
arbitration rule 3. Retrieval answers the real need with a checkable output.

**Consequences:**
- The eval's scored set covers all shipped answer capabilities; nothing ships
  un-evaled.
- Vaguely-phrased "what am I looking at?" routes via T-classify to a single-field
  answer or to a clarifying prompt (Agent 4 flow), not to generated prose.

**Revisit if:** The owner later wants narration, at which point it returns as an
evaled capability with its own scored task type, not an un-evaled addition.

---

## D-024: The action layer selects existing labels and never constructs or transforms one

**Decision:** Every label crossing into an action parameter is selected from a
list the code already holds. No label is constructed, derived, or transformed,
including deriving aadr_population from a population label.

**Driver:** Agent 1 session 4. aadr_population is not derivable from the
population label in either direction: Puerto Rican -> PUR.DG, San -> San,
Basque -> Basque.DG, BantuSouthAfrica -> gnomad_pop_BantuSouthAfrica. Four
distinct patterns, no rule. Separately, Dataset takes at least three observed
values (HGDP, AADR, 1KGP) and is data-derived, so it is not a closed enum.

**Consequences:**
- Extends T-3 from model output to the action layer: not only must the model
  select rather than name, the code must not transform what was selected.
- Agent 2 must not treat Dataset as a closed enum in any task type.

**Revisit if:** A capability requires a label DELPHI does not already expose in
a retrievable list.

---

## D-025: The sort option set is one closed list of five, shared by pairwise and individual tracks

**Decision:** Sort options are identical for pairwise and individual tracks:
Distance_from_Africa, genetic_distance, time, Temperature_index,
Precipitation_index. One closed enum of five values, valid for every track type.

**Driver:** Owner statement, 2026-07-26, answering Q-013. Matches the pairwise set
Agent 1 read from the pairwiseSort switch in pops.js, so the code-read list is the
complete list rather than a subset.

**Consequences:**
- T-answer-state can score the sort field against a closed enum. The last
  unspecified field in the D-022 task set is now specified.
- Agent 1's observed values (time, Temperature_index) are both members, as
  expected.
- DEFAULTS.sort is 'date', which is not a member. This remains the known DELPHI
  inconsistency Agent 1 reported (syncSortDropdown silently rewrites it on load);
  an eval must not assert against DEFAULTS for this field.

**Revisit if:** A read of .sort-selector in index.html disagrees with this list, in
which case the dropdown is authoritative per syncSortDropdown.

---

## D-026: Gene and population resolution is extraction plus deterministic exact-match resolution

**Decision:** For genes and populations the model extracts a name; code resolves
it by exact match against a code-held collection (gene map, 55,765 entries,
name -> {chr, start}; population catalogue, 147 records). The scored and acted-on
unit is the resolved entry, never the extracted string. Unresolvable resolves to
clarify. An index-selection list is presented only on ambiguous multi-match.
Index-into-presented-list selection remains the mechanism for annotations (18)
only.

**Driver:** Agent 2 session 6, on owner-supplied facts about the gene map and
population catalogue. Cheaper in context than list presentation and strictly
safer: the model's string is a lookup key against a code-held list, never an
action parameter, so T-3 and D-024 hold.

**Condition:** Resolution is exact match only. Fuzzy, normalized, or
best-effort matching is a transformation and is forbidden under D-024. A
near-miss resolves to clarify, not to a guess.

**Amends:** D-021 and D-022's assumption that selection means index into a
presented list. T-select-gene, T-select-population and T-select-metadata are
re-scoped to extraction-plus-resolution; their outputs stay auto-scorable because
the resolved entry is a member of a code-held set. D-021's catalogue-on-demand
decision is unaffected for annotations.

**Metadata selection decomposes into two capabilities:** sort field, a closed enum
of five (D-025), needing no list; and metadata-driven population filtering, which
lands on the existing population action with a code-computed label set.

**Revisit if:** Ambiguous multi-match proves common enough that list presentation
is the normal path rather than the exception.

---

## D-027: ARCHITECTURE (1).md is the authoritative codebase reference

**Decision:** The comprehensive architecture and data-flow reference supersedes the
original ARCHITECTURE.md summary as the authoritative description of DELPHI. The
.intent/* directory is stale and must not be trusted (it describes hg38,
client-side Web Worker computation, and .janno metadata; the app uses hg19, AWS
Lambda, and JSON). The /apc/ "do not modify" convention is retained.

**Driver:** Owner-supplied comprehensive reference, 2026-07-26.

**Closes from the old known-gaps list:** module interfaces (with
INTERFACE_MAP.md); refresh event names and behavior (update/refresh, section 4);
localStorage and IndexedDB shapes (sections 3 and 15); Lambda trigger and batching
profile (section 7B); Pyodide load behavior (section 14: never loaded by
index.html); build step (framework-free, no-build).

**Still gaps:** CSS conventions and whether a design system exists; test setup.

**Revisit if:** The codebase diverges from this reference.

---

## D-028: The assistant validates coordinates itself and does not rely on zoomToLevel's clamp

**Decision:** All chromosome and position validation happens in the assistant's own
action layer against CHR_LENGTHS keyed by chromosome. The assistant does not rely
on zoomToLevel's chromosome-length clamp for range safety.

**Driver:** ARCHITECTURE (1).md section 1 documents that browser/helpers.js and
browser/zoom.js default assembly to 'hg38' and index CHR_LENGTHS[assembly]?.[chr],
while CHR_LENGTHS is keyed by chromosome directly, so the clamp falls back to
Infinity. Panning code indexes CHR_LENGTHS[chr] correctly and is unaffected.

**Consequences:**
- Agent 5's T-3 control names "integers validated against hg19 in common.js" as
  the mechanism. That wording must be revised: the assistant performs the
  validation; the existing clamp is not a control.
- The latent bug is DELPHI's and is not ours to fix (constraint 7, arbitration
  rule 4). We do not depend on it.

**Revisit if:** The assembly-keying bug is fixed upstream.


## D-029: Gate 4a is a design baseline, not a capability measurement

**Decision:** The Gate 4a run is recorded as a valid baseline of the current
harness design and is explicitly NOT a capability measurement. No capability is
described, scoped, cut, or shipped on these numbers. Arbitration rule 3 does not
fire until a clean re-run exists.

**Driver:** Agent 2 session 7, self-reported. Two harness defects contaminate the
numbers and are Agent 2's, not the model's:
- Schemas made every parameter optional (required: ['action'] only), so the
  grammar permits omitting a parameter and the model omits the first-declared one
  while emitting the rest correctly. Accounts for 14/30 position, 4/30
  answer-state, 1/30 gene.
- clarify is reachable in every schema and action is generated before parameters,
  so the model commits to clarify then fills parameters correctly anyway. Clarify
  share: population 22/30, classify 17/30, answer-state 15/29. Accounts for 8/30
  population, 3/30 position, 2 gene, 1 answer-state.
33 of 118 failures are directly attributable to these two; the clarify bias
plausibly contaminates more. markModelCapability promoted schema-induced failures
to model-capability and needs a harness-defect category.

**Recorded for history (contaminated, do not cite as capability):** overall /
nominal / edge - gene 0.43/0.60/0.27; classify 0.37/0.07/0.67; statistic
0.37/0.47/0.27; population 0.23/0.27/0.20; answer-state 0.23/0.00/0.47;
position 0.00/0.00/0.00. Edge beats nominal wherever the expected answer is
clarify, which is clarify bias, not edge competence. Invalid JSON 1/180.

**What it does establish:** nothing is close at these numbers (best nominal 0.60,
gene selection), the corpus/generator/scorer need no change, and the defects are
confined to schemas.js and one line of the system prompt.

**Revisit:** superseded by the clean re-run. Q-002's reliability half stays open.

## D-030: Confirmation gating is removed from v1  [SUPERSEDES D-004]

**Decision:** The assistant acts on its scoped actions without per-action
confirmation. No confirmation dialog and no undo mechanism ship in v1.

**Driver:** Owner decision, 2026-07-27.

**Constraint change:** Block 0 constraint 4 (CONFIRMED ACTIONS ONLY) is
withdrawn by the owner and must be edited out of all six project contexts.
Until that edit lands, Block 0 and this record disagree.

**Security assessment:** No live security control depended on confirmation.
T-1 died with D-017; T-6 is closed by D-018; T-3 is closed by D-024, D-026
and D-028, which keep every action parameter a selection from a code-held
list or an integer the assistant validates itself. The posture is
architectural, not procedural.

**Residual risk accepted:** An injected instruction that reaches an action
now executes with no human gate. Blast radius is a view change: bounded, and
manually repairable for every field except region, where the user's prior
coordinates are lost with no way to recover them.

**Alternatives rejected:** Per-action confirmation (owner: paperwork). Full
undo stack (owner: not needed). Region-only state snapshot (recommended by
Agent 0, declined by owner).

**Closes:** Q-003 as moot.

**Revisit if:** Users report losing their place, or capability scope widens
beyond view state.
