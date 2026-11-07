import {
  StructuredContent,
  ContentSection,
  ContentBlock,
} from '../../models/structured-content.js';
import { AppError } from '../../middleware/error-handler.js';

export interface TextExtractOptions {
  customTitle?: string;
}

/**
 * Normalizes and reconstructs structured content from raw pasted text.
 */
export function extractFromPastedText(
  rawText: string,
  options?: TextExtractOptions,
): StructuredContent {
  if (!rawText || !rawText.trim()) {
    throw new AppError('The pasted text is empty.', 400, 'EMPTY_TEXT');
  }

  // 1. Normalize line breaks and remove unprintable control chars (except tabs & newlines)
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  const lines = normalized.split('\n');
  const sections: ContentSection[] = [];
  const sourceReferences: string[] = [];

  let detectedTitle = options?.customTitle;
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

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Check for fenced code blocks
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      currentSection.blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language: lang,
      });
      continue;
    }

    // Check for LaTeX display math ($$ ... $$)
    if (trimmed.startsWith('$$')) {
      const mathLines: string[] = [];
      if (trimmed.endsWith('$$') && trimmed.length > 2) {
        mathLines.push(trimmed.slice(2, -2).trim());
        i++;
      } else {
        mathLines.push(trimmed.slice(2).trim());
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathLines.push(lines[i].trim());
          i++;
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().replace(/\$\$$/, '').trim());
          i++;
        }
      }
      currentSection.blocks.push({
        type: 'equation',
        content: mathLines.join(' '),
      });
      continue;
    }

    // Check for Markdown table (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const tableLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // Parse table lines into 2D matrix
      const rows: string[][] = [];
      for (const tLine of tableLines) {
        // Skip separator row like |---|---|
        if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(tLine)) continue;
        const cells = tLine
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        currentSection.blocks.push({
          type: 'table',
          content: tableLines.join('\n'),
          tableData: rows,
        });
      }
      continue;
    }

    // Check for Markdown Headings (# Heading)
    const mdHeadingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (mdHeadingMatch) {
      const level = mdHeadingMatch[1].length;
      const headingText = mdHeadingMatch[2].trim();
      if (!detectedTitle && level === 1) {
        detectedTitle = headingText;
      }
      commitSection();
      currentSection.heading = headingText;
      currentSection.headingLevel = level;
      i++;
      continue;
    }

    // Check for Underlined Headings (Heading \n === or ---)
    if (i + 1 < lines.length && /^[=-]{3,}$/.test(lines[i + 1].trim()) && trimmed.length < 100) {
      const level = lines[i + 1].trim().startsWith('=') ? 1 : 2;
      if (!detectedTitle && level === 1) {
        detectedTitle = trimmed;
      }
      commitSection();
      currentSection.heading = trimmed;
      currentSection.headingLevel = level;
      i += 2;
      continue;
    }

    // Check for Chapter/Section titles (e.g. "Chapter 1: The Foundations", "1. Introduction")
    if (
      /^(?:chapter\s+\d+|section\s+\d+|\d+\.\s+[A-Z])/i.test(trimmed) &&
      trimmed.length < 80 &&
      (i + 1 >= lines.length || !lines[i + 1].trim())
    ) {
      commitSection();
      currentSection.heading = trimmed;
      currentSection.headingLevel = 2;
      i++;
      continue;
    }

    // Check for Blockquotes (> Quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [trimmed.replace(/^>\s?/, '')];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      currentSection.blocks.push({
        type: 'quote',
        content: quoteLines.join(' '),
      });
      continue;
    }

    // Check for Bullet list items (- item, * item)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^[-*•]\s+/, '')];
      i++;
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      currentSection.blocks.push({
        type: 'unordered-list',
        content: items.join('\n'),
        items,
      });
      continue;
    }

    // Check for Numbered list items (1. item, 1) item)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [trimmed.replace(/^\d+[.)]\s+/, '')];
      i++;
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      currentSection.blocks.push({
        type: 'ordered-list',
        content: items.join('\n'),
        items,
      });
      continue;
    }

    // Standard Paragraph: collect until blank line
    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>')
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    const fullParagraph = paraLines.join(' ');

    // Extract any embedded URLs for source reference tracking
    const urlMatches = fullParagraph.match(/https?:\/\/[^\s)\]]+/g);
    if (urlMatches) {
      for (const u of urlMatches) {
        if (!sourceReferences.includes(u)) sourceReferences.push(u);
      }
    }

    currentSection.blocks.push({
      type: 'paragraph',
      content: fullParagraph,
    });
  }

  commitSection();

  // If title was not explicitly found in headers, derive one from the first line or default
  if (!detectedTitle) {
    const firstLine = lines.find((l) => l.trim());
    if (firstLine && firstLine.trim().length <= 60 && !/[.!?]$/.test(firstLine.trim())) {
      detectedTitle = firstLine.trim();
    } else {
      detectedTitle = 'Pasted Learning Material';
    }
  }

  // Calculate word count
  let totalWords = 0;
  for (const sec of sections) {
    if (sec.heading) totalWords += sec.heading.split(/\s+/).length;
    for (const b of sec.blocks) {
      if (b.content) totalWords += b.content.split(/\s+/).length;
    }
  }

  return {
    title: detectedTitle,
    source: {
      type: 'text',
      extractedAt: new Date().toISOString(),
    },
    sections,
    wordCount: totalWords,
    language: 'en',
    sourceReferences: sourceReferences.length > 0 ? sourceReferences : undefined,
  };
}
