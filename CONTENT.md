# Editing the site

You do not need GitHub, and you cannot break the site from here.

## Signing in

Go to **/admin** and enter three things:

1. your email
2. your password
3. the 6-digit code from your authenticator app

The code changes every 30 seconds, so type it fresh. Press **Sign out** when
you are finished — especially on a shared computer. You stay signed in for one
hour, then sign in again.

### First time: setting up the code on your phone

The site owner will show you a QR code once. Scan it with any authenticator app
already on your phone — Google Authenticator, Authy, Microsoft Authenticator,
or the built-in password app on iPhone. That is the whole setup and it takes
about ten seconds.

After that the app shows a rotating 6-digit code. It works offline; the phone
needs no signal to generate it.


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

Press **Save changes**. Reload the home page and your change is already there —
there is no waiting for a rebuild.

If two people save at once the later save wins, so agree who is editing before
you both start.

## What you cannot change here

The risk warning, Terms of Use, and Privacy Policy. Those are required legal
disclosures, not marketing copy.

---

# For the developer

Live content is a single JSON document in **Vercel Blob**, read on every
request and written by `/admin`. Saves take effect immediately; there is no
deploy in the write path.

`content/site.json` is committed as the fallback. It ships with the build and
is served when nothing has been saved yet, or if Blob is unreachable — so a
storage outage degrades to slightly stale copy rather than a broken site.

Trade-off taken deliberately: instant saves in exchange for version history.
There is no `git log` of content changes and no one-click revert, so a bad edit
is fixed by editing again. Every save is logged with the editor's address, and
`app/api/admin/content/route.ts` validates shape and length before writing,
constraining market symbols and campaign keys by pattern since both reach other
systems.

### Connecting the store

Vercel dashboard → **Storage** → **Create** → **Blob**, connect it to the
project, then redeploy. Vercel injects `BLOB_READ_WRITE_TOKEN` itself; there is
no token to create, paste, or renew.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_USERS` | JSON array of editors. Generate with `npm run admin:user`. |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when you connect a Blob store. Do not set by hand. |
| `GITHUB_BRANCH` | Optional, defaults to `main` |

## Admin access

`proxy.ts` guards `/admin` and `/api/admin/*` with a signed session cookie.
Signing in needs a password **and** a TOTP code, so a leaked password alone is
not enough.

### Adding an editor

```bash
npm run admin:user
```

It asks for an email and password (or generates a strong one), then prints an
enrolment QR code in the terminal and the JSON entry for `ADMIN_USERS`. The
password and the TOTP secret are shown once and stored nowhere — only the
scrypt hash reaches the environment, so the variable itself is not a usable
credential. For several editors, put every entry in the same JSON array.

### How it is put together

- **Passwords**: scrypt, with salt and hash as separate hex fields. The usual
  `$`-delimited form is silently mangled by dotenv-style variable expansion,
  which reads `$9ebf...` as a variable name and substitutes nothing.
- **TOTP**: standard 6-digit, 30-second codes, accepted one window either side
  to tolerate clock drift. Any authenticator app works; no provider account.
- **Session**: HMAC-signed cookie, `httpOnly`, `Secure`, `SameSite=Strict`,
  one hour. Membership is rechecked on every request, so removing someone from
  `ADMIN_USERS` cuts them off immediately rather than when their cookie lapses.
- **Unknown addresses** are verified against a decoy hash, so a wrong email and
  a wrong password cost the same time and cannot be told apart.
- **Logins are logged**, success and failure, with the source address. Saves
  are already attributed to a person in git.
- `/api/admin/content` re-checks the session itself rather than trusting the
  `x-admin-email` header the proxy forwards.

### Known limitation

Rate limiting (5 attempts, then a 15-minute lockout) is held **in memory**, so
on serverless it is per-instance: an attacker spreading attempts across cold
starts sees a weaker limit than those numbers suggest. It is a speed bump; TOTP
is the actual boundary. Making it exact needs shared storage such as Vercel KV.
