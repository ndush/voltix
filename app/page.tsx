'use client';

import { useEffect, useRef, useState } from 'react';
import { RiskWarning, SiteFooter } from './components/SiteFooter';

const MARKETS = [
  { symbol: 'R_75', name: 'Volatility 75' },
  { symbol: 'R_100', name: 'Volatility 100' },
  { symbol: 'R_50', name: 'Volatility 50' },
  { symbol: 'R_25', name: 'Volatility 25' },
];

type Quote = { price: number; dir: 'up' | 'down' | null };

export default function Home() {
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
        [sym]: { price: q, dir: prev == null ? null : q >= prev ? 'up' : 'down' },
      }));
    };
    return () => ws.close();
  }, []);

  async function handleLogin() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <main className="landing">
      <header className="nav">
        <div className="logo">Voltix</div>
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
        <h1>Trade Volatility Indices</h1>
        <p>Powered by Deriv. Built for speed. Zero custody of your funds.</p>
        <button className="btn-primary big" onClick={handleLogin}>
          Start Trading →
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

      <section className="risk-section">
        <RiskWarning />
      </section>

      <SiteFooter />
    </main>
  );
}
