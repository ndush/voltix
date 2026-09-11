import Link from 'next/link';
import { SiteFooter } from '../components/SiteFooter';

export const metadata = {
  title: 'Terms of Use — Voltix',
  description: 'Terms governing use of the Voltix site',
};

export default function Terms() {
  return (
    <main>
      <header className="nav">
        <Link href="/" className="logo">
          Voltix
        </Link>
      </header>

      <article className="legal">
        <h1>Terms of Use</h1>
        <p className="updated">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <div className="legal-notice">
          This is a starting template and has not been reviewed by a lawyer. Have
          it checked by qualified counsel in your jurisdiction before relying on
          it.
        </div>

        <h2>1. What Voltix is</h2>
        <p>
          Voltix is an independent interface to Deriv&apos;s trading API. We are
          not a broker, dealer, or financial institution. We do not hold your
          funds, execute trades on our own account, or act as counterparty to
          any contract. All accounts, balances, orders and settlements are held
          and performed by Deriv under Deriv&apos;s own terms.
        </p>

        <h2>2. No investment advice</h2>
        <p>
          Nothing on this site is investment, financial, legal or tax advice, or
          a recommendation to enter any transaction. Prices, payouts and
          contract details are supplied by Deriv and shown for convenience.
          Decisions you make are your own.
        </p>

        <h2>3. Risk</h2>
        <p>
          Trading derivatives and synthetic indices carries a high level of risk
          to your capital. You can lose your entire stake. Past performance does
          not indicate future results. Do not trade with money you cannot afford
          to lose.
        </p>

        <h2>4. Affiliate relationship</h2>
        <p>
          We participate in Deriv&apos;s partner programme and may receive a
          commission when you open an account or trade through this site. This
          does not change the price you pay. It is disclosed so you can weigh
          any conflict of interest.
        </p>

        <h2>5. Eligibility</h2>
        <p>
          You must be of legal age in your jurisdiction and permitted to use
          Deriv&apos;s services there. Deriv restricts access in some countries.
          Confirming your own eligibility is your responsibility.
        </p>

        <h2>6. Availability</h2>
        <p>
          The service is provided as-is, without warranty. We do not guarantee
          uninterrupted access, accurate or timely market data, or successful
          order execution. Market data and connectivity depend on Deriv and on
          your own network.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          To the extent permitted by law, we are not liable for trading losses,
          missed opportunities, or damages arising from use of this site,
          including outages, delayed data, or failed or duplicated orders.
        </p>

        <h2>8. Your account</h2>
        <p>
          You authorise this site to act on your Deriv account only through the
          permissions you grant at login. You can revoke that access at any time
          from your Deriv account settings. Keep your credentials secure.
        </p>

        <h2>9. Changes</h2>
        <p>
          These terms may change. Continued use after a change means you accept
          the revised terms.
        </p>
      </article>

      <SiteFooter />
    </main>
  );
}
