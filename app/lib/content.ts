/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MARKETING CONTENT — safe to edit
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Everything the site says about itself lives here. Edit this file on
 *  GitHub and the site redeploys on its own; no other files need touching.
 *
 *  See CONTENT.md for a walkthrough.
 *
 *  Two rules:
 *   1. Keep the quotes and commas exactly as they are.
 *   2. The risk warning and the legal pages are NOT here. They are required
 *      disclosures and must not be edited for marketing.
 */

export type Campaign = {
  /** Internal label, shown only in your own notes. */
  name: string;
  /** Big headline on the landing page. */
  headline: string;
  /** Sentence under the headline. */
  subhead: string;
  /** Text on the main button. */
  cta: string;
  /** Optional strip across the top. Empty string hides it. */
  banner?: string;
  /** Reported to Deriv so you can tell campaigns apart in your dashboard. */
  utmCampaign: string;
  utmSource: string;
  /**
   * Optional: use a different affiliate token for this campaign only.
   * Leave undefined to use DERIV_AFFILIATE_TOKEN.
   */
  affiliateToken?: string;
};

export const BRAND = 'Voltix';

/** Markets shown on the landing page. Deriv symbols. */
export const MARKETS = [
  { symbol: 'R_75', name: 'Volatility 75' },
  { symbol: 'R_100', name: 'Volatility 100' },
  { symbol: 'R_50', name: 'Volatility 50' },
  { symbol: 'R_25', name: 'Volatility 25' },
];

/** Three selling points under the hero. */
export const FEATURES = [
  {
    title: 'Zero custody',
    body: 'Your funds stay with Deriv. We never hold, move, or touch your money.',
  },
  {
    title: 'Live pricing',
    body: 'Streaming prices straight from Deriv, with no delay added in between.',
  },
  {
    title: 'Trade in seconds',
    body: 'Pick a direction, set a stake, and place a contract in two clicks.',
  },
];

/**
 * The default campaign — what visitors see with no ?c= in the URL.
 */
export const DEFAULT_CAMPAIGN: Campaign = {
  name: 'Default',
  headline: 'Trade Volatility Indices',
  subhead: 'Powered by Deriv. Built for speed. Zero custody of your funds.',
  cta: 'Start Trading →',
  banner: '',
  utmCampaign: 'reshare_site',
  utmSource: 'voltix',
};

/**
 * Add a campaign by copying a block below and changing the values.
 * Reach it at  https://your-site/?c=THE_KEY
 *
 * Example:  https://your-site/?c=weekend  →  the "weekend" entry.
 */
export const CAMPAIGNS: Record<string, Campaign> = {
  weekend: {
    name: 'Weekend push',
    headline: 'Markets never sleep',
    subhead:
      'Synthetic indices trade 24/7, weekends included. Open a Deriv account and trade whenever you want.',
    cta: 'Trade this weekend →',
    banner: 'Synthetic indices trade 24/7 — including right now.',
    utmCampaign: 'weekend_push',
    utmSource: 'voltix',
  },

  beginner: {
    name: 'Beginner audience',
    headline: 'Start with a free demo account',
    subhead:
      'Practise with 10,000 in virtual funds before risking anything real. No deposit needed to begin.',
    cta: 'Try the demo →',
    banner: '',
    utmCampaign: 'beginner_demo',
    utmSource: 'voltix',
  },

  volatility: {
    name: 'Volatility focus',
    headline: 'Trade the Volatility 75',
    subhead:
      "One of Deriv's most active synthetic indices, priced every second, available around the clock.",
    cta: 'Trade V75 →',
    banner: '',
    utmCampaign: 'v75_focus',
    utmSource: 'voltix',
  },
};

/** Picks the campaign for a ?c= value, falling back to the default. */
export function getCampaign(key: string | null | undefined): Campaign {
  if (!key) return DEFAULT_CAMPAIGN;
  return CAMPAIGNS[key] ?? DEFAULT_CAMPAIGN;
}
