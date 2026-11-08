import { StructuredContent } from '../../models/structured-content.js';
import { AppError } from '../../middleware/error-handler.js';
import { config } from '../../config.js';

type BoilerplateKind = 'loading' | 'cookie-consent' | 'browser-compatibility' | 'bot-block';

const URL_BOILERPLATE: Array<{ kind: BoilerplateKind; pattern: RegExp }> = [
  {
    kind: 'loading',
    pattern: /^(?:please wait\b|loading(?:\.{2,}|…)?\s*$|just a moment\b|one moment\b|(?:this |the )?page is loading\b|content is loading\b|enable javascript\b|javascript is required\b|checking your browser\b)/i,
  },
  {
    kind: 'cookie-consent',
    pattern: /(?:we use cookies\b|this site uses cookies\b|accept (?:all )?cookies\b|cookie (?:consent|settings|preferences)\b|by continuing.{0,80}cookies)/i,
  },
  {
    kind: 'browser-compatibility',
    pattern: /(?:browser compatibility|(?:your )?browser (?:is )?(?:not supported|unsupported|not compatible|out of date)|please (?:update|upgrade) your browser|upgrade your browser)/i,
  },
  {
    kind: 'bot-block',
    pattern: /(?:access denied|unusual traffic|verify (?:that )?you are human|are you human|automated requests? (?:are|have)|request blocked|bot protection|captcha|security check|cloudflare)/i,
  },
  {
    kind: 'loading',
    pattern: /(?:no extractable text found|could not be text-extracted|scanned image or non-text content)/i,
  },
];

function bodyText(content: StructuredContent): string {
  return content.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => {
      if (block.type === 'image') return [];
      if (block.type === 'ordered-list' || block.type === 'unordered-list') {
        return [block.items?.join(' ') || block.content];
      }
      if (block.type === 'table' && block.tableData) {
        return [block.tableData.flatMap((row) => row).join(' ')];
      }
      return [block.content];
    })
    .filter(Boolean)
    .join('\n');
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

function actionableError(content: StructuredContent): AppError {
  const title = content.title?.trim() || 'Untitled source';
  const sourceUrl = content.source?.type === 'url' ? content.source.url?.trim() : undefined;

  if (content.source?.type === 'url') {
    const sourceContext = sourceUrl ? ` (${sourceUrl})` : '';
    return new AppError(
      `We couldn't extract the actual article content for "${title}"${sourceContext}. This page may require JavaScript or block automated access. Try pasting the article text or uploading a PDF.`,
      422,
      'SOURCE_CONTENT_UNAVAILABLE',
    );
  }
  if (content.source?.type === 'pdf') {
    return new AppError(
      `We couldn't extract readable text from "${title}". Try a text-based PDF or paste the document text.`,
      422,
      'SOURCE_CONTENT_UNAVAILABLE',
    );
  }
  return new AppError('Paste the source text you want ListenWise to teach.', 422, 'SOURCE_CONTENT_UNAVAILABLE');
}

/** Reject extraction artifacts before they can be sent to a lesson provider. */
export class SourceQualityService {
  public static assertUsable(content: StructuredContent): void {
    const sourceType = content.source?.type;
    const rawBody = bodyText(content).replace(/\s+/g, ' ').trim();
    if (!rawBody) throw actionableError(content);

    // Pasted text is user intent. Do not impose webpage length or boilerplate heuristics on it.
    if (sourceType === 'text') return;

    if (sourceType === 'pdf') {
      const sentences = rawBody.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
      const meaningful = sentences.filter((sentence) => !URL_BOILERPLATE.some(({ pattern }) => pattern.test(sentence)));
      if (meaningful.length === 0) throw actionableError(content);
      return;
    }

    const sourceUrl = content.source?.url?.trim();
    let parsedUrl: URL | undefined;
    try {
      if (sourceUrl) parsedUrl = new URL(sourceUrl);
    } catch {
      // A missing or invalid source URL is treated as incomplete URL extraction metadata.
    }
    const validSourceUrl = parsedUrl && ['http:', 'https:'].includes(parsedUrl.protocol);
    const sentences = rawBody.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
    const meaningfulSentences = sentences.filter(
      (sentence) => !URL_BOILERPLATE.some(({ pattern }) => pattern.test(sentence.trim())),
    );
    const meaningfulText = meaningfulSentences.join(' ').trim();
    const meaningfulWords = words(meaningfulText).length;
    const meaningfulCharacters = (meaningfulText.match(/[\p{L}\p{N}]/gu) || []).length;
    if (
      !validSourceUrl ||
      !content.title?.trim() ||
      meaningfulSentences.length === 0 ||
      meaningfulWords < config.minUrlContentWords ||
      meaningfulCharacters < config.minUrlContentChars
    ) {
      throw actionableError(content);
    }
  }
}
