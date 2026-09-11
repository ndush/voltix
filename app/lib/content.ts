import data from '@/content/site.json';

/**
 * Marketing content.
 *
 * The values live in `content/site.json`, not here, so the admin page at
 * /admin can rewrite them through a form without generating TypeScript. This
 * file only supplies the types and the lookup helper.
 *
 * The risk warning and the legal pages are deliberately NOT editable content.
 * They are required disclosures.
 */
export type Campaign = {
  name: string;
  headline: string;
  subhead: string;
  cta: string;
  banner?: string;
  utmCampaign: string;
  utmSource: string;
  /** Optional per-campaign affiliate token, for running several partners. */
  affiliateToken?: string;
};

export type Market = { symbol: string; name: string };
export type Feature = { title: string; body: string };

export type SiteContent = {
  brand: string;
  markets: Market[];
  features: Feature[];
  defaultCampaign: Campaign;
  campaigns: Record<string, Campaign>;
};

export const CONTENT = data as SiteContent;

export const BRAND = CONTENT.brand;
export const MARKETS = CONTENT.markets;
export const FEATURES = CONTENT.features;
export const DEFAULT_CAMPAIGN = CONTENT.defaultCampaign;
export const CAMPAIGNS = CONTENT.campaigns;

/** Picks the campaign for a ?c= value, falling back to the default. */
export function getCampaign(key: string | null | undefined): Campaign {
  if (!key) return DEFAULT_CAMPAIGN;
  return CAMPAIGNS[key] ?? DEFAULT_CAMPAIGN;
}
