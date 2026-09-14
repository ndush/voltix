import 'server-only';
import { get, put } from '@vercel/blob';
import bundled from '@/content/site.json';
import type { SiteContent } from './content';

/**
 * Where the editable site content lives.
 *
 * Content is a single JSON document in Vercel Blob. The copy committed at
 * `content/site.json` is the fallback: it ships with the build, so the site
 * renders correctly before anyone has saved anything and if Blob is briefly
 * unreachable.
 *
 * Reads are uncached.
 *
 * They were cached and invalidated on write, but revalidateTag did not clear
 * an unstable_cache entry under Next 16 — a saved edit stayed invisible on the
 * public page for up to the five minute backstop, which is indistinguishable
 * from the editor being broken. An editor who cannot trust Save is worse than
 * a few extra reads.
 *
 * The cost is one Blob operation per page view, against a 10k monthly
 * allowance. Worth revisiting with a caching approach that demonstrably
 * invalidates, but not at the price of correctness.
 */
const PATHNAME = 'site-content.json';

export const FALLBACK = bundled as SiteContent;

/**
 * Whether a Blob store is reachable.
 *
 * Vercel connects stores over OIDC by default, which sets BLOB_STORE_ID and no
 * long-lived token — the SDK mints short-lived credentials itself at runtime.
 * A store connected the older way instead exposes BLOB_READ_WRITE_TOKEN, so
 * both are accepted. Checking only for the token reports a perfectly healthy
 * OIDC connection as missing.
 */
export function blobConfigured(): boolean {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

async function fetchContent(): Promise<{
  content: SiteContent;
  source: 'blob' | 'fallback';
}> {
  try {
    const found = await get(PATHNAME, { access: 'private' });
    // Null means nothing has been saved yet, which is the normal state on a
    // fresh deployment rather than an error.
    if (!found || found.statusCode !== 200 || !found.stream) {
      return { content: FALLBACK, source: 'fallback' };
    }
    const text = await new Response(found.stream).text();
    return { content: JSON.parse(text) as SiteContent, source: 'blob' };
  } catch (err) {
    // Never let a storage problem take the marketing site down; serve the
    // committed copy and make the failure visible in the logs.
    console.error('[content] blob read failed, serving bundled copy', err);
    return { content: FALLBACK, source: 'fallback' };
  }
}

export async function readContent(): Promise<{
  content: SiteContent;
  source: 'blob' | 'fallback';
}> {
  if (!blobConfigured()) return { content: FALLBACK, source: 'fallback' };
  return fetchContent();
}

export async function writeContent(content: SiteContent): Promise<void> {
  await put(PATHNAME, JSON.stringify(content, null, 2), {
    // Private: only this app's server reads the document, so there is no
    // reason to expose it on a public URL. Campaigns may carry their own
    // affiliate token, which does not belong in a publicly fetchable file.
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    // The page reads this on every request, so a cached copy would defeat the
    // instant-save behaviour.
    cacheControlMaxAge: 0,
  });

}
