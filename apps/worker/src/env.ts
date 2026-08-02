import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENGINE_VERSION: z.string().default('mmxm-v1.0.0'),
  ANALYSIS_DEBOUNCE_MS: z.coerce.number().default(5_000),
  MIN_CANDLES_M15: z.coerce.number().default(120),
  MIN_CANDLES_M5: z.coerce.number().default(200),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NOTIFICATION_WEBHOOK_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
