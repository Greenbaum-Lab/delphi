# Reconnaissance: the design document's open questions, answered

Section 12 of the design lists eight questions that "change the design and need
answers before phase 0". Six are answerable from the code and are answered here.
Two need the owner.

Files read in full: `browser.js`, `common.js`, `browser/helpers.js`,
`browser/region.js`, `browser/zoom.js`, `browser/pops.js`, `init.js`,
`index.html`, `.intent/*`, `ARCHITECTURE.md`. Files read in part: `assets.js`
(annotation, gene-map and metadata accessors, `parseJSONL`), `apc/common.js`
(`getOptions`), `apc/cache.js` (`listIDBTable`), `tracks/annotation.js`
(`handleSearch`), `tracks/viewfinder.js` (option reads), `library.js` (selection
handlers), `css/main.css`. Not read, and not on the assistant's path:
`analysis.js`, `plot.js`, `jobs.js`, `toc.js`, `lfu.js`, `worker.dedicated.js`,
`custom_annotation.js`, `browser/export.js`, `browser/focal_window.js`,
`tracks/signal.js`, `lambdas/`, `maintenance/`, `analyses/`.

---

## Q1. Is every navigable piece of state reachable and writable through `getOptions()`?

**Yes for population and region, which is all phase 1 needs.** `getOptions`
(`apc/common.js:114`) takes an array of `[key, value]` pairs, merges them into
the parsed `site_options` object and writes the whole object back to
`localStorage`. There is no setter to go through and no validation on the way
in, so nothing in DELPHI stops a bad write; the assistant's own validation is
the only guard.

The catch is that a region change is **not** one field or three. See Q3.

## Q2. Does a write trigger a redraw, or must one be invoked?

**A write does nothing on its own.** There is no change event on
`site_options`. Every writer in DELPHI dispatches its own event on
`[data-module="browser"]`:

- **`refresh`** redraws the existing tracks. This is what a region change needs
  (`dispatchBrowserRefresh`, `browser/helpers.js:13`).
- **`update`** rebuilds the track set, re-derives `mode` from the selected
  populations' `Dataset`, re-sorts, and ends by dispatching `refresh` itself
  (`browser.js:106-152`). This is what a population change needs.

So the assistant dispatches `update` when the patch touches populations and
`refresh` otherwise.

## Q3. What exactly is the shape of the region state?

Separate fields, and more of them than the design assumes:

| Field | Value |
|---|---|
| `chr` | a string with the prefix, `'chr2'` — not `'2'` |
| `start`, `end` | integers, hg19 |
| `viewfinder_start`, `viewfinder_end` | the wider minimap window |
| `zoom_level` | index into `ZOOM_LEVELS` |

**Nothing in DELPHI derives the last three from the first three.**
`tracks/viewfinder.js` reads `options.viewfinder_start` and
`options.viewfinder_end` straight from the options on every draw (lines 28-31,
55-60, 76). A patch that writes only `chr`/`start`/`end` therefore leaves the
minimap pointing at the previous locus. DELPHI's own search box writes all six
(`updateRegionFromInput`, `browser/helpers.js:43-70`); its own gene search
writes three and has exactly this defect (`handleSearch`,
`tracks/annotation.js:190-200`). The assistant writes all six, every time.

Because the model returns `chrom` without the prefix in the design's own
example, the patch layer normalises `'2'` to `'chr2'` before validating it
against `CHR_LENGTHS`.

## Q4. Is there existing history or undo behaviour that "back" should hook into?

**No. There is no history, no undo, and no stack of previous views anywhere in
DELPHI.** `back` is therefore implemented as the assistant's own bounded region
stack (`assistant/history.js`), and it can only return to views the assistant
itself moved away from. A pan the user did by dragging the focal window is not
recorded, because nothing reports it.

## Q5. Roughly how many users, and how often?

**Not answerable from the code — owner question.** The quota numbers shipped are
the design's own starting point: 30 requests/hour per token, 200/day per
address, and a monthly ceiling of $100 in `proxy/wrangler.toml`. All three are
single constants and are meant to be re-set once real traffic exists.

## Q6. Is a gene-symbol coordinate table already available, or must one be sourced?

**Already available, and phase 2 costs nothing.** `loadGeneMap`
(`assets.js:477`) returns a `Map` of gene name to `{chr, start}`, built from the
GENCODE v19 JSONL that the annotation track already loads. The map is 55,765
entries and is resident once the gene track has drawn once.

One limitation drops out of `parseJSONL` (`assets.js:196-217`): the map stores
**only the start coordinate**, not the end, so a gene's own length is not
available. DELPHI's search box handles this by keeping the current span and
re-centring on the gene's start, and the assistant does the same thing, so a
gene jump behaves the way a DELPHI user already expects.

## Q7. Should the assistant change track visibility and display settings?

**Not in phase 1** — the design's own section 2 scopes this to "where you are
looking", and that is what shipped: region and population only. The statistic,
the sort, the window size, the y-axis and the annotation tracks are all
reachable through the same `getOptions` boundary and could be added to the patch
schema later without touching anything else.

## Q8. Public-facing, or behind an institutional network?

**Public.** `.github/workflows/deploy.yml` syncs the site to the S3 bucket
`beta2.seqmash.com` behind CloudFront on every push to `main`, and
`ARCHITECTURE.md` gives the live site as `delphi.seqmash.com`. Nothing in the
app authenticates anyone. Section 8 of the design is therefore load-bearing, not
optional, and the bot check, quotas, origin allowlist and monthly ceiling all
ship.

---

## Things checked that the design did not ask about

- **Population writes replace, and dispatch `update`.** `library.js:208-211`
  writes the full selected set and dispatches `update`. The grid is pre-seeded
  with the current selection (`library.js:244`), which is why it feels additive
  to a user. The patch therefore always carries the whole desired set, and
  "add X" is composed in code from the current selection rather than asked of
  the model.
- **`CHR_LENGTHS` is keyed by chromosome, not by assembly** (`common.js:41`).
  `browser/helpers.js:29` and `:56` index it as `CHR_LENGTHS[assembly]?.[chr]`
  with `assembly` defaulting to `'hg38'`, so DELPHI's own clamp always falls
  back to `Infinity`. That latent bug is not ours to fix and, more to the point,
  is not a safety net we can lean on: the assistant validates every coordinate
  itself.
- **There is no test suite and no test runner.** No `package.json` at the repo
  root, no CI test step. The assistant's tests are therefore pages you open.
- **There is no design system.** `css/main.css` is a single 997-line ad hoc
  sheet with a custom-property palette in `:root` (lines 1-27). The assistant
  reuses those properties from a separate `css/assistant.css` and leaves
  `main.css` untouched.
- **Prompt caching will not fire on the catalogue.** The design (sections 4 and
  7) counts on caching the static catalog portion of the prompt. The minimum
  cacheable prefix on the Haiku-class model the cost model assumes is 4096
  tokens; the catalogue plus system prompt is well under half that. Adding a
  cache breakpoint would pay the write premium and never read, so none is set.
  This changes nothing about feasibility — the cost per call is a fraction of a
  cent either way — but the design's stated saving is not available at this
  prompt size.
