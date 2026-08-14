import { PrismaClient } from '@mmxm/database';
import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';
import { runAnalysis } from './analyzer.js';
import { runBacktest } from './backtest-runner.js';

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

  const analysisWorker = new Worker(
    'mmxm-analysis',
    async (job: Job) => {
      if (job.name === 'closed-candle') {
        await runAnalysis(prisma, publish);
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
  // every minute, aligned slightly after candle close
  setInterval(() => void schedule(), 60_000);
  void schedule();

  logger.info('worker started (signal-only)');
}

void main();
