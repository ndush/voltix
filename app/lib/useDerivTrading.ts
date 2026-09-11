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

export type TradeParams = {
  contract_type: 'CALL' | 'PUT';
  amount: number;
  duration: number;
  duration_unit: 't' | 's' | 'm' | 'h' | 'd';
  underlying_symbol: string;
};

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
 * on a shared connection.
 */
export function useDerivTrading(account: Account | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<Map<number, Pending>>(new Map());
  const reqId = useRef(1);

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    const inflight = pending.current;

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

        socket.onopen = () => !cancelled && setConnected(true);
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
          const waiter = pending.current.get(id);
          if (!waiter) return;
          pending.current.delete(id);
          const err = data.error as { message?: string } | undefined;
          if (err) waiter.reject(new Error(err.message ?? 'deriv_error'));
          else waiter.resolve(data);
        };
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'connect_failed');
      }
    })();

    return () => {
      cancelled = true;
      inflight.forEach((p) => p.reject(new Error('disconnected')));
      inflight.clear();
      socket?.close();
      wsRef.current = null;
    };
  }, [account]);

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
      return res.proposal as Proposal;
    },
    [account, send]
  );

  // `price` caps what Deriv may charge. Passing the quoted ask_price means a
  // price move between quote and execution rejects the trade rather than
  // silently filling at a worse number.
  const buy = useCallback(
    async (proposalId: string, maxPrice: number): Promise<Purchase> => {
      const res = await send({ buy: proposalId, price: maxPrice });
      return res.buy as Purchase;
    },
    [send]
  );

  return { connected, error, getProposal, buy };
}
