# The DELPHI navigation assistant

Say where you want to look; the browser moves there. Text goes in, a patch to
`site_options` comes out, and you approve it before it applies.

```
"show me the lactase region in Finns"
        |
        v
{ populations: ['Finnish'], chr: 'chr2', start: 136045410, end: 137045410 }
        |
        v
  Show Finnish, then go to chr2:136,045,410-137,045,410 (1.0 Mb)   [Go]  [Cancel]
```

## How a request travels

```
typed text
   |
   +-- tier 0  parser.js        exact coordinates, gene, population, zoom/pan/back
   |                            no network call at all
   |
   +-- tier 1  proxy KV cache   a query someone already confirmed
   |
   +-- tier 2  proxy -> model   constrained to a fixed form, ~200 output tokens
                    |
                    v
              patch.js      resolves names against code-held collections,
                            computes relative moves, clamps to the chromosome
                    |
                    v
              validate.js   every field checked against hg19 and the catalogue,
                            unknown keys dropped
                    |
                    v
              preview.js -> [Go] -> apply.js   the only writer of site_options
```

The model never supplies coordinates for a named gene. It returns the symbol;
`assets.js`'s own gene map supplies the position. Model for understanding, our
table for accuracy, never the reverse.

## Files

| File | What it is |
|---|---|
| `/assistant.js` | the entry module, wired by `data-module="assistant"` in `index.html` |
| `panel.js` | the panel shell: text in, one proposed change out, Go or Cancel |
| `parser.js` | tier 0, the deterministic reader |
| `client.js` | the only outbound path, and the only place that knows the proxy exists |
| `turnstile.js` | the invisible bot check |
| `patch.js` | request to patch: resolution, relative-move arithmetic, clamping |
| `validate.js` | the safety layer |
| `preview.js` | the sentence the user reads before approving |
| `apply.js` | the only module that writes `site_options` |
| `resolvers.js` | exact-match lookup, with near misses offered as a question |
| `catalog.js` | loads the gene map and population list once |
| `state_slice.js` | the whitelist of fields that may leave the machine |
| `history.js` | the region stack behind "back" |
| `config.js`, `messages.js` | the constants and the user-facing copy |
| `state_observer.js`, `state_serializer.js` | pre-existing scaffolding, unused by this design |

## What leaves the machine

Only three things, and only on a tier 2 miss: the typed query (capped at 200
characters), the current `chr`/`start`/`end`/`populations`, and an anonymous
visitor id. `state_slice.js` is a whitelist by name, so a field added to
`site_options` later is not sent by accident.

Never sent: genotypes, allele frequencies, per-sample records, uploaded files,
or any other `localStorage` key. Logging on the proxy is a hashed query plus
token counts.

## Running the tests

There is no test runner in this repository, so the tests are pages. Serve the
repository root and open:

- `/assistant/tests/navigation.html` - parser, patch, validation, preview and
  apply, 43 cases
- `/assistant/tests/panel.html` - the panel shell including the Go/Cancel
  contract, 27 cases

Each prints pass or fail per case and a total. The navigation tests write
`localStorage.site_options`, so run them in a tab you do not mind resetting.

## The proxy

`proxy/` is a separate deployable: the Cloudflare Worker holding the API key,
the cache, the quotas and the monthly ceiling. It is not part of the static site
and is excluded from the S3 sync in `.github/workflows/deploy.yml`, so it never
reaches the public bucket. See `proxy/README.md` for deployment and for the
three secrets it needs.

## Known limits

- No capability here has a measured accuracy. The ~30-query validation the
  design asks for before phase 4 has not been run.
- The proxy has never executed: no API key, no KV namespace, no Turnstile
  keypair. Treat it as reviewed code, not working code.
- Until a Turnstile keypair is set, the proxy issues no tokens and the assistant
  runs on tier 0 alone.
- "back" only returns to views the assistant itself moved away from; DELPHI
  reports nothing when the user drags the focal window.
