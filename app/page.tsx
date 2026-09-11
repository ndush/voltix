'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RiskWarning, SiteFooter } from './components/SiteFooter';
import { BRAND, FEATURES, MARKETS, getCampaign } from './lib/content';

type Quote = { price: number; dir: 'up' | 'down' | null };

function Landing() {
  const searchParams = useSearchParams();
  const campaignKey = searchParams.get('c');
  const campaign = getCampaign(campaignKey);

  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const last = useRef<Record<string, number>>({});

  // The public feed needs no credentials, so the landing page can show real
  // prices before anyone logs in.
  useEffect(() => {
    const ws = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );
    ws.onopen = () => {
      for (const m of MARKETS) {
        ws.send(JSON.stringify({ ticks: m.symbol, subscribe: 1 }));
      }
    };
    ws.onmessage = (msg) => {
      let data: { tick?: { symbol?: string; quote?: number } };
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      const sym = data.tick?.symbol;
      const q = Number(data.tick?.quote);
      if (!sym || !Number.isFinite(q)) return;
      const prev = last.current[sym];
      last.current[sym] = q;
      setQuotes((old) => ({
        ...old,
        [sym]: {
          price: q,
          dir: prev == null ? null : q >= prev ? 'up' : 'down',
        },
      }));
    };
    return () => ws.close();
  }, []);

  async function handleLogin() {
    setLoading(true);
    try {
      // Carry the campaign through so its UTM values reach Deriv.
      const qs = campaignKey ? `?c=${encodeURIComponent(campaignKey)}` : '';
      const res = await fetch(`/api/auth/url${qs}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <main className="landing">
      {campaign.banner ? (
        <div className="promo-banner">{campaign.banner}</div>
      ) : null}

      <header className="nav">
        <div className="logo">{BRAND}</div>
        <nav>
          <a href="#markets">Markets</a>
          <button
            className="btn-primary"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Redirecting…' : 'Login with Deriv'}
          </button>
        </nav>
      </header>

      <section className="hero">
        <h1>{campaign.headline}</h1>
        <p>{campaign.subhead}</p>
        <button className="btn-primary big" onClick={handleLogin}>
          {campaign.cta}
        </button>
        <p className="fineprint">
          New accounts are linked to our partner program during signup.
        </p>
      </section>

      <section id="markets" className="markets">
        {MARKETS.map((m) => {
          const q = quotes[m.symbol];
          return (
            <div key={m.symbol} className="card">
              <div className="card-name">{m.name}</div>
              <div
                className={`card-price ${
                  q?.dir === 'up' ? 'up' : q?.dir === 'down' ? 'down' : ''
                }`}
              >
                {q ? q.price.toFixed(4) : '—'}
              </div>
              <div className="card-sym">{m.symbol}</div>
            </div>
          );
        })}
      </section>

      <section className="features">
        {FEATURES.map((f) => (
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

export default function Home() {
  // useSearchParams needs a Suspense boundary so the shell can prerender.
  return (
    <Suspense fallback={<main className="landing" />}>
      <Landing />
    </Suspense>
  );
}
