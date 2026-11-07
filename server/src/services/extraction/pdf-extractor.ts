import {
  StructuredContent,
  ContentSection,
  ContentBlock,
} from '../../models/structured-content.js';
import { AppError } from '../../middleware/error-handler.js';

/**
 * Extracts and reconstructs structured content from a PDF document buffer.
 */
export async function extractFromPdfBuffer(
  buffer: Buffer,
  originalFilename?: string,
): Promise<StructuredContent> {
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

  // Step 4: Iterate through all pages
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<any>;

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

      // Skip common standalone header/footer page numbers (e.g. "1", "Page 2 of 10")
      if (/^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i.test(trimmed) && (i === 0 || i === lines.length - 1)) {
        continue;
      }

      // Check if line represents a heading based on font size (> 1.25 * median)
      const isLargeFont = line.fontSize >= medianHeight * 1.25 && trimmed.length < 120;
      const isNumberedHeading = /^(?:Chapter|\d+\.|\d+\.\d+|Section)\s+/i.test(trimmed) && trimmed.length < 100;

      if (isLargeFont || isNumberedHeading) {
        flushParagraph();
        commitSection();
        const level = line.fontSize >= medianHeight * 1.6 ? 1 : line.fontSize >= medianHeight * 1.3 ? 2 : 3;
        currentSection.heading = trimmed;
        currentSection.headingLevel = level;
        currentSection.pageNumber = pageNum;
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

  return {
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
}
