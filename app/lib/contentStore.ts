import 'server-only';
import { get, put } from '@vercel/blob';
import { revalidateTag, unstable_cache } from 'next/cache';
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
 * Reads are cached and invalidated on save rather than fetched per request.
 * Reading per request cost one Blob operation per page view — 10k views would
 * exhaust the monthly free allowance — and paid a round trip to the store's
 * region on every render. Invalidating on write keeps saves instant while
 * making ordinary traffic free.
 *
 * `unstable_cache` rather than the `use cache` directive that replaces it:
 * `use cache` requires enabling Cache Components, which changes rendering
 * semantics across the whole app. Not worth that for one cached read.
 */
const PATHNAME = 'site-content.json';
const CACHE_TAG = 'site-content';

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

const cachedRead = unstable_cache(fetchContent, ['site-content'], {
  tags: [CACHE_TAG],
  // A backstop only: a save invalidates the tag immediately. This just bounds
  // how long a missed invalidation could serve stale copy.
  revalidate: 300,
});

export async function readContent(): Promise<{
  content: SiteContent;
  source: 'blob' | 'fallback';
}> {
  if (!blobConfigured()) return { content: FALLBACK, source: 'fallback' };
  return cachedRead();
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

  // Expire immediately rather than the recommended 'max' profile: 'max' serves
  // stale content while revalidating behind it, so an editor would save, reload
  // and see their old copy. `updateTag` gives read-your-own-writes but only
  // works in Server Actions, and this is a Route Handler.
  revalidateTag(CACHE_TAG, { expire: 0 });
}
