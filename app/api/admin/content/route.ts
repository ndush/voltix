import { NextResponse, NextRequest } from 'next/server';
import { readSession, SESSION_COOKIE } from '@/app/lib/adminAuth';
import { cookies } from 'next/headers';
import type { SiteContent } from '@/app/lib/content';

const CONTENT_PATH = 'content/site.json';

function ghConfig() {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo || !token) return null;
  return { repo, token, branch };
}

function gh(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * The editor's email.
 *
 * `proxy.ts` already checked the session, but it is verified again here rather
 * than trusting the x-admin-email header it forwards: if the matcher were ever
 * changed and this route stopped being covered, an attacker could otherwise
 * assert an identity simply by setting that header.
 */
async function currentEditor(): Promise<string | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Rejects anything that is not the exact shape the site renders.
 *
 * The form is the only intended caller, but this endpoint writes to the
 * repository, so it validates rather than trusting its input.
 */
function validate(body: unknown): { ok: true; value: SiteContent } | { ok: false; error: string } {
  const str = (v: unknown, max = 400) =>
    typeof v === 'string' && v.length <= max;

  if (!body || typeof body !== 'object') return { ok: false, error: 'not_an_object' };
  const b = body as Record<string, unknown>;

  if (!str(b.brand, 60)) return { ok: false, error: 'brand' };

  if (!Array.isArray(b.markets) || b.markets.length > 12)
    return { ok: false, error: 'markets' };
  for (const m of b.markets) {
    const mm = m as Record<string, unknown>;
    // Deriv symbols only; this value is sent to their API.
    if (typeof mm.symbol !== 'string' || !/^[A-Za-z0-9_]{2,20}$/.test(mm.symbol))
      return { ok: false, error: 'market_symbol' };
    if (!str(mm.name, 60)) return { ok: false, error: 'market_name' };
  }

  if (!Array.isArray(b.features) || b.features.length > 6)
    return { ok: false, error: 'features' };
  for (const f of b.features) {
    const ff = f as Record<string, unknown>;
    if (!str(ff.title, 60) || !str(ff.body, 400))
      return { ok: false, error: 'feature' };
  }

  const checkCampaign = (c: unknown): boolean => {
    const cc = c as Record<string, unknown>;
    return (
      !!cc &&
      str(cc.name, 60) &&
      str(cc.headline, 120) &&
      str(cc.subhead, 400) &&
      str(cc.cta, 60) &&
      (cc.banner === undefined || str(cc.banner, 200)) &&
      str(cc.utmCampaign, 60) &&
      str(cc.utmSource, 60) &&
      (cc.affiliateToken === undefined || str(cc.affiliateToken, 200))
    );
  };

  if (!checkCampaign(b.defaultCampaign))
    return { ok: false, error: 'default_campaign' };

  if (!b.campaigns || typeof b.campaigns !== 'object')
    return { ok: false, error: 'campaigns' };
  const entries = Object.entries(b.campaigns as Record<string, unknown>);
  if (entries.length > 30) return { ok: false, error: 'too_many_campaigns' };
  for (const [key, c] of entries) {
    // The key becomes a ?c= value, so keep it URL-safe.
    if (!/^[a-z0-9_-]{1,40}$/i.test(key))
      return { ok: false, error: `campaign_key:${key}` };
    if (!checkCampaign(c)) return { ok: false, error: `campaign:${key}` };
  }

  return { ok: true, value: body as SiteContent };
}

export async function GET() {
  const editor = await currentEditor();
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cfg = ghConfig();
  if (!cfg)
    return NextResponse.json({ error: 'github_not_configured' }, { status: 503 });

  const res = await fetch(
    `https://api.github.com/repos/${cfg.repo}/contents/${CONTENT_PATH}?ref=${cfg.branch}`,
    { headers: gh(cfg.token), cache: 'no-store' }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`[admin/content] read ${res.status}: ${body.slice(0, 300)}`);
    return NextResponse.json(
      { error: 'read_failed', status: res.status },
      { status: 502 }
    );
  }

  const file = await res.json();
  const decoded = Buffer.from(file.content, 'base64').toString('utf8');
  return NextResponse.json({
    content: JSON.parse(decoded),
    sha: file.sha,
    editor,
  });
}

export async function PUT(req: NextRequest) {
  const editor = await currentEditor();
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cfg = ghConfig();
  if (!cfg)
    return NextResponse.json({ error: 'github_not_configured' }, { status: 503 });

  let payload: { content?: unknown; sha?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const checked = validate(payload.content);
  if (!checked.ok)
    return NextResponse.json(
      { error: 'invalid_content', field: checked.error },
      { status: 400 }
    );

  if (!payload.sha)
    return NextResponse.json({ error: 'sha_required' }, { status: 400 });

  const body = JSON.stringify(checked.value, null, 2) + '\n';

  const res = await fetch(
    `https://api.github.com/repos/${cfg.repo}/contents/${CONTENT_PATH}`,
    {
      method: 'PUT',
      headers: { ...gh(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Attribute the commit to whoever signed in, so the repository
        // history is a real audit trail rather than one shared identity.
        message: `Update site content from admin (${editor})`,
        author: { name: editor.split('@')[0], email: editor },
        content: Buffer.from(body, 'utf8').toString('base64'),
        // Passing the sha we read makes this a compare-and-set: a concurrent
        // edit is rejected rather than silently overwritten.
        sha: payload.sha,
        branch: cfg.branch,
      }),
    }
  );

  if (res.status === 409)
    return NextResponse.json({ error: 'conflict' }, { status: 409 });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[admin/content] write ${res.status}: ${text.slice(0, 300)}`);
    return NextResponse.json(
      { error: 'write_failed', status: res.status },
      { status: 502 }
    );
  }

  const out = await res.json();
  return NextResponse.json({ ok: true, sha: out.content?.sha });
}
