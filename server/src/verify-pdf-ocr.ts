import { readFile } from 'node:fs/promises';
import { extractFromPdfBuffer } from './services/extraction/pdf-extractor.js';
import { SourceQualityService } from './services/extraction/source-quality.service.js';

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: pnpm exec tsx src/verify-pdf-ocr.ts "C:\\path\\to\\scanned.pdf"');
    process.exitCode = 2;
    return;
  }

  const buffer = await readFile(filePath);
  const content = await extractFromPdfBuffer(buffer, filePath.split(/[\\/]/).pop());
  SourceQualityService.assertUsable(content);
  const pageNumbers = content.sections.flatMap((section) => [
    ...(section.pageNumber ? [section.pageNumber] : []),
    ...section.blocks.map((block) => block.pageNumber).filter((page): page is number => Boolean(page)),
  ]);
  const pageCount = Math.max(...pageNumbers, 0);
  const ocrPages = (content.extractionWarnings || [])
    .filter((warning) => warning.includes('recovered with OCR'))
    .map((warning) => warning.match(/Page (\d+)/)?.[1])
    .filter(Boolean);

  // Intentionally report metadata only; do not write recognized document content to the console.
  console.log('OCR verification passed.');
  console.log(`Pages represented: ${pageCount}; extracted words: ${content.wordCount}.`);
  console.log(`Pages recovered with OCR: ${ocrPages.length ? ocrPages.join(', ') : 'none (text layer was sufficient)'}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown PDF OCR failure.';
  console.error(`OCR verification failed: ${message}`);
  process.exitCode = 1;
});
