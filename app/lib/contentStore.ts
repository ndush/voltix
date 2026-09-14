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
 * The write path is deliberately not cached. A marketing edit that takes a
 * minute to appear is the thing this storage was chosen to avoid, and the read
 * costs one request against Blob in the same region.
 */
const PATHNAME = 'site-content.json';

export const FALLBACK = bundled as SiteContent;

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readContent(): Promise<{
  content: SiteContent;
  source: 'blob' | 'fallback';
}> {
  if (!blobConfigured()) return { content: FALLBACK, source: 'fallback' };

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
