import path from 'node:path';

/**
 * Centralised server configuration.
 * All environment-dependent values are read here.
 * Never logs secrets or crashes if optional keys are missing at startup.
 */
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // LLM Engine (Phase 2)
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // TTS Engine (Phase 3 future)
  gnaniApiKey: process.env.GNANI_API_KEY || '',
  gnaniBaseUrl: 'https://api.vachana.ai',

  // Storage
  tempDir: path.resolve(process.env.TEMP_DIR || './tmp'),
  maxUploadSizeMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20', 10),

  // Document Chunking & AI Processing Limits
  maxDocumentWords: parseInt(process.env.MAX_DOCUMENT_WORDS || '40000', 10),
  targetChunkWords: parseInt(process.env.TARGET_CHUNK_WORDS || '1800', 10),
  maxRetries: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
  requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '45000', 10),
} as const;
