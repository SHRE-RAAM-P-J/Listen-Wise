import { createCanvas } from '@napi-rs/canvas';

/**
 * Simple generator for a valid test PDF without external heavyweight dependencies.
 * Creates a valid PDF 1.4 file with text, headings, and lines with proper coordinates.
 */
export function generateTestPdfBuffer(): Buffer {
  const content = [
    'BT',
    '/F1 20 Tf', // 20pt title (heading)
    '50 720 Td',
    '(Quantum Computing Fundamentals) Tj',
    'ET',
    'BT',
    '/F1 14 Tf', // 14pt section heading
    '50 670 Td',
    '(Section 1: Introduction to Qubits) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '50 640 Td',
    '(Unlike classical bits which can only be 0 or 1, qubits exist in superposition.) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '50 620 Td',
    '(This allows quantum computers to evaluate multiple states simultaneously.) Tj',
    'ET',
    'BT',
    '/F1 14 Tf', // 14pt heading
    '50 580 Td',
    '(Section 2: Key Algorithms) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '50 550 Td',
    '(- Shor algorithm for integer factorization) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '50 530 Td',
    '(- Grover algorithm for unstructured search) Tj',
    'ET',
  ].join('\n');

  const streamLength = Buffer.byteLength(content, 'utf-8');

  const objects = [
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    // 3: Page
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    // 4: Contents
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${content}\nendstream\nendobj`,
    // 5: Font
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += obj + '\n';
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    pdf += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf-8');
}
export type TestPdfPage = { type: 'text'; text: string } | { type: 'scan'; text: string };

/** Generates small synthetic image/text PDFs; OCR itself is injected by PDF pipeline tests. */
export function generateMixedTestPdfBuffer(pages: TestPdfPage[]): Buffer {
  const objects = new Map<number, Buffer>();
  const pageRefs: number[] = [];
  let nextObject = 3;
  for (const page of pages) {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    const imageObject = page.type === 'scan' ? nextObject++ : undefined;
    pageRefs.push(pageObject);

    const escapedText = page.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ' ');
    let content: Buffer;
    if (imageObject) {
      const canvas = createCanvas(1224, 1584);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 1224, 1584);
      context.fillStyle = '#111';
      context.font = 'bold 54px Arial';
      context.fillText('INTERVIEW INVITATION', 90, 150);
      context.font = '36px Arial';
      const words = page.text.split(/\s+/);
      let line = '';
      let y = 260;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > 42) {
          context.fillText(line, 90, y);
          line = word;
          y += 64;
        } else line = next;
      }
      if (line) context.fillText(line, 90, y);
      const jpeg = canvas.toBuffer('image/jpeg');
      objects.set(imageObject, Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1224 /Height 1584 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
        jpeg,
        Buffer.from('\nendstream'),
      ]));
      content = Buffer.from('q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ');
    } else {
      const lines = escapedText.match(/.{1,70}(?:\s|$)/g) || [escapedText];
      content = Buffer.from(lines.map((text, index) => `BT /F1 12 Tf 50 ${740 - index * 24} Td (${text.trim()}) Tj ET`).join('\n'));
    }

    objects.set(contentObject, Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream'),
    ]));
    const resources = imageObject
      ? `/Resources << /XObject << /Im0 ${imageObject} 0 R >> >>`
      : '/Resources << /Font << /F1 99 0 R >> >>';
    objects.set(pageObject, Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${resources} /Contents ${contentObject} 0 R >>`));
  }
  const fontObject = nextObject++;
  objects.set(fontObject, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  // Point text pages at the generated font object.
  for (const page of pages) {
    if (page.type !== 'text') continue;
    const pageObject = pageRefs[pages.indexOf(page)];
    objects.set(pageObject, Buffer.from(objects.get(pageObject)!.toString().replace('/F1 99 0 R', `/F1 ${fontObject} 0 R`)));
  }
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pages.length} >>`));

  const maxObject = Math.max(...objects.keys());
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let offset = chunks[0].length;
  for (let id = 1; id <= maxObject; id++) {
    const body = objects.get(id);
    if (!body) continue;
    offsets[id] = offset;
    const chunk = Buffer.concat([Buffer.from(`${id} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    offset += chunk.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${maxObject + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= maxObject; id++) xref.push(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`);
  chunks.push(Buffer.from(`${xref.join('')}trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return Buffer.concat(chunks);
}
