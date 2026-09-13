/**
 * Best-effort login throttle.
 *
 * State is in memory, so on serverless it is per-instance: an attacker
 * spreading attempts across cold starts sees a weaker limit than the numbers
 * below suggest. It is a speed bump, not the security boundary — TOTP is.
 * Making it exact would need shared storage (Redis, Vercel KV).
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type Entry = { count: number; first: number; lockedUntil?: number };
const attempts = new Map<string, Entry>();

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (attempts.size < 500) return;
  for (const [key, e] of attempts) {
    if ((e.lockedUntil ?? 0) < now && now - e.first > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

export function checkLocked(key: string): number | null {
  const now = Date.now();
  const e = attempts.get(key);
  if (!e?.lockedUntil) return null;
  if (e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
  attempts.delete(key);
  return null;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return;
  }
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) e.lockedUntil = now + LOCKOUT_MS;
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}
