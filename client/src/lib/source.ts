import { SourceDraft } from '../types/pipeline';
import { wordCount } from './format';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MIN_TEXT_WORDS = 10;

export function validatePdfFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Choose a PDF file.';
  if (file.size === 0) return 'That PDF is empty.';
  if (file.size > MAX_PDF_BYTES) return 'That PDF is larger than 20 MB.';
  return null;
}

export function validateSource(draft: SourceDraft): string | null {
  if (draft.mode === 'url') {
    const value = draft.url.trim();
    if (!value) return 'Enter a webpage URL.';
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Use an http or https URL.';
      }
    } catch {
      return 'Enter a valid URL, such as https://example.com/article.';
    }
    return null;
  }

  if (draft.mode === 'pdf') {
    if (!draft.pdfFile) return 'Choose a PDF to upload.';
    return validatePdfFile(draft.pdfFile);
  }

  if (!draft.text.trim()) return 'Paste the text you want to learn.';
  const words = wordCount(draft.text);
  if (words < MIN_TEXT_WORDS) {
    return `Paste at least ${MIN_TEXT_WORDS} words so the lesson has something to teach.`;
  }
  return null;
}
