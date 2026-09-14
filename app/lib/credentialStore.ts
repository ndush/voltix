import 'server-only';
import { get, put } from '@vercel/blob';
import { blobConfigured } from './contentStore';

/**
 * Password overrides.
 *
 * ADMIN_USERS is an environment variable, so the app cannot rewrite it — a
 * password changed at runtime has nowhere to live. This document holds a
 * replacement hash per editor, layered over the env entry at sign-in.
 *
 * ADMIN_USERS remains authoritative for *who* may sign in and for the TOTP
 * secret. Removing someone there still revokes them, override or not.
 */
const PATHNAME = 'admin-credentials.json';

export type Override = { salt: string; hash: string; changedAt: number };
export type Overrides = Record<string, Override>;

export class CredentialStoreUnavailable extends Error {}

/**
 * Returns the overrides, or an empty set if none have ever been written.
 *
 * Throws when the store cannot be reached. Callers must fail closed on that:
 * treating an unreadable store as "no overrides" would quietly re-accept a
 * password the user had already replaced.
 */
export async function readOverrides(): Promise<Overrides> {
  // No store means no override can ever have been written, so the environment
  // credentials are still the whole truth. Only a store that exists and cannot
  // be reached is dangerous to ignore.
  if (!blobConfigured()) return {};

  try {
    const found = await get(PATHNAME, { access: 'private' });
    if (!found) return {};
    if (found.statusCode !== 200 || !found.stream) return {};
    const text = await new Response(found.stream).text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Overrides) : {};
  } catch (err) {
    console.error('[credentials] override read failed', err);
    throw new CredentialStoreUnavailable('cannot read credential overrides');
  }
}

export async function writeOverride(
  email: string,
  override: Override
): Promise<void> {
  const current = await readOverrides();
  const next: Overrides = { ...current, [email.toLowerCase()]: override };
  await put(PATHNAME, JSON.stringify(next, null, 2), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}
