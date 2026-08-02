import { describe, it, expect } from 'vitest';
import { candle, flatSeries, T0, M5_MS } from './helpers';
import { atr, closedOnly } from '../src/measure';
import { findPivots } from '../src/pivots';
import { detectFvgs } from '../src/zones';
import { detectStructure } from '../src/structure';

describe('measure', () => {
  it('closedOnly filters live candles', () => {
    const cs = [...flatSeries(T0, 3, 2000), candle(T0 + 3 * M5_MS, 2000, 2001, 1999, 2000.5, false)];
    expect(closedOnly(cs).length).toBe(3);
  });

  it('atr computes after period', () => {
    const cs = flatSeries(T0, 30, 2000);
    const a = atr(cs, 14);
    expect(a[13]).toBeNull();
    expect(a[14]).not.toBeNull();
    expect(a[29]).toBeGreaterThan(0);
  });
});

describe('pivots', () => {
  it('confirms pivot only after rightBars', () => {
    const cs = [
      candle(T0, 100, 101, 99, 100.5),
      candle(T0 + M5_MS, 100, 105, 99, 104),   // candidate high at idx1
      candle(T0 + 2 * M5_MS, 100, 102, 99, 101),
      candle(T0 + 3 * M5_MS, 100, 101, 99, 100),
      candle(T0 + 4 * M5_MS, 100, 100.5, 99, 100),
    ];
    const pivots = findPivots(cs, 1, 2);
    expect(pivots.some(p => p.index === 1 && p.kind === 'HIGH')).toBe(true);
    // with only 1 right bar, not confirmed
    expect(findPivots(cs.slice(0, 3), 1, 2).length).toBe(0);
  });
});

describe('fvg', () => {
  it('detects bullish fvg above min size', () => {
    const cs = [
      candle(T0, 100, 101, 99, 100),        // a: high 101
      candle(T0 + M5_MS, 101, 104, 100.5, 103), // displacement
      candle(T0 + 2 * M5_MS, 103, 105, 102, 104), // c: low 102 > a.high 101 → gap 101..102
    ];
    const fvgs = detectFvgs(cs, 0.1, 5); // minSize = 0.5
    expect(fvgs.length).toBe(1);
    expect(fvgs[0]!.direction).toBe('BULLISH');
    expect(fvgs[0]!.low).toBe(101);
    expect(fvgs[0]!.high).toBe(102);
  });

  it('skips fvg smaller than min', () => {
    const cs = [
      candle(T0, 100, 100.2, 99, 100),
      candle(T0 + M5_MS, 100, 100.3, 99.9, 100.1),
      candle(T0 + 2 * M5_MS, 100, 100.4, 100.25, 100.3),
    ];
    const fvgs = detectFvgs(cs, 1.0, 5); // minSize 5 → too small
    expect(fvgs.length).toBe(0);
  });

  it('marks mitigated when price trades back', () => {
    const cs = [
      candle(T0, 100, 101, 99, 100),
      candle(T0 + M5_MS, 101, 104, 100.5, 103),
      candle(T0 + 2 * M5_MS, 103, 105, 102, 104),
      candle(T0 + 3 * M5_MS, 104, 104.5, 101.5, 102), // dips into gap
    ];
    const fvgs = detectFvgs(cs, 0.1, 5);
    expect(fvgs[0]!.mitigated).toBe(true);
  });

  it('ignores live candles as evidence', () => {
    const cs = [
      candle(T0, 100, 101, 99, 100),
      candle(T0 + M5_MS, 101, 104, 100.5, 103, false),
      candle(T0 + 2 * M5_MS, 103, 105, 102, 104),
    ];
    expect(detectFvgs(cs, 0.1, 5).length).toBe(0);
  });
});

describe('structure', () => {
  it('detects bullish CHoCH after downtrend', () => {
    // lower highs + lower lows then break above last lower high
    const cs = [
      candle(T0, 110, 112, 109, 109.5),   // 0 high
      candle(T0 + M5_MS, 109, 109.5, 106, 107), // 1
      candle(T0 + 2 * M5_MS, 107, 108, 105, 106), // 2 low
      candle(T0 + 3 * M5_MS, 106, 109, 105.5, 108), // 3 lower high 109
      candle(T0 + 4 * M5_MS, 108, 108, 104, 105),   // 4 lower low
      candle(T0 + 5 * M5_MS, 105, 106, 104.5, 105.5),
      candle(T0 + 6 * M5_MS, 105.5, 106, 104.8, 105.2),
      candle(T0 + 7 * M5_MS, 105.2, 109.5, 105, 109.2), // break above 109
    ];
    const pivots = findPivots(cs, 1, 1);
    const evts = detectStructure(cs, pivots, 'M5', 0.01, 1);
    expect(evts.some(e => e.direction === 'BULLISH' && (e.kind === 'CHOCH' || e.kind === 'MSS' || e.kind === 'BOS'))).toBe(true);
  });

  it('does not use live candle for break evidence', () => {
    const cs = [
      candle(T0, 100, 101, 99, 100),
      candle(T0 + M5_MS, 100, 100.5, 98, 99),
      candle(T0 + 2 * M5_MS, 99, 101.5, 98.5, 101.2, false), // live break — must be ignored
    ];
    const pivots = findPivots(cs, 1, 0); // right=0 so pivot at idx0? force none
    const evts = detectStructure(cs, pivots, 'M5', 0.01, 1);
    expect(evts.length).toBe(0);
  });
});
