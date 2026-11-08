import { AppError } from './middleware/error-handler.js';
import { ensureContentIdentifiers } from './models/structured-content.js';
import { LessonGeneratorService } from './services/ai/lesson-generator.service.js';
import { MockLLMProvider } from './services/ai/providers/mock.provider.js';
import { extractFromPdfBuffer } from './services/extraction/pdf-extractor.js';
import { SourceQualityService } from './services/extraction/source-quality.service.js';
import { generateMixedTestPdfBuffer, generateTestPdfBuffer } from './test-pdf-generator.js';

let passed = 0;
let failed = 0;
function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}`);
    failed++;
  }
}

const scannedInvitation =
  'A HackerRank technical interview invitation asks the candidate to choose an available interview slot. The invitation explains that the interview will be conducted remotely using a coding platform. Candidates should check their internet connection, test their microphone and camera, and join the scheduled session a few minutes early. The message includes contact details for rescheduling and recommends reviewing data structures and algorithms before the meeting.';

async function run(): Promise<void> {
  console.log('\n--- PDF OCR fallback tests ---');
  const runRealOcr = process.argv.includes('--real');
  if (runRealOcr) console.log('Real Tesseract mode: recognition output is not printed.');

  let textPdfOcrCalls = 0;
  const resume = await extractFromPdfBuffer(generateTestPdfBuffer(), 'resume.pdf', {
    recognizePage: async () => { textPdfOcrCalls++; return ''; },
  });
  assert(resume.source.type === 'pdf' && resume.wordCount > 25 && textPdfOcrCalls === 0, 'Text-based resume PDF stays on the existing PDF.js extraction path');

  let renderedPng = false;
  const scannedPdf = await extractFromPdfBuffer(
    generateMixedTestPdfBuffer([{ type: 'scan', text: scannedInvitation }]),
    'hackerrank-invitation.pdf',
    runRealOcr ? {} : { recognizePage: async (image) => { renderedPng = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); return `INTERVIEW INVITATION\n${scannedInvitation}`; } },
  );
  SourceQualityService.assertUsable(scannedPdf);
  const scannedBlocks = ensureContentIdentifiers(scannedPdf).sections.flatMap((section) => section.blocks);
  assert((runRealOcr || renderedPng) && scannedPdf.wordCount > 40 && scannedBlocks.some((block) => block.pageNumber === 1), `${runRealOcr ? 'Real Tesseract' : 'Mock'} OCR reads image-only page, passes quality gate, and retains page numbering`);
  assert(Boolean(scannedPdf.extractionWarnings?.some((warning) => warning.includes('OCR'))), 'Canonical PDF output records that OCR recovered the page');

  const multiPagePdf = await extractFromPdfBuffer(
    generateMixedTestPdfBuffer([{ type: 'scan', text: scannedInvitation }, { type: 'scan', text: 'The second page confirms the interview schedule. Contact the recruiting team for accessibility requests before the session.' }]),
    'two-page-scan.pdf',
    { recognizePage: async (_image, pageNumber) => pageNumber === 1 ? `INTERVIEW INVITATION\n${scannedInvitation}` : 'SCHEDULE AND ACCESSIBILITY\nThe second page confirms the interview schedule. Contact the recruiting team for accessibility requests before the session.' },
  );
  SourceQualityService.assertUsable(multiPagePdf);
  const multiPageBlocks = multiPagePdf.sections.flatMap((section) => section.blocks);
  assert(multiPageBlocks.some((block) => block.pageNumber === 1) && multiPageBlocks.some((block) => block.pageNumber === 2), 'Multi-page scanned PDF OCRs every page and preserves page numbers');
  assert(multiPagePdf.sections.flatMap((section) => section.blocks).map((block) => block.content).join(' ').indexOf('HackerRank') < multiPagePdf.sections.flatMap((section) => section.blocks).map((block) => block.content).join(' ').indexOf('accessibility'), 'Multi-page OCR preserves page reading order');

  let mixedOcrPages = 0;
  const mixedPdf = await extractFromPdfBuffer(
    generateMixedTestPdfBuffer([
      { type: 'text', text: 'Resume profile. The candidate has experience in software development, database design, and collaborative engineering projects. They are seeking a technical role with opportunities to build reliable applications.' },
      { type: 'scan', text: scannedInvitation },
    ]),
    'mixed-document.pdf',
    { recognizePage: async (_image, pageNumber) => { mixedOcrPages++; return `INTERVIEW INVITATION\n${scannedInvitation}`; } },
  );
  const mixedBody = mixedPdf.sections.flatMap((section) => section.blocks).map((block) => block.content).join(' ');
  assert(mixedOcrPages === 1 && mixedBody.includes('Resume profile') && mixedBody.includes('HackerRank'), 'Mixed PDF keeps native text and OCRs only its scanned page');

  let poorScanRejected = false;
  try {
    await extractFromPdfBuffer(
      generateMixedTestPdfBuffer([{ type: 'scan', text: 'unreadable' }]),
      'poor-scan.pdf',
      { recognizePage: async () => 'x 1 ?' },
    );
  } catch (error) {
    poorScanRejected = error instanceof AppError && error.code === 'PDF_OCR_UNREADABLE';
  }
  assert(poorScanRejected, 'Poor-quality or unreadable scanned page returns a clear OCR error instead of placeholder lesson input');

  const groundedPdf = await extractFromPdfBuffer(
    generateMixedTestPdfBuffer([{ type: 'scan', text: scannedInvitation }]),
    'hackerrank-invitation.pdf',
    { recognizePage: async () => `INTERVIEW INVITATION\n${scannedInvitation}` },
  );
  const identified = ensureContentIdentifiers(groundedPdf);
  const sourceText = identified.sections.flatMap((section) => section.blocks).map((block) => block.content).join(' ');
  const provider = new MockLLMProvider(async (prompt) => {
    if (prompt.includes('TASK:')) {
      return {
        subject: 'Technical interview invitation',
        purpose: 'Explain the interview logistics described in the invitation.',
        learningObjective: 'Understand the remote interview arrangements and candidate preparation guidance.',
        mainTopics: ['Remote interview', 'Candidate preparation'],
        keyConcepts: [], terminology: [], relationshipsBetweenConcepts: [], relationshipsBetweenSections: [],
        importantExamples: [], importantFormulasOrNumbers: [], prerequisites: [],
      };
    }
    return {
      id: 'ocr-grounded-chapter', title: 'Interview logistics', overview: 'The invitation describes a remote coding interview.',
      conceptsCovered: ['Remote interview', 'Candidate preparation'], teachingScript: sourceText,
      transitionToNext: '',
      sourceReferences: identified.sections.flatMap((section) => section.blocks.map((block) => ({ blockId: block.id!, pageNumber: block.pageNumber, sectionTitle: section.heading }))),
    };
  });
  const lesson = await LessonGeneratorService.generateLesson(groundedPdf, { provider });
  assert(lesson.validation.sourceCoverage === 'passed' && lesson.validation.coverageScore > 0, 'OCR-derived canonical content reaches lesson generation and passes source-grounding validation');

  console.log(`\nPDF OCR TEST RESULTS: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error('PDF OCR test suite failed:', error instanceof AppError ? `${error.code}: ${error.message}` : error);
  process.exitCode = 1;
});
