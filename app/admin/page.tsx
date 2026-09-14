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
            Change what visitors see. Nothing here can break your trading page.
          </p>
        </div>
        <div className="admin-actions">
          <a href="/" target="_blank" rel="noreferrer" className="ghost">
            Preview ↗
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

      <section className="admin-section">
        <h2>Markets</h2>
        <p className="admin-muted">
          These show on your home page with real prices from Deriv, updating
          every second. Pick a market on the left; on the right, write what you
          want it called.
        </p>
        {content.markets.map((m, i) => (
          <div className="admin-row" key={i}>
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
        <button
          className="admin-add"
          onClick={() =>
            set({
              markets: [
                ...content.markets,
                { symbol: 'R_75', name: 'Volatility 75' },
              ],
            })
          }
        >
          + Add market
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

      <section className="admin-section">
        <h2>Campaigns</h2>
        <p className="admin-muted">
          A campaign is a second version of your home page with its own link.
        </p>
        <p className="admin-muted" style={{ marginTop: 8 }}>
          Say you want to try a different message on WhatsApp. Make a campaign
          called <em>whatsapp</em>, give it its own headline, and share that
          link there instead. Anyone who signs up through it shows up
          separately in your Deriv reports — so after a week you can see which
          message actually worked, and do more of that one.
        </p>
        {Object.entries(content.campaigns).map(([key, c]) => (
          <details key={key} className="campaign">
            <summary>
              <span className="camp-name">{c.name || key}</span>
              <a
                href={`/?c=${encodeURIComponent(key)}`}
                target="_blank"
                rel="noreferrer"
                className="camp-preview"
                onClick={(e) => e.stopPropagation()}
              >
                Open ↗
              </a>
            </summary>
            <ShareLink campaignKey={key} />
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
              'What should this campaign be called?\n\n' +
                'Use one word, letters or dashes only — it becomes part of the ' +
                'link you share. For example "whatsapp" gives you a link ' +
                'ending in ?c=whatsapp'
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

      <Editors />

      <ChangePassword />

      <div className={`savebar ${dirty ? 'on' : ''}`} aria-hidden={!dirty}>
        <span className="savebar-msg">You have unsaved changes</span>
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
];

type EditorRow = { email: string; removable: boolean; isYou: boolean };

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

/** The whole link, ready to paste into WhatsApp — not developer shorthand. */
function ShareLink({ campaignKey }: { campaignKey: string }) {
  const [copied, setCopied] = useState(false);
  // Safe to read window during render: /admin renders "Loading…" on the
  // server, so this component only ever mounts on the client.
  const [href] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/?c=${encodeURIComponent(campaignKey)}`
  );

  return (
    <div className="share">
      <span className="share-lbl">Share this link</span>
      <div className="share-row">
        <code className="share-url">{href || '…'}</code>
        <button
          type="button"
          className="admin-add"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
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
        <span className="preview-tag">This is what people will see</span>
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
