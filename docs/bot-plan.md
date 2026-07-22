# DELPHI on-device assistant (bot) - implementation plan

## Goal

Let a researcher type a natural-language request, for example:

> "show me the heterozygosity of two modern populations from africa in a gene under strong selection"

and have DELPHI carry it out: select or create the populations, set the measure, and
navigate to a relevant gene - without the researcher opening the population picker,
measure dropdown, or gene search by hand. The assistant proposes the steps, the user
confirms, and the existing browser events apply them so the result appears on screen.

## Core decisions

| Decision | Choice |
|---|---|
| Where the model runs | Fully on-device in the browser via WebLLM (WebGPU). No server, no API key, no per-use cost, no content-attribution risk. |
| Model | Llama-3.2-3B-Instruct (q4f16), loaded and cached by WebLLM. Model id is a single constant in `agent/engine.js`. |
| Bring-your-own-key | Not supported. There is no key path of any kind, now or later. |
| Backend | None. The Lambda/Gemini path explored on the `nl-agent` branch is dropped. |
| UI | Adopted from `nl-agent`: floating bubble (bottom-right) that expands into a chat panel. |
| Action safety | Preview, then confirm. Proposed actions render as a list with Apply / Cancel before anything runs (population creation writes to IndexedDB and is not trivially undoable). |
| Control strategy | Single-shot constrained JSON. The model emits one `{reply, proposed_actions}` object matching a fixed schema; no multi-turn tool-call round-trips. |
| Gene knowledge | The model's own parametric knowledge. No curated gene/selection database is added. A later phase may inject a small set of instructions and reference data (see Deferred work). |
| Conversation | Multi-turn, in-memory per session, not persisted across reloads. |
| Code style | All new code follows `.intent/system`: tabs, ASCII only, single quotes, underscore-delimited variables, functional style, short modules and functions, docstrings only. |

## Why on-device

The assistant runs without a login. Any usage would otherwise be attributed to a single
account, making the operator responsible for arbitrary user input. Running the model in
the browser removes that exposure completely: nothing leaves the user's tab, there is no
key to leak, and there is no bill to run up. The trade is that gene reasoning relies on a
3B model's training rather than web search - accepted deliberately.

## Architecture

```
+-------------------------------------------------------------+
|  Browser tab                                                |
|                                                             |
|  agent_chat.js  (mounted module, data-module="agent_chat")  |
|   - floating bubble + chat panel                            |
|   - conversation history (in memory)                        |
|   - action preview / confirm UI                             |
|        |                         ^                          |
|        v                         |                          |
|  agent/tools.js            agent/engine.js                  |
|   - system prompt          - WebLLM lifecycle               |
|   - response schema        - WebGPU gate + progress         |
|   - context injection      - constrained JSON generation    |
|        |                         |                          |
|        +------------ {reply, proposed_actions} -------------+
|        v                                                    |
|  agent_actions.js  (validated executor)                     |
|   select_populations | create_population |                  |
|   set_measure | navigate_to_gene                            |
|        |                                                    |
|        v  (existing app functions, unchanged)               |
|  browser/pops.js: addPopulation(), getMetadata()            |
|  apc/common.js: getOptions()                                |
|  browser/helpers.js: updateRegionFromInput()                |
|  [data-module="browser"] dispatch 'update' / 'refresh'      |
+-------------------------------------------------------------+
```

All model inference and all state changes happen in the browser. The assistant only
proposes actions; the existing browser code performs them, using the same functions a
human click already uses.

## Reuse, drop, add

### Reuse from `nl-agent` (as-is or lightly adapted)

- The chat UI: `index.html` additions (chat and send SVG symbols, the
  `data-module="agent_chat"` mount) and `css/main.css` additions (bubble and panel,
  using existing `--accent` / `--bg-panel` / `--border` tokens).
- The preview / confirm flow in `agent_chat.js` (Apply / Cancel on proposed actions).
- `agent_actions.js`: the executor mapping each tool to a real DELPHI function
  (`select_populations`, `create_population`, `set_measure`, `navigate_to_gene`) with
  `runAction` / `describeAction`.
- The `{reply, proposed_actions: [{tool, args}]}` response contract, which becomes the
  JSON schema the on-device model is constrained to emit and maps directly onto the
  existing `handleResponse`.

### Drop

- `lambdas/agent/` (Python Lambda) and `docs/nl-agent-deploy-checklist.md`.
- In `agent_chat.js`: `AGENT_ENDPOINT`, `AGENT_SHARED_SECRET`, `requestAgent`,
  `sendToAgent`, and the `fetch` to the Function URL.

### Add

Two pure-helper modules under `agent/` (mirroring the `browser/*` helper pattern; the
mounted module stays root-level `agent_chat.js`):

| File | Interface | Responsibility |
|---|---|---|
| `agent/engine.js` | `loadEngine(on_progress)`, `generatePlan(engine, messages, schema)` | WebLLM lifecycle: load the model, WebGPU feature-gate, progress callback, constrained-JSON generation. This is the swappable backend boundary. |
| `agent/tools.js` | `RESPONSE_SCHEMA`, `buildSystemPrompt(population_catalog, current_state)` | The response JSON schema, the system prompt (reusing the four tool definitions), and injected context: population catalog from `getPopsData()` plus the current snapshot from `getOptions()`. |

## Control strategy

Single-shot constrained JSON via WebLLM `response_format`. Context that the model needs
in order to choose valid populations - the catalog of available populations with their
dataset and geography, and the current browser state - is injected into the system prompt
rather than fetched through tool round-trips. Small models handle a single constrained
completion far more reliably than a multi-step tool loop, and the catalog is small enough
to inline. The emitted object is validated in `agent_actions.js`, previewed, then applied.

## Action and validation surface

`agent_actions.js` is the single choke point that mutates app state:

- `set_measure`: measure restricted to `heterozygosity`, `fst`, `tajimasd`, `fulif`.
- `select_populations`: labels validated against the known population set; unknown labels
  are reported, not applied.
- `create_population`: filters `getMetadata()` samples by region and age range, then calls
  `addPopulation`. Field names and the kya sign convention are verified against real
  metadata during implementation.
- `navigate_to_gene`: routed through `updateRegionFromInput`, which reuses the existing
  gene-symbol search; a no-op result is reported as "gene not found".

No `eval`, no arbitrary DOM, no arbitrary JavaScript - only the named actions.

## Lifecycle and gating

- Lazy load: the model downloads only when the user first opens the bubble, with progress
  shown in the panel. WebLLM caches the weights, so later sessions start immediately.
  Visitors who never open the assistant pay no download cost.
- WebGPU gate: `navigator.gpu` is feature-detected. When absent, the panel shows a clear
  message (on-device AI needs a WebGPU browser such as desktop Chrome or Edge) instead of
  failing.

## Model choice

Default Llama-3.2-3B-Instruct (q4f16, about 1.9 GB). Best balance of instruction-following
and recall of well-known selection genes for its size. A smaller model can be swapped in
by changing one constant in `agent/engine.js` if download size becomes a concern.

## The knowledge gap and deferred work

With no web search and no key path, recall of less-famous selection genes depends entirely
on the 3B model's training. Mitigations already in the design: the system prompt seeds
canonical examples (for example LCT, EDAR, SLC24A5, HERC2, DARC/ACKR1), constrained
decoding keeps output valid, and the preview step lets the user correct a wrong gene before
anything runs.

Deferred (later implementation): inject a small, curated set of instructions and reference
data into the model context - for example a short table of genes with a known selection or
phenotype annotation, and usage guidance specific to DELPHI. This stays on-device (bundled
static data read into the prompt or retrieved locally), adds no key and no backend, and
closes the recall gap for the genes that matter most. Kept out of the initial build to
prove the on-device path first.

## Implementation phases

| Phase | Deliverable | Exit check |
|---|---|---|
| 0 | Port the `nl-agent` frontend onto `bot`; strip the Lambda seam; keep the injectable test hook | Panel opens and closes; the preview / Apply flow runs from an injected response |
| 1 | `agent/engine.js`: WebLLM load, WebGPU gate, progress, a plain generation spike | Llama-3.2-3B downloads, caches, and returns text under the no-build service-worker setup |
| 2 | `agent/tools.js`: response schema, system prompt, context injection | The model emits schema-valid `{reply, proposed_actions}` |
| 3 | Wire the local path in `agent_chat.js` end to end | The example query produces a correct preview; Apply drives the browser |
| 4 | Prompt tuning on the gold queries | Modern / African selection and relative edits handled; wrong-gene cases correctable via preview |
| 5 | Polish: errors, WebGPU fallback, model-id constant, accessibility | Clean behavior on unsupported browsers; gold set passes |
| 6 (deferred) | On-device instructions and reference data injection | Improved gene recall with no key and no backend |

## Gold queries for testing

- The example above (two modern African populations, heterozygosity, a gene under selection).
- Compare heterozygosity of YRI and CEU at LCT.
- FST between two African populations near EDAR.
- Sort tracks by distance from Africa.
- Zoom out and add a European population.

## Risks and mitigations

- Small-model gene-knowledge gaps: constrained schema keeps behavior safe; unresolved genes
  are reported, not silently wrong; the deferred knowledge-injection phase addresses recall.
- Model download size: lazy load, progress, WebLLM cache, and a smaller-model swap point.
- WebGPU unsupported (for example mobile Safari): graceful feature-gated message.
- CDN import, CORS, CSP: verified in Phase 1; WebLLM may be vendored locally. `sw.js` caches
  only seqmash origins, so cross-origin weights pass through to WebLLM's own cache and no
  `sw.js` change is required.
- ASCII-only source rule: all prompt and UI string literals stay ASCII; model output is
  runtime data and is unrestricted.

## Footprint on existing code

New files: `agent/engine.js`, `agent/tools.js`, plus the ported `agent_chat.js` and
`agent_actions.js` and the additive `index.html` / `css/main.css` blocks. No changes to
`/apc/`, `browser.js`, `assets.js`, or any track module - the assistant rides entirely on
their existing event and state surface.
