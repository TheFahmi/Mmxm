import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT_API: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MQL5_API_KEY: z.string().min(8),
  MQL5_API_SECRET: z.string().min(16),
  MQL5_TIMESTAMP_SKEW_SECONDS: z.coerce.number().default(30),
  MQL5_NONCE_TTL_SECONDS: z.coerce.number().default(60),
  MQL5_MAX_PAYLOAD_BYTES: z.coerce.number().default(1_048_576),
  TRADING_EXECUTION_ENABLED: z.enum(['true','false']).default('false').transform(v => v === 'true'),
  SIGNAL_ONLY_MODE: z.enum(['true','false']).default('true').transform(v => v === 'true'),
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid env', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

// Hard safety: this system NEVER trades.
if (parsed.data.TRADING_EXECUTION_ENABLED || !parsed.data.SIGNAL_ONLY_MODE) {
  throw new Error('Trading execution must stay disabled. TRADING_EXECUTION_ENABLED=false, SIGNAL_ONLY_MODE=true');
}

export const env = parsed.data;
