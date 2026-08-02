'use client';

import { Nav } from '@/components/nav';

export default function SettingsPage() {
  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-semibold">Settings</h1>

        <section className="rounded-lg border border-border p-4 space-y-2">
          <h2 className="font-semibold">Mode</h2>
          <p className="text-sm">
            <span className="text-bullish font-medium">SIGNAL_ONLY_MODE</span> — this system never sends
            trade orders to MT5. The EA is compiled without any trading calls.
          </p>
          <p className="text-xs text-muted-foreground">
            Enforced server-side: API refuses to boot if TRADING_EXECUTION_ENABLED=true.
          </p>
        </section>

        <section className="rounded-lg border border-border p-4 space-y-2">
          <h2 className="font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Telegram bot + webhook delivery for CONFIRMED signals, configured via env
            (<code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_CHAT_ID</code>, <code>NOTIFICATION_WEBHOOK_URL</code>).
          </p>
        </section>

        <section className="rounded-lg border border-border p-4 space-y-2">
          <h2 className="font-semibold">Security</h2>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>All MQL5 ingestion endpoints require HMAC-SHA256 signature (timestamp + nonce, 60s skew).</li>
            <li>Replay protection via Redis nonce cache.</li>
            <li>Idempotency-Key dedupe on every batch.</li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          MMXM XAUUSD Signal System — analysis only. Not financial advice. No auto-trading.
        </p>
      </main>
    </>
  );
}
