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
- The Buy/Sell buttons on the dashboard are not wired to any trade endpoint.

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
