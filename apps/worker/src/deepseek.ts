import { env } from './env.js';
import { logger } from './logger.js';
import { getNewsForLLM } from './news.js';

/**
 * Minimal OpenAI-compatible chat client for the DeepSeek gateway
 * (https://llm.mfah.me/v1). Used to verify rule-engine signals and add
 * human-readable insight. Never blocks the analysis loop: any failure is
 * caught and logged, signal is kept regardless.
 */

export interface LlmSignal {
  direction: 'LONG' | 'SHORT' | 'NONE';
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  confidence: number;
  mmxmModel: string | null;
  htfBias: string;
  reasons: { code: string; description: string; weight: number }[];
  summary: string;
}

/**
 * LLM-first signal detection: DeepSeek analyzes recent candles and returns a
 * structured trade setup (or NONE). Used when the rule engine finds nothing
 * (e.g. sparse data). Never blocks the loop — returns null on any failure.
 */
export async function detectSignalWithLlm(
  recentCandles: { open: number; high: number; low: number; close: number; openTime: string }[],
  currentPrice: number,
): Promise<LlmSignal | null> {
  if (!env.DEEPSEEK_ENABLED) return null;

  // Fetch high-impact USD news for context
  const newsContext = await getNewsForLLM();

  const system = `You are a senior XAUUSD ICT/MMXM signal analyst. Analyze the given M15 candles and return STRICT JSON only, NO extra text:
{
  "direction": "LONG" | "SHORT" | "NONE",
  "entry": number,
  "stopLoss": number,
  "takeProfits": [number],
  "confidence": 0-100,
  "mmxmModel": "MARKET_MAKER_BUY_MODEL" | "MARKET_MAKER_SELL_MODEL",
  "htfBias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "reasons": [{"code": string, "description": string, "weight": number}],
  "summary": string
}
If no valid setup, return {"direction":"NONE", ...empty}. Entry/SL/TP must be real prices near current price. Max 4 take profits.

Position management rule (fixed, do not output): partial close plan is TP1=25%, TP2=25%, TP3=remaining 50%. Place TPs at logical liquidity levels (swing high/low, session extremes, round numbers), not arbitrary distances.

${newsContext}`;

  const user = JSON.stringify({
    candles: recentCandles,
    currentPrice,
  });

  const fallbackModels = [env.DEEPSEEK_MODEL, ...env.DEEPSEEK_FALLBACK_MODELS.split(',').map(s => s.trim()).filter(Boolean)].filter((v, i, a) => a.indexOf(v) === i);
  let rawContent = '';
  let lastErr: string | null = null;
  for (const model of fallbackModels) {
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), env.DEEPSEEK_TIMEOUT_MS);
      const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = `detect ${model} ${res.status}`;
        logger.warn({ status: res.status, model }, 'llm detect failed, trying fallback');
        continue;
      }
      const data = (await res.json()) as { choices: { message: { content?: string; reasoning_content?: string } }[] };
      rawContent = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.message?.reasoning_content ?? '';
      if (!rawContent || rawContent.includes('[CommandCode error')) {
        lastErr = `detect ${model} 503/empty`;
        logger.warn({ model, preview: rawContent.slice(0, 120) }, 'llm detect 503/empty, trying fallback');
        rawContent = '';
        continue;
      }
      if (model !== fallbackModels[0]) logger.info({ model }, 'llm detect fallback succeeded');
      break;
    } catch (e) {
      lastErr = `detect ${model} ${e instanceof Error ? e.message : String(e)}`;
      logger.warn({ err: lastErr }, 'llm detect error, trying fallback');
      continue;
    }
  }
  if (!rawContent) {
    if (lastErr) logger.warn({ err: lastErr }, 'llm detect all models failed');
    return null;
  }
  try {
    logger.debug({ raw: rawContent.slice(0, 500) }, 'llm raw response');
    const cleaned = rawContent.replace(/```json|```/g, '').trim();
    // model kadang tambah teks di luar JSON — ambil objek terluar saja
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as LlmSignal;
    if (!parsed.direction) return null;
    logger.debug({ dir: parsed.direction, entry: parsed.entry, sl: parsed.stopLoss, conf: parsed.confidence }, 'llm parsed signal');
    // always return the verdict — NONE carries reasons for "why no trade" display
    return parsed;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'llm detect error');
    return null;
  }
}

export interface LlmInsight {
  verdict: 'AGREE' | 'DISAGREE' | 'NEUTRAL';
  summary: string;
  keyLevels: string[];
  risks: string[];
  suggestion: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX_TOKENS = 3000;

export async function verifySignalWithLlm(payload: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  takeProfits: number[];
  confidence: number;
  htfBias: string;
  reasons: string[];
  recentCandles: { open: number; high: number; low: number; close: number; openTime: string }[];
}): Promise<LlmInsight | null> {
  if (!env.DEEPSEEK_ENABLED) return null;

  const system = `You are a senior gold (XAUUSD) analyst. You are given an ICT/MMXM rule-based signal. Verify it against the recent M15 candles and return STRICT JSON:
{
  "verdict": "AGREE" | "DISAGREE" | "NEUTRAL",
  "summary": "2-3 sentence plain-language summary",
  "keyLevels": ["array of key price levels"],
  "risks": ["array of risk factors"],
  "suggestion": "one actionable suggestion"
}
Reply with ONLY the JSON object, no markdown, no commentary.`;

  const user = JSON.stringify(payload);

  const fallbackModels = [env.DEEPSEEK_MODEL, ...env.DEEPSEEK_FALLBACK_MODELS.split(',').map(s => s.trim()).filter(Boolean)].filter((v, i, a) => a.indexOf(v) === i);
  let content = '';
  let lastErr2: string | null = null;
  for (const model of fallbackModels) {
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ] as ChatMessage[],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), env.DEEPSEEK_TIMEOUT_MS);
      const res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr2 = `verify ${model} ${res.status}`;
        logger.warn({ status: res.status, model }, 'llm verify failed, trying fallback');
        continue;
      }
      const data = (await res.json()) as { choices: { message: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content ?? '';
      if (!content || content.includes('[CommandCode error')) {
        lastErr2 = `verify ${model} 503/empty`;
        logger.warn({ model, preview: content.slice(0, 120) }, 'llm verify 503/empty, trying fallback');
        content = '';
        continue;
      }
      if (model !== fallbackModels[0]) logger.info({ model }, 'llm verify fallback succeeded');
      break;
    } catch (e) {
      lastErr2 = `verify ${model} ${e instanceof Error ? e.message : String(e)}`;
      logger.warn({ err: lastErr2 }, 'llm verify error, trying fallback');
      continue;
    }
  }
  if (!content) {
    if (lastErr2) logger.warn({ err: lastErr2 }, 'llm verify all models failed');
    return null;
  }
  try {
    // strip markdown fences if present
    const cleaned = content.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as LlmInsight;
    if (!parsed.verdict || !parsed.summary) {
      logger.warn({ parsed }, 'llm unexpected shape');
      return null;
    }
    return parsed;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'llm verify error');
    return null;
  }
}
