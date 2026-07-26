# Gate 4a harness

Measures per-capability task success, the failure split, real token counts,
latency and heap for Llama-3.2-1B-Instruct q4f16_1 on WebGPU, with DELPHI live
in the same tab.

Scope note: latency, peak memory and resident impact measured on a 64GB machine
are not the Gate 4b figures. Gate 4b needs the 8GB reference machine.

## What is measured

Six capability types, 30 tasks each, 15 nominal and 15 edge:
T-classify, T-extract-position, T-select-statistic, T-select-gene,
T-select-population, T-answer-state.

T-select-metadata is not included. Its sort half needs the sort action confirmed
in the interface map, and its filtering half needs the region/country join path.

Tasks are generated, not hand-labeled. Six captures times five state transforms
gives 28 fixtures; transforms a capture cannot support are dropped. Every
expected value is derived by code from a re-parse of the exact text the model was
shown.

## Run

1. Copy this `eval/` directory next to `index.html` so it is served from the same
   origin as DELPHI.
2. Open DELPHI and set up any view. The harness reads catalogues only; it writes
   no options and dispatches no events.
3. Open Chrome's task manager (Shift+Esc) and write down the DELPHI tab's memory
   footprint and GPU memory now.
4. In the DELPHI page console, paste:

```js
const harness = await import('/eval/harness.js');
const report = await harness.runGate4a();
```

5. The first run downloads the model, roughly 800MB, cached after that. Progress
   prints to the console.
6. Read the task manager again once the model has loaded, and once more at the
   end of the run. Three numbers total.
7. A `gate4a_<timestamp>.json` file downloads when the run finishes. Send it back
   with the three memory readings.

`performance.memory` is recorded automatically but is the JavaScript heap only
and does not see GPU-resident weights, which is why the task manager numbers are
required rather than optional.

## If the run fails immediately

A failure inside `loadEngine` or on the first `generate` call is a harness or
WebLLM API problem, not a model result. Paste the error rather than the report.
The only WebLLM surface used is `CreateMLCEngine` and
`chat.completions.create` with a JSON schema response format, both isolated in
`model_runner.js`.

## Side effect

`loadGeneMap` populates the gene annotation IndexedDB table on a cold cache.
Nothing else is written.
