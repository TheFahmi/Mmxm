import Link from 'next/link';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chart/xauusd', label: 'Chart' },
  { href: '/signals', label: 'Signals' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/backtests', label: 'Backtests' },
  { href: '/data-source', label: 'Data Source' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/dashboard" className="font-bold tracking-tight">
          MMXM <span className="text-yellow-500">XAUUSD</span>
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className="hover:text-foreground transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">Analysis only. Not financial advice.</span>
      </div>
    </header>
  );
}
