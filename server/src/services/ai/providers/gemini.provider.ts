import { GoogleGenAI } from '@google/genai';
import { LLMProvider, LLMGenerateOptions, LLMResponse } from './llm-provider.interface.js';
import { config } from '../../../config.js';
import { AppError } from '../../../middleware/error-handler.js';

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  public readonly modelName: string;
  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.modelName = modelName || config.geminiModel || 'gemini-2.5-flash';
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
    const maxRetries = config.maxRetries;
    const timeoutMs = options?.timeoutMs || config.requestTimeoutMs;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new AppError(`Gemini request timed out after ${timeoutMs / 1000}s`, 504, 'AI_TIMEOUT')), timeoutMs),
        );

        const genConfig: any = {
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxOutputTokens,
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

        const response: any = await Promise.race([callPromise, timeoutPromise]);
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

        return { text, usage };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || '';

        // Check for rate limit or quota exceeded
        const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
        const isTransient = isRateLimit || errMsg.includes('503') || errMsg.includes('ECONNRESET');

        if (isTransient && attempt < maxRetries) {
          const backoffMs = (attempt + 1) * 2000;
          console.warn(`[GeminiProvider] Transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${backoffMs}ms:`, errMsg);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        if (err instanceof AppError) throw err;

        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('invalid api key')) {
          throw new AppError('The configured GEMINI_API_KEY is invalid.', 401, 'INVALID_API_KEY');
        }

        throw new AppError(`Gemini AI generation failed: ${errMsg}`, 502, 'AI_PROVIDER_ERROR');
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
