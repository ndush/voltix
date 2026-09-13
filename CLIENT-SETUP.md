# Standing up a client instance

You keep this repository as the template. Each client gets a fork, their own
Vercel project, and their own Deriv credentials, so their commissions, their
content and their outages are all theirs.

Budget about 40 minutes the first time, 20 after that.

## What the client must bring

| Thing | Where they get it |
| --- | --- |
| A Deriv account | deriv.com |
| Their affiliate token | Partner dashboard, or the `t=` value their tracking link redirects to |
| A Deriv app | developers.deriv.com → Applications Manager |
| An email address | For their admin login |

They need their own **app** as well as their own token. The app is what Deriv
checks the redirect URL against; the token is what decides who gets paid.

## 1. Fork the repository

```bash
gh repo fork ndush/voltix --fork-name voltix-<client> --clone
```

Or fork on github.com. Keep it under your account unless the client has bought
the code outright — you will be maintaining it.

Wire up the upstream so you can carry fixes across:

```bash
cd voltix-<client>
git remote add upstream git@github.com:ndush/voltix.git
```

Later, to pull in a fix you made to the template:

```bash
git pull upstream main
```

Only `content/site.json` diverges between forks, so merges stay clean as long
as you avoid editing that file in the template.

## 2. Create the Vercel project

Import the fork at vercel.com/new. Framework detects as Next.js; leave the
build settings alone. Deploy once to get the URL — you need it for step 3.

If the fork is private, the client cannot edit content on the Hobby plan: their
commits are refused as a second contributor. Either make the fork public or put
that project on Pro.

## 3. Register the client's Deriv app

At developers.deriv.com → Applications Manager, with **their** account:

- Scopes: `trade`, `account_manage`
- Redirect URL, exactly:
  `https://<their-vercel-url>/api/auth/callback`

The path is `/api/auth/callback`, not `/callback`. An exact-match failure here
is the single most common way this breaks, and the error only appears after a
user tries to log in.

## 4. Create their admin login

From the fork:

```bash
npm run admin:user
```

Use their email. It prints a QR code and the JSON entry. Show them the QR in
person or on a screen share — not over WhatsApp. Add your own entry to the same
array if you want to be able to support them.

## 5. Create a GitHub token for their fork

github.com/settings/personal-access-tokens/new

- Repository access: **Only select repositories** → their fork
- Permissions: **Contents · Read and write**, nothing else

One token per fork. A token scoped to one client's repository cannot touch
another's.

## 6. Environment variables

| Variable | Value |
| --- | --- |
| `DERIV_APP_ID` | Their app id from step 3 |
| `DERIV_AFFILIATE_TOKEN` | **Their** token — this decides who gets paid |
| `DERIV_AFFILIATE_CAMPAIGN` | Their default campaign name |
| `DERIV_OAUTH_URL` | `https://auth.deriv.com/oauth2/auth` |
| `DERIV_TOKEN_URL` | `https://auth.deriv.com/oauth2/token` |
| `DERIV_API_BASE` | `https://api.derivws.com` |
| `NEXT_PUBLIC_BASE_URL` | Their Vercel URL, or their domain once they buy one |
| `SESSION_SECRET` | `openssl rand -base64 32` — a fresh one per client |
| `ADMIN_USERS` | From step 4 |
| `GITHUB_REPO` | `ndush/voltix-<client>` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_TOKEN` | From step 5 |

Never reuse `SESSION_SECRET` between clients. It signs admin sessions, so a
shared value would let a session from one instance be replayed against another.

Redeploy after setting these. Vercel injects environment variables at build
time, so a running deployment never sees a variable added after it was built.

## 7. Check it before handing over

- Load the site — live prices should be moving.
- Click **Login with Deriv**, and check the URL you land on carries
  `affiliate_token` and `utm_campaign`. If those are missing, attribution is
  silently broken even though login works.
- Complete a login, place one demo contract, watch it settle.
- Sign in at `/admin`, change the headline, save, and confirm the site updates.

That fourth check is the one clients care about, because it is the thing they
were promised they could do without you.

## 8. Hand over

- The site address
- Their admin email, password and QR code
- `CONTENT.md` — the top half is written for a non-developer
- A reminder to test on a **demo** Deriv account first

## Rebranding beyond content

`content/site.json` covers copy, markets, selling points and campaigns. Going
further than that is a code change in the fork:

- Colours and fonts: `app/globals.css`
- Logo text: the `brand` field, already in the content file
- Page title: `app/layout.tsx`
- Legal pages: `app/terms` and `app/privacy` — these carry an unreviewed-
  template notice that must stay until a lawyer has actually looked at them

## When one repository stops being enough

Past a handful of clients, maintaining separate forks gets tedious. At that
point the better shape is one repository, one deployment per client, and a
`GITHUB_CONTENT_PATH` environment variable pointing each deployment at its own
content file. That needs a small refactor — `app/lib/content.ts` currently
imports the JSON statically — so it is not worth doing before you need it.
