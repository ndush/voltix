'use client';

import { useEffect, useRef, useState } from 'react';
import { MARKETS } from '../lib/content';

type Quote = { price: number; dir: 'up' | 'down' | null };

/**
 * Live prices for the landing page. Kept as its own client component so the
 * marketing copy around it stays server-rendered and indexable.
 */
export function MarketTicker() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const last = useRef<Record<string, number>>({});

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

  return (
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
  );
}
