import Link from 'next/link';

export function RiskWarning({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`risk ${compact ? 'risk-compact' : ''}`}>
      <strong>Risk warning:</strong> Trading derivatives and synthetic indices
      carries a high level of risk to your capital. Prices can move rapidly
      against you and you can lose your entire stake. These products are not
      suitable for everyone. Never trade with money you cannot afford to lose,
      and make sure you fully understand the risks involved.
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <RiskWarning />
      <p className="affiliate">
        Voltix is an independent affiliate partner of Deriv. We are not a broker
        and we do not hold client funds. Accounts, trades and balances are held
        with Deriv, and we may receive a commission when you open an account or
        trade through links on this site. Deriv&apos;s products are not
        available in all jurisdictions.
      </p>
      <nav className="footer-links">
        <Link href="/terms">Terms of Use</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <a href="https://deriv.com" target="_blank" rel="noopener noreferrer">
          Deriv
        </a>
      </nav>
      <p className="copyright">
        © {new Date().getFullYear()} Voltix. All rights reserved.
      </p>
    </footer>
  );
}
