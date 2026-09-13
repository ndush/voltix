# Editing the site

You do not need GitHub, and you cannot break the site from here.

## Signing in

Go to **/admin**. The browser asks for a username and password: your email
address, and the password the site owner gave you. Tick "remember" if your
browser offers it.

To sign out, close the browser. Browsers keep these credentials for the rest of
the session and there is no sign-out button.

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
| `ADMIN_USERS` | `email:password` pairs, comma separated. See below. |
| `GITHUB_REPO` | `ndush/voltix` |
| `GITHUB_TOKEN` | Fine-grained PAT, **Contents: Read and write**, scoped to this repository only |
| `GITHUB_BRANCH` | Optional, defaults to `main` |

Create the token at **GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens**. Give it access to `ndush/voltix` alone and the
single **Contents** permission. It can commit to this repository, so treat it
as a credential: it belongs in Vercel's environment variables and nowhere else.

## Admin access

`proxy.ts` enforces HTTP Basic Auth over `/admin` and `/api/admin/*`. There is
no login page, no session cookie and no provider: the browser's own dialog
collects the credentials and resends them on each request.

Set `ADMIN_USERS` to `email:password` pairs:

```
ADMIN_USERS=you@gmail.com:LONG_RANDOM_ONE,client@gmail.com:LONG_RANDOM_TWO
```

Generate each with `openssl rand -base64 24`. A password may contain colons but
not commas, since commas separate users.

Using the email as the username keeps per-person identity: saves are committed
with that address as the git author, so the history says who changed what.
Removing someone's pair revokes them on their next request.

Basic Auth sends the password with every request, so it is only acceptable over
HTTPS. Vercel terminates TLS on all deployments, and the proxy additionally
refuses non-HTTPS requests in production.

Passwords are compared in constant time, and every configured user is checked
even after a match so the timing does not reveal which entry matched.
`/api/admin/content` re-verifies the credentials itself rather than trusting
the identity header the proxy forwards.

**Trade-off accepted:** there is no sign-out. Browsers cache Basic Auth
credentials until the session ends, so revoking access means changing that
user's password in `ADMIN_USERS`.
