# Deploying Voltix to Vercel

## 1. Vercel project

Import the GitHub repo at <https://vercel.com/new>. Framework preset is detected
as Next.js; leave build settings at their defaults.

## 2. Domain

No custom domain. The app is served from its Vercel URL:

```
https://voltix-khaki.vercel.app
```

This URL is stable across production deploys and already has valid HTTPS, which
is all Deriv requires of a redirect target. If a custom domain is added later,
update `NEXT_PUBLIC_BASE_URL` and the Deriv redirect URL together, then redeploy.

## 3. Environment variables

Set these under **Project → Settings → Environment Variables** for the
Production environment. Do not commit real values.

| Variable | Value |
| --- | --- |
| `DERIV_APP_ID` | your Deriv OAuth client_id |
| `DERIV_AFFILIATE_TOKEN` | your affiliate token (secret) |
| `DERIV_AFFILIATE_CAMPAIGN` | `reshare_site` |
| `DERIV_OAUTH_URL` | `https://auth.deriv.com/oauth2/auth` |
| `DERIV_TOKEN_URL` | `https://auth.deriv.com/oauth2/token` |
| `DERIV_API_BASE` | `https://api.derivws.com` |
| `NEXT_PUBLIC_BASE_URL` | `https://voltix-khaki.vercel.app` |
| `SESSION_SECRET` | `openssl rand -base64 32` |

`NEXT_PUBLIC_BASE_URL` is inlined into the client bundle at build time, so
changing it requires a redeploy, not just a restart.

## 4. Deriv app settings

The registered redirect URL must exactly match what the app sends:

```
https://voltix-khaki.vercel.app/api/auth/callback
```

Exact string match — a trailing slash or a different path fails with
`redirect_uri_mismatch`.

## 5. Verify

1. Load `https://voltix-khaki.vercel.app` and click **Login with Deriv**.
2. Confirm the authorization URL carries `affiliate_token` and `utm_campaign`.
   Attribution depends on these; if they are absent the reshare is not credited.
3. Complete login and confirm the redirect lands on `/dashboard`.
4. Confirm the balance renders and the R_75 price ticks.

## Known gaps

- The session is the raw Deriv access token in an httpOnly cookie.
  `SESSION_SECRET` is not read by any code yet; it is reserved for signing a
  real session if you move off the raw token.
- There is no refresh-token handling. When the access token expires the user is
  bounced to `/` by `proxy.ts` and must log in again.
- No refresh-token handling (see above); an expired token means a fresh login.

## Trading

Trading runs over Deriv's authenticated WebSocket, not REST. The flow is:

1. `GET /trading/v1/options/accounts` lists accounts (`account_type` is
   `demo` or `real`).
2. `POST /trading/v1/options/accounts/{id}/otp` returns a ready-to-use socket
   URL. The OTP is single-use and expires after 120 seconds, so a URL is
   minted per connection and never reused. This happens in
   `app/api/deriv/ws-url`, which keeps the Deriv access token server-side.
3. `{ proposal: 1, ... }` over that socket quotes a contract. Note the field
   is `underlying_symbol`, not `symbol`.
4. `{ buy: <proposal id>, price: <ask_price> }` executes it. Passing the quoted
   ask price as `price` caps the spend: if the market moves between quote and
   execution, Deriv rejects the trade rather than filling at a worse price.

Buying requires the `trade` scope, which the OAuth URL already requests.

### Open positions

`{ proposal_open_contract: 1, subscribe: 1 }` with no `contract_id` streams
every open contract on the account, so positions stay live without polling and
a newly bought contract appears on its own.

### Deriv stringifies numbers the spec calls numbers

This has bitten twice. `GET /accounts` returns `balance` as `"10000.00"` even
though the OpenAPI spec declares it a number, and calling `.toFixed()` on it
takes the dashboard down with a client-side exception.

Treat every monetary field from Deriv as possibly a string. Values are coerced
at the boundary (`coerce` in `api/auth/me`, `toProposal` / `toPurchase` /
`toOpenContract` in `useDerivTrading`), and the dashboard formats through a
`money()` helper that returns a dash rather than throwing.

Deriv sends the monetary fields on this message as **strings**
(`buy_price`, `bid_price`, `payout`, `profit`, `current_spot`, `sell_price`);
only `profit_percentage` is a number. They are coerced once in
`toOpenContract`. Calling `.toFixed()` on the raw values throws.

Subscription updates reuse the original `req_id` on every message, so the hook
tracks streams separately from one-shot requests, which are resolved and
discarded after their first response.

### Duration and stake limits

Deriv rejects durations it does not offer ("Trading is not offered for this
duration"), and the valid range differs per unit: R_75 rise/fall accepts a few
ticks, but time-based durations start well above 2 seconds.

Rather than hardcoding this, `contracts_for` is queried on connect and
`min_contract_duration` / `max_contract_duration` (strings like `"15s"`,
`"10t"`, `"1d"`) are parsed into per-unit bounds. Time ranges are normalised to
seconds and re-expressed in each unit; ticks are kept separate because they are
not time. A unit that cannot express a valid duration is not offered at all.

`min_stake` / `max_stake` from the same call bound the stake field.

### Early sell

`{ sell: <contract_id>, price: <minimum> }` closes a position before expiry.
Note the asymmetry with buying: on a **buy**, `price` is a maximum (a cap); on
a **sell** it is a **minimum** (a floor), and `0` means "sell at market" —
accepting any price at all. The UI quotes a floor 5% below the displayed bid,
which rejects a large adverse move while tolerating ordinary tick noise.

Only offered when Deriv reports `is_valid_to_sell` on the contract. Note that
tick-duration contracts are generally not sellable, so the button will not
appear on them — use a time-based duration to exercise early sell.

### History

`{ profit_table: 1, description: 1, limit: 50, sort: 'DESC' }` returns settled
trades. It has no `profit` field: profit is `sell_price - buy_price`.

### Session expiry

Deriv's OAuth guide documents no refresh token and no `offline_access` scope,
so a refresh may simply be impossible for this app. The plumbing is built and
opt-in:

- set `DERIV_REQUEST_OFFLINE_ACCESS=1` to add `offline_access` to the
  authorize request. Left off by default because an unsupported scope can fail
  the whole authorize call and break login.
- `api/auth/callback` stores `deriv_refresh` when one is issued, and logs a
  warning when it is not.
- `api/auth/refresh` exchanges it via `grant_type=refresh_token`.
- the dashboard reads the non-secret `deriv_expires_at` cookie and attempts a
  refresh a minute before expiry; if that fails it shows a banner rather than
  dropping the user mid-trade.

To find out whether Deriv issues refresh tokens, set the flag, log in, and
check the runtime logs for the `no refresh_token issued` warning.

### Real-money safeguards

- The account selector defaults to a demo account when one exists.
- A `REAL MONEY` badge and a persistent banner show whenever a real account is
  selected.
- Real-money trades require confirmation in a dialog stating cost, payout, and
  worst-case loss. Demo trades skip it.
- The check is `account_type !== 'demo'`, not `=== 'real'`. It fails safe: an
  unexpected account type gets the confirmation dialog rather than silently
  spending real money.

## Compliance

The site carries a risk warning on the landing page and dashboard, discloses
the Deriv affiliate relationship, and links Terms of Use and a Privacy Policy.

**The legal pages are templates and have not been reviewed by a lawyer.** They
must be checked by qualified counsel before real traffic, particularly for UK,
EU, or other regions with statutory disclosure and privacy obligations.
Financial promotions are separately regulated in many jurisdictions.

## Commit authorship

Vercel's Hobby plan only deploys commits whose author has contributing access to
the project, and it does not allow additional contributors on a private repo. A
commit authored by any other identity is rejected with "Deployment Blocked",
even though the push itself succeeds.

Commits must therefore be authored as the GitHub account the Vercel project was
imported from:

```
git config user.name  "Damaris Muange"
git config user.email "13904670+ndush@users.noreply.github.com"
```

The noreply address attributes the commit to the account without exposing a
private email. Check with `git log -1 --format='%an <%ae>'` before pushing.
