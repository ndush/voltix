# Editing the site

You do not need GitHub, and you cannot break the site from here.

## Signing in

Go to **/admin** and press **Sign in with Google**. Use the Google account the
site owner added as an editor. There is no password to remember.

## What you can change

**Home page** — the big headline, the sentence under it, the button text, and
the banner strip across the top. Leave the banner empty to hide it.

**Markets** — which indices appear, with live prices. The symbol must be a
Deriv code (`R_10`, `R_25`, `R_50`, `R_75`, `R_100`); the name is whatever you
want people to read.

**Selling points** — the three short blurbs under the prices.

**Campaigns** — each one is a different version of the home page with its own
link. A campaign named `payday` lives at `/?c=payday`. Anyone who signs up
through that link is tagged in your Deriv partner dashboard under the campaign
name you set, so you can see which message actually brought people in. Add as
many as you like and run them side by side.

## Saving

Press **Save changes**. The site rebuilds and your change is live in about a
minute. Reload the home page to see it.

If someone else edited the content while you had the page open, the save is
refused rather than overwriting their work. Reload and make your change again.

## What you cannot change here

The risk warning, Terms of Use, and Privacy Policy. Those are required legal
disclosures, not marketing copy.

---

# For the developer

Content lives in `content/site.json`. The admin page reads and writes it
through the GitHub Contents API, so every change is an ordinary commit: full
history, blame, and one-click revert, with no database.

Saves are compare-and-set on the file SHA, so a concurrent edit returns 409
instead of clobbering. `app/api/admin/content/route.ts` validates the payload
shape and length before writing, and constrains market symbols and campaign
keys with a pattern, since both reach other systems.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAILS` | Comma-separated Google addresses that may sign in, e.g. `you@gmail.com,client@gmail.com` |
| `SESSION_SECRET` | Signs the admin session cookie. Already set. |
| `GOOGLE_CLIENT_ID` | From a Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | Same |
| `GITHUB_REPO` | `ndush/voltix` |
| `GITHUB_TOKEN` | Fine-grained PAT, **Contents: Read and write**, scoped to this repository only |
| `GITHUB_BRANCH` | Optional, defaults to `main` |

Create the token at **GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens**. Give it access to `ndush/voltix` alone and the
single **Contents** permission. It can commit to this repository, so treat it
as a credential: it belongs in Vercel's environment variables and nowhere else.

## Google sign-in setup

1. <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → OAuth consent screen**. External, fill in the app name
   and your support email. Adding editors as test users is enough; the app does
   not need verification while it stays in testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
4. Authorised redirect URI, exactly:
   `https://voltix-khaki.vercel.app/api/admin/google/callback`
   For local work add `http://localhost:3000/api/admin/google/callback` too.
5. Copy the client ID and secret into Vercel.

## Access and sessions

Google proves who the visitor is; `ADMIN_EMAILS` decides whether they may edit.
Signing in with an account that is not on the list is harmless — it is refused
and told so. Removing an address revokes access on the next request, since the
allowlist is rechecked every time rather than baked into the cookie.

The session is an HMAC-signed cookie valid 8 hours carrying the editor's
address, so each save is committed with that person as the git author. To end
every live session at once, rotate `SESSION_SECRET`.

The OAuth flow uses PKCE and a state cookie, and an account whose email Google
reports as unverified is rejected.
