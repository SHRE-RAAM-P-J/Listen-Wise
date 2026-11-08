import { GoogleGenAI } from '@google/genai';
import { LLMProvider, LLMGenerateOptions, LLMResponse } from './llm-provider.interface.js';
import { config } from '../../../config.js';
import { AppError } from '../../../middleware/error-handler.js';
import { performance } from 'node:perf_hooks';

const MAX_TRANSIENT_RETRIES = 1;

export function calculateRetryDelayMs(attempt: number, baseDelayMs: number, random: () => number = Math.random): number {
  const exponentialDelay = baseDelayMs * (2 ** attempt);
  return exponentialDelay + Math.floor(random() * Math.max(1, exponentialDelay * 0.5));
}

type GeminiFailureKind =
  | 'authentication'
  | 'permission'
  | 'quota'
  | 'unavailable-model'
  | 'timeout'
  | 'rate-limit'
  | 'server'
  | 'invalid-request'
  | 'network'
  | 'other';

function classifyGeminiFailure(err: unknown): { kind: GeminiFailureKind; status?: number } {
  const error = err as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    cause?: { code?: string; message?: string };
  };
  const statusValue = Number(error?.status ?? error?.statusCode);
  const status = Number.isFinite(statusValue) && statusValue > 0 ? statusValue : undefined;
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
  const code = `${error?.code || ''} ${error?.cause?.code || ''}`.toUpperCase();

  if (
    status === 401 ||
    /api[_ ]key[_ ]invalid|invalid api key|api key not valid|unauthenticated/.test(message)
  ) {
    return { kind: 'authentication', status };
  }
  if (status === 403) return { kind: 'permission', status };
  if (status === 404 || /model[^\n]*(not found|unavailable|does not exist)/.test(message)) {
    return { kind: 'unavailable-model', status };
  }
  if (
    status === 408 ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    code.includes('ETIMEDOUT') ||
    code.includes('UND_ERR_CONNECT_TIMEOUT') ||
    /timed? ?out|timeout|aborted/.test(message)
  ) {
    return { kind: 'timeout', status };
  }
  if (/quota|billing|insufficient_quota|daily limit|exceeded your current plan/.test(message)) {
    return { kind: 'quota', status };
  }
  if (status === 429 || /rate.?limit|too many requests|requests per minute/.test(message)) {
    return { kind: 'rate-limit', status };
  }
  if (status !== undefined && status >= 500) return { kind: 'server', status };
  if (status === 400 || status === 422) return { kind: 'invalid-request', status };
  if (/ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/.test(code) || /fetch failed/.test(message)) {
    return { kind: 'network', status };
  }
  return { kind: 'other', status };
}

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  public readonly modelName: string;
  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.modelName = modelName || config.geminiModel || 'gemini-3.8-flash';
    if (config.geminiApiKey && config.geminiApiKey.trim()) {
      this.client = new GoogleGenAI({ apiKey: config.geminiApiKey.trim() });
    }
  }

  public isConfigured(): boolean {
    return Boolean(config.geminiApiKey && config.geminiApiKey.trim());
  }

  private ensureConfigured(): GoogleGenAI {
    if (!this.isConfigured() || !this.client) {
      throw new AppError(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in server/.env to use the AI Understanding Engine.',
        503,
        'MISSING_GEMINI_API_KEY',
      );
    }
    return this.client;
  }

  /**
   * Cleans model output by stripping markdown JSON fences (```json ... ```).
   */
  public cleanJsonOutput(raw: string): string {
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    // Also handle trailing or leading junk outside braces/brackets
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else {
      startIdx = Math.max(firstBrace, firstBracket);
    }

    if (startIdx > 0) {
      cleaned = cleaned.substring(startIdx);
    }

    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);
    if (endIdx !== -1 && endIdx < cleaned.length - 1) {
      cleaned = cleaned.substring(0, endIdx + 1);
    }

    return cleaned;
  }

  public async generateText(prompt: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
    const ai = this.ensureConfigured();
    const timeoutMs = options?.timeoutMs || config.requestTimeoutMs;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      const startedAt = performance.now();
      try {
        const genConfig: any = {
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxOutputTokens,
          httpOptions: {
            timeout: timeoutMs,
            // Keep retries in this provider so the total retry count is explicit and bounded.
            retryOptions: { attempts: 1 },
          },
        };

        if (options?.systemInstruction) {
          genConfig.systemInstruction = options.systemInstruction;
        }

        if (options?.responseMimeType) {
          genConfig.responseMimeType = options.responseMimeType;
        }

        const callPromise = ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: genConfig,
        });

        const response: any = await callPromise;
        const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!text || !text.trim()) {
          throw new AppError('Gemini returned an empty response.', 502, 'EMPTY_AI_RESPONSE');
        }

        const usage = response?.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount,
              candidatesTokens: response.usageMetadata.candidatesTokenCount,
              totalTokens: response.usageMetadata.totalTokenCount,
            }
          : undefined;

        console.info(`[Timing] Gemini request completed in ${Math.round(performance.now() - startedAt)}ms.`);
        return { text, usage };
      } catch (err: unknown) {
        console.warn(`[Timing] Gemini request failed after ${Math.round(performance.now() - startedAt)}ms.`);
        lastError = err;
        const failure = classifyGeminiFailure(err);
        const retryable = ['timeout', 'rate-limit', 'server', 'network'].includes(failure.kind);

        if (retryable && attempt < MAX_TRANSIENT_RETRIES) {
          const delayMs = calculateRetryDelayMs(attempt, config.geminiRetryBaseDelayMs);
          console.warn(`[GeminiProvider] Transient ${failure.kind} error; retrying once after ${delayMs}ms.`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        if (failure.kind === 'authentication') {
          throw new AppError(
            'Gemini rejected the API key or its permissions. Verify GEMINI_API_KEY in server/.env.',
            failure.status || 401,
            'INVALID_API_KEY',
          );
        }
        if (failure.kind === 'permission') {
          throw new AppError(
            'Gemini denied this API key permission to use the configured model. Check the key permissions and model access.',
            403,
            'GEMINI_PERMISSION_DENIED',
          );
        }
        if (failure.kind === 'unavailable-model') {
          throw new AppError(
            `Gemini model "${this.modelName}" is unavailable to this API key. Check GEMINI_MODEL and model access.`,
            404,
            'GEMINI_MODEL_UNAVAILABLE',
          );
        }
        if (failure.kind === 'timeout') {
          throw new AppError(
            `Gemini request timed out after ${Math.ceil(timeoutMs / 1000)}s. Try again or reduce the source length.`,
            504,
            'AI_TIMEOUT',
          );
        }
        if (failure.kind === 'rate-limit') {
          throw new AppError('Gemini rate limits were reached. Wait briefly, then try again.', 429, 'GEMINI_RATE_LIMITED');
        }
        if (failure.kind === 'quota') {
          throw new AppError('Gemini quota is exhausted for this project. Check billing and model quota before retrying.', 429, 'GEMINI_QUOTA_EXHAUSTED');
        }
        if (failure.kind === 'server') {
          throw new AppError('Gemini is temporarily unavailable. Try generating the lesson again.', 503, 'GEMINI_SERVICE_UNAVAILABLE');
        }
        if (failure.kind === 'invalid-request') {
          throw new AppError('Gemini rejected the request. Check the source content and generation settings.', failure.status || 400, 'INVALID_GEMINI_REQUEST');
        }
        if (failure.kind === 'network') {
          throw new AppError('Could not connect to Gemini after one retry. Check the server network and try again.', 502, 'GEMINI_NETWORK_ERROR');
        }
        if (err instanceof AppError) throw err;
        throw new AppError('Gemini generation failed unexpectedly. Try again later.', 502, 'AI_PROVIDER_ERROR');
      }
    }

    throw lastError;
  }

  public async generateStructuredJSON<T>(
    prompt: string,
    schemaDescription: string,
    options?: LLMGenerateOptions,
  ): Promise<T> {
    const fullPrompt = `${prompt}

OUTPUT FORMAT REQUIREMENT:
You MUST respond ONLY with valid JSON conforming to the following specification:
${schemaDescription}

Do NOT wrap the output in markdown code fences. Do NOT include any introductory or concluding text. Respond ONLY with the raw JSON object.`;

    const response = await this.generateText(fullPrompt, {
      ...options,
      responseMimeType: 'application/json',
      temperature: options?.temperature ?? 0.1, // low temperature for structured factual conformity
    });

    const cleaned = this.cleanJsonOutput(response.text);

    try {
      const parsed = JSON.parse(cleaned);
      return parsed as T;
    } catch (parseErr: any) {
      // Attempt repair retry if JSON was slightly truncated or malformed
      console.warn('[GeminiProvider] Initial JSON parse failed, attempting controlled repair...', parseErr.message);
      
      const repairPrompt = `The following output was supposed to be valid JSON conforming to:
${schemaDescription}

However, JSON.parse failed with error: "${parseErr.message}".
Here is the text that failed to parse:
${cleaned}

Repair and return ONLY the completely valid, well-formed JSON object.`;

      const repairResponse = await this.generateText(repairPrompt, {
        ...options,
        temperature: 0.0,
        responseMimeType: 'application/json',
      });

      const secondCleaned = this.cleanJsonOutput(repairResponse.text);
      try {
        const repaired = JSON.parse(secondCleaned);
        return repaired as T;
      } catch (finalErr: any) {
        throw new AppError(
          `Failed to parse model output into valid structured JSON: ${finalErr.message}`,
          502,
          'INVALID_AI_JSON_OUTPUT',
        );
      }
    }
  }
}
