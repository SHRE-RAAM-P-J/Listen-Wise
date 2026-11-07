import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { GnaniTtsService } from '../services/tts/gnani-tts.service.js';
import { TempStorageService } from '../services/storage/temp-storage.service.js';
import { AppError } from '../middleware/error-handler.js';
import { Lesson } from '../models/lesson.js';

const router: Router = Router();

/**
 * POST /api/tts/generate
 * Generates audio for each chapter in a lesson.
 */
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lesson, text, options } = req.body;

    if (lesson) {
      const audioResult = await GnaniTtsService.generateLessonAudio(lesson as Lesson, options);
      res.json({
        success: true,
        data: audioResult,
      });
      return;
    }

    if (text && typeof text === 'string') {
      const syntheticChapter = {
        id: 'single-sample',
        index: 1,
        title: req.body.title || 'Audio Sample',
        overview: 'Sample audio segment',
        conceptsCovered: [],
        teachingScript: text,
        transitionToNext: '',
        sourceReferences: [],
      };

      const singleLesson: Lesson = {
        id: `sample-${Date.now()}`,
        documentTitle: req.body.title || 'Audio Sample',
        subject: 'Audio Sample',
        purpose: 'Synthesis Test',
        lessonOverview: 'Synthesis Test',
        keyConcepts: [],
        chapters: [syntheticChapter],
        completeLessonScript: text,
        validation: {
          sourceCoverage: 'passed',
          coverageScore: 1,
          unsupportedClaims: [],
          warnings: [],
          coveredSectionTitles: [],
          missingSectionTitles: [],
        },
        createdAt: new Date().toISOString(),
      };

      const audioResult = await GnaniTtsService.generateLessonAudio(singleLesson, options);
      res.json({
        success: true,
        data: audioResult,
      });
      return;
    }

    throw new AppError('Request must include either "lesson" or "text".', 400, 'MISSING_TTS_PAYLOAD');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tts/audio/:lessonId/:filename
 * Streams/serves temporary binary WAV audio with HTTP 206 Range support.
 */
router.get('/audio/:lessonId/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const lessonId = String(req.params.lessonId || '');
    const filename = String(req.params.filename || '');
    if (!lessonId || !filename) {
      throw new AppError('Lesson ID and filename are required.', 400, 'INVALID_AUDIO_PARAMS');
    }

    const filePath = TempStorageService.getChapterAudioPath(lessonId, filename);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // HTTP 206 Partial Content (Streaming / Seeking support)
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).header('Content-Range', `bytes */${fileSize}`).send();
        return;
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tts/audio/:lessonId
 * Cleans up temporary audio files for a lesson.
 */
router.delete('/audio/:lessonId', (req: Request, res: Response) => {
  const lessonId = String(req.params.lessonId || '');
  const cleaned = TempStorageService.cleanupLessonAudio(lessonId);
  res.json({
    success: true,
    cleaned,
  });
});

export default router;
