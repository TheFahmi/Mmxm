import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CONFIG = {
  symbol: 'XAUUSD',
  higherTimeframes: ['H4', 'H1'],
  setupTimeframe: 'M15',
  confirmationTimeframe: 'M5',
  precisionTimeframe: 'M1',
  atrPeriod: 14,
  pivotLeftBars: 3,
  pivotRightBars: 3,
  minimumDisplacementBodyAtr: 1.2,
  minimumDisplacementRangeAtr: 1.8,
  minimumFvgAtr: 0.25,
  equalHighLowToleranceAtr: 0.15,
  sweepPenetrationAtr: 0.1,
  structureBreakBufferAtr: 0.05,
  stopLossBufferAtr: 0.5,
  minimumConfidence: 75,
  minimumRiskReward: 2.0,
  maximumSpreadPoints: null,
  maximumSignalAgeMinutes: 240,
  maxSetupAgeCandlesM15: 12,
  maxConfirmationAgeCandlesM5: 24,
};

async function main() {
  const strategy = await prisma.strategyDefinition.upsert({
    where: { name: 'MMXM XAUUSD v1' },
    update: {},
    create: {
      name: 'MMXM XAUUSD v1',
      description: 'ICT Market Maker Buy/Sell Model on XAUUSD. HTF bias H4+H1, setup M15, confirmation M5, precision M1. Signal-only.',
    },
  });

  const existing = await prisma.strategyVersion.findFirst({
    where: { strategyId: strategy.id, version: '1.0.0' },
  });
  if (!existing) {
    await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: '1.0.0',
        config: DEFAULT_CONFIG,
        isActive: true,
      },
    });
    console.log('seeded strategy version 1.0.0 (active)');
  } else {
    console.log('strategy version 1.0.0 already exists');
  }
}

main().finally(() => prisma.$disconnect());
