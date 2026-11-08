/**
 * Common, provider-agnostic interface for Large Language Model integrations.
 * Allows swapping between Gemini, Anthropic, OpenAI, or local models without rewriting business logic.
 */

export interface LLMGenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMProvider {
  /** Identifier name of the provider (e.g. 'gemini', 'mock'). */
  readonly name: string;

  /** Configured model name (e.g. 'gemini-3.8-flash'). */
  readonly modelName: string;

  /** Returns true if required API credentials are present in the environment. */
  isConfigured(): boolean;

  /** Generates free-form textual output from a prompt. */
  generateText(prompt: string, options?: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * Generates strictly validated structured JSON output conforming to a target schema.
   * Cleans potential Markdown code fences and parses JSON safely.
   */
  generateStructuredJSON<T>(
    prompt: string,
    schemaDescription: string,
    options?: LLMGenerateOptions,
  ): Promise<T>;
}
