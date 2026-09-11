# Editing the site

You do not need GitHub, and you cannot break the site from here.

## Signing in

Go to **/admin**, type your email, and press **Email me a link**. Open the
email and click **Sign in**. There is no password to remember.

The link works for 10 minutes. If it expires, just ask for another.

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
| `ADMIN_EMAILS` | Comma-separated list of who may sign in, e.g. `you@x.com,client@y.com` |
| `SESSION_SECRET` | Signs the sign-in links and session cookies. Already set. |
| `RESEND_API_KEY` | Resend API key for sending the sign-in emails |
| `RESEND_FROM` | Sender address, e.g. `admin@yourdomain.com` |
| `GITHUB_REPO` | `ndush/voltix` |
| `GITHUB_TOKEN` | Fine-grained PAT, **Contents: Read and write**, scoped to this repository only |
| `GITHUB_BRANCH` | Optional, defaults to `main` |

Create the token at **GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens**. Give it access to `ndush/voltix` alone and the
single **Contents** permission. It can commit to this repository, so treat it
as a credential: it belongs in Vercel's environment variables and nowhere else.

## Access and sessions

Sign-in is passwordless. A request emails an HMAC-signed link valid 10 minutes;
redeeming it sets an HMAC-signed session cookie valid 8 hours. Both carry the
editor's address, so each save is committed with that person as the git author
and the history is a real audit trail.

Access is governed entirely by `ADMIN_EMAILS`. Removing someone revokes them
immediately, including any unexpired link they already hold, because the
allowlist is rechecked on every request. To invalidate live sessions as well,
rotate `SESSION_SECRET`.

`/api/admin/request-link` answers identically for every address, so it cannot
be used to discover who can administer the site.

**Known limitation:** links are stateless, so a link cannot be marked used and
is replayable within its 10-minute window by anyone who obtains it. Making it
single-use requires somewhere to record spent tokens.

**Before real use:** without a verified domain, Resend only delivers to the
address that owns the Resend account, so your client will not receive links
until a domain is verified. Until `RESEND_API_KEY` is set, links are written to
the Vercel runtime logs instead of being emailed — usable for testing, but
anyone who can read those logs can sign in.
