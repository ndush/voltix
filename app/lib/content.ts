import data from '@/content/site.json';

/**
 * Marketing content types, and the copy that ships with the build.
 *
 * Live content is stored in Vercel Blob and read per request; see
 * `contentStore.ts`. This file holds only the shape and the fallback.
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
/** Deriv contract types, listed so visitors recognise what is on offer there. */
export type TradeType = { name: string; body: string };

export type SiteContent = {
  brand: string;
  markets: Market[];
  features: Feature[];
  tradeTypes?: TradeType[];
  defaultCampaign: Campaign;
  campaigns: Record<string, Campaign>;
};

/**
 * The copy committed to the repository. Used as the fallback when nothing has
 * been saved yet, or when Blob cannot be reached — never as the live source,
 * which would make edits invisible until the next deploy.
 */
export const BUNDLED = data as SiteContent;

/** Picks the campaign for a ?c= value, falling back to the default. */
export function pickCampaign(
  content: SiteContent,
  key: string | null | undefined
): Campaign {
  if (!key) return content.defaultCampaign;
  return content.campaigns[key] ?? content.defaultCampaign;
}
