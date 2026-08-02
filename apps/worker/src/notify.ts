import type { XauusdSignal } from '@mmxm/types';
import { env } from './env';
import { logger } from './logger';

/** Fire-and-forget signal notifications. Never throws. */
export async function notifySignal(signalId: string, sig: XauusdSignal): Promise<void> {
  const text = formatSignal(sig);
  const jobs: Promise<unknown>[] = [];

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      }).then(async r => {
        if (!r.ok) logger.warn({ status: r.status, body: await r.text() }, 'telegram send failed');
      }),
    );
  }

  if (env.NOTIFICATION_WEBHOOK_URL) {
    jobs.push(
      fetch(env.NOTIFICATION_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId, text, signal: sig }),
      }).then(r => {
        if (!r.ok) logger.warn({ status: r.status }, 'webhook send failed');
      }),
    );
  }

  if (jobs.length === 0) {
    logger.info({ signalId }, 'no notification channels configured');
    return;
  }
  await Promise.allSettled(jobs);
}

function formatSignal(s: XauusdSignal): string {
  const tps = s.takeProfits.map(tp => `TP${tp.level}: ${tp.price.toFixed(2)} (${tp.allocationPercentage}%)`).join('\n');
  return [
    `<b>${s.direction} XAUUSD</b> — ${s.mmxmModel === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM'}`,
    `Entry: ${s.preferredEntry.toFixed(2)}`,
    `SL: ${s.stopLoss.toFixed(2)}`,
    tps,
    `RR 1:${s.riskRewardRatio.toFixed(2)} · Confidence ${s.confidenceScore}/100`,
    '',
    '<i>Analysis only. Not financial advice. No auto-trading.</i>',
  ].join('\n');
}
