import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Minimal OpenAI-compatible chat client for the DeepSeek gateway
 * (https://llm.mfah.me/v1). Used to verify rule-engine signals and add
 * human-readable insight. Never blocks the analysis loop: any failure is
 * caught and logged, signal is kept regardless.
 */

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

const MAX_TOKENS = 2000;

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

  const body = {
    model: env.DEEPSEEK_MODEL,
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
      logger.warn({ status: res.status, body: (await res.text()).slice(0, 200) }, 'llm verify failed');
      return null;
    }
    const data = (await res.json()) as {
      choices: { message: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      logger.warn('llm empty content');
      return null;
    }
    // strip markdown fences if present
    const cleaned = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as LlmInsight;
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
