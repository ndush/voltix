'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  balance?: number;
  currency?: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [tick, setTick] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch account info
    fetch('/api/auth/me')
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) {
          setAccountError(
            body.status ? `${body.error} (${body.status})` : body.error
          );
        } else if (!body.accounts?.length) {
          setAccountError('no_accounts_returned');
        } else {
          setAccount(body.accounts[0]);
        }
        setLoading(false);
      })
      .catch(() => {
        setAccountError('request_failed');
        setLoading(false);
      });

    // Connect to Deriv public WebSocket for live ticks
    const ws = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({ ticks: 'R_75', subscribe: 1 }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.tick?.quote) {
        setTick(data.tick.quote.toFixed(4));
      }
    };

    return () => ws.close();
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="dashboard">
        <p>Loading account…</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="nav">
        <div className="logo">Voltix</div>
        <div className="account">
          <span>
            {accountError ? (
              <span className="acct-error">Balance unavailable: {accountError}</span>
            ) : (
              <>
                Balance: {account?.balance ?? '—'} {account?.currency ?? ''}
              </>
            )}
          </span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <section className="trade-panel">
        <h2>Volatility 75 Index</h2>
        <div className="price">{tick ?? '—'}</div>
        <div className="actions">
          <button className="buy">Buy / Rise</button>
          <button className="sell">Sell / Fall</button>
        </div>
      </section>
    </main>
  );
}
