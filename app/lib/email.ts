/**
 * Sends the sign-in link.
 *
 * Resend is used when RESEND_API_KEY is set. When it is not, the link is
 * written to the server log instead so the flow can be exercised before an
 * email domain exists — visible only to people who can already read Vercel
 * logs, but still a sign-in link, so configure email before real use.
 */
export async function sendMagicLink(
  to: string,
  link: string
): Promise<{ delivered: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  if (!key) {
    console.warn(
      `[admin] RESEND_API_KEY not set. Sign-in link for ${to}: ${link}`
    );
    return { delivered: false, reason: 'email_not_configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your Voltix admin sign-in link',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">
          <h2 style="font-size:18px;margin:0 0 12px">Sign in to Voltix admin</h2>
          <p style="margin:0 0 20px">Click the button below to edit the site content. The link works once and expires in 10 minutes.</p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="background:#ff444f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">Sign in</a>
          </p>
          <p style="margin:0;color:#666;font-size:13px">If you did not ask for this, ignore this email. Nobody can sign in without the link.</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[admin] resend ${res.status}: ${body.slice(0, 300)}`);
    return { delivered: false, reason: 'send_failed' };
  }

  return { delivered: true };
}
