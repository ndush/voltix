import Link from 'next/link';
import { SiteFooter } from '../components/SiteFooter';

export const metadata = {
  title: 'Privacy Policy — Voltix',
  description: 'How Voltix handles your data',
};

export default function Privacy() {
  return (
    <main>
      <header className="nav">
        <Link href="/" className="logo">
          Voltix
        </Link>
      </header>

      <article className="legal">
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <div className="legal-notice">
          This is a starting template and has not been reviewed by a lawyer.
          Have it checked by qualified counsel before relying on it, especially
          if you serve users in the UK, EU, or another region with statutory
          privacy obligations.
        </div>

        <h2>What we store</h2>
        <p>
          We operate no database and hold no user accounts. When you log in with
          Deriv, the resulting access token is stored in a cookie on your own
          browser, marked <code>httpOnly</code> so page scripts cannot read it,
          and sent only to Deriv when your requests are relayed. We also set a
          short-lived cookie holding the token&apos;s expiry time so the page
          can renew your session before it lapses.
        </p>

        <h2>What we do not do</h2>
        <ul>
          <li>We do not store your Deriv password. We never see it.</li>
          <li>We do not retain your balances, trades, or personal details.</li>
          <li>We do not sell or share your data with advertisers.</li>
        </ul>

        <h2>Deriv</h2>
        <p>
          Your account, funds, trading history and identity documents are held
          by Deriv and governed by Deriv&apos;s privacy policy, not this one. We
          pass an affiliate identifier to Deriv when you sign up so the referral
          can be attributed to us.
        </p>

        <h2>Hosting and logs</h2>
        <p>
          The site is hosted on Vercel, which records standard request logs
          (such as IP address, timestamp and user agent) for operating and
          securing the service. Our server-side error logs may record API
          failure details for debugging; we avoid writing tokens into them.
        </p>

        <h2>Cookies</h2>
        <p>
          We use only the cookies needed to keep you signed in and to protect
          the login flow against cross-site request forgery. We set no
          advertising or analytics cookies.
        </p>

        <h2>Your control</h2>
        <p>
          Logging out clears the session cookies. You can revoke this
          application&apos;s access entirely from your Deriv account settings,
          and clear cookies in your browser at any time.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions about this site, contact the site operator. For
          anything concerning your Deriv account or its data, contact Deriv.
        </p>
      </article>

      <SiteFooter />
    </main>
  );
}
