# The assistant proxy

A Cloudflare Worker. It exists for one reason: the API key must never reach the
browser. Everything else it does — the cache, the quotas, the monthly ceiling —
follows from being the only server-side piece the assistant has.

It is **not** part of the static site. `.github/workflows/deploy.yml` excludes
`proxy/*` from the S3 sync, so nothing here reaches the public bucket.

## Endpoints

| Route | What it does |
|---|---|
| `POST /token` | verifies a Turnstile token, returns a signed bearer token valid one hour |
| `POST /navigate` | quota, then cache, then model. Returns `{source, request}` |
| `POST /confirm` | stores a confirmed answer in the cache. Called after the user pressed Go |

Every route requires an `Origin` on the allowlist. `/navigate` and `/confirm`
also require the bearer token.

## Deploy

```sh
cd proxy
npm install

# One KV namespace holds the cache, the quota counters and the month's spend.
npx wrangler kv namespace create ASSISTANT_KV
# paste the printed id into wrangler.toml

npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put TOKEN_SECRET

npx wrangler deploy
```

Then set two things on the browser side, in `assistant/config.js`:
`PROXY_URL` to the deployed Worker URL, and `TURNSTILE_SITE_KEY` to the public
half of the Turnstile keypair. Both are placeholders in the committed file, and
until they are real the assistant runs on its deterministic tier alone.

### The three secrets

- **`ANTHROPIC_API_KEY`** — a key created **for DELPHI and nothing else**, with
  its own hard spend limit set in the provider's dashboard. That limit is the
  backstop for a bug in this Worker; the ceiling below is the backstop for
  ordinary use. Never share the key with another project.
- **`TURNSTILE_SECRET_KEY`** — the server half of the Turnstile keypair.
- **`TOKEN_SECRET`** — 32 random bytes, signs the session token.
  `openssl rand -base64 32` is enough.

### Before the first deploy

`INPUT_PRICE_PER_MTOK` and `OUTPUT_PRICE_PER_MTOK` in `wrangler.toml` feed the
monthly ceiling arithmetic. **Check both against the current price list.** If
they are wrong the ceiling is wrong in the same direction, and a ceiling that is
wrong in the generous direction is not a ceiling.

## Spend control, cheapest first

1. The browser's deterministic tier answers most real traffic with no request.
2. The KV cache answers a repeat with no model call.
3. 200-character input cap, enforced here as well as in the browser.
4. `max_tokens` 300, and a response schema with no field for prose.
5. 30 requests/hour per token, 200/day per address.
6. A monthly ceiling in cents (`MONTHLY_CEILING_CENTS`), accumulated from the
   real `usage` figures on each response. A warning is logged once at 80%.

At 100% the model tier switches **off** and `/navigate` returns 503 with a
message the panel shows. Typed coordinates, gene names, population names and
zoom commands all keep working. The worst case is a reduced feature, not a
broken site and not a surprise bill.

## Abuse control without accounts

- Invisible Turnstile on first use; no token, no model call.
- Short-lived signed token, one hour, carrying an expiry and a random id and
  nothing else.
- Quotas on both the token and the address, so collecting fresh tokens does not
  multiply the allowance.
- Origin allowlist.
- Rejection-rate monitoring: 25 unusable requests from one address in a day
  blocks it for a day. People mistype occasionally; probes do not.

## Logging

One line per model call: the event name, the anonymous visitor id, and the input
and output token counts. **Never the query text.** The cache key is a SHA-256 of
the normalised query, so the stored keys reveal nothing either.

## What it never does

Accept a catalogue from the client, return prose, write to the browser's state,
or see a genotype. The response schema has no free-text field, which is why this
endpoint is worth nothing to someone hoping to use it as a chatbot.
