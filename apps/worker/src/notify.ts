import type { XauusdSignal } from '@mmxm/types';
import { env } from './env.js';
import { logger } from './logger.js';

/** Fire-and-forget Telegram message. Never throws. */
async function tgSend(text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!r.ok) logger.warn({ status: r.status, body: await r.text() }, 'telegram send failed');
  } catch (e) {
    logger.warn({ err: e }, 'telegram send error');
  }
}

/** Notif sinyal baru — hanya confidence >= TELEGRAM_MIN_CONFIDENCE (default 75). */
export async function notifySignal(signalId: string, sig: XauusdSignal): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    logger.info({ signalId }, 'no notification channels configured');
    return;
  }
  if (sig.confidenceScore < env.TELEGRAM_MIN_CONFIDENCE) {
    logger.info({ signalId, conf: sig.confidenceScore, min: env.TELEGRAM_MIN_CONFIDENCE }, 'telegram skipped: below min confidence');
    return;
  }
  await tgSend(formatSignal(sig));
}

/** Notif event lifecycle dari track.ts (ACTIVE / TPx_HIT / COMPLETED / FAILED / INVALIDATED). */
export async function notifyEvent(
  s: Pick<XauusdSignal, 'direction' | 'preferredEntry' | 'stopLoss' | 'takeProfits'>,
  status: string,
  payload: { level?: number; price?: number; reason?: string },
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const dir = `<b>${s.direction} XAUUSD</b>`;
  const px = (v?: number | string) => Number(v).toFixed(2);
  let text: string | null = null;

  switch (status) {
    case 'ACTIVE':
      text = `▶️ <b>ENTRY AKTIF</b> — ${dir}\n💰 Harga masuk zone @ <code>${px(payload.price)}</code>\n🎯 Preferred entry: <code>${px(s.preferredEntry)}</code>`;
      break;
    case 'TP1_HIT':
      text = `✅ <b>TP1 HIT</b> — ${dir}\n💰 Close 25% @ <code>${px(payload.price)}</code>\n📦 Sisa posisi: <b>75%</b> (pertimbangkan SL ke BE)\n📈 Status: TP1_HIT`;
      break;
    case 'TP2_HIT':
      text = `✅ <b>TP2 HIT</b> — ${dir}\n💰 Close 25% @ <code>${px(payload.price)}</code> (kumulatif 50%)\n📦 Sisa posisi: <b>50%</b>\n📈 Status: TP2_HIT`;
      break;
    case 'COMPLETED':
      text = `🏁 <b>TP3 HIT — TRADE COMPLETE</b> 🏆\n${dir}\n💰 Close sisa 50% @ <code>${px(payload.price)}</code>\n📊 Total ter-close: 25%+25%+50%\n🎉 Full target tercapai`;
      break;
    case 'FAILED':
      text = `🛑 <b>SL HIT</b> — ${dir}\n❌ Close @ <code>${px(payload.price)}</code> (−1R)\n⚠️ Menunggu setup valid berikutnya.`;
      break;
    case 'STOPPED': {
      const hitTp = s.takeProfits.filter(tp => (payload.level ?? 0) >= tp.level).length;
      text = `⚖️ <b>TRAILING STOP</b> — ${dir}\n❌ Close @ <code>${px(payload.price)}</code>\n✅ Pernah hit ${hitTp} TP sebelum stop\n📈 Status: STOPPED`;
      break;
    }
    case 'INVALIDATED':
      text = `🚫 <b>DIBATALKAN</b> — ${dir}\nHarga tembus SL (<code>${px(payload.price)}</code>) sebelum entry.\nSetup tidak valid.`;
      break;
    default:
      return;
  }
  await tgSend(text);
}

/** Notif AI Insight (MMAI verdict) — dikirim hanya kalau sinyal lolos min confidence. */
export async function notifyInsight(
  s: Pick<XauusdSignal, 'direction' | 'confidenceScore'>,
  verdict: string,
  summary: string,
  suggestion?: string,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  if (s.confidenceScore < env.TELEGRAM_MIN_CONFIDENCE) return;
  const icon = verdict === 'AGREE' ? '🤝' : verdict === 'DISAGREE' ? '⚠️' : '🤔';
  const lines = [
    `${icon} <b>AI Insight</b> (${verdict}) — ${s.direction} XAUUSD`,
    `📊 Confidence sinyal: <b>${s.confidenceScore}/100</b>`,
    '',
    `<i>${summary}</i>`,
  ];
  if (suggestion) lines.push('', `💡 ${suggestion}`);
  await tgSend(lines.join('\n'));
}

function formatSignal(s: XauusdSignal): string {
  const tps = s.takeProfits
    .map(tp => `• TP${tp.level}: <code>${tp.price.toFixed(2)}</code> — close ${tp.allocationPercentage}%`)
    .join('\n');
  return [
    `🎯 <b>${s.direction} XAUUSD</b> — ${s.mmxmModel === 'MARKET_MAKER_BUY_MODEL' ? 'MMBM' : 'MMSM'}`,
    `📊 Confidence: <b>${s.confidenceScore}/100</b>`,
    '',
    `📍 Entry zone: <code>${s.entryMin.toFixed(2)} – ${s.entryMax.toFixed(2)}</code>`,
    `🎯 Preferred entry: <code>${s.preferredEntry.toFixed(2)}</code>`,
    `🛑 SL: <code>${s.stopLoss.toFixed(2)}</code>`,
    '',
    'Take Profits (partial close):',
    tps,
    '',
    `RR 1:${s.riskRewardRatio.toFixed(2)} · Bias ${s.higherTimeframeBias}`,
    '',
    '<i>Analysis only. Not financial advice.</i>',
  ].join('\n');
}
