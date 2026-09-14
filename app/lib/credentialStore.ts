import 'server-only';
import { get, put } from '@vercel/blob';
import { blobConfigured } from './contentStore';
import { adminUsers, type AdminUser } from './adminAuth';

/**
 * The editor list, stored outside the environment.
 *
 * ADMIN_USERS is an environment variable, so anything the app changes at
 * runtime — a new password, a new editor — has nowhere to live and forces a
 * Vercel edit plus a redeploy. This document holds those changes instead.
 *
 * Resolution: an entry here wins over the environment entry with the same
 * address, and an entry here with no environment counterpart is simply an
 * additional editor. Environment entries always remain valid, which makes
 * ADMIN_USERS the break-glass route if this document is ever lost or an
 * account is locked out.
 */
const PATHNAME = 'admin-credentials.json';

export type StoredEditor = {
  salt: string;
  hash: string;
  /** Present only for editors added in-app; env editors keep their own. */
  totp?: string;
  changedAt: number;
  addedBy?: string;
};

export type Stored = Record<string, StoredEditor>;

/** An editor as the rest of the app sees them, from either source. */
export type ResolvedEditor = AdminUser & {
  source: 'env' | 'stored';
  removable: boolean;
};

export class CredentialStoreUnavailable extends Error {}

export async function readStored(): Promise<Stored> {
  // No store means nothing can have been written, so the environment list is
  // still the whole truth. Only a store that exists and cannot be read is
  // dangerous to treat as empty.
  if (!blobConfigured()) return {};

  try {
    const found = await get(PATHNAME, { access: 'private' });
    if (!found || found.statusCode !== 200 || !found.stream) return {};
    const parsed = JSON.parse(await new Response(found.stream).text());
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch (err) {
    console.error('[credentials] read failed', err);
    throw new CredentialStoreUnavailable('cannot read editor store');
  }
}

async function writeStored(next: Stored): Promise<void> {
  await put(PATHNAME, JSON.stringify(next, null, 2), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

/**
 * Everyone who may sign in, from both sources.
 *
 * A stored entry overrides the environment entry with the same address; a
 * stored entry with no counterpart is an extra editor. Environment editors are
 * marked unremovable, because deleting them here would not revoke them.
 */
export async function resolveEditors(): Promise<ResolvedEditor[]> {
  const stored = await readStored();
  const env = adminUsers();
  const byEmail = new Map<string, ResolvedEditor>();

  for (const u of env) {
    const email = u.email.toLowerCase();
    const s = stored[email];
    byEmail.set(email, {
      email: u.email,
      salt: s?.salt ?? u.salt,
      hash: s?.hash ?? u.hash,
      totp: s?.totp ?? u.totp,
      source: 'env',
      removable: false,
    });
  }

  for (const [email, s] of Object.entries(stored)) {
    if (byEmail.has(email)) continue;
    // Without a TOTP secret there is no second factor, so such an entry is
    // unusable and is skipped rather than silently weakening sign-in.
    if (!s.totp) continue;
    byEmail.set(email, {
      email,
      salt: s.salt,
      hash: s.hash,
      totp: s.totp,
      source: 'stored',
      removable: true,
    });
  }

  return [...byEmail.values()];
}

export async function upsertEditor(
  email: string,
  entry: StoredEditor
): Promise<void> {
  const current = await readStored();
  await writeStored({ ...current, [email.toLowerCase()]: entry });
}

export async function removeEditor(email: string): Promise<void> {
  const current = await readStored();
  delete current[email.toLowerCase()];
  await writeStored(current);
}
