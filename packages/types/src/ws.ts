export const WS_EVENTS = {
  TICK_UPDATED: 'xauusd.tick.updated',
  CANDLE_UPDATED: 'xauusd.candle.updated',
  CANDLE_CLOSED: 'xauusd.candle.closed',
  STRUCTURE_UPDATED: 'xauusd.structure.updated',
  LIQUIDITY_SWEPT: 'xauusd.liquidity.swept',
  MMXM_STAGE_CHANGED: 'xauusd.mmxm.stage.changed',
  SIGNAL_PRELIMINARY: 'xauusd.signal.preliminary',
  SIGNAL_CONFIRMED: 'xauusd.signal.confirmed',
  SIGNAL_ACTIVE: 'xauusd.signal.active',
  SIGNAL_INVALIDATED: 'xauusd.signal.invalidated',
  SIGNAL_COMPLETED: 'xauusd.signal.completed',
  TERMINAL_STATUS_CHANGED: 'mql5.terminal.status.changed',
  DATA_GAP_DETECTED: 'mql5.data.gap.detected',
} as const;
export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
