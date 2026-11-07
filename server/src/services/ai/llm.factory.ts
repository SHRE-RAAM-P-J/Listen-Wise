import { LLMProvider } from './providers/llm-provider.interface.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { MockLLMProvider } from './providers/mock.provider.js';

export type SupportedProviderType = 'gemini' | 'mock';

export class LLMFactory {
  private static defaultProviderInstance: LLMProvider | null = null;

  /**
   * Returns the primary configured LLM provider (defaults to Gemini).
   */
  public static getProvider(providerType: SupportedProviderType = 'gemini'): LLMProvider {
    if (providerType === 'gemini') {
      if (!this.defaultProviderInstance || this.defaultProviderInstance.name !== 'gemini') {
        this.defaultProviderInstance = new GeminiProvider();
      }
      return this.defaultProviderInstance;
    }

    if (providerType === 'mock') {
      return new MockLLMProvider();
    }

    throw new Error(`Unsupported LLM provider: ${providerType}`);
  }

  /**
   * Overrides the default provider instance (useful for unit tests and integration tests).
   */
  public static setProvider(provider: LLMProvider): void {
    this.defaultProviderInstance = provider;
  }

  /**
   * Resets default provider instance.
   */
  public static resetProvider(): void {
    this.defaultProviderInstance = null;
  }
}
