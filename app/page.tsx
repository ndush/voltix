import { SiteFooter } from './components/SiteFooter';
import { MarketTicker } from './components/MarketTicker';
import { LoginButton } from './components/LoginButton';
import { pickCampaign } from './lib/content';
import { readContent } from './lib/contentStore';
import {
  affiliateTokenOrThrow,
  resolveAffiliateToken,
  signupUrl,
} from './lib/affiliate';

// Server component: campaign copy is rendered on the server so it appears in
// the HTML for search engines, social previews and visitors without
// JavaScript. Only the live prices and the login action are client-side.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).c;
  const key = Array.isArray(raw) ? raw[0] : raw;

  // Read on every request: an edit in /admin should be visible immediately,
  // which is the reason content lives in Blob rather than in the build.
  const { content } = await readContent();
  const campaignKey = key && key in content.campaigns ? key : undefined;
  const campaign = pickCampaign(content, campaignKey);

  // Worked out here so the button is a real link the browser can follow
  // instantly, rather than something that has to ask the server first.
  const token =
    resolveAffiliateToken(campaign.affiliateToken) ?? affiliateTokenOrThrow();
  const href = signupUrl(
    token,
    campaignKey
      ? campaign.utmCampaign
      : process.env.DERIV_AFFILIATE_CAMPAIGN || campaign.utmCampaign,
    campaign.utmSource
  );

  return (
    <main className="landing">
      {campaign.banner ? (
        <div className="promo-banner">{campaign.banner}</div>
      ) : null}

      <header className="nav">
        <div className="logo">{content.brand}</div>
        <nav>
          <a href="#markets">Markets</a>
          {/* Not "Login": nobody has an account yet, and implying one is
              needed turns away the newcomers this page exists to reach. */}
          <LoginButton href={href} label="Get started" />
        </nav>
      </header>

      <section className="hero">
        <h1>{campaign.headline}</h1>
        <p>{campaign.subhead}</p>
        <LoginButton
          href={href}
          label={campaign.cta}
          className="btn-primary big"
        />
        <p className="fineprint">
          New accounts are linked to our partner program during signup.
        </p>
      </section>

      <MarketTicker markets={content.markets} href={href} />

      {content.tradeTypes?.length ? (
        <section className="tradetypes">
          <h2>What you can trade on Deriv</h2>
          <p className="tt-lead">
            All of these run on the same round-the-clock synthetic indices.
          </p>
          <div className="tt-grid">
            {/* Each card is a link. On a page whose whole job is one tap,
                five panels that do nothing are five wasted chances. */}
            {content.tradeTypes.map((t) => (
              <a key={t.name} className="tt" href={href} rel="nofollow sponsored">
                <h3>{t.name}</h3>
                <p>{t.body}</p>
                <span className="tt-go">Trade this on Deriv →</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="features">
        {content.features.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
