# Editing the site

You do not need GitHub, and you cannot break the site from here.

## Signing in

Go to **/admin** on the site and enter the password you were given.

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
| `ADMIN_PASSWORD` | Password for `/admin`. Make it long. |
| `SESSION_SECRET` | Signs the admin session cookie. Already set. |
| `GITHUB_REPO` | `ndush/voltix` |
| `GITHUB_TOKEN` | Fine-grained PAT, **Contents: Read and write**, scoped to this repository only |
| `GITHUB_BRANCH` | Optional, defaults to `main` |

Create the token at **GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens**. Give it access to `ndush/voltix` alone and the
single **Contents** permission. It can commit to this repository, so treat it
as a credential: it belongs in Vercel's environment variables and nowhere else.

The admin session is a stateless HMAC of an expiry timestamp, valid 8 hours.
There is no user store; the password is shared. If it leaks, change
`ADMIN_PASSWORD` and every existing session stays valid until it expires —
rotate `SESSION_SECRET` too if you need to invalidate them immediately.
