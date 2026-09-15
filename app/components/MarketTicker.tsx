'use client';

import { useEffect, useRef, useState } from 'react';
import type { Market } from '../lib/content';

type Quote = { price: number; dir: 'up' | 'down' | null };

/**
 * Live prices for the landing page. Kept as its own client component so the
 * marketing copy around it stays server-rendered and indexable.
 */
export function MarketTicker({ markets }: { markets: Market[] }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const last = useRef<Record<string, number>>({});

  useEffect(() => {
    const ws = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );
    ws.onopen = () => {
      for (const m of markets) {
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
  }, [markets]);

  const tile = (m: Market) => {
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
  };

  // The 1s indices tick every second rather than every two. They are a
  // distinct product to this audience, so they get their own heading rather
  // than being mixed into one long undifferentiated grid.
  const oneSecond = markets.filter((m) => m.symbol.startsWith('1HZ'));
  const standard = markets.filter((m) => !m.symbol.startsWith('1HZ'));

  return (
    <section id="markets" className="markets-wrap">
      {standard.length > 0 && (
        <>
          {oneSecond.length > 0 && <h2 className="mk-head">Volatility indices</h2>}
          <div className="markets">{standard.map(tile)}</div>
        </>
      )}

      {oneSecond.length > 0 && (
        <>
          <h2 className="mk-head">
            One-second indices
            <span className="mk-sub">a new price every second</span>
          </h2>
          <div className="markets">{oneSecond.map(tile)}</div>
        </>
      )}
    </section>
  );
}
