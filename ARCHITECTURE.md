# DELPHI — Architecture & Data Flow Reference

**DELPHI** = *DNA Explorer for Locus-based Population History Insights*. A
**framework-free, no-build** vanilla-JS genome browser for population-genetic
signals across modern + ancient human genomes. The client renders everything as
native **SVG**. Live site: `delphi.seqmash.com`; deployed as a static site to S3
(`beta2.seqmash.com`) behind CloudFront.

> ⚠️ **Stale docs warning:** `.intent/*` describes an earlier design (says
> **hg38**, client-side Web-Worker computation, `.janno` metadata). The *actual*
> app uses **hg19**, **AWS Lambda** computation, and JSON metadata. Trust the
> code + `README.md`, not `.intent/`. The `.intent/project` claim that `/apc/` is
> "DO NOT MODIFY" is still a good convention to honor.

---

## 1. Reference assembly & top-level layout

- **All coordinates are hg19.** `CHR_LENGTHS` is hardcoded in `common.js`.
  - *Latent bug:* `browser/helpers.js` and `browser/zoom.js` default `assembly`
    to `'hg38'` and index `CHR_LENGTHS[assembly]?.[chr]`, but `CHR_LENGTHS` is
    keyed by chromosome directly (not by assembly), so `zoomToLevel`'s
    chr-length clamp silently falls back to `Infinity`. Panning code uses
    `CHR_LENGTHS[chr]` correctly.
- **Entry:** `index.html` → `<script type="module" src="/init.js">`.
  `index.html` is the whole UI shell (header, viewfinder, controls, two track
  containers, two `<template>`s for signal/annotation tracks).
- **`init.js`:** registers service worker `sw.js`, imports `apc/common.js` global
  hooks, then auto-initializes every `[data-module]` element by dynamically
  importing `/${module_name}.js` and calling its `init()`. The only module in
  `index.html` is `data-module="browser"`.

---

## 2. Module system (the "APC" micro-framework, in `/apc/`)

Reusable infrastructure. Key primitives in **`apc/common.js`**:

- **`getOptions(update=[], defaults={}, key='site_options')`** — the entire app
  state store. Reads/writes a single **`localStorage` key `site_options`** as
  JSON. This is the single source of truth for view state.
- **`addModule(elem, name, options)`** — dynamically imports `/${name}.js`,
  appends a `<div data-module=name>` with `options` copied to `dataset`, calls
  its `init()`.
- **`addHooks(elem, hooks)`** — event delegation: `hooks` is an array of
  `[selector, eventType, fn]`; one capturing listener per event type dispatches
  to matching `e.target`. This is the app's universal event pattern (no
  framework).
- Math/util helpers (`mean`, `range`, `linspace`, `numericize`, …),
  `errorBox`/`confirmBox`, `toCSV`.

**`apc/cache.js`** — persistence wrappers:

- **IndexedDB** (`getIDBObject`, `queryIDBRange`, `listIDBTable`,
  `deleteIDBObject`) over DB **`delphi`**. `queryIDBRange` uses compound-key
  `IDBKeyRange.bound` — critical for binned range queries.
- **Cache Storage API** (`cacheString`, `getCachedString`) under cache name
  **`apc_cache`** — used for user-uploaded annotations.

**`apc/graphics/core.js`** — **`svg_draw(svg, bounds)`** returns a stateless
drawer with `.genomicRect()`, `.genomicLine()`, `.plot()`, `.point()`,
`.text()`, `.clear()`, etc. `bounds = [[xmin,xmax],[ymin,ymax]]`; `genomicRect`
maps genomic-x → pixels. All track rendering goes through this. (`canvas_draw`
also exists but is unused by the browser.)

**`apc/plot/static.js`** → `createSVG(container, bounds, ratio)`.
**`apc/form.js`** → `addBox`/`addPopup` dialogs. The IDB DB name and all table
names come from `CONFIG` in `assets.js`.

---

## 3. State model — the `site_options` object

Defined by `DEFAULTS` in `browser.js`. Every field lives in
`localStorage.site_options`:

| Field | Meaning |
|---|---|
| `chr`, `start`, `end` | current view region (hg19) |
| `viewfinder_start` / `viewfinder_end` | wider region shown in the top viewfinder |
| `zoom_level` | index into `ZOOM_LEVELS` (powers-of-two spans, `MIN_SPAN 10_240` → `MAX_SPAN 83_886_080`) |
| `mode` | `'gnomad'` or `'adna'` — **auto-derived** each update from selected populations' `Dataset` |
| `measure` | `heterozygosity` \| `fst` \| `tajimasd` \| `fulif` |
| `sort`, `sort_dir` | track ordering metadata key + `asc`/`desc` |
| `window_size` | 10000 / 100000 / 1000000 bp binning |
| `show_guides` | vertical guide lines |
| `populations` | array of selected population **labels** |
| `annotations` | array of active annotation track ids (default `['gencode19_genes']`) |
| `y_limits` | `{measure: [min,max]}` overrides |
| `hidden_pairs` | FST pairs the user removed (keyed by `pairKey`) |

---

## 4. Event orchestration (`browser.js` — the controller)

Two custom events drive everything, dispatched on `[data-module="browser"]`:

- **`update`** (structural rebuild): reconciles annotation tracks against
  `options.annotations`; loads population metadata; **derives `mode`** (`adna` if
  any selected pop has `Dataset` `User`/`AADR`, else `gnomad`); removes/recreates
  signal tracks. For `measure==='fst'` it enters **pairwise mode**: generates all
  population *pairs* (minus `hidden_pairs`), sorts them by `pairwiseSort`, creates
  one track per pair. Otherwise one track per population, sorted by
  `options.sort`. Ends by dispatching `refresh`.
- **`refresh`** (redraw only, no rebuild): tells every track to re-fetch+redraw
  its current region. When `sort==='signal'`, it awaits each signal track's
  `refreshed` event (which carries `detail.signal` = mean value) and reorders the
  DOM accordingly.

All UI controls (measure/window/sort selectors, zoom, drag-to-reorder tracks,
y-limits, guides, track size, display style, export menu, reset) are `addHooks`
entries in `browser.js` that mutate `getOptions` then dispatch `update`/`refresh`.

---

## 5. Track layer (`track.js` → `tracks/*.js`)

`track.js` is a thin dispatcher: `import(/tracks/${dataset.type}.js)`. Three
track types:

- **`tracks/viewfinder.js`** (`data-type=viewfinder`, in header): the
  chromosome-scale minimap. Draws simplified gene blocks + coordinate ruler + the
  draggable/resizable **focal window** (uses `browser/focal_window.js` for
  interaction math, `browser/zoom.js` for pointer/wheel zoom). Dragging the focal
  window updates `start/end`; releasing dispatches `refresh`. Also owns global pan
  (`.track-plot-area` mousedrag) and Ctrl-wheel/double-click zoom hooks bound to
  `window`.
- **`tracks/annotation.js`** (`data-type=annotation`): detailed gene models —
  exons (`genomicRect`), introns (thin rect), strand chevrons, gene-name labels
  when zoomed ≤ 1 Mb, GeneCards tooltip links. Gene search: typing a
  non-coordinate query dispatches a `search` event → `handleSearch` looks up the
  gene in the name-map and re-centers. Deterministic vertical lane via
  `getGeneTrackIndex` (name hash % 3).
- **`tracks/signal.js`** (`data-type=signal`): the population-genetics plots. On
  `refresh`: reads `dataset.population` (a `;`-joined label list — 1 label =
  per-pop, 2 = pairwise), resolves sample lists via `getPopulationSamples`, calls
  **`getSignalTrack(...)`** from `assets.js`, then:
  - FST is computed **client-side** in `computeFst()` (Weir & Cockerham
    estimator) from **raw `[ac, an, het_obs]`** triples of the two populations.
  - Other measures come back already computed.
  - Bins → `drawSignal()` (styles: `binned` bars / `line` / `scatter`; NaN bins
    masked; y-bounds from `dataset.bounds` or auto). Stores `track.signal_bins`
    for export. Emits `refreshed` with mean signal.

---

## 6. Population model (`browser/pops.js`)

- **`initPopCache()`** (run once at browser init): fetches
  **`/data/modern_populations.json`** and, for each entry not already present,
  calls `addPopulation()`, which reads full sample metadata and stores a computed
  population record in **IndexedDB table `populations`** keyed by `label`.
- A **population record** contains: `label`, `time` (mean Date), `Latitude`,
  `Longitude`, `Distance_from_Africa` (via **`waypointDistance`** — great-circle
  distance routed through 5 fixed waypoints Cairo / Istanbul / Anadyr / Prince
  Rupert / Phnom Penh, modelling the out-of-Africa land route; African pops
  pinned to 0), `Temperature_index`, `Precipitation_index`, `Urbanization_onset`,
  `Agriculture_extensiveness`, `Genetic_distance_PC1/PC2`, `Dataset`
  (`gnomAD`/`AADR`/`User`), `aadr_population` (the AADR Group_Name / gnomAD
  filename key), and **`subset`** (array of `Poseidon_ID` sample IDs).
- `pairwiseSort(pop1, pop2, measure)` computes pairwise metrics (waypoint
  distance, genetic-distance Euclidean over PCs, or abs-diff of
  time/temp/precip).
- User-defined populations: `addPopulation(label, 'User', '', sample_ids)` from
  the sample-selection grid; deletable (only `Dataset==='User'`).

---

## 7. Data layer (`assets.js`) — the heart of the data flow

`CONFIG` holds all endpoints & names:

- `S3_BASE_URL = '/data'` (static data served from same origin/CloudFront)
- `LAMBDA_ENDPOINT = 'https://d.modelrxiv.org/adna/browser'`
- IDB DB `delphi`; tables: **`lambda_cache`**, **`gnomad_cache`**,
  **`populations`**, **`annotations`**
- `BED = 'poseidon/Poseidon_AADR_v62/Poseidon_AADR_v62'`,
  `LAMBDA_WINDOW_SIZE = 10000`, `LAMBDA_BUFFER_BASES = 1_000_000`,
  `LAMBDA_BATCH_DELAY_MS = 75`, `MIN_FETCH_WINDOWS = 20`
- `GNOMAD_STAT_COLUMNS = ['heterozygosity','tajimasd','fulif','ac','an','het_obs']`

**Two compute paths, chosen by `options.mode`** in `getSignalTrack()`:

### A) gnomAD path (precomputed, modern-only) — `mode==='gnomad'`

- URL: **`/data/gnomad/{window_size}/{gnomad_label}_{chr}.npy`** where
  `gnomad_label = pop.aadr_population` with trailing `.DG` stripped.
- File is a **NumPy `.npy` float32 array**, shape `(n_bins, 6)`, columns =
  `GNOMAD_STAT_COLUMNS`. Parsed in-browser by `parseNumpyFloat32` (reads header,
  re-aligns buffer, → `Float32Array`).
- Cached: whole chromosome in `gnomad_cache` IDB (key `[population, chr,
  window_size]`) + in-memory promise map (dedupes concurrent loads). Region slice
  by array index (`start/window_size`).

### B) Lambda path (on-demand; ancient/custom/any AADR or User pop) — `mode==='adna'`

`getLambdaTrack()`:

- Bins are 10 kb (`LAMBDA_WINDOW_SIZE`). Fetches with a **±1 Mb buffer** so
  panning stays ahead.
- Per population: query `lambda_cache` IDB (compound key `['pop', label, chr,
  bin_start, bin_end]`) over the buffered range → `findMissingBins`. Fetches
  missing bins only if any are visible **or** ≥ `MIN_FETCH_WINDOWS`. In-flight
  fetches deduped via `inflightLambdaFetches`.
- **Request batching** (`queueLambdaRequest`/`processBatch`): requests within a
  **75 ms debounce** on the same chromosome are merged — union of ranges, union of
  populations — into **one POST** to `LAMBDA_ENDPOINT`. Response bins written into
  `lambda_cache`; then the visible slice is read back and returned as `{label:
  {data, window_size, start, end}}`. `data` is the requested measure (or raw
  `[ac,an,het_obs]` triples when `measure==='raw'`, used for FST).

**Lambda request body shape:**
`{bed_files:[BED], subsets:[{label, samples}], params:{type: measure, variants:[{type:'region', chr, start, end}], window_size}}`.

### Annotations (`assets.js`)

- **`/data/index.json`** seeds the `annotations` IDB table on first use (each
  entry: `{label, source, type, user:false}`). Built-in gene track id =
  **`gencode19_genes`**, source is a **JSONL** file (`{source}` →
  `/data/..._genes.jsonl`).
- `getTracks()` loads + region-filters gene features. `loadGeneMap` builds a
  name→`{chr,start}` map for gene search. JSONL gene entry:
  `{chr, gene, coordinates:{start,end}, strand, exons, introns}`.

---

## 8. Custom annotation upload (`custom_annotation.js`)

Client-side parse of user **GTF / GFF3 / BED** files (gzip extensions recognized
by name only). Normalizes chromosomes (incl. RefSeq `NC_0000xx` → `chrN`), builds
genes+exons+introns, serializes to JSONL, stores in **Cache Storage** at
`/data/user/{label}.jsonl`, registers an `annotations` IDB entry with
`user:true`, adds label to `options.annotations`, dispatches `update` +
`annotations-changed`.

---

## 9. Tables / library UI (`library.js`)

Lazy-loads **AG Grid** (`/aggrid/aggrid.js`+css) on first use. Renders modal data
grids for: **Populations** (select → set `options.populations`), **Samples**
(multi-select → create User population; or view a population's samples),
**Annotations** (select active / upload). Column tooltips come from
**`/data/column_descriptions.json`** (`COLUMN_DESCRIPTIONS` promise in
`common.js`). Grid filter models are converted to a normalized filter spec via
`getColumnFilters`/`convertSimpleFilter`.

---

## 10. Export (`browser/export.js`)

TSV downloads: **Export data** (`exportPositionalData`) = per-bin values of
visible tracks in the current window; **Export metadata** (`exportMetadata`) =
population rows, or population-pair rows in FST/pairwise view. Filenames:
`delphi_{measure}_{chr}_{start}-{end}.tsv`, `delphi_populations.tsv` /
`delphi_population_pairs.tsv`.

---

## 11. Service worker (`sw.js`)

Cache name `apc_cache`. Cache-first for data assets from
`seqmash.com`/`delphi.seqmash.com`; **bypasses cache for `.js/.py/.css/.html/.list`**
(so code updates aren't stuck) and for `no-cache` requests. This is the
cross-session persistence layer that lets returning users skip refetching.

---

## 12. Backend — AWS Lambda (`/lambdas/`, Python)

- **`lambdas/browser/lambda_function.py`** (behind `LAMBDA_ENDPOINT`): CORS
  handler; reads job body, **downloads `analyses/{type}.py` from an S3
  `analysis_bucket`, `exec`s it, calls its `region_signal(job)`**, returns JSON.
  (Dynamic script loading = statistics are versioned as data, not baked into the
  Lambda.)
- **`lambdas/browser/br_wrapper.py`** — `read_bed()`: genotype random-access over
  **PLINK BED** stored in S3 via `bed_reader`/fsspec. Resolves variant ranges
  against the **canonical BIM** (most common `bim_md5` across `bed_files`, from
  `delphi_datasets.csv`) using **pre-binned `.chr{N}.bins.npz`** index files for
  O(1) position→row lookup. Reads only needed samples×variants; multi-dataset
  merge fills mismatched BIMs with NaN. `_choose_orientation` picks SNP-major vs
  sample-major BED for efficiency.
- **`analyses/pop.py`** — the compute script the browser uses:
  `region_signal(options)` reads genotypes then `_compute_window_stats` produces,
  per 10 kb window, `[het_exp, tajimasd, fulif, ac, an, het_obs]` (expected
  heterozygosity, **Tajima's D**, **Fu & Li's F\***, plus
  allele-count/number/observed-het used for downstream FST). Returns
  `[{population, window_size, chr, start, end, data:[...]}]`.
- Other `analyses/*.py` (`fst.py`, `frequency.py`, `heterozygosity.py`,
  `tajimasd.py`, `emu_pca.py`) and `lambdas/analysis_init`, `analysis_image_br`,
  `maintenance` belong to a separate cohort-analysis pipeline (see §14), not the
  browser's hot path.

---

## 13. Data-prep pipeline (`maintenance/`)

- **`build_metadata.py`**: single pipeline from raw AADR/HGDP metadata + a curated
  modern list → the two deployable assets
  **`Poseidon_AADR_v62_metadata.json`** (per-sample) and
  **`modern_populations.json`** (population definitions). Stages: display-name
  mapping for 1KGP, region tagging (by group/country-ISO), snapping `Group_Name`
  to `aadr_population` suffixes, **gnomAD filename overrides** (9 pops whose
  `.npy` are named `gnomad_pop_{label}`), field simplification/rename (e.g.
  `chelsa_pc1→Temperature_index`, `ukb_pc1→Genetic_distance_PC1`,
  `ag_urbanization→Urbanization_onset`), coverage validation, and **aDNA binning**
  (samples grouped into `{region} {k}-{k+1} kya` windows, min 15 samples,
  `aadr_population` = `aDNA_{...}`).
- `gtf_to_genes.py`: GENCODE GTF → the gene JSONL.

**Canonical per-sample metadata fields** (in
`Poseidon_AADR_v62_metadata.json`): `Poseidon_ID`, `Group_Name`, `Country`,
`Location`, `Region`, `Date`, `Latitude`, `Longitude`, `Genetic_Sex`,
`Temperature_index`, `Precipitation_index`, `Urbanization_onset`,
`Foraging_onset`, `Agriculture_extensiveness`, `Agriculture_intensity`,
`Pastoralism_onset`, `Genetic_distance_PC1`, `Genetic_distance_PC2`.

---

## 14. Adjacent / not wired into the browser

`analysis.js`, `plot.js`, `jobs.js`, `toc.js`, `lfu.js`, `worker.dedicated.js`
(Pyodide worker), `tutorial.html` are a **separate modelrxiv-style
cohort-analysis app** (imports a non-existent `/workspaces.js`, polls S3 for
async job results, runs Python in-browser). **`index.html` never loads them** —
DELPHI's browser only loads `browser`, `track`, `library` modules. Treat these as
a sibling/legacy codebase unless a task specifically targets them.

The **`assistant/`** module (`state_observer.js` + `state_serializer.js` +
`knowledge/`) is scaffolding for an LLM assistant: `observeState()` reads
`site_options` into a structured snapshot; `serializeState()` renders it as
fenced, escaped, quarantined text (untrusted population/annotation strings
between `BEGIN/END_UNTRUSTED_DATA` fences) for safe prompt injection. Also **not
currently imported** by the running app.

---

## 15. Named data assets (quick index)

| Name | Location | What |
|---|---|---|
| `site_options` | localStorage | all view state (§3) |
| `delphi` | IndexedDB DB | tables below |
| `populations` | IDB table | computed population records, key=`label` |
| `gnomad_cache` | IDB table | per-chr `.npy` slices, key=`[pop,chr,window]` |
| `lambda_cache` | IDB table | per-bin ancient/custom stats, key=`['pop',label,chr,start,end]` |
| `annotations` | IDB table | annotation catalog entries, key=`label` |
| `apc_cache` | Cache Storage | data assets + user annotation JSONL |
| `/data/modern_populations.json` | S3 | population seed list |
| `/data/Poseidon_AADR_v62_metadata.json` | S3 | per-sample metadata |
| `/data/index.json` | S3 | annotation-track catalog |
| `/data/column_descriptions.json` | S3 | grid column tooltips |
| `/data/gnomad/{window}/{label}_{chr}.npy` | S3 | precomputed modern stats (6 cols) |
| `/data/..._genes.jsonl` (`gencode19_genes`) | S3 | GENCODE v19 gene models |
| `/data/user/{label}.jsonl` | Cache Storage | uploaded annotations |
| `poseidon/Poseidon_AADR_v62/*` (`.bed/.bim/.fam`, `.chr{N}.bins.npz`) | S3 (Lambda) | AADR 1240K genotypes + bin index |
| `delphi_datasets.csv` | S3 (Lambda) | BED dataset registry / canonical BIM |

**One-line data flow:** user navigates → `getOptions` mutates `site_options` →
browser dispatches `update`/`refresh` → each track calls
`getSignalTrack`/`getTracks` in `assets.js` → **gnomAD** (`.npy` static fetch)
*or* **Lambda** (batched, buffered, IDB-cached POST running `analyses/pop.py` over
S3 BED genotypes) → bins returned → `svg_draw` renders SVG; FST derived
client-side from raw `ac/an/het` triples.

---

## 16. Data sources (from `README.md`, all on hg19)

- **Allen Ancient DNA Resource (AADR v62)** — ancient + modern genomes on the
  1240K panel (~1.23M SNPs); primary source for combined modern–ancient analysis.
- **gnomAD v3.1.2** — modern populations, precomputed stats over full genotype
  data (~66M SNPs).
- **CHELSA** — climatic variables (temperature/precipitation indices).
- **ArchaeoGLOBE** — cultural/archaeological summaries (Neolithic + urbanization
  onset).
- **UK Biobank** — genetic distances from PCA.
- **GENCODE v19** — gene models and annotation tracks.
