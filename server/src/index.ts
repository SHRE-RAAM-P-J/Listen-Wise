import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';

import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import extractRouter from './routes/extract.js';
import lessonRouter from './routes/lesson.js';
import ttsRouter from './routes/tts.js';

const app: express.Application = express();

// ─── Security & parsing ──────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Ensure temp directory exists ─────────────────────────────
fs.mkdirSync(config.tempDir, { recursive: true });

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'ListenWise API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Extraction Routes ────────────────────────────────────────
app.use('/api/extract', extractRouter);

// ─── AI Understanding & Lesson Engine Routes ──────────────────
app.use('/api/lessons', lessonRouter);
app.use('/api/lesson', lessonRouter);
// ─── Gnani AI Speech Synthesis Routes (Phase 3) ───────────────
app.use('/api/tts', ttsRouter);

// ─── Error handling ───────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n  🎧 ListenWise API running at http://localhost:${config.port}`);
  console.log(`  📋 Health check:  http://localhost:${config.port}/api/health`);
  console.log(`  🌍 Environment:   ${config.nodeEnv}\n`);
});

export default app;
