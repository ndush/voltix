'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RiskWarning } from '../components/SiteFooter';
import {
  useDerivTrading,
  type Account,
  type DurationUnit,
  type HistoryRow,
  type OpenContract,
  type Proposal,
  type Purchase,
  type TradeParams,
} from '../lib/useDerivTrading';

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 't', label: 'ticks' },
  { value: 's', label: 'seconds' },
  { value: 'm', label: 'minutes' },
  { value: 'h', label: 'hours' },
  { value: 'd', label: 'days' },
];

// Selling quotes a floor rather than accepting any price, so a large adverse
// move rejects the sale instead of filling far below what was displayed.
const SELL_SLIPPAGE = 0.95;

const unitLabel = (u: DurationUnit) =>
  DURATION_UNITS.find((d) => d.value === u)?.label ?? u;

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
  // Direction as well as value: on a fast index the number alone is hard to
  // read, and which way it just moved is the thing a trader is watching for.
  const [tick, setTick] = useState<{ v: string; dir: 'up' | 'down' | null }>({
    v: '',
    dir: null,
  });
  const lastTick = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [stake, setStake] = useState('1');
  const [duration, setDuration] = useState('5');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('t');
  const [sellingId, setSellingId] = useState<number | null>(null);
  // Only set once the session has actually ended. There is deliberately no
  // "about to expire" warning: Deriv issues no refresh token for this app, so
  // such a warning would fire on every session and offer nothing actionable.
  const [sessionEnded, setSessionEnded] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirming, setConfirming] = useState<TradeParams | null>(null);
  // Tagged with the account it happened on. A receipt from a demo trade must
  // never linger after switching to a real account, where it reads as though
  // real money was just spent.
  const [purchase, setPurchase] = useState<
    (Purchase & { accountId: string }) | null
  >(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    connected,
    error: wsError,
    positions,
    history,
    getProposal,
    buy,
    limits,
    sell,
    refreshHistory,
  } = useDerivTrading(account, SYMBOL);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) {
          if (body.error === 'not_authenticated' || body.status === 401) {
            setSessionEnded(true);
          }
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

  // Renew silently, and only when Deriv actually issued a refresh token.
  // If it did not, there is nothing to attempt and nothing worth saying until
  // a request genuinely fails.
  useEffect(() => {
    const cookie = (name: string) =>
      document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${name}=`))
        ?.split('=')[1];

    if (cookie('deriv_can_refresh') !== '1') return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const at = Number(cookie('deriv_expires_at'));
      if (!Number.isFinite(at)) return;
      const delay = Math.max(5000, at - Date.now() - 60000);
      timer = setTimeout(async () => {
        try {
          const res = await fetch('/api/auth/refresh', { method: 'POST' });
          if (res.ok) schedule();
          else setSessionEnded(true);
        } catch {
          // A network blip is not an ended session; try again shortly.
          timer = setTimeout(schedule, 15000);
        }
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );
    ws.onopen = () => ws.send(JSON.stringify({ ticks: SYMBOL, subscribe: 1 }));
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      const q = Number(data.tick?.quote);
      if (!Number.isFinite(q)) return;
      const prev = lastTick.current;
      lastTick.current = q;
      setTick({
        v: q.toFixed(4),
        dir: prev == null ? null : q > prev ? 'up' : q < prev ? 'down' : null,
      });
    };
    return () => ws.close();
  }, []);

  // The socket URL endpoint rejects an expired token too; treat that as the
  // same condition rather than tracking it separately.
  const expired = sessionEnded || wsError === 'not_authenticated';

  // Fail safe, not open: anything that is not explicitly a demo account is
  // treated as real. If Deriv ever returns an unexpected account_type, the
  // user gets the confirmation dialog rather than silently spending real money.
  const isReal = account ? account.account_type !== 'demo' : false;
  // Derived rather than synced through an effect: if Deriv does not offer the
  // selected unit, fall back to one it does without an extra render pass.
  const effectiveUnit: DurationUnit =
    limits && !limits.durations[durationUnit]
      ? (DURATION_UNITS.find((u) => limits.durations[u.value])?.value ??
        durationUnit)
      : durationUnit;
  const range = limits?.durations[effectiveUnit] ?? null;

  const params = useCallback(
    (contract_type: 'CALL' | 'PUT'): TradeParams => ({
      contract_type,
      amount: Number(stake),
      duration: Number(duration),
      duration_unit: effectiveUnit,
      underlying_symbol: SYMBOL,
    }),
    [stake, duration, effectiveUnit]
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
    if (range && (p.duration < range.min || p.duration > range.max)) {
      setTradeError(
        `Duration must be between ${range.min} and ${range.max} ${unitLabel(
          durationUnit
        )}.`
      );
      return;
    }
    if (limits?.minStake != null && p.amount < limits.minStake) {
      setTradeError(`Minimum stake is ${limits.minStake}.`);
      return;
    }
    if (limits?.maxStake != null && p.amount > limits.maxStake) {
      setTradeError(`Maximum stake is ${limits.maxStake}.`);
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
        setPurchase({ ...done, accountId: account?.account_id ?? '' });
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

  async function sellPosition(c: OpenContract) {
    setTradeError(null);
    setSellingId(c.contract_id);
    try {
      const result = await sell(
        c.contract_id,
        Math.max(0, c.bid_price * SELL_SLIPPAGE)
      );
      setAccount((a) => (a ? { ...a, balance: result.balance_after } : a));
      setAccounts((prev) =>
        prev.map((a) =>
          a.account_id === account?.account_id
            ? { ...a, balance: result.balance_after }
            : a
        )
      );
      await refreshHistory().catch(() => {});
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'sell_failed');
    } finally {
      setSellingId(null);
    }
  }

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
                  onChange={(e) => {
                    setAccount(
                      accounts.find((a) => a.account_id === e.target.value) ??
                        null
                    );
                    setTradeError(null);
                    setProposal(null);
                    setConfirming(null);
                  }}
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
              <span className="bal">
                <span className="bal-num">{money(account?.balance)}</span>
                <span className="bal-cur">{account?.currency ?? ''}</span>
              </span>
            </>
          )}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {expired && (
        <div className="expiry-banner">
          Your Deriv session has ended. Sign in again to keep trading — any open
          contracts are unaffected.{' '}
          <button onClick={() => router.replace('/')}>Sign in again</button>
        </div>
      )}

      {isReal && (
        <div className="real-banner">
          You are trading with real funds. Losses are permanent.
        </div>
      )}

      <section className="trade-panel">
        <div className="sym">
          <h2>Volatility 75</h2>
          <span className="sym-code">{SYMBOL}</span>
        </div>
        <div className={`price ${tick.dir ?? ''}`}>
          <span className="price-val">{tick.v || '—'}</span>
          {tick.dir && (
            <span className="price-arrow" aria-hidden="true">
              {tick.dir === 'up' ? '▲' : '▼'}
            </span>
          )}
        </div>
        <p className="price-note">
          {tick.v ? 'Live price, updating every second' : 'Connecting to the price feed…'}
        </p>

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
            Duration
            <input
              type="number"
              min={range?.min ?? 1}
              max={range?.max}
              step="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
          <label>
            Unit
            <select
              value={effectiveUnit}
              onChange={(e) => {
                const next = e.target.value as DurationUnit;
                setDurationUnit(next);
                // Snap the duration into the new unit's range so the form is
                // never showing a value Deriv would reject.
                const r = limits?.durations[next];
                if (r) {
                  const n = Number(duration);
                  if (!Number.isFinite(n) || n < r.min)
                    setDuration(String(r.min));
                  else if (n > r.max) setDuration(String(r.max));
                }
              }}
            >
              {DURATION_UNITS.filter(
                (u) => !limits || limits.durations[u.value]
              ).map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {range && (
          <p className="range-hint">
            {range.min}–{range.max} {unitLabel(effectiveUnit)}
            {limits?.minStake != null &&
              ` · stake ${limits.minStake}–${limits.maxStake ?? '∞'}`}
          </p>
        )}

        <div className="conn">
          <span className={`pill ${connected ? 'live' : 'off'}`}>
            <span className="pill-dot" aria-hidden="true" />
            {connected ? 'Live' : (wsError ?? 'Connecting…')}
          </span>
        </div>

        <div className="actions">
          <button
            className="dir up"
            disabled={!connected || busy}
            onClick={() => startTrade('CALL')}
          >
            <span className="dir-arrow" aria-hidden="true">▲</span>
            <span className="dir-label">{busy ? 'Working…' : 'Rise'}</span>
            <span className="dir-sub">Price goes up</span>
          </button>
          <button
            className="dir down"
            disabled={!connected || busy}
            onClick={() => startTrade('PUT')}
          >
            <span className="dir-arrow" aria-hidden="true">▼</span>
            <span className="dir-label">{busy ? 'Working…' : 'Fall'}</span>
            <span className="dir-sub">Price goes down</span>
          </button>
        </div>

        {tradeError && <p className="trade-error">{tradeError}</p>}

        {purchase && purchase.accountId === account?.account_id && (
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

      <Positions
        positions={positions}
        connected={connected}
        onSell={sellPosition}
        sellingId={sellingId}
        isReal={isReal}
      />

      <TradeHistory rows={history} />

      <section className="dash-risk">
        <RiskWarning compact />
      </section>

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
  onSell,
  sellingId,
  isReal,
}: {
  positions: OpenContract[];
  connected: boolean;
  onSell: (c: OpenContract) => void;
  sellingId: number | null;
  isReal: boolean;
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
                {!settled && !c.is_valid_to_sell && (
                  <p className="no-sell">
                    Not available to sell yet — very short contracts often
                    cannot be closed early.
                  </p>
                )}
                {!settled && c.is_valid_to_sell && (
                  <button
                    className="sell-btn"
                    disabled={sellingId === c.contract_id}
                    onClick={() => {
                      if (
                        isReal &&
                        !window.confirm(
                          `Sell this contract for about ${money(
                            c.bid_price
                          )} ${c.currency}?\n\nYou staked ${money(
                            c.buy_price
                          )} ${c.currency}. This closes the position now and is final.`
                        )
                      )
                        return;
                      onSell(c);
                    }}
                  >
                    {sellingId === c.contract_id
                      ? 'Selling…'
                      : `Sell now for ~${money(c.bid_price)} ${c.currency}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TradeHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="positions history">
      <h3>History</h3>
      <ul>
        {rows.map((r) => {
          const up = r.profit >= 0;
          return (
            <li key={r.transaction_id}>
              <div className="pos-head">
                <span className="pos-code">{r.longcode}</span>
                <span className={`pos-status ${up ? 'status-won' : 'status-lost'}`}>
                  {up ? 'WON' : 'LOST'}
                </span>
              </div>
              <div className="pos-row">
                <span>Stake {money(r.buy_price)}</span>
                <span>Returned {money(r.sell_price)}</span>
                <span className={up ? 'pnl-up' : 'pnl-down'}>
                  {up ? '+' : ''}
                  {money(r.profit)}
                </span>
              </div>
              <div className="pos-spot">
                {new Date(
                  (r.sell_time ?? r.purchase_time) * 1000
                ).toLocaleString()}
              </div>
            </li>
          );
        })}
      </ul>
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
