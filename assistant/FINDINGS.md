# Stage 1 reconnaissance

Six facts established by reading the code, per CLAUDE.md section 11. No code was
changed in this stage.

Everything below is a first-hand read of the branch at `d184738`. Where a fact
could not be established by reading, it says so.

What I did not read, and why it does not affect these answers: `lambdas/*`,
`analyses/*`, `maintenance/*` (server side, not the browser hot path);
`analysis.js`, `plot.js`, `jobs.js`, `toc.js`, `lfu.js`, `worker.dedicated.js`
(ARCHITECTURE.md section 14, never loaded by `index.html`, confirmed against
`index.html` which loads only `browser`, `track` and `library`); `apc/graphics/*`
and `apc/plot/*` (SVG drawing, below the level the assistant works at);
`custom_annotation.js`, `browser/export.js`; the eval modules other than
`catalogues.js`, `state_parser.js`, `prompt.js` and `schemas.js`.

Assets under `/data/` are not in the repository. Anything about catalogue
contents or size is therefore unverifiable by reading and is marked as such.

---

## 1. Region jumps: which fields must be written

**Writing `chr`, `start` and `end` is not enough. Six fields must be written.**

`updateRegionFromInput` (`browser/helpers.js:43-70`) is the reference path, and
it writes all six:

	chr, start, end, zoom_level, viewfinder_start, viewfinder_end

It derives them: `clampSpanToMinimum` enforces `MIN_SPAN` 10,240
(`browser/region.js:28`), `findZoomLevelForSpan` picks the level
(`browser/zoom.js:62`), `computeViewfinderBounds` widens by `VIEWFINDER_RATIO` 2
around the centre (`browser/region.js:4`). It then calls `updateRegionInput` to
sync the text box and dispatches `refresh`.

**The app repairs one of the three derived fields, and only partially.**

- `viewfinder_start` / `viewfinder_end`: repaired. The viewfinder track's
  `refresh` hook (`tracks/viewfinder.js:98-115`) calls
  `shouldRecenterViewfinder`, which returns true when the focal window comes
  within 10 percent of a viewfinder edge (`browser/focal_window.js:85-91`). On
  true it recomputes and writes both fields. So a jump far from the current
  viewfinder self-corrects on the next refresh. A jump landing inside the
  current viewfinder does not, and the viewfinder keeps showing the old
  neighbourhood, which is correct behaviour but means the field is stale
  relative to what a fresh jump would have produced.
- `zoom_level`: never repaired. Exactly four sites write it
  (`browser/helpers.js:35`, `:64`; `tracks/viewfinder.js:245`, `:279`). Nothing
  derives it from the current span. A writer that skips it leaves it
  permanently wrong.

**Consequence for the assistant.** The action layer writes all six fields
itself, as `updateRegionFromInput` does. It does not rely on the viewfinder
repair, which is conditional and only covers two of the three.

**A live DELPHI inconsistency, found while establishing this.** The gene-search
path (`tracks/annotation.js:197`) writes only `chr`, `start` and `end`. It
leaves `zoom_level` at whatever it was. Because it preserves the current span
the level stays numerically correct, so this is latent rather than visible, but
it is the one navigation path in DELPHI that does not write the full set. Our
action layer will not copy it. This is DELPHI's, not ours to fix (constraint 7).

---

## 2. Gene span: the window a gene jump opens

**The gene's own length is not used. The current span is preserved and
re-centred on the gene's start coordinate.**

`handleSearch` in `tracks/annotation.js:176-205`:

	current_span = options.end - options.start
	half_span    = floor(current_span / 2)
	new_start    = max(0, coords.start - half_span)
	new_end      = min(CHR_LENGTHS[coords.chr] || Infinity, coords.start + half_span)

Three things follow from this that matter:

- The gene map value is `{chr, start}` only. `parseJSONL`
  (`assets.js:213`) stores `name_map.set(gene.name, {chr, start})` and discards
  the end. So the gene's length is not available from the map at all, which is
  why the app cannot use it. Full coordinates including `end` do exist, but on
  the `genes` array (`assets.js:207`), not the name map.
- The window is centred on the gene's **start**, not its midpoint. For a long
  gene at a tight zoom the body of the gene runs off the right edge.
- `CHR_LENGTHS[coords.chr]` is indexed correctly here, keyed by chromosome. This
  is the correct pattern; `zoomToLevel` is the broken one (D-028).

It also highlights the gene, dispatches `refresh`, and clears the highlight
after 4000 ms with a second `refresh`.

**Matching in DELPHI's own search is case-insensitive** (`annotation.js:185-186`
lowercases both sides and scans all entries). Our resolver must not copy this:
D-026 requires exact match, and D-024 makes normalisation a forbidden
transformation. Noting it because the two behaviours will visibly differ, and a
user who types `lct` will be re-centred by the search box but asked to clarify
by the assistant. That divergence is intended by the decisions, not a defect.

**Assumption I am proceeding on.** The assistant's gene jump reproduces this
same window rule (preserve current span, centre on `start`), because matching
DELPHI's existing behaviour is the least surprising choice and no decision
specifies otherwise. Flagging it because it is a judgement call, not a fact.

---

## 3. Population writes: how the grid does it

**It replaces. Always. There is no append path in DELPHI.**

`library.js:208-212`, the `update-populations` branch of `mapSelectFunction`:

	getOptions([['populations', accession_ids]]);
	document.querySelector('[data-module="browser"]').dispatchEvent(new Event('update'));

`accession_ids` is the grid's full selected-row set, mapped through
`data-select-col="label"` (`library.js:317`). So the write is the complete new
array, and the event is **`update`**, not `refresh`. `update` is correct: adding
or removing a population requires the structural rebuild that creates and
destroys signal tracks (`browser.js:106-153`).

**Why it feels additive to the user but is not.** `showTable('populations')`
passes `{label: getOptions().populations}` as `selected_rows`
(`library.js:244`), and the grid pre-selects those rows on ready
(`library.js:122-131`). The user sees their current populations already ticked
and ticks more, so the submitted set happens to be a superset. The write is
still a replace.

**Consequence for D-034.** Add and replace are two functions. Replace maps
directly onto this path. **Add has no existing equivalent and must be built**:
read `options.populations`, concatenate, de-duplicate, write the union, dispatch
`update`. That is composition of existing state, not construction of a label, so
it stays inside D-024.

`deletePopulations` (`browser/pops.js:61-72`) also writes the field, but only for
`Dataset === 'User'` populations, and only dispatches `update` if the selection
actually shrank.

---

## 4. CSS: conventions and whether a design system exists

**One stylesheet, 852 lines: `/css/main.css`, linked at `index.html:7`. It is
the only stylesheet the app loads at startup.** AG Grid's CSS is appended to
`<head>` lazily on first library use (`library.js:330-333`). No CSS framework,
no preprocessor, no build step, consistent with hard rule 6.

**There is a design-token system, and it is the thing to follow.** `:root`
(`css/main.css:1-27`) defines every colour, the font stack and the layout
metrics as custom properties:

	--bg --bg-panel --bg-subtle --bg-track --border --border-strong
	--accent --accent2 --data-1 --data-2 --tab-modern --tab-adna
	--text --text-dim --text-faint --font
	--ruler-height --annotation-track-height --track-height --top-bar-height
	--svg-text-color --svg-text-color-inverse
	--svg-font-large --svg-font-medium --svg-font-small

These are read from JavaScript as well as CSS
(`tracks/annotation.js:9-16`, `tracks/viewfinder.js:17-22` resolve them via
`getComputedStyle` and `hexToRgb`), so they are a real contract, not just
styling. The panel uses these variables and introduces no new colour literals.

**The existing panel/modal convention is `.popup`, built by `addBox`**
(`apc/form.js:82-95`). Structure:

	.popup[data-title]
		.header   > a[data-action="close"][data-icon="x"], a[data-action="minimize"], h3
		.content
		.form-footer

Styled at `css/main.css:854-947`: absolutely positioned, `top:10%; left:15%;
width:70%; max-height:80%`, `z-index:1000`, `background: var(--border)`,
`border-radius:3px`, `font-size:14px`. Variants `.popup.narrow` and
`.popup.aggrid` exist. Escape-to-close is wired globally in `browser.js:169-173`.

Naming conventions observed throughout: lowercase hyphenated class names;
behaviour addressed by `[data-action="..."]` / `[data-control="..."]` /
`[data-module="..."]` attributes rather than by class; icons via a
`[data-icon]::before` icon font (`css/main.css:101-111`); tooltips via
`[data-tooltip]::after`.

**One caution for stage 4.** `addBox` builds its markup with `innerHTML` and
interpolates both `title` and `content` unescaped (`apc/form.js:92`). It is safe
for the static strings DELPHI passes it. Assistant output is not static and must
never reach it. Per CLAUDE.md section 7 and D-019, assistant text is written
with `textContent` into elements the panel creates itself. If the panel reuses
`addBox` for its shell, it passes a static title and empty content, then fills
the content node with `textContent`.

---

## 5. Tests: what exists

**There is no test suite and no test runner in this repository.**

- No `package.json` anywhere, so no npm scripts, no dev dependencies, no Jest,
  no Vitest, no Karma. Consistent with the no-build rule.
- `eval/test` is a 1-byte placeholder. `assistant/knowledge/README.md` is a
  5-byte file containing the word `test`. Both are commit artefacts
  (`e421752 Add test readme`), not tests.
- `.github/workflows/` contains only `deploy.yml`. No CI test job.
- No `*.test.js`, `*.spec.js`, or test directory exists.

**What does exist is `eval/`, and it is not a test suite.** It is the Gate 4a
measurement harness (D-029): 15 modules, run by hand from the DELPHI page
console via `await import('/eval/harness.js')` then `harness.runGate4a()`, per
`eval/README.md`. It measures model capability, latency and memory. It needs
WebGPU, a live DELPHI page, and an 800 MB model download. It cannot serve as a
unit-test runner for the stage 2 resolvers.

**Consequence for stage 2.** CLAUDE.md stage 2 says the resolvers are "testable
without a model. Test them." There is nothing here to test them with. The
options are a runnable-in-browser test module in the `eval/` style (no
dependency, no build, consistent with hard rule 6) or introducing a runner
(needs `package.json`, which is an owner decision under hard rule 6). **I will
take the first option**: a self-contained test module the owner runs the same
way the eval harness is run. Stated as an assumption because CLAUDE.md does not
specify the mechanism, and flagged for correction if the owner wants otherwise.

---

## 6. The assistant scaffolding: what is there and how far it matches

Four items. Two are current and good, two are stale and contradict the decision
log.

### 6a. `state_observer.js`, 61 lines. Current. Matches D-015.

Reads `getOptions()`, `listAnnotations()` and `getPopData()` per selected label;
returns a structured snapshot. Writes no options, dispatches no events. Its own
docstring records the D-015 session-3 caveat honestly: it is read-only only
because `browser.js` `init()` has already called `getOptions()`, since
`getOptions` writes `site_options` on a cold key. Verified against
`apc/common.js`. `listAnnotations()` seeds the annotations IDB table on a cold
cache (`assets.js:37-59`, `:66-69`), which is the second documented exception.
Both hold as recorded.

Its `DISPLAY_KEYS` list carries all six navigation fields, so finding 1 is
already representable in the snapshot.

### 6b. `state_serializer.js`, 88 lines. Current. Implements D-020 and D-021 as ratified.

Line-oriented `key=value` header; `BEGIN_UNTRUSTED_DATA` / `END_UNTRUSTED_DATA`
fence; `-` for absent and `?` for present-but-unusable; backslash and pipe
escaped, every non-printable ASCII including newline mapped to `?`; 48-character
truncation with trailing `~`; header restricted to numbers, flags and
`SAFE_TOKEN_PATTERN` tokens. `serializeSelectionList` emits `SELECT n` with
indexed records, matching the D-021 session-4 note that one selection function
serves all four selection kinds. Imports nothing; never reads DELPHI. The
quarantine-by-provenance rule (T-2) is implemented as written: every population
and annotation string goes in the fence regardless of content.

`eval/state_parser.js` is the round-trip parser for this format and agrees with
it field for field.

### 6c. `knowledge/guidelines.md`, 75 lines. **Stale. Contradicts eight current decisions.**

This is a complete system prompt from an earlier design. Nothing imports it. It
predates the decisions it conflicts with (last touched in `3104a27`, before the
D-020 onwards records). Point by point:

| Line in guidelines.md | Contradicts |
|---|---|
| Model emits `{"reply": "<short message>", ...}` prose | D-023 (narration cut), D-035 (code chooses wording) |
| Emits an ordered list of `proposed_actions` for multi-step requests | D-021, D-033 (one decision per call, short output) |
| `create_population` tool | D-011 (deferred from phase 1) |
| `select_populations` replaces only, "output the FULL desired set" | D-034 (add and replace, add is default) |
| Sort fields: 10 values incl. `Latitude`, `Longitude`, `signal` | D-025 (closed enum of five) |
| "FILTER the population catalog injected at runtime" | D-026, D-036 (code resolves; the model never scans metadata) |
| Rule 1 tells the model to compose clarifying questions listing options | D-035 (code decides, from the failure type) |
| Few-shot: "LCT is a classic target of positive selection" | D-011 division of labour; the model supplies no domain knowledge |

Long outputs also cut directly against D-033: at roughly 0.44 s per token on the
target hardware, the `reply` field alone spends budget on text D-035 says code
should write.

**`knowledge/genes.json` (5 KB, 26 curated symbols with aliases and tags) and
`knowledge/populations.json` (1.7 KB, a 1KGP acronym map) belong to the same
superseded design.** Under D-026 the resolver reads the real gene map and the
real population catalogue, not a curated subset. The alias and acronym tables
are exactly the label transformation D-024 forbids.

Recommendation: delete all three. Not doing so in stage 1, which changes no
code; and deletion is the owner's call since these are knowledge assets rather
than code. Flagged for a decision. Nothing imports them, so they block nothing.

### 6d. `eval/catalogues.js` resolvers. **Contradict D-026's exact-match condition.**

Not scaffolding under `assistant/`, but it is the existing implementation of
what stage 2 builds, so it matters here. `eval/catalogues.js:32-39`:

	resolveGene:       gene_map.get(cleaned) || gene_map.get(cleaned.toUpperCase()) || null
	resolvePopulation: exact match || populations.find(p => p.label.toLowerCase() === cleaned.toLowerCase()) || null

and `cleanLabel` strips trailing `.,;:?!` before either lookup.

D-026 states: "Resolution is exact match only. Fuzzy, normalized, or
best-effort matching is a transformation and is forbidden under D-024. A
near-miss resolves to clarify, not to a guess." Case folding and punctuation
stripping are normalisation. Both fallbacks and `cleanLabel` are outside the
decision.

This is a scoring harness, not the shipping path, and looser matching there
inflates measured success rather than creating a live risk. But it means the
Gate 4a numbers scored a more permissive resolver than the one that will ship,
which is one more reason those numbers are not a capability measurement (D-029
already says so, for different reasons). **Stage 2 builds the exact-match
resolvers required by D-026.** Whether to align `eval/catalogues.js` is a
separate question, raised at the end of stage 2 rather than assumed.

---

## Two recorded decisions the code contradicts

Both are flagged rather than acted on. DECISIONS.md is append-only and owned by
Agent 0, so I am not writing superseding records.

### D-025 is wrong on the sort option set. Its own revisit trigger has fired.

D-025: "Sort options are identical for pairwise and individual tracks:
`Distance_from_Africa, genetic_distance, time, Temperature_index,
Precipitation_index`. One closed enum of five values, valid for every track
type." Revisit trigger: "A read of `.sort-selector` in `index.html` disagrees
with this list, in which case the dropdown is authoritative per
`syncSortDropdown`."

`index.html:38-56` disagrees. The two dropdowns are **not identical**, and
neither holds five values:

`.sort-selector` (individual tracks), nine values:

	time, Distance_from_Africa, Latitude, Longitude, Temperature_index,
	Precipitation_index, Agriculture_extensiveness, Urbanization_onset, signal

`.sort-selector-pairwise` (FST view), six values:

	time, Distance_from_Africa, genetic_distance, Temperature_index,
	Precipitation_index, signal

So `genetic_distance` is pairwise-only, `Latitude` / `Longitude` /
`Agriculture_extensiveness` / `Urbanization_onset` are individual-only, and
`signal` is in both and in neither the D-025 list nor `pairwiseSort`.

The five values D-025 names are exactly what `pairwiseSort`
(`browser/pops.js:48-59`) implements. That is where the list came from. It is
the pairwise compute set, not the UI option set.

**The dropdown is authoritative, and enforced.** `syncSortDropdown`
(`browser.js:7-17`) picks the selector by view type, and if `options.sort` is
not among that selector's values it silently rewrites `options.sort` to the
first option and persists it. It runs on init and on every `update`
(`browser.js:145`, `:148`, `:341`).

Live consequences for the action layer:

- Setting `sort = 'genetic_distance'` outside an FST view is silently rewritten
  to `'time'` on the next `update`. The assistant's post-action verification
  (stage 3) would correctly report the change did not stick.
- Setting `sort = 'Latitude'` inside an FST view is likewise rewritten.
- The valid sort set is therefore **conditional on `measure === 'fst'`**, not
  one closed enum. This changes what the model may be offered and what
  T-select-metadata can score (D-022, D-026).
- D-025's own note about `DEFAULTS.sort` is confirmed: `browser.js:47` sets
  `sort: 'date'`, which is in neither dropdown, so it is rewritten to `'time'`
  on first load.

I am not designing around this in stage 1. It lands in stage 3, where the sort
action is built, and the sort action will validate against the dropdown that is
live for the current measure. If the owner prefers the narrower five-value set
across both views, that is a superseding record to write.

### D-036's residency assumption is refuted for the 11 MB per-sample metadata.

D-036 records the population catalogue, the per-sample metadata and the gene
name map as "already cached at load", and its revisit trigger says: "Revisit if:
The 11 MB file turns out not to be resident in a normal session, which stage 1
reconnaissance will confirm or refute." Refuting it, in part:

- **Gene name map: resident. Confirmed.** `parseJSONL` populates `geneNameMaps`
  as a side effect of `loadAnnotationData` (`assets.js:339-364`), which
  `getTracks` calls on every annotation and viewfinder refresh. Both tracks
  refresh at startup, so the map is in memory from first render onward, in every
  session. `loadGeneMap` then returns it from the `geneNameMaps` cache with no
  work. Free, as D-036 assumes.
- **Population catalogue: effectively resident, via IndexedDB not memory.**
  `initPopCache` is awaited in `browser.js` `init()` (`:342`) and fetches
  `/data/modern_populations.json` (16 KB) on every load. Records live in the
  `populations` IDB table; `getPopsData()` (`browser/pops.js:19-22`) reads them
  all. An async IDB read, not a network fetch. Cheap, as D-036 assumes.
- **Per-sample metadata, 11 MB: NOT resident in a warm session.**
  `loadMeta`/`getMetadata` (`assets.js:81-94`) fill a module-level
  `metadataCache` lazily, and only two callers exist: `addPopulation`
  (`browser/pops.js:26`) and the samples grid (`library.js:231`).
  `initPopCache` calls `addPopulation` **only for populations not already in
  IDB** (`browser/pops.js:168-171`). On a cold first-ever load every population
  is missing, so the file loads and is resident. On **every subsequent load the
  IDB table is already populated, the loop body never runs, `getMetadata` is
  never called, and `metadataCache` stays `null`.** The samples grid is the only
  other path and needs a deliberate user action.

**What this costs.** Not a network fetch: `sw.js` is cache-first for `/data`
assets (`sw.js`, ARCHITECTURE.md section 11), so the bytes come from Cache
Storage. The cost is reading and `JSON.parse`-ing 11 MB, once, on first use.
Unmeasured, and I cannot measure it by reading; on the D-031 target hardware it
is plausibly a large fraction of the 20-second D-033 budget if it happens inside
a request.

**Consequence for D-036's metadata filtering capability.** The join path D-036
records (`population.subset` to `Poseidon_ID` to per-sample metadata) is intact
and correct. What changes is when the cost is paid. The fix is cheap and fits
the decisions: **call `getMetadata()` once at assistant startup**, alongside
loading the model, per D-033's "set up once, not per call". That keeps
filtering free at request time and adds no fetch, since D-018 permits the
assistant to reach DELPHI's existing exports and `getMetadata` performs no
egress the app does not already perform.

Raising it rather than building it: the population-filtering capability is stage
3 work, and this is a stage 5 startup-sequence question. Recorded here so it is
not rediscovered late.

---

## Summary

| # | Question | Answer |
|---|---|---|
| 1 | Region jump fields | Six: `chr`, `start`, `end`, `zoom_level`, `viewfinder_start`, `viewfinder_end`. Viewfinder pair self-repairs only near an edge; `zoom_level` never self-repairs. |
| 2 | Gene span | Current span preserved, re-centred on the gene's `start`. The map holds no end. |
| 3 | Population writes | Full replace of `options.populations`, then `update`. No append path exists; add must be built. |
| 4 | CSS | One stylesheet, a real `:root` token system read from JS as well as CSS, `.popup` from `addBox` as the modal convention. `addBox` uses `innerHTML`. |
| 5 | Tests | None. No runner, no `package.json`. `eval/` is a manual in-page measurement harness, not a test suite. |
| 6 | Scaffolding | `state_observer.js` and `state_serializer.js` are current and match D-015/D-020/D-021. `knowledge/*` is superseded and contradicts eight decisions. `eval/catalogues.js` resolvers normalise, against D-026. |

Two decisions need the owner: **D-025** (sort set is two conditional lists, not
one closed five; its revisit trigger has fired) and **D-036** (the 11 MB
metadata is not resident in a warm session; its revisit trigger has fired).
Neither blocks stage 2.
