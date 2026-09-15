import 'server-only';

/**
 * Deriv partner reporting.
 *
 * Reads the signup and commission figures Deriv already holds. Nothing is
 * stored here: the site has no database of referred people and never sees
 * their details, only the totals Deriv reports back.
 *
 * Needs the `application_read` scope, which the public reshare flow does not
 * request — this is a separate, deliberate connection made by the site owner.
 */
export const PARTNER_TOKEN_COOKIE = 'deriv_partner_token';
export const PARTNER_FLOW_COOKIE = 'partner_oauth';
export const PARTNER_SCOPE = 'application_read';

export type Overview = {
  period: { start_date: string; end_date: string };
  currency: string;
  signups: {
    total: number;
    real_accounts: number;
    first_time_depositors: number;
    first_time_traders: number;
  };
  activity: { paid: number; pending: number; active_traders: number };
};

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Deriv has returned numbers as strings elsewhere in this API; do not trust them. */
export function toOverview(raw: Record<string, unknown>): Overview {
  const s = (raw.signups ?? {}) as Record<string, unknown>;
  const a = (raw.activity ?? {}) as Record<string, unknown>;
  const p = (raw.period ?? {}) as Record<string, unknown>;
  return {
    period: {
      start_date: String(p.start_date ?? ''),
      end_date: String(p.end_date ?? ''),
    },
    currency: String(raw.currency ?? ''),
    signups: {
      total: num(s.total),
      real_accounts: num(s.real_accounts),
      first_time_depositors: num(s.first_time_depositors),
      first_time_traders: num(s.first_time_traders),
    },
    activity: {
      paid: num(a.paid),
      pending: num(a.pending),
      active_traders: num(a.active_traders),
    },
  };
}
