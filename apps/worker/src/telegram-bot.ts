import { PrismaClient } from '@mmxm/database';
import { env } from './env.js';
import { logger } from './logger.js';
import { tgSendToChat, tgGetMe, tgSendButton } from './notify.js';

const MENU = `🤖 <b>MMXM Signal Bot</b>
Sinyal XAUUSD + AI Insight, partial close 25/25/50.

<b>Perintah:</b>
/start — daftar & terima sinyal
/stop — berhenti terima sinyal
/status — cek langganan
/menu — tampilkan menu ini

Sinyal dikirim otomatis (confidence ≥ ${env.TELEGRAM_MIN_CONFIDENCE}):
🎯 sinyal baru · ▶️ entry aktif · ✅ TP hit · 🏁 complete · 🛑 SL hit · 🤝 AI Insight`;

// Burger menu: tombol total 3 (maks bot menu).
const BURGER: { text: string; reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } } = {
  text: '🍔 Menu',
  reply_markup: {
    inline_keyboard: [[
      { text: '📊 Sinyal', callback_data: 'menu:signal' },
      { text: 'ℹ️ Status', callback_data: 'menu:status' },
      { text: '❌ Berhenti', callback_data: 'menu:stop' },
    ]],
  },
};

const isSubscribed = async (prisma: PrismaClient, cid: string): Promise<boolean> => {
  const rows = await prisma.$queryRawUnsafe<{ chatId: string }[]>(
    `SELECT "chatId" FROM "telegram_subscribers" WHERE "chatId" = $1`,
    cid,
  );
  return rows.length > 0;
};

export async function sendMenu(prisma: PrismaClient, cid: string): Promise<void> {
  await tgSendToChat(MENU, cid);
  await tgSendButton('🍔 <b>Menu</b> — pilih aksi:', cid, BURGER.reply_markup);
}

/** Register commands ke tombol ☰ (burger menu) Telegram — sekali saat startup. */
export async function registerCommands(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const commands = [
    { command: 'menu', description: '📋 Buka menu' },
    { command: 'status', description: 'ℹ️ Cek langganan sinyal' },
    { command: 'start', description: '✅ Daftar terima sinyal' },
    { command: 'stop', description: '🛑 Berhenti terima sinyal' },
  ];
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
    const j = (await r.json()) as { ok: boolean };
    logger.info({ ok: j.ok }, 'telegram setMyCommands');
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'telegram setMyCommands failed');
  }
}

async function handleMessage(prisma: PrismaClient, chatId: string | number, text: string): Promise<void> {
  const cid = String(chatId);
  const cmd = (text ?? '').trim().split(/\s+/)[0] ?? '';

  switch (cmd) {
    case '/start': {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "telegram_subscribers" ("chatId", "createdAt") VALUES ($1, now()) ON CONFLICT ("chatId") DO NOTHING`,
        cid,
      );
      await tgSendToChat(`✅ Kamu terdaftar! Sinyal confidence ≥ ${env.TELEGRAM_MIN_CONFIDENCE} akan dikirim ke sini.\n\n${MENU}`, cid);
      await tgSendButton('🍔 <b>Menu</b> — pilih aksi:', cid, BURGER.reply_markup);
      break;
    }
    case '/stop': {
      await prisma.$executeRawUnsafe(`DELETE FROM "telegram_subscribers" WHERE "chatId" = $1`, cid);
      await tgSendToChat('🛑 Berhenti. Kamu tidak akan menerima sinyal lagi. Ketik /start kapan saja untuk kembali.', cid);
      break;
    }
    case '/status': {
      const active = await isSubscribed(prisma, cid);
      await tgSendToChat(active ? '✅ Status: <b>AKTIF</b> — kamu menerima sinyal.' : '❌ Status: <b>TIDAK AKTIF</b> — ketik /start untuk daftar.', cid);
      break;
    }
    case '/menu': {
      await sendMenu(prisma, cid);
      break;
    }
    default:
      await tgSendToChat('Perintah tidak dikenal. Ketik /menu untuk daftar perintah.', cid);
  }
}

/** Handle tap tombol inline keyboard (callback query). */
async function handleCallback(prisma: PrismaClient, chatId: string | number, callbackData: string, messageId: number): Promise<void> {
  const cid = String(chatId);
  switch (callbackData) {
    case 'menu:signal': {
      await tgSendToChat('📊 Daftar perintah sinyal:\n\n/start — daftar terima sinyal\n/stop — berhenti\n/status — cek langganan\n/on — aktifkan notif TP/SL', cid);
      break;
    }
    case 'menu:status': {
      const active = await isSubscribed(prisma, cid);
      await tgSendToChat(active ? '✅ Status: <b>AKTIF</b> — kamu menerima sinyal.' : '❌ Status: <b>TIDAK AKTIF</b> — ketik /start untuk daftar.', cid);
      break;
    }
    case 'menu:stop': {
      await prisma.$executeRawUnsafe(`DELETE FROM "telegram_subscribers" WHERE "chatId" = $1`, cid);
      await tgSendToChat('🛑 Berhenti. Kamu tidak akan menerima sinyal lagi.', cid);
      break;
    }
    default:
      break;
  }
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: '', },),
    });
  } catch { /* ignore */ }
}

/** Polling getUpdates — handle pesan + callback query inline keyboard. */
export async function runTelegramBot(prisma: PrismaClient): Promise<void> {
  const me = await tgGetMe();
  if (!me.ok) {
    logger.warn('telegram bot polling disabled (getMe failed)');
    return;
  }
  logger.info({ username: me.username }, 'telegram bot polling started');
  await registerCommands();

  let offset = 0;
  const poll = async () => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=25&offset=${offset}`);
      const j = (await r.json()) as {
        ok: boolean;
        result: {
          update_id: number;
          message?: { chat?: { id: number }; text?: string };
          callback_query?: { id: string; message?: { chat?: { id: number }; message_id?: number }; data?: string };
        }[];
      };
      if (!j.ok) return;
      for (const u of j.result) {
        offset = Math.max(offset, u.update_id + 1);
        if (u.callback_query) {
          const cq = u.callback_query;
          if (cq.message?.chat?.id && cq.data) {
            void handleCallback(prisma, cq.message.chat.id, cq.data, cq.message.message_id ?? 0);
          }
          continue;
        }
        const m = u.message;
        if (!m?.chat?.id) continue;
        void handleMessage(prisma, m.chat.id, m.text ?? '');
      }
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'telegram poll error');
    }
  };
  setInterval(() => void poll(), 3_000);
  void poll();
}

/** Ambil semua chatId subscriber aktif. */
export async function listSubscribers(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ chatId: string }[]>(`SELECT "chatId" FROM "telegram_subscribers" ORDER BY "createdAt"`);
  return rows.map(r => r.chatId);
}