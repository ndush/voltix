'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Account = {
  account_id: string;
  balance: number;
  currency: string;
  account_type: 'demo' | 'real';
  status?: 'active' | 'inactive';
  group?: string;
};

export type Proposal = {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  longcode: string;
};

export type Purchase = {
  contract_id: number;
  buy_price: number;
  payout: number;
  balance_after: number;
  longcode: string;
  transaction_id: number;
};

export type SellResult = {
  contract_id: number;
  sold_for: number;
  balance_after: number;
  transaction_id: number;
};

export type TradeParams = {
  contract_type: 'CALL' | 'PUT';
  amount: number;
  duration: number;
  duration_unit: DurationUnit;
  underlying_symbol: string;
};

export type DurationUnit = 't' | 's' | 'm' | 'h' | 'd';

/**
 * A live contract.
 *
 * Deriv sends the monetary fields as strings, so they are coerced once here
 * rather than at every render site.
 */
export type OpenContract = {
  contract_id: number;
  contract_type: string;
  underlying_symbol: string;
  longcode: string;
  currency: string;
  buy_price: number;
  bid_price: number;
  payout: number;
  profit: number;
  profit_percentage: number;
  entry_spot: number | null;
  current_spot: number | null;
  status: 'open' | 'sold' | 'won' | 'lost' | 'cancelled' | null;
  is_sold: boolean;
  is_expired: boolean;
  is_valid_to_sell: boolean;
  date_expiry: number;
  tick_count: number | null;
};

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

// Deriv's OpenAPI spec declares several monetary fields as numbers but returns
// them as strings. Every value that reaches arithmetic or .toFixed() is coerced
// at the boundary rather than trusted.
function toProposal(p: Record<string, unknown>): Proposal {
  return {
    id: p.id as string,
    ask_price: num(p.ask_price),
    payout: num(p.payout),
    spot: num(p.spot),
    longcode: (p.longcode as string) ?? '',
  };
}

function toPurchase(b: Record<string, unknown>): Purchase {
  return {
    contract_id: num(b.contract_id),
    buy_price: num(b.buy_price),
    payout: num(b.payout),
    balance_after: num(b.balance_after),
    longcode: (b.longcode as string) ?? '',
    transaction_id: num(b.transaction_id),
  };
}

function toOpenContract(c: Record<string, unknown>): OpenContract {
  return {
    contract_id: c.contract_id as number,
    contract_type: (c.contract_type as string) ?? '',
    underlying_symbol: (c.underlying_symbol as string) ?? '',
    longcode: (c.longcode as string) ?? '',
    currency: (c.currency as string) ?? '',
    buy_price: num(c.buy_price),
    bid_price: num(c.bid_price),
    payout: num(c.payout),
    profit: num(c.profit),
    profit_percentage: num(c.profit_percentage),
    entry_spot: numOrNull(c.entry_spot),
    current_spot: numOrNull(c.current_spot),
    status: (c.status as OpenContract['status']) ?? null,
    is_sold: c.is_sold === 1,
    is_expired: c.is_expired === 1,
    is_valid_to_sell: c.is_valid_to_sell === 1,
    date_expiry: (c.date_expiry as number) ?? 0,
    tick_count: (c.tick_count as number) ?? null,
  };
}

export type HistoryRow = {
  contract_id: number | null;
  transaction_id: number;
  contract_type: string;
  underlying_symbol: string;
  longcode: string;
  buy_price: number;
  sell_price: number;
  payout: number;
  profit: number;
  purchase_time: number;
  sell_time: number | null;
};

function toHistoryRow(t: Record<string, unknown>): HistoryRow {
  const buy = num(t.buy_price);
  const sell = num(t.sell_price);
  return {
    contract_id: (t.contract_id as number) ?? null,
    transaction_id: num(t.transaction_id),
    contract_type: (t.contract_type as string) ?? '',
    underlying_symbol: (t.underlying_symbol as string) ?? '',
    longcode: (t.longcode as string) ?? '',
    buy_price: buy,
    sell_price: sell,
    payout: num(t.payout),
    // profit_table has no profit field; it is the realised difference.
    profit: sell - buy,
    purchase_time: num(t.purchase_time),
    sell_time: t.sell_time == null ? null : num(t.sell_time),
  };
}

export type UnitRange = { min: number; max: number };

export type ContractLimits = {
  /** Allowed duration range per unit; a missing unit is not offered. */
  durations: Partial<Record<DurationUnit, UnitRange>>;
  minStake: number | null;
  maxStake: number | null;
};

const UNIT_SECONDS: Record<Exclude<DurationUnit, 't'>, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** Deriv expresses durations as "15s", "10t", "1d". */
function parseDuration(v: unknown): { n: number; u: DurationUnit } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d+)([tsmhd])$/.exec(v.trim());
  if (!m) return null;
  return { n: parseInt(m[1], 10), u: m[2] as DurationUnit };
}

/**
 * Turns `contracts_for` entries into per-unit duration bounds.
 *
 * Deriv splits offerings by `expiry_type`, and merging them produces nonsense:
 * intraday contracts top out around a day while daily ones run to a year, so a
 * naive merge advertised "15-31536000 seconds". Intraday entries therefore
 * govern seconds/minutes/hours, daily entries govern days, and ticks are kept
 * separate because they are not time at all.
 */
function toLimits(
  available: Record<string, unknown>[],
  contractTypes: string[]
): ContractLimits {
  let tickMin = Infinity;
  let tickMax = 0;
  let intraMinSec = Infinity;
  let intraMaxSec = 0;
  let dayMin = Infinity;
  let dayMax = 0;
  let minStake: number | null = null;
  let maxStake: number | null = null;

  for (const a of available) {
    if (!contractTypes.includes(a.contract_type as string)) continue;

    const lo = parseDuration(a.min_contract_duration);
    const hi = parseDuration(a.max_contract_duration);

    if (lo && hi) {
      if (lo.u === 't' && hi.u === 't') {
        tickMin = Math.min(tickMin, lo.n);
        tickMax = Math.max(tickMax, hi.n);
      } else if (lo.u !== 't' && hi.u !== 't') {
        const loSec = lo.n * UNIT_SECONDS[lo.u];
        const hiSec = hi.n * UNIT_SECONDS[hi.u];
        if (hi.u === 'd' && hi.n > 1) {
          dayMin = Math.min(dayMin, Math.max(1, Math.ceil(loSec / 86400)));
          dayMax = Math.max(dayMax, hi.n);
        } else {
          intraMinSec = Math.min(intraMinSec, loSec);
          intraMaxSec = Math.max(intraMaxSec, hiSec);
        }
      }
    }

    const ms = a.min_stake as number | null;
    const xs = a.max_stake as number | null;
    if (typeof ms === 'number') minStake = Math.min(minStake ?? ms, ms);
    if (typeof xs === 'number') maxStake = Math.max(maxStake ?? xs, xs);
  }

  const durations: Partial<Record<DurationUnit, UnitRange>> = {};

  if (tickMax > 0 && Number.isFinite(tickMin))
    durations.t = { min: tickMin, max: tickMax };

  if (intraMaxSec > 0 && Number.isFinite(intraMinSec)) {
    for (const u of ['s', 'm', 'h'] as const) {
      const step = UNIT_SECONDS[u];
      const min = Math.max(1, Math.ceil(intraMinSec / step));
      const max = Math.floor(intraMaxSec / step);
      if (max >= min && min * step >= intraMinSec) durations[u] = { min, max };
    }
  }

  if (dayMax > 0 && Number.isFinite(dayMin))
    durations.d = { min: dayMin, max: dayMax };

  return { durations, minStake, maxStake };
}

type Pending = {
  resolve: (v: Record<string, unknown>) => void;
  reject: (e: Error) => void;
};

/**
 * Owns the authenticated Deriv socket for one account.
 *
 * Deriv's OTP is single-use and expires after 120s, so the URL is fetched
 * fresh each time a socket is opened and never reused across reconnects.
 * Requests are correlated by `req_id` because responses arrive out of order
 * on a shared connection; subscriptions reuse their `req_id` on every update,
 * so they are tracked separately from one-shot requests.
 */
export function useDerivTrading(account: Account | null, symbol: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<Map<number, Pending>>(new Map());
  const streams = useRef<Map<number, (d: Record<string, unknown>) => void>>(
    new Map()
  );
  const reqId = useRef(1);

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tagged with the account the contracts belong to, so switching accounts
  // discards the previous list on read instead of resetting state from the
  // effect body (which would cascade an extra render).
  const [posState, setPosState] = useState<{
    accountId: string | null;
    list: OpenContract[];
  }>({ accountId: null, list: [] });
  const [histState, setHistState] = useState<{
    accountId: string | null;
    rows: HistoryRow[];
  }>({ accountId: null, rows: [] });
  const [limits, setLimits] = useState<ContractLimits | null>(null);

  const positions =
    posState.accountId === (account?.account_id ?? null) ? posState.list : [];
  const history =
    histState.accountId === (account?.account_id ?? null)
      ? histState.rows
      : [];

  useEffect(() => {
    if (!account) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    const inflight = pending.current;
    const subs = streams.current;

    // Settlement and the profit_table write are not atomic on Deriv's side, so
    // a refresh fired immediately can miss the row. Debounce and delay a beat.
    let histTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleHistoryRefresh = () => {
      clearTimeout(histTimer);
      histTimer = setTimeout(() => {
        if (cancelled || socket?.readyState !== WebSocket.OPEN) return;
        const rid = reqId.current++;
        subs.set(rid, (d) => {
          const table = d.profit_table as
            | { transactions?: Record<string, unknown>[] }
            | undefined;
          if (table?.transactions) {
            setHistState({
              accountId: account.account_id,
              rows: table.transactions.map(toHistoryRow),
            });
          }
          subs.delete(rid);
        });
        socket.send(
          JSON.stringify({
            profit_table: 1,
            description: 1,
            limit: 50,
            sort: 'DESC',
            req_id: rid,
          })
        );
      }, 1500);
    };

    (async () => {
      setError(null);
      setConnected(false);
      try {
        const res = await fetch('/api/deriv/ws-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: account.account_id }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'ws_url_failed');
        if (cancelled) return;

        socket = new WebSocket(body.url);
        wsRef.current = socket;

        socket.onopen = () => {
          if (cancelled) return;
          setConnected(true);
          // Streaming every open contract keeps positions current without
          // polling, and newly bought contracts appear on their own.
          const id = reqId.current++;
          subs.set(id, (d) => {
            const c = d.proposal_open_contract as
              | Record<string, unknown>
              | undefined;
            if (!c?.contract_id) return;
            const next = toOpenContract(c);
            const done = next.is_sold || next.is_expired;

            setPosState((prev) => {
              const list =
                prev.accountId === account.account_id ? prev.list : [];
              // A settled contract belongs in history, not positions. Leaving
              // it here made "Positions" accumulate every trade of the session.
              const without = list.filter(
                (p) => p.contract_id !== next.contract_id
              );
              return {
                accountId: account.account_id,
                list: done ? without : [next, ...without],
              };
            });

            // Pull the realised row once Deriv has settled it.
            if (done) scheduleHistoryRefresh();
          });
          socket!.send(
            JSON.stringify({
              proposal_open_contract: 1,
              subscribe: 1,
              req_id: id,
            })
          );

          // Settled trades are a one-shot read, not a stream.
          const hid = reqId.current++;
          subs.set(hid, (d) => {
            const table = d.profit_table as
              | { transactions?: Record<string, unknown>[] }
              | undefined;
            if (!table?.transactions) return;
            setHistState({
              accountId: account.account_id,
              rows: table.transactions.map(toHistoryRow),
            });
            subs.delete(hid);
          });
          socket!.send(
            JSON.stringify({
              profit_table: 1,
              description: 1,
              limit: 50,
              sort: 'DESC',
              req_id: hid,
            })
          );

          // Ask Deriv what durations and stakes it will actually accept, so
          // the form cannot offer a combination it will reject.
          const cid = reqId.current++;
          subs.set(cid, (d) => {
            const cf = d.contracts_for as
              | { available?: Record<string, unknown>[] }
              | undefined;
            if (!cf?.available) return;
            setLimits(toLimits(cf.available, ['CALL', 'PUT']));
            subs.delete(cid);
          });
          socket!.send(
            JSON.stringify({
              contracts_for: symbol,
              req_id: cid,
            })
          );
        };

        socket.onclose = () => !cancelled && setConnected(false);
        socket.onerror = () => !cancelled && setError('socket_error');

        socket.onmessage = (msg) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(msg.data);
          } catch {
            return;
          }
          const id = data.req_id as number | undefined;
          if (id == null) return;

          const stream = subs.get(id);
          if (stream) {
            if (!data.error) stream(data);
            return;
          }

          const waiter = inflight.get(id);
          if (!waiter) return;
          inflight.delete(id);
          const err = data.error as { message?: string } | undefined;
          if (err) waiter.reject(new Error(err.message ?? 'deriv_error'));
          else waiter.resolve(data);
        };
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'connect_failed');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(histTimer);
      inflight.forEach((p) => p.reject(new Error('disconnected')));
      inflight.clear();
      subs.clear();
      socket?.close();
      wsRef.current = null;
    };
  }, [account, symbol]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not_connected'));
    }
    const id = reqId.current++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      socket.send(JSON.stringify({ ...payload, req_id: id }));
      // Deriv can silently drop a malformed request; don't hang the UI on it.
      setTimeout(() => {
        if (pending.current.delete(id)) reject(new Error('timeout'));
      }, 15000);
    });
  }, []);

  const getProposal = useCallback(
    async (p: TradeParams): Promise<Proposal> => {
      if (!account) throw new Error('no_account');
      const res = await send({
        proposal: 1,
        contract_type: p.contract_type,
        currency: account.currency,
        underlying_symbol: p.underlying_symbol,
        amount: p.amount,
        basis: 'stake',
        duration: p.duration,
        duration_unit: p.duration_unit,
      });
      return toProposal(res.proposal as Record<string, unknown>);
    },
    [account, send]
  );

  // `price` caps what Deriv may charge. Passing the quoted ask_price means a
  // price move between quote and execution rejects the trade rather than
  // silently filling at a worse number.
  const buy = useCallback(
    async (proposalId: string, maxPrice: number): Promise<Purchase> => {
      const res = await send({ buy: proposalId, price: maxPrice });
      return toPurchase(res.buy as Record<string, unknown>);
    },
    [send]
  );

  // `price` is a floor, not a cap: 0 would accept any price at all. Quoting a
  // small tolerance below the displayed bid protects against a large adverse
  // move while still tolerating ordinary tick noise on a fast synthetic index.
  const sell = useCallback(
    async (contractId: number, minPrice: number): Promise<SellResult> => {
      const res = await send({ sell: contractId, price: minPrice });
      const r = res.sell as Record<string, unknown>;
      return {
        contract_id: num(r.contract_id),
        sold_for: num(r.sold_for),
        balance_after: num(r.balance_after),
        transaction_id: num(r.transaction_id),
      };
    },
    [send]
  );

  const refreshHistory = useCallback(async () => {
    if (!account) return;
    const res = await send({
      profit_table: 1,
      description: 1,
      limit: 50,
      sort: 'DESC',
    });
    const table = res.profit_table as
      | { transactions?: Record<string, unknown>[] }
      | undefined;
    setHistState({
      accountId: account.account_id,
      rows: (table?.transactions ?? []).map(toHistoryRow),
    });
  }, [account, send]);

  return {
    connected,
    error,
    positions,
    history,
    limits,
    getProposal,
    buy,
    sell,
    refreshHistory,
  };
}
