import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';
import {
  affiliateTokenOrThrow,
  resolveAffiliateToken,
  signupUrl,
  tradingEnabled,
} from '@/app/lib/affiliate';
import { pickCampaign } from '@/app/lib/content';
import { readContent } from '@/app/lib/contentStore';

export async function GET(req: NextRequest) {
  // Referral mode: no OAuth, no session, no return trip. The visitor goes to
  // Deriv carrying the tracking token and signs up there.
  if (!tradingEnabled()) {
    const campaignKey = req.nextUrl.searchParams.get('c');
    const { content } = await readContent();
    const campaign = pickCampaign(content, campaignKey);
    const isNamed = !!campaignKey && campaignKey in content.campaigns;
    const token =
      resolveAffiliateToken(campaign.affiliateToken) ?? affiliateTokenOrThrow();
    return NextResponse.json({
      url: signupUrl(
        token,
        isNamed
          ? campaign.utmCampaign
          : process.env.DERIV_AFFILIATE_CAMPAIGN || campaign.utmCampaign,
        campaign.utmSource
      ),
    });
  }

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Marketing campaign selected by ?c= on the landing page. Its UTM values
  // flow through to Deriv so signups can be told apart in the partner
  // dashboard, and it may carry its own affiliate token.
  const campaignKey = req.nextUrl.searchParams.get('c');
  const { content } = await readContent();
  const campaign = pickCampaign(content, campaignKey);
  const isNamedCampaign = !!campaignKey && campaignKey in content.campaigns;
  const affiliateToken =
    resolveAffiliateToken(campaign.affiliateToken) ?? affiliateTokenOrThrow();

  // Build OAuth URL with affiliate token (reshare attribution)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DERIV_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
    // Deriv documents only trade, account_manage, application_read and
    // payment. It does not document offline_access, and an unsupported scope
    // can fail the whole authorize request, so requesting a refresh token is
    // opt-in via DERIV_REQUEST_OFFLINE_ACCESS rather than on by default.
    scope: process.env.DERIV_REQUEST_OFFLINE_ACCESS === '1'
      ? 'trade account_manage offline_access'
      : 'trade account_manage',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  // ---- RESHARE / AFFILIATE ATTRIBUTION ----
  // Deriv accepts the tracking token under four interchangeable names and
  // asks that exactly one be sent, so only affiliate_token is used.
  if (affiliateToken) params.set('affiliate_token', affiliateToken);
  // A named campaign always wins; DERIV_AFFILIATE_CAMPAIGN is only the
  // baseline for visitors arriving without one.
  params.set(
    'utm_campaign',
    isNamedCampaign
      ? campaign.utmCampaign
      : process.env.DERIV_AFFILIATE_CAMPAIGN || campaign.utmCampaign
  );
  params.set('utm_source', campaign.utmSource);
  // -----------------------------------------

  const url = `${process.env.DERIV_OAUTH_URL}?${params.toString()}`;

  // Store verifier and state in cookies for callback validation
  const response = NextResponse.json({ url });
  response.cookies.set('pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
