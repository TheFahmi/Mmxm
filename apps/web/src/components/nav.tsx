'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { setToken } from '@/lib/api';

const NAV = [
 { href: '/dashboard', label: 'Dashboard' },
 { href: '/chart/xauusd', label: 'Chart' },
 { href: '/signals', label: 'Signals' },
 { href: '/simulasi', label: 'Simulasi' },
 { href: '/strategy', label: 'Strategy' },
 { href: '/backtests', label: 'Backtests' },
 { href: '/data-source', label: 'Data Source' },
 { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function logout() {
    setToken(null);
    router.replace('/login');
  }

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/dashboard" className="font-bold tracking-tight whitespace-nowrap">
          MMXM <span className="text-primary">XAUUSD</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-4 text-sm text-muted-foreground">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className="hover:text-foreground transition-colors whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </nav>

        <span className="ml-auto hidden md:inline text-xs text-muted-foreground">Analysis only. Not financial advice.</span>

        {/* Desktop logout */}
        <button
          onClick={logout}
          className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Keluar"
        >
          <LogOut className="h-3.5 w-3.5" />
          Keluar
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden ml-auto p-2 -mr-2 rounded-md hover:bg-muted text-foreground"
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <nav className="md:hidden border-t border-border bg-background/95 backdrop-blur">
          {NAV.map(n => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-b border-border/50"
            >
              {n.label}
            </Link>
          ))}
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-b border-border/50"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
          <p className="px-4 py-3 text-xs text-muted-foreground">Analysis only. Not financial advice.</p>
        </nav>
      )}
    </header>
  );
}
