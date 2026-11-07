import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { extractFromUrl } from '../services/extraction/html-extractor.js';
import { extractFromPdfBuffer } from '../services/extraction/pdf-extractor.js';
import { extractFromPastedText } from '../services/extraction/text-extractor.js';
import { config } from '../config.js';
import { AppError } from '../middleware/error-handler.js';

const router: Router = Router();

// Configure multer for memory storage with size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadSizeMB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Only accept PDFs
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF documents are supported.', 400, 'UNSUPPORTED_FILE_TYPE'));
    }
  },
});

/**
 * POST /api/extract/url
 * Extracts structured content from a public webpage URL.
 */
router.post('/url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new AppError('The "url" field is required.', 400, 'MISSING_URL');
    }

    const structuredContent = await extractFromUrl(url.trim());
    res.json({
      success: true,
      data: structuredContent,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/extract/pdf
 * Extracts structured content from an uploaded PDF file.
 */
router.post(
  '/pdf',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file || !req.file.buffer) {
        throw new AppError('No PDF file uploaded. Please upload a file with field "file".', 400, 'NO_FILE_UPLOADED');
      }

      const originalName = req.file.originalname || 'document.pdf';
      const structuredContent = await extractFromPdfBuffer(req.file.buffer, originalName);

      res.json({
        success: true,
        data: structuredContent,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/extract/text
 * Extracts structured content from raw pasted text.
 */
router.post('/text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, title } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new AppError('The "text" field is required and must not be empty.', 400, 'MISSING_TEXT');
    }

    const structuredContent = extractFromPastedText(text, { customTitle: title });
    res.json({
      success: true,
      data: structuredContent,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
