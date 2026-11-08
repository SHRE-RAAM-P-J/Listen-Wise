import { Router, Request, Response, NextFunction } from 'express';
import { LessonGeneratorService } from '../services/ai/lesson-generator.service.js';
import { extractFromUrl } from '../services/extraction/html-extractor.js';
import { extractFromPastedText } from '../services/extraction/text-extractor.js';
import { StructuredContent } from '../models/structured-content.js';
import { AppError } from '../middleware/error-handler.js';
import { performance } from 'node:perf_hooks';

const router: Router = Router();

/**
 * POST /api/lessons/generate
 * (also mounted at /api/lesson/generate for consistency)
 *
 * Accepts either:
 * - A pre-extracted Canonical Content Representation (CCR) under `content` or `structuredContent`
 * - An extraction request under `url` or `text` to run extraction + AI generation in one seamless call
 */
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, structuredContent, url, text, title } = req.body;

    let targetDocument: StructuredContent;

    if (content || structuredContent) {
      targetDocument = content || structuredContent;
      if (!targetDocument.title || !Array.isArray(targetDocument.sections)) {
        throw new AppError(
          'Invalid canonical content structure. Must contain a title and sections array.',
          400,
          'INVALID_STRUCTURED_CONTENT',
        );
      }
    } else if (url && typeof url === 'string') {
      console.log('[LessonRoute] Extracting URL source.');
      targetDocument = await extractFromUrl(url.trim());
    } else if (text && typeof text === 'string') {
      console.log('[LessonRoute] Extracting text content first');
      targetDocument = extractFromPastedText(text, { customTitle: title });
    } else {
      throw new AppError(
        'Request must include either "content" (CCR object), "url", or "text".',
        400,
        'MISSING_GENERATION_SOURCE',
      );
    }

    console.log(`[LessonRoute] Generating lesson for: "${targetDocument.title}" (~${targetDocument.wordCount} words)`);
    const generationStartedAt = performance.now();
    let lesson;
    try {
      lesson = await LessonGeneratorService.generateLesson(targetDocument);
    } finally {
      console.info(`[Timing] Lesson generation request completed in ${Math.round(performance.now() - generationStartedAt)}ms.`);
    }

    res.json({
      success: true,
      data: lesson,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
