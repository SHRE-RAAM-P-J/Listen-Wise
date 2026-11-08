import { extractFromPastedText } from './services/extraction/text-extractor.js';
import { extractFromPdfBuffer } from './services/extraction/pdf-extractor.js';
import { parseHtmlToStructuredContent, extractFromUrl } from './services/extraction/html-extractor.js';
import { validateUrlSafety } from './utils/url-security.js';
import { generateTestPdfBuffer } from './test-pdf-generator.js';
import { SourceQualityService } from './services/extraction/source-quality.service.js';
import { StructuredContent } from './models/structured-content.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== RUNNING LISTENWISE PHASE 1 EXTRACTION TESTS ===\n');

  // ─────────────────────────────────────────────────────────────
  // 1. PASTED TEXT EXTRACTION
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. Testing Pasted Text Pipeline ---');
  const sampleMarkdown = `
# Understanding Neural Networks

Neural networks are computational models inspired by biological neural brains.

## Architecture

A typical neural network consists of multiple layers:
- Input layer for feature ingest
- Hidden layers for hierarchical representation
- Output layer for classification or regression

### The Activation Function
The activation function introduces non-linearity into the network:

$$ f(x) = \\frac{1}{1 + e^{-x}} $$

Here is a simple Python snippet for the sigmoid:
\`\`\`python
import math
def sigmoid(x):
    return 1 / (1 + math.exp(-x))
\`\`\`

### Performance Comparison
| Model | Accuracy | Training Time |
| Logistic Regression | 84.5% | 2 mins |
| Deep MLP | 96.2% | 45 mins |

For more details, see https://deeplearningbook.org
`;

  try {
    const textCCR = extractFromPastedText(sampleMarkdown);

    assert(textCCR.title === 'Understanding Neural Networks', 'Extracts correct document title');
    assert(textCCR.source.type === 'text', 'Source type is text');
    assert(textCCR.sections.length >= 3, `Extracts sections hierarchy (got ${textCCR.sections.length} sections)`);

    const allBlocks = textCCR.sections.flatMap((s) => s.blocks);
    const hasParagraph = allBlocks.some((b) => b.type === 'paragraph');
    const hasList = allBlocks.some((b) => b.type === 'unordered-list' && b.items?.length === 3);
    const hasEquation = allBlocks.some((b) => b.type === 'equation');
    const hasCode = allBlocks.some((b) => b.type === 'code' && b.language === 'python');
    const hasTable = allBlocks.some((b) => b.type === 'table' && b.tableData && b.tableData.length >= 2);

    assert(hasParagraph, 'Extracts paragraph blocks');
    assert(hasList, 'Extracts unordered list with 3 items');
    assert(hasEquation, 'Preserves mathematical equations');
    assert(hasCode, 'Extracts code blocks with language hint');
    assert(hasTable, 'Extracts table preserving row/column matrix');
    assert(textCCR.wordCount > 50, `Calculates accurate word count (${textCCR.wordCount} words)`);
    assert(textCCR.sourceReferences?.[0] === 'https://deeplearningbook.org', 'Extracts reference URLs');
    SourceQualityService.assertUsable(extractFromPastedText('Gravity pulls objects toward Earth.'));
    assert(true, 'Accepts legitimate short pasted text without URL length thresholds');
  } catch (err: any) {
    console.error('Error in text extraction test:', err);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PDF EXTRACTION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Testing PDF Extraction Pipeline ---');
  try {
    const pdfBuffer = generateTestPdfBuffer();
    const pdfCCR = await extractFromPdfBuffer(pdfBuffer, 'quantum_computing.pdf');

    assert(pdfCCR.source.type === 'pdf', 'Source type is pdf');
    assert(pdfCCR.title === 'quantum_computing', 'Extracts title from filename or metadata');
    assert(pdfCCR.sections.length >= 1, `PDF sections extracted (got ${pdfCCR.sections.length})`);
    
    const pdfText = pdfCCR.sections.flatMap((s) => s.blocks).map((b) => b.content).join(' ');
    assert(pdfText.includes('Qubits') || pdfText.includes('superposition'), 'Extracts text in reading order');
    assert(pdfCCR.wordCount > 10, `Calculates PDF word count (${pdfCCR.wordCount} words)`);
    SourceQualityService.assertUsable(pdfCCR);
    assert(true, 'Accepts normal PDF extraction without URL-specific thresholds');

    // Test rejection of non-PDF buffer
    let nonPdfRejected = false;
    try {
      await extractFromPdfBuffer(Buffer.from('Not a real PDF file!'), 'fake.pdf');
    } catch (e: any) {
      if (e.code === 'INVALID_PDF_FORMAT') nonPdfRejected = true;
    }
    assert(nonPdfRejected, 'Safely rejects non-PDF file disguised as PDF');
  } catch (err: any) {
    console.error('Error in PDF extraction test:', err);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SECURITY & SSRF PROTECTION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Testing URL Security & SSRF Protection ---');
  const dangerousUrls = [
    { url: 'http://localhost:3001', reason: 'Explicit localhost' },
    { url: 'http://127.0.0.1:8080/secret', reason: 'Loopback 127.0.0.1' },
    { url: 'http://169.254.169.254/latest/meta-data', reason: 'Cloud metadata IP' },
    { url: 'http://192.168.1.1/admin', reason: 'Private RFC1918 192.168.x.x' },
    { url: 'http://10.0.0.1', reason: 'Private RFC1918 10.x.x.x' },
    { url: 'ftp://example.com/file.txt', reason: 'Disallowed protocol FTP' },
  ];

  for (const item of dangerousUrls) {
    let blocked = false;
    try {
      await validateUrlSafety(item.url);
    } catch (e: any) {
      if (e.code === 'SSRF_BLOCKED' || e.code === 'INVALID_PROTOCOL') {
        blocked = true;
      }
    }
    assert(blocked, `Blocks ${item.reason} (${item.url})`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. WEBPAGE EXTRACTION WITH READABILITY & CHEERIO
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Testing Webpage Article Extraction ---');
  const sampleArticleHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>The History of Audiobooks</title>
  <meta name="description" content="A comprehensive review of spoken audio learning.">
  <meta name="author" content="Dr. Alan Sound">
</head>
<body>
  <nav><a href="/home">Home</a><a href="/login">Login</a></nav>
  <div class="sidebar">Ads: Buy headphones now!</div>
  <main>
    <article>
      <h1>The Evolution of Spoken Learning</h1>
      <p class="byline">By Dr. Alan Sound</p>
      <p>Audio recording revolutionized accessibility for visually impaired readers in the 1930s.</p>
      
      <h2>Cassette Tapes and Portability</h2>
      <p>The introduction of the compact cassette made listening on the go practical for commuters.</p>
      <figure>
        <img src="https://images.example.com/cassette.jpg" alt="Vintage Cassette Tape" />
        <figcaption>A 1980s standard cassette tape.</figcaption>
      </figure>

      <h2>Modern Digital Formats</h2>
      <p>Today, digital audio formats enable variable playback speeds and chapter markers.</p>
      <ul>
        <li>Lossless compression</li>
        <li>Dynamic pitch correction</li>
        <li>Synchronized text transcripts</li>
      </ul>

      <p>Learn more at <a href="https://loc.gov/nls">National Library Service</a>.</p>
    </article>
  </main>
  <footer>Copyright 2026 History Site. All rights reserved.</footer>
</body>
</html>
`;

  try {
    const htmlCCR = parseHtmlToStructuredContent(sampleArticleHtml, 'https://example.com/audio-history');

    assert(htmlCCR.title.includes('Spoken Learning') || htmlCCR.title.includes('Audiobooks'), `Extracts article title: "${htmlCCR.title}"`);
    assert(htmlCCR.source.type === 'url', 'Source type is url');
    assert(htmlCCR.sections.length >= 2, `Extracts headings as section boundaries (got ${htmlCCR.sections.length} sections)`);

    const allBlocks = htmlCCR.sections.flatMap((s) => s.blocks);
    const hasImage = allBlocks.some((b) => b.type === 'image' && b.url?.includes('cassette.jpg'));
    const hasCaption = allBlocks.some((b) => b.type === 'image-caption' || (b.type === 'image' && b.note?.includes('1980s')));
    const hasList = allBlocks.some((b) => b.type === 'unordered-list' && b.items?.length === 3);

    assert(hasImage, 'Extracts image reference with URL and alt');
    assert(hasCaption, 'Preserves image caption relationship');
    assert(hasList, 'Preserves list items');
    assert(Boolean(htmlCCR.sourceReferences?.some((r) => r.includes('loc.gov'))), 'Collects extracted source links');

    // Verify ads and nav were excluded by Readability
    const fullText = allBlocks.map((b) => b.content).join(' ');
    assert(!fullText.includes('Buy headphones now'), 'Strips irrelevant advertisements');
    assert(!fullText.includes('Login'), 'Strips navigation links');
    SourceQualityService.assertUsable(htmlCCR);
    assert(true, 'Accepts a valid webpage article with meaningful body text and source URL');
  } catch (err: any) {
    console.error('Error in HTML extraction test:', err);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. LIVE WEBPAGE FETCH TEST
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4a. Testing URL Extraction Quality Gate ---');
  const urlContent = (body: string): StructuredContent => ({
    title: 'The Investment Guide',
    source: {
      type: 'url',
      url: 'https://unstop.com/resources/the-investment-guide',
      extractedAt: new Date().toISOString(),
    },
    sections: [{ heading: 'The Investment Guide', blocks: [{ type: 'paragraph', content: body }] }],
    wordCount: body.trim().split(/\s+/).length,
    language: 'en',
  });
  const rejectedUrlFixtures = [
    {
      name: '13-word loading placeholder',
      body: 'The investment guide is loading. Please wait while the page prepares its full content for you.',
    },
    {
      name: 'browser compatibility placeholder',
      body: 'Your browser is not supported. Please update your browser to read this investment guide.',
    },
    {
      name: 'anti-bot blocked page',
      body: 'Access denied. Unusual traffic was detected. Verify that you are human before continuing.',
    },
    {
      name: 'cookie consent page',
      body: 'We use cookies to improve this site. Accept all cookies or update cookie preferences to continue.',
    },
  ];
  for (const fixture of rejectedUrlFixtures) {
    let rejection: unknown;
    try {
      SourceQualityService.assertUsable(urlContent(fixture.body));
    } catch (err) {
      rejection = err;
    }
    const error = rejection as { code?: string; message?: string } | undefined;
    assert(
      Boolean(
        error?.code === 'SOURCE_CONTENT_UNAVAILABLE' &&
          error.message?.includes('The Investment Guide') &&
          error.message?.includes('https://unstop.com/resources/the-investment-guide') &&
          error.message?.includes('pasting the article text or uploading a PDF'),
      ),
      `Rejects ${fixture.name} and preserves title, URL, and recovery guidance`,
    );
  }

  console.log('\n--- 5. Testing Live Webpage Extraction ---');
  try {
    const liveUrl = 'https://en.wikipedia.org/wiki/Podcast';
    console.log(`  Fetching live article: ${liveUrl}...`);
    const liveCCR = await extractFromUrl(liveUrl);

    assert(liveCCR.title.toLowerCase().includes('podcast'), `Live article title extracted: "${liveCCR.title}"`);
    assert(liveCCR.sections.length > 3, `Extracted ${liveCCR.sections.length} sections from Wikipedia`);
    assert(liveCCR.wordCount > 500, `Extracted substantial article (${liveCCR.wordCount} words)`);
    assert(liveCCR.source.url === liveUrl, 'Source URL preserved');
  } catch (err: any) {
    console.warn('  ⚠️ Live fetch note (network may be restricted in sandbox):', err.message);
    // If external internet is restricted in current network, test still logged
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log(`\n=================================================`);
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
