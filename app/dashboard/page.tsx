'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useDerivTrading,
  type Account,
  type OpenContract,
  type Proposal,
  type Purchase,
  type TradeParams,
} from '../lib/useDerivTrading';

const SYMBOL = 'R_75';

// Values are coerced at the API boundary, but Deriv has twice returned a
// string where its spec promised a number. Formatting defensively means a
// third instance shows a dash instead of taking down the page.
function money(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

export default function Dashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [tick, setTick] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stake, setStake] = useState('1');
  const [duration, setDuration] = useState('5');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirming, setConfirming] = useState<TradeParams | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    connected,
    error: wsError,
    positions,
    getProposal,
    buy,
  } = useDerivTrading(account);

  useEffect(() => {
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
          setAccounts(body.accounts);
          // Default to demo when one exists, so a misclick cannot spend real
          // money before the user has deliberately switched.
          setAccount(
            body.accounts.find((a: Account) => a.account_type === 'demo') ??
              body.accounts[0]
          );
        }
        setLoading(false);
      })
      .catch(() => {
        setAccountError('request_failed');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const ws = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );
    ws.onopen = () => ws.send(JSON.stringify({ ticks: SYMBOL, subscribe: 1 }));
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      const q = Number(data.tick?.quote);
      if (Number.isFinite(q)) setTick(q.toFixed(4));
    };
    return () => ws.close();
  }, []);

  const isReal = account?.account_type === 'real';

  const params = useCallback(
    (contract_type: 'CALL' | 'PUT'): TradeParams => ({
      contract_type,
      amount: Number(stake),
      duration: Number(duration),
      duration_unit: 't',
      underlying_symbol: SYMBOL,
    }),
    [stake, duration]
  );

  // Quote first, then confirm. A real-money account always sees the dialog;
  // demo skips straight to purchase.
  async function startTrade(contract_type: 'CALL' | 'PUT') {
    setTradeError(null);
    setPurchase(null);
    const p = params(contract_type);
    if (!(p.amount > 0) || !(p.duration > 0)) {
      setTradeError('Stake and duration must be greater than zero.');
      return;
    }
    setBusy(true);
    try {
      const quote = await getProposal(p);
      setProposal(quote);
      if (isReal) setConfirming(p);
      else await execute(quote);
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'proposal_failed');
    } finally {
      setBusy(false);
    }
  }

  const execute = useCallback(
    async (quote: Proposal) => {
      setBusy(true);
      setTradeError(null);
      try {
        const done = await buy(quote.id, quote.ask_price);
        setPurchase(done);
        setConfirming(null);
        setProposal(null);
        setAccounts((prev) =>
          prev.map((a) =>
            a.account_id === account?.account_id
              ? { ...a, balance: done.balance_after }
              : a
          )
        );
        setAccount((a) => (a ? { ...a, balance: done.balance_after } : a));
      } catch (e) {
        setTradeError(e instanceof Error ? e.message : 'buy_failed');
      } finally {
        setBusy(false);
      }
    },
    [buy, account]
  );

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="dashboard">
        <p style={{ padding: 40 }}>Loading account…</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="nav">
        <div className="logo">Voltix</div>
        <div className="account">
          {accountError ? (
            <span className="acct-error">
              Balance unavailable: {accountError}
            </span>
          ) : (
            <>
              {accounts.length > 1 && (
                <select
                  className="acct-select"
                  value={account?.account_id ?? ''}
                  onChange={(e) =>
                    setAccount(
                      accounts.find((a) => a.account_id === e.target.value) ??
                        null
                    )
                  }
                >
                  {accounts.map((a) => (
                    <option key={a.account_id} value={a.account_id}>
                      {a.account_type.toUpperCase()} · {a.account_id}
                    </option>
                  ))}
                </select>
              )}
              <span className={`badge ${isReal ? 'badge-real' : 'badge-demo'}`}>
                {isReal ? 'REAL MONEY' : 'DEMO'}
              </span>
              <span>
                {money(account?.balance)} {account?.currency ?? ''}
              </span>
            </>
          )}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {isReal && (
        <div className="real-banner">
          You are trading with real funds. Losses are permanent.
        </div>
      )}

      <section className="trade-panel">
        <h2>Volatility 75 Index</h2>
        <div className="price">{tick ?? '—'}</div>

        <div className="fields">
          <label>
            Stake ({account?.currency ?? '—'})
            <input
              type="number"
              min="0"
              step="0.01"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
            />
          </label>
          <label>
            Duration (ticks)
            <input
              type="number"
              min="1"
              step="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        </div>

        <div className="conn">
          {connected ? (
            <span className="ok">● connected</span>
          ) : (
            <span className="warn">○ {wsError ?? 'connecting…'}</span>
          )}
        </div>

        <div className="actions">
          <button
            className="buy"
            disabled={!connected || busy}
            onClick={() => startTrade('CALL')}
          >
            {busy ? '…' : 'Buy / Rise'}
          </button>
          <button
            className="sell"
            disabled={!connected || busy}
            onClick={() => startTrade('PUT')}
          >
            {busy ? '…' : 'Sell / Fall'}
          </button>
        </div>

        {tradeError && <p className="trade-error">{tradeError}</p>}

        {purchase && (
          <div className="receipt">
            <strong>Contract purchased</strong>
            <p>{purchase.longcode}</p>
            <p>
              Paid {money(purchase.buy_price)} · Payout{' '}
              {money(purchase.payout)} · ID {purchase.contract_id}
            </p>
          </div>
        )}
      </section>

      <Positions positions={positions} connected={connected} />

      {confirming && proposal && (
        <ConfirmDialog
          proposal={proposal}
          params={confirming}
          currency={account?.currency ?? ''}
          busy={busy}
          onCancel={() => {
            setConfirming(null);
            setProposal(null);
          }}
          onConfirm={() => execute(proposal)}
        />
      )}
    </main>
  );
}

function Positions({
  positions,
  connected,
}: {
  positions: OpenContract[];
  connected: boolean;
}) {
  if (!connected && positions.length === 0) return null;

  // Live contracts first, then most recently settled.
  const sorted = [...positions].sort((a, b) => {
    if (a.is_sold !== b.is_sold) return a.is_sold ? 1 : -1;
    return b.contract_id - a.contract_id;
  });

  return (
    <section className="positions">
      <h3>Positions</h3>
      {sorted.length === 0 ? (
        <p className="empty">No open contracts.</p>
      ) : (
        <ul>
          {sorted.map((c) => {
            const up = c.profit >= 0;
            const settled = c.is_sold || c.is_expired;
            return (
              <li key={c.contract_id} className={settled ? 'settled' : ''}>
                <div className="pos-head">
                  <span className="pos-code">{c.longcode}</span>
                  <span className={`pos-status status-${c.status ?? 'open'}`}>
                    {(c.status ?? 'open').toUpperCase()}
                  </span>
                </div>
                <div className="pos-row">
                  <span>
                    Stake {money(c.buy_price)} {c.currency}
                  </span>
                  <span>
                    Payout {money(c.payout)} {c.currency}
                  </span>
                  <span className={up ? 'pnl-up' : 'pnl-down'}>
                    {up ? '+' : ''}
                    {money(c.profit)} {c.currency}
                    {c.profit_percentage != null &&
                      ` (${up ? '+' : ''}${c.profit_percentage.toFixed(1)}%)`}
                  </span>
                </div>
                {!settled && c.current_spot != null && (
                  <div className="pos-spot">
                    Entry {c.entry_spot?.toFixed(4) ?? '—'} · Now{' '}
                    {c.current_spot.toFixed(4)}
                    {c.tick_count ? ` · ${c.tick_count} ticks` : ''}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ConfirmDialog({
  proposal,
  params,
  currency,
  busy,
  onCancel,
  onConfirm,
}: {
  proposal: Proposal;
  params: TradeParams;
  currency: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3>Confirm real-money trade</h3>
        <p className="longcode">{proposal.longcode}</p>
        <dl>
          <div>
            <dt>Direction</dt>
            <dd>{params.contract_type === 'CALL' ? 'Rise' : 'Fall'}</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd className="cost">
              {money(proposal.ask_price)} {currency}
            </dd>
          </div>
          <div>
            <dt>Payout if correct</dt>
            <dd>
              {money(proposal.payout)} {currency}
            </dd>
          </div>
          <div>
            <dt>Loss if wrong</dt>
            <dd className="cost">
              {money(proposal.ask_price)} {currency}
            </dd>
          </div>
        </dl>
        <div className="dialog-actions">
          <button onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            ref={ref}
            className="sell"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Placing…' : 'Place real trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
