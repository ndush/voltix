'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Campaign, SiteContent } from '../lib/content';

type Status = { kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string };

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '', code: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [source, setSource] = useState<'blob' | 'fallback' | null>(null);
  // Snapshot of what is stored, so unsaved edits can be detected. Without it a
  // client can edit for five minutes, close the tab and silently lose the lot.
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Fetch is separated from the state update so the effect never calls
  // setState synchronously in its body.
  const fetchContent = useCallback(async () => {
    const res = await fetch('/api/admin/content');
    if (res.status === 401) return { authed: false as const };
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        authed: true as const,
        error:
          body.error === 'blob_not_configured'
            ? 'No Blob store is connected. Create one in Vercel under Storage, then redeploy.'
            : `Could not load content (${body.error}).`,
      };
    }
    return {
      authed: true as const,
      content: body.content as SiteContent,
      source: body.source as 'blob' | 'fallback',
      editor: body.editor as string,
    };
  }, []);

  const apply = useCallback(
    (r: Awaited<ReturnType<typeof fetchContent>>) => {
      setAuthed(r.authed);
      if (!r.authed) return;
      if ('error' in r && r.error) {
        setStatus({ kind: 'error', message: r.error });
        return;
      }
      if ('content' in r && r.content) {
        setContent(r.content);
        setSaved(JSON.stringify(r.content));
        setSource(r.source ?? null);
        setEditor(r.editor ?? null);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchContent();
      if (!cancelled) apply(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, fetchContent]);

  // Browsers only allow this warning when something is genuinely unsaved.
  useEffect(() => {
    const hasEdits =
      saved !== null && content !== null && JSON.stringify(content) !== saved;
    if (!hasEdits) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [content, saved]);

  async function save() {
    if (!content) return;
    setStatus({ kind: 'saving' });
    const res = await fetch('/api/admin/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setSource('blob');
      setSaved(JSON.stringify(content));
      setStatus({ kind: 'saved', message: 'Saved. Your changes are live now.' });
    } else {
      setStatus({
        kind: 'error',
        message: `Could not save${body.field ? ` — check "${body.field}"` : ''}.`,
      });
    }
  }

  if (authed === null) {
    return (
      <main className="admin">
        <p className="admin-muted">Loading…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="admin admin-login">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setSigningIn(true);
            setLoginError(null);
            try {
              const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
              });
              const body = await res.json().catch(() => ({}));
              if (res.ok) {
                setForm({ email: '', password: '', code: '' });
                apply(await fetchContent());
              } else if (res.status === 429) {
                setLoginError(
                  `Too many attempts. Try again in about ${Math.ceil(
                    (body.retryAfter ?? 900) / 60
                  )} minutes.`
                );
              } else if (body.error === 'not_configured') {
                setLoginError('Admin is not set up yet. ADMIN_USERS is missing.');
              } else {
                setLoginError('Email, password or code is not correct.');
              }
            } catch {
              setLoginError('Could not reach the server. Try again.');
            } finally {
              setSigningIn(false);
            }
          }}
        >
          <h1>Voltix admin</h1>
          <p className="admin-muted">
            Sign in with your password and the 6-digit code from your
            authenticator app.
          </p>
          <input
            type="email"
            autoComplete="username"
            placeholder="Email"
            value={form.email}
            autoFocus
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.replace(/\D/g, '') })
            }
          />
          {loginError && <p className="admin-error">{loginError}</p>}
          <button type="submit" className="btn-primary" disabled={signingIn}>
            {signingIn ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="admin">
        {status.message ? (
          <p className="admin-error">{status.message}</p>
        ) : (
          <p className="admin-muted">Loading content…</p>
        )}
      </main>
    );
  }

  const dirty = saved !== null && JSON.stringify(content) !== saved;

  const set = (patch: Partial<SiteContent>) =>
    setContent({ ...content, ...patch });

  const setCampaign = (key: string | null, patch: Partial<Campaign>) => {
    if (key === null) {
      set({ defaultCampaign: { ...content.defaultCampaign, ...patch } });
    } else {
      set({
        campaigns: {
          ...content.campaigns,
          [key]: { ...content.campaigns[key], ...patch },
        },
      });
    }
  };

  return (
    <main className="admin">
      <header className="admin-head">
        <div className="admin-title">
          <h1>Your site</h1>
          <p className="admin-muted">
            Edit the text below, then press Save. Changes go live straight away.
          </p>
        </div>
        <div className="admin-actions">
          <a href="/" target="_blank" rel="noreferrer" className="ghost">
            View live site ↗
          </a>
          {editor && <span className="admin-who">{editor}</span>}
          <button
            className="ghost"
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              setAuthed(false);
              setContent(null);
              setEditor(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {source === 'fallback' && !status.message && (
        <p className="admin-muted">
          Showing the copy that ships with the site. Nothing has been saved here
          yet — your first save becomes the live version.
        </p>
      )}

      {status.message && (
        <p
          className={
            status.kind === 'error' ? 'admin-error' : 'admin-success'
          }
        >
          {status.message}
        </p>
      )}

      <CampaignFields
        title="Home page"
        hint="What visitors see at your main address."
        campaign={content.defaultCampaign}
        onChange={(patch) => setCampaign(null, patch)}
      />

      <Earnings />

      <details className="fold">
        <summary>
          <span className="fold-title">The rest of the page</span>
          <span className="fold-hint">markets and selling points</span>
        </summary>
      <section className="admin-section">
        <h2>Markets</h2>
        <p className="admin-muted">
          These show on your home page with real prices from Deriv, updating
          every second. Pick a market on the left; on the right, write what you
          want it called.
        </p>
        {content.markets.map((m, i) => (
          <div
            className={`admin-row ${
              content.markets.findIndex((o) => o.symbol === m.symbol) !== i
                ? 'dupe'
                : ''
            }`}
            key={i}
          >
            <select
              value={m.symbol}
              onChange={(e) => {
                const choice = SYMBOL_CHOICES.find(
                  (c) => c.code === e.target.value
                );
                const markets = [...content.markets];
                markets[i] = {
                  symbol: e.target.value,
                  // Rename alongside the market unless it has been customised.
                  name:
                    SYMBOL_CHOICES.some((c) => c.label === m.name) || !m.name
                      ? (choice?.label ?? m.name)
                      : m.name,
                };
                set({ markets });
              }}
            >
              {!SYMBOL_CHOICES.some((c) => c.code === m.symbol) && (
                <option value={m.symbol}>{m.symbol}</option>
              )}
              {SYMBOL_CHOICES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={m.name}
              placeholder="What to call it on your page"
              onChange={(e) => {
                const markets = [...content.markets];
                markets[i] = { ...m, name: e.target.value };
                set({ markets });
              }}
            />
            <button
              className="admin-remove"
              onClick={() =>
                set({ markets: content.markets.filter((_, n) => n !== i) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        {new Set(content.markets.map((m) => m.symbol)).size !==
          content.markets.length && (
          <p className="admin-error">
            The same market is listed more than once — it will appear twice on
            your page. Remove the extra row.
          </p>
        )}

        {(() => {
          const used = new Set(content.markets.map((m) => m.symbol));
          const spare = SYMBOL_CHOICES.filter((c) => !used.has(c.code));
          // There are only five of these, so once they are all listed a sixth
          // row could only ever be a duplicate.
          if (spare.length === 0) {
            return (
              <p className="admin-muted" style={{ marginTop: 15 }}>
                All 13 volatility indices are already on your page.
              </p>
            );
          }
          return (
            <button
              className="admin-add"
              onClick={() =>
                set({
                  markets: [
                    ...content.markets,
                    { symbol: spare[0].code, name: spare[0].label },
                  ],
                })
              }
            >
              + Add market
            </button>
          );
        })()}
      </section>

      <section className="admin-section">
        <h2>What you can trade</h2>
        <p className="admin-muted">
          The Deriv contract types listed on your page, so visitors recognise
          what is on offer. They trade these on Deriv, not here.
        </p>
        {(content.tradeTypes ?? []).map((t, i) => (
          <div className="admin-stack" key={i}>
            <input
              value={t.name}
              placeholder="e.g. Even / Odd"
              onChange={(e) => {
                const tradeTypes = [...(content.tradeTypes ?? [])];
                tradeTypes[i] = { ...t, name: e.target.value };
                set({ tradeTypes });
              }}
            />
            <textarea
              value={t.body}
              rows={2}
              placeholder="One line explaining it"
              onChange={(e) => {
                const tradeTypes = [...(content.tradeTypes ?? [])];
                tradeTypes[i] = { ...t, body: e.target.value };
                set({ tradeTypes });
              }}
            />
            <button
              className="admin-remove"
              onClick={() =>
                set({
                  tradeTypes: (content.tradeTypes ?? []).filter(
                    (_, n) => n !== i
                  ),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="admin-add"
          onClick={() =>
            set({
              tradeTypes: [...(content.tradeTypes ?? []), { name: '', body: '' }],
            })
          }
        >
          + Add one
        </button>
      </section>

      <section className="admin-section">
        <h2>Selling points</h2>
        <p className="admin-muted">
          Three short reasons to choose you, shown under the prices.
        </p>
        {content.features.map((f, i) => (
          <div className="admin-stack" key={i}>
            <input
              value={f.title}
              placeholder="Title"
              onChange={(e) => {
                const features = [...content.features];
                features[i] = { ...f, title: e.target.value };
                set({ features });
              }}
            />
            <textarea
              value={f.body}
              rows={2}
              placeholder="One or two sentences"
              onChange={(e) => {
                const features = [...content.features];
                features[i] = { ...f, body: e.target.value };
                set({ features });
              }}
            />
            <button
              className="admin-remove"
              onClick={() =>
                set({ features: content.features.filter((_, n) => n !== i) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="admin-add"
          onClick={() =>
            set({ features: [...content.features, { title: '', body: '' }] })
          }
        >
          + Add selling point
        </button>
      </section>

      </details>

      <details className="fold">
        <summary>
          <span className="fold-title">Account and access</span>
          <span className="fold-hint">your password, who else can edit</span>
        </summary>
        <Editors />
        <ChangePassword />
      </details>

      <div className={`savebar ${dirty ? 'on' : ''}`} aria-hidden={!dirty}>
        <span className="savebar-msg">
          Not saved yet — the live site still shows the old version
        </span>
        <button
          className="ghost"
          onClick={() => {
            if (saved) setContent(JSON.parse(saved));
            setStatus({ kind: 'idle' });
          }}
          disabled={status.kind === 'saving'}
        >
          Discard
        </button>
        <button
          className="btn-primary"
          onClick={save}
          disabled={status.kind === 'saving'}
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <p className="admin-foot">
        The risk warning, Terms and Privacy pages are required disclosures and
        are not editable here.
      </p>
    </main>
  );
}

/** Deriv's synthetic indices, named the way a person would say them. */
const SYMBOL_CHOICES: { code: string; label: string }[] = [
  { code: 'R_10', label: 'Volatility 10' },
  { code: 'R_25', label: 'Volatility 25' },
  { code: 'R_50', label: 'Volatility 50' },
  { code: 'R_75', label: 'Volatility 75' },
  { code: 'R_100', label: 'Volatility 100' },
  // One-second versions tick every second rather than every two, which is
  // what the digits and accumulators audience tends to want.
  { code: '1HZ10V', label: 'Volatility 10 (1s)' },
  { code: '1HZ15V', label: 'Volatility 15 (1s)' },
  { code: '1HZ25V', label: 'Volatility 25 (1s)' },
  { code: '1HZ30V', label: 'Volatility 30 (1s)' },
  { code: '1HZ50V', label: 'Volatility 50 (1s)' },
  { code: '1HZ75V', label: 'Volatility 75 (1s)' },
  { code: '1HZ90V', label: 'Volatility 90 (1s)' },
  { code: '1HZ100V', label: 'Volatility 100 (1s)' },
];

type EditorRow = { email: string; removable: boolean; isYou: boolean };

type Overview = {
  currency: string;
  period: { start_date: string; end_date: string };
  signups: {
    total: number;
    real_accounts: number;
    first_time_depositors: number;
    first_time_traders: number;
  };
  activity: { paid: number; pending: number; active_traders: number };
};

/**
 * Figures read live from Deriv. Nothing here is stored by this site — it holds
 * no record of who signed up, only what Deriv reports back.
 */
const CONNECT_ERRORS: Record<string, string> = {
  invalid_scope:
    'Deriv refused the request because your app is not allowed to read partner reports. In Deriv\u2019s Applications Manager, add the application_read scope to this app, then try again.',
  access_denied: 'You declined the request on Deriv. Try again to connect.',
  state_mismatch: 'That attempt expired. Please try again.',
  missing_code: 'That attempt expired. Please try again.',
  token_exchange_failed: 'Deriv could not complete the connection. Try again.',
};

function Earnings() {
  const [days, setDays] = useState(30);
  // Set by the callback when Deriv refuses; read once on mount.
  const [connectError] = useState(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('connect_error')
  );
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'disconnected' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; data: Overview }
  >({ kind: 'loading' });

  const load = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/partner/overview?days=${d}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { kind: 'ready' as const, data: body.overview as Overview };
      if (body.error === 'not_connected' || body.error === 'reconnect_needed')
        return { kind: 'disconnected' as const };
      return {
        kind: 'error' as const,
        message: 'Could not read your figures from Deriv just now.',
      };
    } catch {
      return { kind: 'error' as const, message: 'Could not reach the server.' };
    }
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const r = await load(days);
      if (!off) setState(r);
    })();
    return () => {
      off = true;
    };
  }, [load, days]);

  const money = (n: number, cur: string) =>
    `${n.toFixed(2)}${cur ? ' ' + cur : ''}`;

  return (
    <section className="admin-section">
      <h2>Your Deriv earnings</h2>
      <p className="admin-muted">
        Read straight from Deriv. This site keeps no record of who signed up —
        these are Deriv&apos;s own numbers.
      </p>

      {state.kind === 'loading' && (
        <p className="admin-muted" style={{ marginTop: 14 }}>
          Loading…
        </p>
      )}

      {connectError && (
        <p className="admin-error">
          {CONNECT_ERRORS[connectError] ??
            'Deriv could not complete the connection.'}
        </p>
      )}

      {state.kind === 'disconnected' && (
        <div className="connect">
          <p className="admin-muted">
            Connect your Deriv partner account to see signups and commission
            here.
          </p>
          <a className="btn-primary" href="/api/partner/connect">
            Connect Deriv
          </a>
        </div>
      )}

      {state.kind === 'error' && <p className="admin-error">{state.message}</p>}

      {state.kind === 'ready' && (
        <>
          <div className="range">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={`range-btn ${d === days ? 'on' : ''}`}
                onClick={() => {
                  setState({ kind: 'loading' });
                  setDays(d);
                }}
              >
                {d} days
              </button>
            ))}
          </div>

          <div className="stats">
            <div className="stat big">
              <span className="stat-n">{state.data.signups.total}</span>
              <span className="stat-l">Signups</span>
            </div>
            <div className="stat">
              <span className="stat-n">{state.data.signups.real_accounts}</span>
              <span className="stat-l">Real accounts</span>
            </div>
            <div className="stat">
              <span className="stat-n">
                {state.data.signups.first_time_depositors}
              </span>
              <span className="stat-l">Funded</span>
            </div>
            <div className="stat">
              <span className="stat-n">
                {state.data.signups.first_time_traders}
              </span>
              <span className="stat-l">Started trading</span>
            </div>
          </div>

          <div className="stats money">
            <div className="stat">
              <span className="stat-n paid">
                {money(state.data.activity.paid, state.data.currency)}
              </span>
              <span className="stat-l">Commission paid</span>
            </div>
            <div className="stat">
              <span className="stat-n">
                {money(state.data.activity.pending, state.data.currency)}
              </span>
              <span className="stat-l">Pending</span>
            </div>
            <div className="stat">
              <span className="stat-n">{state.data.activity.active_traders}</span>
              <span className="stat-l">Active traders</span>
            </div>
          </div>

          <button
            className="admin-add"
            onClick={async () => {
              await fetch('/api/partner/disconnect', { method: 'POST' });
              setState({ kind: 'disconnected' });
            }}
          >
            Disconnect Deriv
          </button>
        </>
      )}
    </section>
  );
}

function Editors() {
  const [rows, setRows] = useState<EditorRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    qr: string;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/editors');
    if (!res.ok) return setRows([]);
    const b = await res.json();
    setRows(b.editors ?? []);
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch('/api/admin/editors');
      const b = res.ok ? await res.json() : { editors: [] };
      if (!off) setRows(b.editors ?? []);
    })();
    return () => {
      off = true;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/editors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreated({ email: b.email, password: b.password, qr: b.qr });
        setEmail('');
        await load();
      } else {
        setErr(
          b.error === 'already_exists'
            ? 'That person is already an editor.'
            : b.error === 'invalid_email'
              ? 'That does not look like an email address.'
              : b.error === 'store_unavailable'
                ? 'Storage is unreachable. Try again in a moment.'
                : 'Could not add that editor.'
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    if (!window.confirm(`Remove ${target}? They will lose access immediately.`))
      return;
    const res = await fetch('/api/admin/editors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target }),
    });
    if (res.ok) await load();
    else {
      const b = await res.json().catch(() => ({}));
      setErr(
        b.error === 'env_editor'
          ? 'That editor is set in Vercel and must be removed there.'
          : 'Could not remove that editor.'
      );
    }
  }

  return (
    <section className="admin-section">
      <h2>Who can edit</h2>
      <p className="admin-muted">
        Everyone here can change the site. Adding someone gives them a password
        and a QR code to scan — shown once.
      </p>

      {rows === null ? (
        <p className="admin-muted" style={{ marginTop: 14 }}>
          Loading…
        </p>
      ) : (
        <ul className="editors">
          {rows.map((r) => (
            <li key={r.email}>
              <span className="ed-mail">
                {r.email}
                {r.isYou && <span className="ed-you">you</span>}
                {!r.removable && <span className="ed-env">in Vercel</span>}
              </span>
              {r.removable && !r.isYou && (
                <button
                  className="admin-remove"
                  onClick={() => remove(r.email)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {created && (
        <div className="ed-new">
          <h3>Give these to {created.email}</h3>
          <p className="admin-muted">
            Shown once. Have them scan the code with Google Authenticator, Authy
            or their phone&apos;s password app, and save the password somewhere
            safe.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={created.qr} alt="Authenticator setup code" width={200} height={200} />
          <code className="ed-pass">{created.password}</code>
          <button className="admin-add" onClick={() => setCreated(null)}>
            Done — I have shared these
          </button>
        </div>
      )}

      {err && <p className="admin-error">{err}</p>}

      <form onSubmit={add} className="ed-add">
        <input
          type="email"
          placeholder="their@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="admin-add" type="submit" disabled={busy || !email}>
          {busy ? 'Adding…' : 'Add editor'}
        </button>
      </form>
    </section>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '', code: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (form.next !== form.confirm) {
      setMsg({ kind: 'err', text: 'The two new passwords do not match.' });
      return;
    }
    if (form.next.length < 12) {
      setMsg({ kind: 'err', text: 'Use at least 12 characters.' });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.current,
          newPassword: form.next,
          code: form.code,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setForm({ current: '', next: '', confirm: '', code: '' });
        setMsg({
          kind: 'ok',
          text: 'Password changed. Use the new one next time you sign in.',
        });
      } else if (body.error === 'invalid_credentials') {
        setMsg({
          kind: 'err',
          text: 'Current password or code is not correct.',
        });
      } else if (body.error === 'too_short') {
        setMsg({ kind: 'err', text: 'Use at least 12 characters.' });
      } else if (body.error === 'unchanged') {
        setMsg({ kind: 'err', text: 'The new password is the same as the old one.' });
      } else if (body.error === 'store_unavailable') {
        setMsg({
          kind: 'err',
          text: 'Storage is unreachable right now. Try again in a moment.',
        });
      } else {
        setMsg({ kind: 'err', text: 'Could not change the password.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="admin-section">
        <h2>Your password</h2>
        <p className="admin-muted">
          Your 6-digit code stays the same — only the password changes.
        </p>
        <button className="admin-add" onClick={() => setOpen(true)}>
          Change password
        </button>
      </section>
    );
  }

  return (
    <section className="admin-section">
      <h2>Change your password</h2>
      <p className="admin-muted">
        Confirm the password you use now and a fresh code from your phone. Your
        6-digit code does not change.
      </p>
      <form onSubmit={submit}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          />
        </label>
        <label>
          <span className="lbl-row">
            New password
            <span className="lbl-hint">12 characters or more</span>
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
          />
        </label>
        <label>
          New password again
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
        <label>
          6-digit code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.replace(/\D/g, '') })
            }
          />
        </label>

        {msg && (
          <p className={msg.kind === 'ok' ? 'admin-success' : 'admin-error'}>
            {msg.text}
          </p>
        )}

        <div className="pw-actions">
          <button
            type="button"
            className="admin-add"
            onClick={() => {
              setOpen(false);
              setMsg(null);
              setForm({ current: '', next: '', confirm: '', code: '' });
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function CampaignFields({
  title,
  hint,
  campaign,
  onChange,
}: {
  title?: string;
  hint?: string;
  campaign: Campaign;
  onChange: (patch: Partial<Campaign>) => void;
}) {
  return (
    <section className="admin-section">
      {title && <h2>{title}</h2>}
      {hint && <p className="admin-muted">{hint}</p>}

      {/* Seeing the result is worth more than any amount of explaining which
          box does what. */}
      <div className="preview">
        <span className="preview-tag">
          Preview — what visitors see once you save
        </span>
        <div className="preview-page">
          {campaign.banner ? (
            <div className="preview-banner">{campaign.banner}</div>
          ) : null}
          <div className="preview-body">
            <div className="preview-brand">Voltix</div>
            <div className="preview-h1">
              {campaign.headline || 'Your headline goes here'}
            </div>
            <div className="preview-sub">
              {campaign.subhead || 'The sentence underneath goes here'}
            </div>
            <span className="preview-btn">
              {campaign.cta || 'Your button'}
            </span>
          </div>
        </div>
      </div>

      <label>
        <span className="lbl-row">
          Headline
          <span
            className={`counter ${campaign.headline.length > 60 ? 'over' : ''}`}
          >
            {campaign.headline.length}/60
          </span>
        </span>
        <input
          value={campaign.headline}
          onChange={(e) => onChange({ headline: e.target.value })}
          placeholder="The big text at the top"
        />
      </label>
      <label>
        Sentence underneath
        <textarea
          rows={2}
          value={campaign.subhead}
          onChange={(e) => onChange({ subhead: e.target.value })}
          placeholder="One sentence explaining what you offer"
        />
      </label>
      <label>
        Button text
        <input
          value={campaign.cta}
          onChange={(e) => onChange({ cta: e.target.value })}
        />
      </label>
      <label>
        <span className="lbl-row">
          Banner across the top
          <span className="lbl-hint">optional</span>
        </span>
        <input
          value={campaign.banner ?? ''}
          onChange={(e) => onChange({ banner: e.target.value })}
        />
      </label>
      <label>
        <span className="lbl-row">
          Label for your Deriv reports
          <span className="lbl-hint">visitors never see this</span>
        </span>
        <input
          value={campaign.utmCampaign}
          onChange={(e) => onChange({ utmCampaign: e.target.value })}
          placeholder="e.g. whatsapp_march"
        />
        <span className="field-help">
          When someone signs up through this page, Deriv shows this label in
          your partner reports — so you know which page brought them in.
        </span>
      </label>
    </section>
  );
}
