import { config } from '../../config.js';
import { AppError } from '../../middleware/error-handler.js';
import { LessonValidatorService } from '../ai/lesson-validator.service.js';
import { performance } from 'node:perf_hooks';
import { WavUtils } from './wav-utils.js';
import { TempStorageService } from '../storage/temp-storage.service.js';
import { Lesson, LessonChapter, AudioSegment, LessonAudioResult } from '../../models/lesson.js';

export interface GnaniTtsOptions {
  voice?: string;
  language?: string;
  speed?: number;
  sampleRate?: number;
  mockMode?: boolean;
}

export class GnaniTtsService {
  private static readonly ENDPOINT = `${config.gnaniBaseUrl}/api/v1/tts/inference`;
  private static readonly DEFAULT_VOICE = 'Nalini';
  private static readonly DEFAULT_LANGUAGE = 'en-IN';
  private static readonly MAX_CHUNK_CHARS = 450; // Gnani Timbre safe per-request chunk limit

  /**
   * Checks whether the Gnani API key is configured in backend environment.
   */
  public static isConfigured(): boolean {
    return Boolean(config.gnaniApiKey && config.gnaniApiKey.trim());
  }

  /**
   * Splits a long text script into conversational chunks at punctuation boundaries.
   */
  public static splitScriptIntoChunks(text: string, maxChars: number = GnaniTtsService.MAX_CHUNK_CHARS): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxChars) return [trimmed];

    // Split on sentence boundaries
    const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [trimmed];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;

      if (!currentChunk) {
        if (s.length <= maxChars) {
          currentChunk = s;
        } else {
          // Sentence itself exceeds maxChars, split by commas or words
          const words = s.split(/\s+/);
          let subChunk = '';
          for (const w of words) {
            if (!subChunk) {
              subChunk = w;
            } else if (subChunk.length + w.length + 1 <= maxChars) {
              subChunk += ' ' + w;
            } else {
              chunks.push(subChunk);
              subChunk = w;
            }
          }
          if (subChunk) currentChunk = subChunk;
        }
      } else if (currentChunk.length + s.length + 1 <= maxChars) {
        currentChunk += ' ' + s;
      } else {
        chunks.push(currentChunk);
        currentChunk = s;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Generates binary WAV audio for a single text segment using Gnani Timbre v2.5.
   */
  public static async synthesizeTextSegment(text: string, options?: GnaniTtsOptions): Promise<Buffer> {
    const isMock = options?.mockMode ?? (!this.isConfigured() && config.isDev);

    // Mock Mode fallback for deterministic testing and development without credentials
    if (isMock) {
      const estimatedWords = text.trim().split(/\s+/).length;
      const durationSeconds = Math.max(1.2, Number((estimatedWords / 2.5).toFixed(2))); // ~150 words per minute
      return WavUtils.createSyntheticWav(durationSeconds);
    }

    if (!this.isConfigured()) {
      throw new AppError(
        'GNANI_API_KEY is not configured. Please set GNANI_API_KEY in server/.env to enable speech synthesis.',
        503,
        'MISSING_GNANI_API_KEY',
      );
    }

    const payload = {
      text: text.trim(),
      voice: options?.voice || this.DEFAULT_VOICE,
      model: 'timbre-v2.5',
      language: options?.language || this.DEFAULT_LANGUAGE,
      speed: options?.speed || 1.0,
      audio_config: {
        encoding: 'linear_pcm',
        container: 'wav',
        num_channels: 1,
        sample_rate: options?.sampleRate || 24000,
        sample_width: 2,
      },
    };

    const maxRetries = config.maxRetries;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        const res = await fetch(this.ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key-ID': config.gnaniApiKey.trim(),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const status = res.status;
          if (status === 401 || status === 403) {
            throw new AppError('Invalid or unauthorized GNANI_API_KEY. Please verify your credentials in server/.env.', 401, 'INVALID_GNANI_KEY');
          }
          if (status === 402) {
            throw new AppError('Insufficient credits on your Gnani AI account. Please top up your account.', 402, 'INSUFFICIENT_CREDITS');
          }
          if (status === 429) {
            if (attempt < maxRetries) {
              const backoff = (attempt + 1) * 2500;
              console.warn(`[GnaniTTS] Rate limited (429). Retrying in ${backoff}ms...`);
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            throw new AppError('Gnani AI Timbre rate limit exceeded. Please wait a moment before retrying.', 429, 'RATE_LIMIT_EXCEEDED');
          }
          if (status >= 500 || status === 408) {
            throw new AppError('Gnani audio service is temporarily unavailable. Retry audio; your lesson is preserved.', 503, 'TTS_SERVICE_ERROR');
          }
          throw new AppError(`Gnani could not synthesize this audio request (HTTP ${status}). Check the lesson text and retry audio.`, 502, 'TTS_REQUEST_REJECTED');
        }

        // Response is documented binary WAV audio
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        // Verify valid WAV signature
        WavUtils.parseWav(buffer);
        return buffer;
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err;
        if (err instanceof AppError) throw err;

        if (err.name === 'AbortError') {
          throw new AppError(`Gnani TTS request timed out after ${Math.ceil(config.requestTimeoutMs / 1000)} seconds. Retry audio; your lesson is preserved.`, 504, 'TTS_TIMEOUT');
        }

        if (attempt < maxRetries) {
          console.warn(`[GnaniTTS] Transient network error (attempt ${attempt + 1}), retrying...`, err.message);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        throw new AppError('Could not connect to the Gnani audio service after retrying. Check the server network and retry audio; your lesson is preserved.', 502, 'TTS_NETWORK_ERROR');
      }
    }

    throw lastError;
  }

  /**
   * Synthesizes audio for an entire chapter script, handling chunking and seamless merging.
   */
  public static async synthesizeChapter(
    chapter: LessonChapter,
    options?: GnaniTtsOptions,
  ): Promise<Buffer> {
    const textToSynthesize = chapter.teachingScript.trim();
    if (!textToSynthesize) {
      throw new AppError(`Chapter "${chapter.title}" has an empty teaching script.`, 400, 'EMPTY_CHAPTER_SCRIPT');
    }

    const chunks = this.splitScriptIntoChunks(textToSynthesize);
    console.log(`[GnaniTTS] Synthesizing chapter "${chapter.title}" (${chunks.length} chunk${chunks.length === 1 ? '' : 's'})...`);

    // Process chunk requests sequentially to respect provider limits
    const wavBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const wav = await this.synthesizeTextSegment(chunkText, options);
      wavBuffers.push(wav);
    }

    return WavUtils.mergeWavBuffers(wavBuffers);
  }

  /**
   * Generates audio for all chapters of a lesson sequentially, stores audio files temporarily,
   * and returns playable audio segment references and metadata.
   */
  public static async generateLessonAudio(
    lesson: Lesson,
    options?: GnaniTtsOptions,
  ): Promise<LessonAudioResult> {
    LessonValidatorService.assertPassed(lesson.validation, lesson.documentTitle);

    if (!lesson.chapters || lesson.chapters.length === 0) {
      throw new AppError('The lesson contains no chapters for audio generation.', 400, 'NO_CHAPTERS_TO_SYNTHESIZE');
    }

    const lessonId = lesson.id || `lesson-${Date.now()}`;
    const audioStartedAt = performance.now();
    const audioSegments: AudioSegment[] = [];
    let totalDurationSeconds = 0;

    console.log(`\n🎧 [GnaniTTS] Starting audio synthesis for lesson: "${lesson.documentTitle}" (${lesson.chapters.length} chapters)...`);

    // Process each chapter sequentially
    for (let idx = 0; idx < lesson.chapters.length; idx++) {
      const chapter = lesson.chapters[idx];
      const chapterIndex = chapter.index || idx + 1;
      const chapterTitle = chapter.title || `Chapter ${chapterIndex}`;
      const chapterStartedAt = performance.now();

      try {
        // Synthesize binary audio
        const wavBuffer = await this.synthesizeChapter(chapter, options);

        // Parse duration and metadata from binary WAV
        const meta = WavUtils.parseWav(wavBuffer);

        // Store temporarily
        const { fileName, filePath } = TempStorageService.saveChapterAudio(lessonId, chapterIndex, wavBuffer);

        // Construct playable audio reference URL
        const audioUrl = `/api/tts/audio/${lessonId}/${fileName}`;

        const segment: AudioSegment = {
          chapterId: chapter.id,
          chapterIndex,
          chapterTitle,
          audioUrl,
          audioPath: filePath,
          durationSeconds: meta.durationSeconds,
          fileSizeBytes: wavBuffer.length,
          format: 'wav',
          status: 'completed',
          createdAt: new Date().toISOString(),
        };

        // Attach to chapter
        chapter.audioSegment = segment;
        chapter.estimatedDurationSeconds = meta.durationSeconds;
        audioSegments.push(segment);
        totalDurationSeconds += meta.durationSeconds;

        console.log(`  ✅ Chapter ${chapterIndex} completed: "${chapterTitle}" (${meta.durationSeconds}s, ${Math.round(wavBuffer.length / 1024)} KB)`);
        console.info(`[Timing] Audio synthesis for chapter ${chapterIndex} completed in ${Math.round(performance.now() - chapterStartedAt)}ms.`);
      } catch (err: any) {
        console.info(`[Timing] Audio synthesis for chapter ${chapterIndex} failed after ${Math.round(performance.now() - chapterStartedAt)}ms.`);
        console.info(`[Timing] Lesson audio request failed after ${Math.round(performance.now() - audioStartedAt)}ms.`);
        console.error(`  ❌ Failed to generate audio for Chapter ${chapterIndex}:`, err.message);
        const failedSegment: AudioSegment = {
          chapterId: chapter.id,
          chapterIndex,
          chapterTitle,
          audioUrl: '',
          audioPath: '',
          durationSeconds: 0,
          fileSizeBytes: 0,
          format: 'wav',
          status: 'failed',
          error: err.message,
          createdAt: new Date().toISOString(),
        };
        chapter.audioSegment = failedSegment;
        audioSegments.push(failedSegment);
        throw err; // Stop and report failure — never mark chapter completed prematurely
      }
    }

    const allCompleted = audioSegments.every((s) => s.status === 'completed');
    console.info(`[Timing] Lesson audio synthesis completed in ${Math.round(performance.now() - audioStartedAt)}ms.`);

    return {
      lessonId,
      totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)),
      audioSegments,
      allChaptersCompleted: allCompleted,
      createdAt: new Date().toISOString(),
    };
  }
}
