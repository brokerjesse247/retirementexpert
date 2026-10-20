import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'RetirementExpert | Your Retirement, Expertly Planned', template: '%s | RetirementExpert' },
  description: 'A guided retirement-planning intake and private advisor workspace from LSRT Insurance.',
  robots: { index: false, follow: false },
  icons: { icon: '/brand.svg' }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link className="wordmark" href="/" aria-label="RetirementExpert planning home">Retirement<strong>Expert<span>.si</span></strong></Link>
      <nav aria-label="Main navigation" className="top-nav"><Link href="/">How it works</Link><Link href="/privacy">Privacy</Link></nav>
      <Link href="/login" className="button button-secondary header-login">Advisor log in</Link>
    </div></header>
    <main id="main">{children}</main>
    <footer className="site-footer"><div><Link href="/" className="wordmark">Retirement<strong>Expert<span>.si</span></strong></Link><p className="muted">LSRT Insurance · Your Retirement, Expertly Planned</p></div><div className="footer-links"><Link href="/privacy">Privacy notice</Link><Link href="/login">Advisor access</Link><a href="https://retirementexpert.si/">Main website ↗</a></div><p className="footer-disclaimer">Educational and illustrative planning only. Not tax, legal, or investment advice. Projections are not guarantees; consult qualified professionals. No Social Security numbers or account numbers are requested.</p></footer>
  </body></html>;
}
