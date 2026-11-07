import { LLMProvider, LLMGenerateOptions, LLMResponse } from './llm-provider.interface.js';

export interface MockHandler {
  (prompt: string, options?: LLMGenerateOptions): Promise<any> | any;
}

/**
 * Mock LLM provider for deterministic offline testing and CI environments.
 */
export class MockLLMProvider implements LLMProvider {
  public readonly name = 'mock';
  public readonly modelName = 'mock-test-model';
  public customHandler?: MockHandler;

  constructor(handler?: MockHandler) {
    this.customHandler = handler;
  }

  public isConfigured(): boolean {
    return true;
  }

  public async generateText(prompt: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
    if (this.customHandler) {
      const result = await this.customHandler(prompt, options);
      if (typeof result === 'string') {
        return { text: result };
      }
      return { text: JSON.stringify(result) };
    }
    return { text: 'Mock response generated successfully.' };
  }

  public async generateStructuredJSON<T>(
    prompt: string,
    _schemaDescription: string,
    options?: LLMGenerateOptions,
  ): Promise<T> {
    if (this.customHandler) {
      const result = await this.customHandler(prompt, options);
      if (typeof result === 'object' && result !== null) {
        return result as T;
      }
      return JSON.parse(result) as T;
    }
    throw new Error('MockLLMProvider requires a customHandler returning valid JSON object.');
  }
}
