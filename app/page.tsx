'use client';

import { useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);

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
        {['Volatility 75', 'Volatility 100', 'Boom & Crash', 'Step Index'].map(
          (m) => (
            <div key={m} className="card">
              {m}
            </div>
          )
        )}
      </section>
    </main>
  );
}
