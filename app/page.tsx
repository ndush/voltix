import { RiskWarning, SiteFooter } from './components/SiteFooter';
import { MarketTicker } from './components/MarketTicker';
import { LoginButton } from './components/LoginButton';
import { pickCampaign } from './lib/content';
import { readContent } from './lib/contentStore';

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

  return (
    <main className="landing">
      {campaign.banner ? (
        <div className="promo-banner">{campaign.banner}</div>
      ) : null}

      <header className="nav">
        <div className="logo">{content.brand}</div>
        <nav>
          <a href="#markets">Markets</a>
          <LoginButton campaignKey={campaignKey} label="Login with Deriv" />
        </nav>
      </header>

      <section className="hero">
        <h1>{campaign.headline}</h1>
        <p>{campaign.subhead}</p>
        <LoginButton
          campaignKey={campaignKey}
          label={campaign.cta}
          className="btn-primary big"
        />
        <p className="fineprint">
          New accounts are linked to our partner program during signup.
        </p>
      </section>

      <MarketTicker markets={content.markets} />

      <section className="features">
        {content.features.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="risk-section">
        <RiskWarning />
      </section>

      <SiteFooter />
    </main>
  );
}
