# Editing the site

You do not need a developer for any of this, and you cannot break the trading
engine from here. Everything below lives in one file:

**`app/lib/content.ts`**

## How to edit it

1. Open the repository on GitHub.
2. Click into `app` → `lib` → `content.ts`.
3. Click the pencil icon (top right).
4. Make your change.
5. Scroll down, click **Commit changes**.

The site rebuilds itself and your change is live in about a minute.

Two rules: keep the `'` quotes and the `,` commas exactly where they are, and
do not touch the risk warning or the legal pages — those are required
disclosures, not marketing copy.

## Changing the headline

Find `DEFAULT_CAMPAIGN` and edit the text between the quotes:

```ts
export const DEFAULT_CAMPAIGN: Campaign = {
  headline: 'Trade Volatility Indices',      // the big text
  subhead:  'Powered by Deriv...',           // the line under it
  cta:      'Start Trading →',               // the button
  banner:   '',                              // a strip across the top
};
```

Put something in `banner` and a coloured strip appears above the header. Set it
back to `''` to remove it.

## Changing which markets are shown

```ts
export const MARKETS = [
  { symbol: 'R_75',  name: 'Volatility 75' },
  { symbol: 'R_100', name: 'Volatility 100' },
];
```

`symbol` must be a real Deriv symbol (`R_10`, `R_25`, `R_50`, `R_75`, `R_100`).
`name` is whatever you want people to read. Prices are live and appear on their
own.

## Running a new marketing angle

Each entry in `CAMPAIGNS` is a different version of the landing page, reachable
at its own link. Copy an existing block and change it:

```ts
export const CAMPAIGNS = {
  payday: {                                  // ← the link is /?c=payday
    name: 'Payday campaign',
    headline: 'Put your payday to work',
    subhead: 'Open a Deriv account in two minutes.',
    cta: 'Get started →',
    banner: 'New this month',
    utmCampaign: 'payday_2026',              // ← how it appears in Deriv
    utmSource: 'voltix',
  },
};
```

Share `https://your-site/?c=payday`. Anyone who signs up through it is tagged
`payday_2026` in your Deriv partner dashboard, so you can see which angle
actually brought people in. Add as many as you like and run them side by side.

The three that ship with the site — `weekend`, `beginner`, `volatility` — are
examples. Edit or delete them.

## Using your own Deriv referral link

Set `DERIV_AFFILIATE_TOKEN` in **Vercel → Settings → Environment Variables**,
then redeploy.

It accepts either your bare token or a Deriv URL that already contains it. It
does **not** accept a `partner-tracking.deriv.com/click?...` link, because that
link has no token in it until it redirects.

To get the token from a tracking link: open the link in a browser, then look at
the address bar of the page you land on. Copy the value after `t=`.

A campaign can also use its own token, which is how you run traffic for
different partners from one site:

```ts
  clientA: {
    name: 'Client A',
    headline: '...',
    affiliateToken: 'their-token-here',
    // ...
  },
```

## What you cannot change here

- The risk warning, Terms, and Privacy pages. These are legal disclosures.
- Anything about how trades are placed or priced.
- Your Deriv credentials, which never appear in this repository.
