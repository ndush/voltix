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
      setStatus({ kind: 'saved', message: 'Saved. The site is live now.' });
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
        <h1>Site content</h1>
        <div className="admin-actions">
          {editor && <span className="admin-who">{editor}</span>}
          <a href="/" target="_blank" rel="noreferrer">
            View site ↗
          </a>
          <button
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              setAuthed(false);
              setContent(null);
              setEditor(null);
            }}
          >
            Sign out
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={status.kind === 'saving'}
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save changes'}
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

      <section className="admin-section">
        <h2>Markets</h2>
        <p className="admin-muted">
          Shown on the home page with live prices. The symbol must be a Deriv
          code such as R_75.
        </p>
        {content.markets.map((m, i) => (
          <div className="admin-row" key={i}>
            <input
              value={m.symbol}
              placeholder="R_75"
              onChange={(e) => {
                const markets = [...content.markets];
                markets[i] = { ...m, symbol: e.target.value };
                set({ markets });
              }}
            />
            <input
              value={m.name}
              placeholder="Volatility 75"
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
        <button
          className="admin-add"
          onClick={() =>
            set({ markets: [...content.markets, { symbol: '', name: '' }] })
          }
        >
          + Add market
        </button>
      </section>

      <section className="admin-section">
        <h2>Selling points</h2>
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

      <section className="admin-section">
        <h2>Campaigns</h2>
        <p className="admin-muted">
          Each one is a different version of the home page with its own link,
          so you can see which message brings people in.
        </p>
        {Object.entries(content.campaigns).map(([key, c]) => (
          <details key={key} className="campaign">
            <summary>
              {c.name || key} <code>/?c={key}</code>
            </summary>
            <CampaignFields
              campaign={c}
              onChange={(patch) => setCampaign(key, patch)}
            />
            <button
              className="admin-remove"
              onClick={() => {
                const campaigns = { ...content.campaigns };
                delete campaigns[key];
                set({ campaigns });
              }}
            >
              Delete this campaign
            </button>
          </details>
        ))}
        <button
          className="admin-add"
          onClick={() => {
            const key = prompt(
              'Short name for the link, letters and dashes only (e.g. payday):'
            );
            if (!key || !/^[a-z0-9_-]{1,40}$/i.test(key)) return;
            set({
              campaigns: {
                ...content.campaigns,
                [key]: {
                  name: key,
                  headline: '',
                  subhead: '',
                  cta: 'Start Trading →',
                  banner: '',
                  utmCampaign: key,
                  utmSource: 'voltix',
                },
              },
            });
          }}
        >
          + Add campaign
        </button>
      </section>

      <ChangePassword />

      <p className="admin-foot">
        The risk warning, Terms and Privacy pages are required disclosures and
        are not editable here.
      </p>
    </main>
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
          New password <span className="admin-muted">(12 characters or more)</span>
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

      <label>
        Headline
        <input
          value={campaign.headline}
          onChange={(e) => onChange({ headline: e.target.value })}
        />
      </label>
      <label>
        Sentence underneath
        <textarea
          rows={2}
          value={campaign.subhead}
          onChange={(e) => onChange({ subhead: e.target.value })}
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
        Banner across the top <span className="admin-muted">(leave empty for none)</span>
        <input
          value={campaign.banner ?? ''}
          onChange={(e) => onChange({ banner: e.target.value })}
        />
      </label>
      <label>
        Campaign name in Deriv reports
        <input
          value={campaign.utmCampaign}
          onChange={(e) => onChange({ utmCampaign: e.target.value })}
        />
      </label>
    </section>
  );
}
