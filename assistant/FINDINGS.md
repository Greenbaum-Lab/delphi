# Stage 1 reconnaissance

Every fact below was read from the code in this repository. Where a fact could
not be established from the code, that is stated plainly rather than inferred.

Files read in full: `browser.js`, `common.js`, `browser/helpers.js`,
`browser/region.js`, `browser/zoom.js`, `browser/pops.js`,
`assistant/state_observer.js`, `assistant/state_serializer.js`,
`assistant/knowledge/*`, `eval/model_runner.js`, `eval/prompt.js`,
`eval/schemas.js`, `eval/catalogues.js`, `index.html`, `ARCHITECTURE.md`,
`DECISIONS.md`, `CLAUDE.md`.

Files read in part: `assets.js` (CONFIG, annotation and metadata accessors,
`parseJSONL`, `loadGeneMap`, `getSignalTrack`, `getLambdaTrack`),
`apc/common.js` (`getOptions`), `apc/cache.js` (`listIDBTable`),
`tracks/annotation.js` (`handleSearch` and the hook table),
`tracks/viewfinder.js` (option reads only), `library.js` (selection handlers),
`css/main.css` (custom properties, panel and popup rules).

Files not read: `analysis.js`, `plot.js`, `jobs.js`, `toc.js`, `lfu.js`,
`worker.dedicated.js`, `custom_annotation.js`, `browser/export.js`,
`browser/focal_window.js`, `tracks/signal.js`, everything under `lambdas/`,
`maintenance/` and `analyses/`. None of them is on the assistant's path.

---

## 1. Region jumps: which fields must be written

**Writing `chr`, `start` and `end` alone is not enough, and the app does not
repair the rest.**

- `updateRegionFromInput` (`browser/helpers.js:43-70`) is the region-jump path
  the search box uses. It writes six fields: `chr`, `start`, `end`,
  `zoom_level`, `viewfinder_start`, `viewfinder_end`. `zoom_level` comes from
  `findZoomLevelForSpan` (`browser/zoom.js:62`) and the viewfinder pair from
  `computeViewfinderBounds` (`browser/region.js:4`), which is the requested span
  times `VIEWFINDER_RATIO` (2), centred and clamped.
- `tracks/viewfinder.js` reads `options.viewfinder_start` and
  `options.viewfinder_end` directly on every draw (lines 28-31, 55-60, 76) and
  never derives them from `start`/`end`. Nothing anywhere recomputes them from
  the main region.
- Consequence: a jump that writes only `chr`/`start`/`end` leaves the minimap
  pointing at the old locus, and the focal window is drawn outside its own
  viewfinder bounds.
- DELPHI's own gene search has exactly this defect. `handleSearch`
  (`tracks/annotation.js:190-200`) writes `chr`, `start` and `end` only. That is
  DELPHI's bug, not ours to fix (CLAUDE.md section 5); the assistant simply
  writes all six fields on every region change.

`refresh` is the event a region change dispatches (`dispatchBrowserRefresh`,
`browser/helpers.js:13`). `update` is only needed when the set of tracks
changes.

## 2. Gene span: the window opened around a gene

**Neither fixed width nor the gene's own length. The current span is preserved
and re-centred on the gene's start coordinate.**

- The gene name map is built in `parseJSONL` (`assets.js:196-217`):
  `name_map.set(gene.name, { chr: gene.chr, start: gene.start })`. The end
  coordinate is parsed into the feature list but is deliberately not carried
  into the name map, so the gene's length is unavailable to any caller of
  `loadGeneMap`.
- `handleSearch` (`tracks/annotation.js:190-197`) computes
  `half_span = floor((options.end - options.start) / 2)` and then
  `new_start = max(0, coords.start - half_span)`,
  `new_end = min(CHR_LENGTHS[coords.chr] || Infinity, coords.start + half_span)`.
- So the view keeps whatever span it already had. Note that the gene's start,
  not its midpoint, ends up centred, and that on a start-clamped jump the span
  is silently widened (start floors at 0 while end does not move).
- The assistant mirrors the preserved-span behaviour, because that is what a
  DELPHI user already expects from the search box, but routes it through its own
  region action so the viewfinder and zoom level are written too.

## 3. Population writes: replace, and which event

- `library.js:208-211`, case `update-populations`:
  `getOptions([['populations', accession_ids]])` followed by
  `dispatchEvent(new Event('update'))` on `[data-module="browser"]`. The grid
  hands over the **full selected set**, so the existing behaviour is **replace**,
  never append.
- The grid is pre-seeded with the current selection (`library.js:244` passes
  `{label: getOptions().populations}` as the selected rows), which is how a user
  perceives it as additive.
- `deletePopulations` (`browser/pops.js:61-72`) is the only other writer of
  `options.populations`, and it also dispatches `update`.
- `update` is required rather than `refresh`: the `update` handler
  (`browser.js:106`) is what re-derives `mode` from the selected populations'
  `Dataset`, rebuilds the signal tracks, and re-sorts them. It ends by
  dispatching `refresh` itself (`browser.js:152`).
- D-034 requires separate add and replace actions. Add is the assistant's own
  composition (current set union new labels); DELPHI offers no append path.

## 4. CSS conventions

There is no design system and no stylesheet framework. `css/main.css` is a
single 997-line ad hoc sheet, but it is consistent enough to follow:

- Tabs for indentation, single-line rules for short blocks.
- A custom-property palette in `:root` (`css/main.css:1-27`): `--bg`,
  `--bg-panel`, `--bg-subtle`, `--border`, `--border-strong`, `--accent`,
  `--accent2`, `--text`, `--text-dim`, `--text-faint`, `--font`,
  `--top-bar-height`. The assistant uses these and introduces no new colours.
- The nearest existing pattern to a panel is `.menu-panel`
  (`css/main.css:403-419`): absolutely positioned, `--bg-panel` background,
  1px `--border-strong`, 4px radius, hidden with the `hidden` attribute rather
  than a class. `.popup` (`css/main.css:854+`) is the modal pattern and belongs
  to `apc/form.js`; the assistant does not use it.
- Icon buttons are `<a data-icon="X">` using the icomoon font, or
  `<svg><use href="#icon-..."></svg>` against the symbol sheet at the top of
  `index.html`.
- The assistant's styles live in a separate `css/assistant.css` so that
  `css/main.css` is untouched.

## 5. Tests

**There is no test suite and no test runner in the repository.** No
`package.json`, no `node_modules`, no test directory, no CI test step
(`.github/workflows/deploy.yml` only syncs to S3 and invalidates CloudFront).
`eval/test` is a 5-byte stray file containing the word `test`.

`eval/` is a manual, browser-console gate-4a harness, not a unit-test runner:
`eval/README.md` documents pasting an import into the DELPHI page console.

Consequence for stage 2: the resolvers are pure and DELPHI-free, so they are
tested by a self-contained page (`assistant/tests/resolvers.html`) that imports
them directly and prints pass/fail. It needs no runner and no dependency.

## 6. The assistant scaffolding as it stands

- **`assistant/state_observer.js` (61 lines)** matches what is recorded.
  `observeState()` reads `getOptions()`, `getPopData` per selected label, and
  `listAnnotations()`, and returns a structured snapshot. It writes nothing and
  dispatches nothing. The caveat noted in D-015's session-3 verification holds:
  it is read-only only because `browser.js` `init()` has already called
  `getOptions(undefined, DEFAULTS)`; a cold call would write `{}`.
- **`assistant/state_serializer.js` (88 lines)** matches D-020 and D-021
  exactly: `DELPHI_STATE`/`SELECT` header lines, `BEGIN/END_UNTRUSTED_DATA`
  fences, backslash and pipe escaping, non-printable ASCII to `?`, 48-character
  truncation with a trailing `~`, `-` for absent. It imports nothing.
- **`assistant/knowledge/` is stale and is not used by the built assistant.**
  - `guidelines.md` is a system prompt for a different, larger design: it names
    tools that do not exist in the ratified scope (`create_population`,
    `clear_populations`, `set_window`), tells the model to emit prose in a
    `reply` field (cut by D-023), tells it to emit an ordered multi-action list
    (D-011 and D-033 are one decision per call), and has `select_populations`
    replace-only (superseded by D-034).
  - `populations.json` is a 1KGP acronym to display-label map. Mapping `YRI` to
    `Yoruba-1KGP` is exactly the label transformation D-024 forbids.
  - `genes.json` is a 40-odd entry hand-written gene table with aliases and
    topic tags. The real gene map has 55,765 entries and is already cached at
    load, so a hand-written subset can only disagree with it.
  - None of the three is imported by anything. They are left in place as
    history; nothing in the assistant reads them.
- **Nothing in `assistant/` was imported by the running app** before this work.
  `index.html` declared only `data-module="browser"`.

## 7. Things checked that were not on the list

- `getOptions` (`apc/common.js:114-124`) takes an array of `[key, value]` pairs,
  merges them into the parsed `site_options` object and writes the whole object
  back. A no-argument call returns the current object. There is no change event;
  every writer dispatches `update` or `refresh` itself.
- `CHR_LENGTHS` (`common.js:41-47`) is keyed by chromosome directly
  (`chr1`...`chrY`, `chrM`), confirming D-028: `browser/helpers.js:29` and `:56`
  index it as `CHR_LENGTHS[assembly]?.[chr]` with `assembly` defaulting to
  `'hg38'`, so that lookup is always `undefined` and the clamp falls back to
  `Infinity`. The assistant validates against `CHR_LENGTHS[chr]` itself.
- There are two different `parseRegion` functions. `common.js:33` requires a
  full `chrN:start-end` and returns the chromosome **without** the `chr` prefix;
  `browser/region.js:48` accepts an optional end, strips commas, and returns it
  **with** the prefix. Only the `browser/region.js` one is on the live path
  (`browser/helpers.js:4`). The assistant uses that one.
- The sort dropdowns in `index.html:38-56` list nine individual-track options
  and six pairwise options, which is wider than D-025's closed enum of five.
  D-025's revisit trigger says the dropdown is authoritative if it disagrees.
  It does disagree: `Latitude`, `Longitude`, `Agriculture_extensiveness`,
  `Urbanization_onset` and `signal` are offered for individual tracks and are
  not in D-025's five. Recorded as an open conflict; the assistant ships D-025's
  five, which are valid in both dropdowns, and does not reach the extra four.
- Population records (`browser/pops.js:27-42`) carry no `Region` and no
  `Country`. Both live only in the per-sample metadata
  (`Poseidon_AADR_v62_metadata.json`). D-036's join path
  (`population.subset` to `Poseidon_ID` to sample) is the only route, and it is
  the route the assistant's metadata index uses.
- `listAnnotations()` (`assets.js:66`) resolves to an array of IndexedDB **keys**
  (`apc/cache.js:110-125`), which are annotation labels, not records.
