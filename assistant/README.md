# The DELPHI assistant

A panel inside DELPHI that turns a plain-language request into a validated
change to the view. Inference runs on the user's own machine, in the tab, on
WebGPU. Nothing is sent anywhere.

## How a request travels

```
typed text
  |
  +-- a number answering a question the assistant asked --> the exact
  |                                                         candidate held
  |                                                         in code
  |
  +-- parser.js, no model                --> command
  |
  +-- model.js, one call, {action, target} --> command
                                                  |
                                                  v
                                       router.js resolves the target
                                       against the code-held collections
                                                  |
                                       resolved ---+--- missed
                                                  |         |
                                                  v         v
                                          actions.js    a question
                                          validates,    chosen by
                                          writes,       code from the
                                          dispatches,   failure type
                                          verifies
```

The model never supplies a coordinate, a gene position or a population label.
It classifies the request and copies out a name; code looks the name up.

## Files

| File | What it is |
|---|---|
| `/assistant.js` | the entry module, wired by `data-module="assistant"` in `index.html` |
| `panel.js` | the panel shell. Text in, text out, `textContent` only |
| `parser.js` | the deterministic reader that runs before the model |
| `model.js` | WebLLM, loaded once on first open. The only dynamic import in the assistant |
| `router.js` | routes a command through the resolvers to the actions |
| `resolvers.js` | exact-match lookup over the collections cached at load |
| `metadata_filter.js` | population filtering by numeric field, region or country |
| `catalogue.js` | loads the collections once, and joins populations to their samples |
| `actions.js` | the only code that writes `site_options` and dispatches events |
| `messages.js` | every word the user reads. The model writes none of them |
| `vocabulary.js` | the closed enums |
| `state_observer.js`, `state_serializer.js` | pre-existing, unchanged |
| `FINDINGS.md` | what stage 1 established from the code |

`knowledge/` is stale scaffolding from an earlier design and is imported by
nothing. See `FINDINGS.md` section 6.

## What it does

Sets the statistic. Sets the sort field and direction. Jumps to a region or a
gene. Adds or replaces populations. Filters populations by region, country or a
numeric metadata field. Adds an annotation track. Answers a question about one
state field.

It does not answer "what is the value here", does not narrate, and does not
create populations. Those are decided out of scope in `DECISIONS.md`.

## Running the tests

There is no test runner in this repository, so the tests are pages. Serve the
repository root and open:

- `/assistant/tests/index.html` - resolvers and metadata filter, 36 cases
- `/assistant/tests/actions.html` - actions and routing against real
  `site_options`, 42 cases
- `/assistant/tests/panel.html` - the panel shell, 17 cases

Each prints pass or fail per case and a total. The action tests write
`localStorage.site_options`, so run them in a tab you do not mind resetting.

## Known limits in this version

- No capability has a measured success rate yet. The Gate 4a re-run against the
  current grammar has not happened.
- One action per request. "Show diversity in Yoruba" sets the statistic and
  stops.
- A filter matching more than twelve populations reports the count and does
  nothing.
- Model weights are fetched from a pinned URL but are not hash-verified.
