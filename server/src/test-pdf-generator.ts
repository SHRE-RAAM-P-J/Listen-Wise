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
