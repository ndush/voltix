/**
 * Resolves the Deriv affiliate token.
 *
 * Partners are given a tracking link, not a bare token, and the difference is
 * not obvious: the link is what you share with people, while the token is the
 * value inside it that Deriv attributes signups to. To avoid that trap,
 * DERIV_AFFILIATE_TOKEN accepts either form.
 *
 * A tracking link redirects to a Deriv page carrying the token as `t`,
 * `affiliate_token`, `sidi` or `ca` — four interchangeable names, of which
 * Deriv says to send exactly one.
 */
const TOKEN_PARAMS = ['t', 'affiliate_token', 'sidi', 'ca'];

export function resolveAffiliateToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) return value;

  // A full URL was supplied. Pull the token out if it is already present.
  try {
    const url = new URL(value);
    for (const p of TOKEN_PARAMS) {
      const found = url.searchParams.get(p);
      if (found) return found;
    }
  } catch {
    return null;
  }

  // A click-tracking link (partner-tracking.deriv.com/click?a=...) carries no
  // token until it redirects, and resolving it here would mean a network call
  // on every login. Ask for the resolved token instead.
  return null;
}

export function affiliateTokenOrThrow(): string | null {
  const resolved = resolveAffiliateToken(process.env.DERIV_AFFILIATE_TOKEN);
  if (!resolved && process.env.DERIV_AFFILIATE_TOKEN) {
    console.error(
      '[affiliate] DERIV_AFFILIATE_TOKEN looks like a tracking link with no ' +
        'token in it. Open the link in a browser and copy the "t" value from ' +
        'the URL you land on. Signups will not be attributed until this is fixed.'
    );
  }
  return resolved;
}

/**
 * Whether the in-site trading screen is available.
 *
 * Off by default. A referral site sends people to Deriv to trade there, which
 * is a materially different regulatory position from operating a screen that
 * places their trades. Turning this on is a deliberate act, not a default.
 */
export function tradingEnabled(): boolean {
  return process.env.TRADING_ENABLED === '1';
}

/**
 * Where the reshare button sends people.
 *
 * Deriv's documented partner signup URL (hub.deriv.com/tradershub/signup) now
 * 301s to their marketing homepage, which keeps the token but drops the
 * visitor somewhere they have to hunt for a signup form.
 *
 * Their own tracking link lands on the real form but overwrites utm_campaign
 * with the value configured on the link, which would collapse every campaign
 * into one and defeat the point of having them.
 *
 * This is the page the tracking link ends on, addressed directly: a real
 * signup form, the token intact, and our own campaign tag preserved. Verified
 * against all three.
 */
export function signupUrl(token: string | null, campaign: string, source: string): string {
  const base =
    process.env.DERIV_SIGNUP_URL || 'https://home.deriv.com/dashboard/signup';
  const params = new URLSearchParams();
  if (token) params.set('t', token);
  params.set('utm_campaign', campaign);
  params.set('utm_source', source);
  params.set('utm_medium', 'affiliate');
  return `${base}?${params.toString()}`;
}
