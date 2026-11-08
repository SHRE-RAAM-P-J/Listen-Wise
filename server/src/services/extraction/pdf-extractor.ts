import {
  StructuredContent,
  ContentSection,
  ContentBlock,
} from '../../models/structured-content.js';
import { AppError } from '../../middleware/error-handler.js';
import { createCanvas } from '@napi-rs/canvas';
import { recognizePdfPage } from './ocr.service.js';
import { performance } from 'node:perf_hooks';

export interface PdfExtractionOptions {
  /** Injectable OCR hook for deterministic tests; production uses Tesseract.js. */
  recognizePage?: (image: Buffer, pageNumber: number) => Promise<string>;
}

const MAX_PDF_PAGES = 50;
const OCR_MIN_WORDS = 25;
const OCR_MIN_CHARS = 120;
const OCR_READABLE_PAGE_MIN_WORDS = 8;
const OCR_READABLE_PAGE_MIN_CHARS = 40;

function pageTextIsInsufficient(text: string): boolean {
  const words = text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const chars = text.match(/[\p{L}\p{N}]/gu)?.length || 0;
  return words < OCR_MIN_WORDS || chars < OCR_MIN_CHARS;
}

function ocrPageIsUnreadable(text: string): boolean {
  const words = text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const chars = text.match(/[\p{L}\p{N}]/gu)?.length || 0;
  return words < OCR_READABLE_PAGE_MIN_WORDS || chars < OCR_READABLE_PAGE_MIN_CHARS;
}

async function renderPagePng(page: any): Promise<Buffer> {
  const viewport = page.getViewport({ scale: 2 });
  const maxPixels = 4_000_000;
  const scale = Math.min(1, Math.sqrt(maxPixels / (viewport.width * viewport.height)));
  const safeViewport = scale < 1 ? page.getViewport({ scale: 2 * scale }) : viewport;
  const width = Math.ceil(safeViewport.width);
  const height = Math.ceil(safeViewport.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport: safeViewport }).promise;
  return canvas.toBuffer('image/png');
}

/**
 * Extracts and reconstructs structured content from a PDF document buffer.
 */
export async function extractFromPdfBuffer(
  buffer: Buffer,
  originalFilename?: string,
  options: PdfExtractionOptions = {},
): Promise<StructuredContent> {
  const extractionStartedAt = performance.now();
  // Step 1: Validate PDF magic bytes (%PDF-)
  if (buffer.length < 5 || buffer.toString('utf-8', 0, 5) !== '%PDF-') {
    throw new AppError(
      'The uploaded file is not a valid PDF document (missing %PDF- header).',
      400,
      'INVALID_PDF_FORMAT',
    );
  }

  // Step 2: Dynamically import pdfjs legacy build for Node.js
  let pdfjs: any;
  try {
    // @ts-ignore
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err: any) {
    throw new AppError('PDF engine could not be loaded.', 500, 'PDF_ENGINE_ERROR');
  }

  let doc: any;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false, // Security: never eval arbitrary code inside PDF
    });
    doc = await loadingTask.promise;
  } catch (err: any) {
    if (err.name === 'PasswordException') {
      throw new AppError(
        'The PDF is password protected. Please provide an unencrypted PDF.',
        400,
        'PDF_PASSWORD_PROTECTED',
      );
    }
    throw new AppError(
      `Failed to open PDF document: ${err.message || 'Malformed PDF'}`,
      400,
      'MALFORMED_PDF',
    );
  }

  // Step 3: Extract PDF metadata (title, author)
  let title = originalFilename ? originalFilename.replace(/\.pdf$/i, '') : 'Untitled PDF';
  let authors: string[] | undefined;

  try {
    const meta = await doc.getMetadata();
    if (meta?.info) {
      if (meta.info.Title && typeof meta.info.Title === 'string' && meta.info.Title.trim()) {
        title = meta.info.Title.trim();
      }
      if (meta.info.Author && typeof meta.info.Author === 'string' && meta.info.Author.trim()) {
        authors = [meta.info.Author.trim()];
      }
    }
  } catch {
    // Non-critical, fall back to filename
  }

  const sections: ContentSection[] = [];
  const extractionWarnings: string[] = [];
  let currentSection: ContentSection = {
    heading: undefined,
    headingLevel: undefined,
    blocks: [],
  };

  const commitSection = () => {
    if (currentSection.blocks.length > 0 || currentSection.heading) {
      sections.push(currentSection);
      currentSection = {
        heading: undefined,
        headingLevel: undefined,
        blocks: [],
      };
    }
  };

  const numPages = doc.numPages;
  if (numPages > MAX_PDF_PAGES) {
    throw new AppError(
      `This PDF has ${numPages} pages. Please split it into files of ${MAX_PDF_PAGES} pages or fewer before uploading.`,
      413,
      'PDF_PAGE_LIMIT_EXCEEDED',
    );
  }

  // Step 4: Iterate through all pages
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    let items = textContent.items as Array<any>;
    let pageHasImage = false;

    // Check for images in operator list
    try {
      const ops = await page.getOperatorList();
      let imageCount = 0;
      for (let i = 0; i < ops.fnArray.length; i++) {
        // pdfjs fn 82 is paintImageXObject, 85 is paintInlineImageXObject
        if (ops.fnArray[i] === pdfjs.OPS?.paintImageXObject || ops.fnArray[i] === pdfjs.OPS?.paintInlineImageXObject) {
          imageCount++;
        }
      }
      if (imageCount > 0) {
        pageHasImage = true;
        currentSection.blocks.push({
          type: 'image',
          content: `Embedded figure or graphic on page ${pageNum}`,
          pageNumber: pageNum,
          note: `Extracted reference to ${imageCount} embedded illustration(s) on page ${pageNum}`,
        });
      }
    } catch {
      // non-critical
    }

    const nativeText = items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => item.str.trim())
      .join(' ');
    if (pageTextIsInsufficient(nativeText) && (pageHasImage || nativeText.length > 0)) {
      const ocrStartedAt = performance.now();
      try {
        console.info(`[PDF OCR] Recognizing page ${pageNum} of ${numPages}.`);
        const image = await renderPagePng(page);
        const recognized = await (options.recognizePage || recognizePdfPage)(image, pageNum);
        const recognizedLines = recognized.split(/\r?\n/).map((line) => line.trim());
        const recognizedText = recognizedLines.join(' ');
        if (ocrPageIsUnreadable(recognizedText)) {
          if (nativeText && !pageHasImage) {
            // Preserve sparse selectable text on pages without embedded scans.
          } else if (pageHasImage) {
            throw new AppError(
              `We couldn't read page ${pageNum} of "${title}". The scan may be too faint or low resolution. Try a clearer PDF or paste the text.`,
              422,
              'PDF_OCR_UNREADABLE',
            );
          }
        } else {
          // OCR lines are fed through the same paragraph, heading, list and page-number builder below.
          items = recognizedLines.map((str, index) => ({
            str,
            // Keep line baselines apart for the existing PDF line grouper.
            transform: [1, 0, 0, 10, 0, (recognizedLines.length - index) * 12],
            height: 10,
          }));
          extractionWarnings.push(`Page ${pageNum} text was recovered with OCR.`);
        }
        console.info(`[Timing] OCR page ${pageNum} completed in ${Math.round(performance.now() - ocrStartedAt)}ms.`);
      } catch (err: any) {
        console.info(`[Timing] OCR page ${pageNum} failed after ${Math.round(performance.now() - ocrStartedAt)}ms.`);
        if (err instanceof AppError) throw err;
        console.warn(`[PDF OCR] OCR failed on page ${pageNum}.`);
        throw new AppError(
          `OCR could not process page ${pageNum} of "${title}". Try a text-based PDF or paste the document text.`,
          422,
          'PDF_OCR_FAILED',
        );
      }
    }

    if (!items || items.length === 0) {
      // Scanned or blank page
      extractionWarnings.push(`Page ${pageNum} contains no extractable text layer (possible scanned image).`);
      currentSection.blocks.push({
        type: 'paragraph',
        content: `[Page ${pageNum} could not be text-extracted: Scanned image or non-text content]`,
        partiallyUnderstood: true,
        pageNumber: pageNum,
        note: 'Scanned image or empty page',
      });
      continue;
    }

    // Determine font heights across page to infer headings
    const fontHeights: number[] = [];
    for (const item of items) {
      if ('str' in item && item.str.trim()) {
        const height = Math.abs(item.transform?.[3] || item.height || 10);
        fontHeights.push(height);
      }
    }

    fontHeights.sort((a, b) => a - b);
    const medianHeight = fontHeights.length > 0 ? fontHeights[Math.floor(fontHeights.length / 2)] : 12;

    // Group items into lines by Y coordinate (within 3pt tolerance)
    interface TextLine {
      y: number;
      fontSize: number;
      text: string;
      xPositions: number[];
    }

    const lines: TextLine[] = [];
    let currentLine: TextLine | null = null;

    for (const item of items) {
      if (!('str' in item) || !item.str) continue;
      const str = item.str;
      const x = item.transform?.[4] || 0;
      const y = item.transform?.[5] || 0;
      const fontSize = Math.abs(item.transform?.[3] || item.height || 10);

      if (!currentLine || Math.abs(currentLine.y - y) > 3) {
        if (currentLine && currentLine.text.trim()) {
          lines.push(currentLine);
        }
        currentLine = {
          y,
          fontSize,
          text: str,
          xPositions: [x],
        };
      } else {
        // Same line
        const needsSpace = !currentLine.text.endsWith(' ') && !str.startsWith(' ');
        currentLine.text += (needsSpace ? ' ' : '') + str;
        currentLine.xPositions.push(x);
        currentLine.fontSize = Math.max(currentLine.fontSize, fontSize);
      }
    }

    if (currentLine && currentLine.text.trim()) {
      lines.push(currentLine);
    }

    // Sort lines in reading order (top to bottom: descending Y)
    lines.sort((a, b) => b.y - a.y);

    // Group lines into paragraphs, headings, or tables
    let currentParagraphLines: string[] = [];

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        const fullPara = currentParagraphLines.join(' ').replace(/\s+/g, ' ').trim();
        if (fullPara) {
          // Check for bullet list format
          if (/^[-•*]\s+/.test(fullPara)) {
            const items = fullPara
              .split(/(?:^|\n)[-•*]\s+/)
              .map((s) => s.trim())
              .filter(Boolean);
            currentSection.blocks.push({
              type: 'unordered-list',
              content: fullPara,
              items,
              pageNumber: pageNum,
            });
          } else if (/^\d+[.)]\s+/.test(fullPara)) {
            const items = fullPara
              .split(/(?:^|\n)\d+[.)]\s+/)
              .map((s) => s.trim())
              .filter(Boolean);
            currentSection.blocks.push({
              type: 'ordered-list',
              content: fullPara,
              items,
              pageNumber: pageNum,
            });
          } else {
            currentSection.blocks.push({
              type: 'paragraph',
              content: fullPara,
              pageNumber: pageNum,
            });
          }
        }
        currentParagraphLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.text.trim();
      if (!trimmed) continue;

      // Preserve paragraph breaks when OCR reports a larger vertical gap between lines.
      if (i > 0 && Math.abs(lines[i - 1].y - line.y) > medianHeight * 1.8) {
        flushParagraph();
      }

      // Skip common standalone header/footer page numbers (e.g. "1", "Page 2 of 10")
      if (/^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i.test(trimmed) && (i === 0 || i === lines.length - 1)) {
        continue;
      }

      // Check if line represents a heading based on font size (> 1.25 * median)
      const isOcrHeading = line.fontSize === 10 && /^[A-Z][A-Z\d\s:,-]{2,80}$/.test(trimmed) && trimmed.length < 100;
      const isLargeFont = line.fontSize >= medianHeight * 1.25 && trimmed.length < 120;
      const isNumberedHeading = /^(?:Chapter|\d+\.|\d+\.\d+|Section)\s+/i.test(trimmed) && trimmed.length < 100;

      if (isLargeFont || isNumberedHeading || isOcrHeading) {
        flushParagraph();
        commitSection();
        const level = line.fontSize >= medianHeight * 1.6 ? 1 : line.fontSize >= medianHeight * 1.3 ? 2 : 3;
        currentSection.heading = trimmed;
        currentSection.headingLevel = level;
        currentSection.pageNumber = pageNum;
        continue;
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        flushParagraph();
        const item = trimmed.replace(/^[-*•]\s+/, '').trim();
        currentSection.blocks.push({ type: 'unordered-list', content: item, items: [item], pageNumber: pageNum });
        continue;
      }
      if (/^\d+[.)]\s+/.test(trimmed)) {
        flushParagraph();
        const item = trimmed.replace(/^\d+[.)]\s+/, '').trim();
        currentSection.blocks.push({ type: 'ordered-list', content: item, items: [item], pageNumber: pageNum });
        continue;
      }

      // Check if line is part of a potential table (has distinct tabbed spacing or column alignment)
      if (line.xPositions.length >= 3 && trimmed.includes('   ')) {
        flushParagraph();
        const cells = trimmed.split(/\s{3,}/).map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 2) {
          currentSection.blocks.push({
            type: 'table',
            content: trimmed,
            tableData: [cells],
            pageNumber: pageNum,
          });
          continue;
        }
      }

      currentParagraphLines.push(trimmed);
    }

    flushParagraph();
  }

  commitSection();

  // If no sections were created, generate a fallback section
  if (sections.length === 0) {
    sections.push({
      heading: undefined,
      blocks: [
        {
          type: 'paragraph',
          content: 'No extractable text found in this PDF.',
          partiallyUnderstood: true,
        },
      ],
    });
  }

  // Count total words
  let totalWords = 0;
  for (const sec of sections) {
    if (sec.heading) totalWords += sec.heading.split(/\s+/).length;
    for (const b of sec.blocks) {
      if (b.content) totalWords += b.content.split(/\s+/).length;
    }
  }

  const extractedContent: StructuredContent = {
    title,
    authors,
    source: {
      type: 'pdf',
      filename: originalFilename,
      extractedAt: new Date().toISOString(),
      fileSizeBytes: buffer.length,
    },
    sections,
    wordCount: totalWords,
    language: 'en',
    extractionWarnings: extractionWarnings.length > 0 ? extractionWarnings : undefined,
  };
  console.info(`[Timing] PDF extraction service completed in ${Math.round(performance.now() - extractionStartedAt)}ms.`);
  return extractedContent;
}
