# Deploying Voltix to Vercel

## 1. Vercel project

Registrar for the domain is Hostinger; DNS is managed there.

Import the GitHub repo at <https://vercel.com/new>. Framework preset is detected
as Next.js; leave build settings at their defaults.

## 2. Custom domain

Add `voltixtrade.com` under **Project → Settings → Domains** and point DNS at Vercel
as instructed there. Wait for the certificate to be issued before testing OAuth —
the redirect URL must be reachable over HTTPS.

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
| `NEXT_PUBLIC_BASE_URL` | `https://voltixtrade.com` |
| `SESSION_SECRET` | `openssl rand -base64 32` |

`NEXT_PUBLIC_BASE_URL` is inlined into the client bundle at build time, so
changing it requires a redeploy, not just a restart.

## 4. Deriv app settings

The registered redirect URL must exactly match what the app sends:

```
https://voltixtrade.com/api/auth/callback
```

Exact string match — a trailing slash or a different path fails with
`redirect_uri_mismatch`.

## 5. Verify

1. Load `https://voltixtrade.com` and click **Login with Deriv**.
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
