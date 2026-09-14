import { NextResponse, NextRequest } from 'next/server';
import { readSession, SESSION_COOKIE } from '@/app/lib/adminAuth';
import { cookies } from 'next/headers';
import type { SiteContent } from '@/app/lib/content';
import { blobConfigured, readContent, writeContent } from '@/app/lib/contentStore';

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

  if (!blobConfigured())
    return NextResponse.json({ error: 'blob_not_configured' }, { status: 503 });

  const { content, source } = await readContent();
  // `source` tells the editor whether they are looking at saved content or the
  // copy that shipped with the build, which is otherwise indistinguishable.
  return NextResponse.json({ content, source, editor });
}

export async function PUT(req: NextRequest) {
  const editor = await currentEditor();
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!blobConfigured())
    return NextResponse.json({ error: 'blob_not_configured' }, { status: 503 });

  let payload: { content?: unknown };
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

  try {
    await writeContent(checked.value);
  } catch (err) {
    console.error(`[admin/content] write failed for ${editor}`, err);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  console.log(`[admin/content] saved by ${editor}`);
  return NextResponse.json({ ok: true });
}
