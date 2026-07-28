# Decisions taken while building the navigation assistant

Every decision here was made against the design document rather than given by
it: either the design left the choice open, or the code contradicted an
assumption in it. Each one is a single constant or a single function, so any of
them can be reversed cheaply.

---

## D-1. Tier 0 runs in the browser, not in the proxy

The architecture diagram in section 3 draws all three tiers inside the Worker.
Section 11 contradicts it: phase 1 is "Tier 0 deterministic parser + preview/Go
UI" with "Depends on external service: **No**". Phase 11 wins, and the parser
runs client-side.

Consequence: a typed coordinate, an exact gene symbol, an exact population name
and every relative move cost **zero network round trips**, not just zero model
tokens. They also keep working when the proxy is down or the budget is spent,
which is what makes the fail-closed story in section 7 real rather than
theoretical.

## D-2. The model may name a relative move; it may not compute one

Section 2 puts relative moves in scope. Tier 0 catches the common phrasings, but
"pull the view back a bit" is exactly the kind of paraphrase a parser misses.
So `relative` is a field in the model's form, constrained to a closed enum of
six values.

The arithmetic stays in code. The model says `zoom_out`; `patch.js` halves,
doubles, shifts and clamps against the chromosome. A model that cannot do
coordinate arithmetic cannot get coordinate arithmetic wrong.

## D-3. The catalogue lives on the proxy, not in the request

The design says the model sees "a static catalog: valid population codes and
names". It does not say who sends it. The proxy fetches
`modern_populations.json` from the public site once per isolate and holds it.

Sending it from the browser would add ~2KB to every request and would let a
client widen the vocabulary the model is allowed to name. Holding it on the
proxy costs one fetch per isolate and keeps the closed vocabulary genuinely
closed.

## D-4. The cache stores only state-independent answers

Section 3's cache is a `normalized query -> patch` map. Applied naively that is
wrong: "same place in Yoruba" and "zoom out" mean different things from
different starting points, and caching one would serve a wrong answer to the
next visitor.

`isCacheable` therefore stores an answer only when it has no `relative` field,
no rejection, and `confidence: high`. Absolute answers — genes, coordinates,
population names — are the ones that repeat across users anyway, so almost
nothing is lost.

## D-5. Cache writes come from Go, and only from Go

Section 6 says every Go is a free labelled example; section 11 puts the cache in
phase 5. Implemented literally: the browser calls `/confirm` **after** the user
pressed Go and the patch applied. An interpretation the user rejected is never
stored, so one bad answer cannot become permanent.

## D-6. Twelve populations is the ceiling

Not in the design. Each selected population becomes a track, and under FST the
track count is the number of *pairs*, so twenty populations is 190 tracks and a
hung tab. `validate.js` refuses more than twelve and says so.

## D-7. A near miss asks; it never guesses

Resolution is exact match. A miss collects up to six code-held names that are a
prefix, a completion or a one-character typo away, and asks. The user answers
with a number and the exact stored name is what proceeds.

The loose comparison decides only what is worth *offering*; it never decides
what is *applied*. Without it, "Finish" gets a flat "no such population", which
is the common case and a bad answer.

## D-8. The model is `claude-haiku-4-5`, in a variable

The design's cost model is built on "a small fast model (Haiku-class)", so that
is what shipped. It is `MODEL_ID` in `wrangler.toml`, not a literal in the code,
because the right tier is a question for the eval in section 11 and not for me.

The two price figures the ceiling arithmetic uses are variables in the same file
and are marked to be verified against the current price list before the first
deploy, as section 7 requires.

## D-9. The spend ceiling counts real usage, not calls

Section 7 wants "a global monthly ceiling in KV". Counting calls would need a
guessed cost per call. Instead the proxy reads `usage.input_tokens` and
`usage.output_tokens` off each response and accumulates actual cents, warning
once at 80% and refusing the model tier at 100%. Tier 0 keeps working after
that, and the panel says so.

## D-10. An anonymous visitor id is stored in `localStorage`

Section 9 asks for per-request tagging with an anonymous visitor ID. It is a
random UUID minted in the browser, sent as `metadata.user_id`, and used for the
rejection-rate block in section 8.

It is not an account: there is no server-side identity, nothing is stored
against it, and clearing site data mints a new one. It is worth naming because
it is the one persistent identifier the design adds.

## D-11. The privacy notice is shown, not buried

Section 10 says users "should be told plainly". The panel says it in the first
line of the transcript, on first open, before anything can be typed. It names
what leaves (query text, coordinates, population selection), what does not
(data, files, results), and the three mitigations.

## D-12. Turnstile fails closed, and the site key is a placeholder

No token, no model call. The site key in `assistant/config.js` and the secret in
the Worker are both placeholders and must be replaced with a real keypair before
deploy; until then the proxy refuses to issue tokens and the assistant runs on
Tier 0 alone. That is the correct failure direction, but it does mean the
interpreter is off until the keys are set.

## D-13. Chromosome lengths are duplicated across the network boundary

`common.js` holds them for the browser; `proxy/src/schema.js` holds them again
for the server-side sanity check. Duplication across a deploy boundary is
unavoidable — the Worker cannot import a browser module — and the server copy
exists only to keep nonsense out of the shared cache. The browser's copy is the
one that gates writes.

---

## Not built, and not hidden

- **No eval.** Section 11 requires validating the model on ~30 representative
  queries before phase 4. That has not been run, so nothing here has a measured
  accuracy, and the interpreter tier should be treated as unproven.
- **The proxy has never executed.** It has no API key, no KV namespace and no
  Turnstile keypair in this environment. The client, the parser, the patch
  builder, the validator and the apply path are all tested; the Worker is
  reviewed code, not working code.
- **Prompt caching is not configured**, for the reason in `FINDINGS.md`: the
  prompt is far below the model's minimum cacheable prefix.
- **The 200-character cap is enforced in three places** (input `maxlength`,
  client-side slice, server-side reject) because the first two are advisory
  only.
