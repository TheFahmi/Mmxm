import { PrismaClient } from '@mmxm/database';
import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';
import { runAnalysis, type LlmVerdictStore } from './analyzer.js';
import { runBacktest } from './backtest-runner.js';
import { trackSignalOutcomes } from './track.js';
import { runTelegramBot, listSubscribers } from './telegram-bot.js';
import { tgBroadcast } from './notify.js';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();

export const analysisQueue = new Queue('mmxm-analysis', { connection: connection as never });
export const backtestQueue = new Queue('mmxm-backtest', { connection: connection as never });

/** Redis publisher mirror of API WS events. */
export function publish(event: string, data: unknown): void {
  void connection.publish('mmxm:ws', JSON.stringify({ event, data }));
}

async function main() {
  // signal-only hard guard (defense in depth — API also checks)
  if (process.env.TRADING_EXECUTION_ENABLED === 'true') {
    throw new Error('TRADING_EXECUTION_ENABLED=true is forbidden: system is signal-only');
  }

  const LLM_VERDICT_KEY = 'mmxm:llm:last-verdict';
  const llmStore: LlmVerdictStore = {
    setLastVerdict: async (v) => {
      await connection.set(LLM_VERDICT_KEY, JSON.stringify(v), 'EX', 4 * 3600);
    },
  };

  const analysisWorker = new Worker(
    'mmxm-analysis',
    async (job: Job) => {
      if (job.name === 'closed-candle') {
        await runAnalysis(prisma, publish, llmStore);
      }
    },
    { connection: connection as never, concurrency: 1 },
  );

  const backtestWorker = new Worker(
    'mmxm-backtest',
    async (job: Job) => {
      if (job.name === 'run') {
        await runBacktest(prisma, job.data as { backtestId: string });
      }
    },
    { connection: connection as never, concurrency: 1 },
  );

  analysisWorker.on('failed', (job, err) => logger.error({ job: job?.id, err }, 'analysis job failed'));
  backtestWorker.on('failed', (job, err) => logger.error({ job: job?.id, err }, 'backtest job failed'));

  // re-analyze shortly after each M5/M15 close; debounced in queue via jobId
  const schedule = async () => {
    await analysisQueue.add(
      'closed-candle',
      {},
      {
        jobId: `analysis-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      },
    );
  };
  // every 10 minutes — Muse 21s/cycle, hemat token 6x
  setInterval(() => void schedule(), 10 * 60_000);
  void schedule();

  // track live signal outcomes against latest tick (1s resolution)
  setInterval(() => void trackSignalOutcomes(prisma, publish), 1_000);
  void trackSignalOutcomes(prisma, publish);

  // Telegram bot: /start /stop /status /menu + subscriber list
  void runTelegramBot(prisma);

  logger.info('worker started (signal-only)');
}

void main();
