import { StructuredContent, ContentSection } from '../../models/structured-content.js';
import { config } from '../../config.js';
import { AppError } from '../../middleware/error-handler.js';

export interface DocumentChunk {
  chunkIndex: number;
  totalChunks: number;
  sections: ContentSection[];
  wordCount: number;
  sectionTitles: string[];
  blockIds: string[];
  suggestedTitle: string;
}

export class ChunkingService {
  /**
   * Validates document size and splits canonical sections into ordered chunks
   * preserving section boundaries, formulas, code, tables, and block identifiers.
   */
  public static createChunks(document: StructuredContent): DocumentChunk[] {
    const totalWords = document.wordCount;

    if (totalWords > config.maxDocumentWords) {
      throw new AppError(
        `Document size (${totalWords} words) exceeds the maximum allowed limit of ${config.maxDocumentWords} words for AI understanding.`,
        413,
        'DOCUMENT_TOO_LARGE',
      );
    }

    if (!document.sections || document.sections.length === 0) {
      throw new AppError('The document contains no sections to process.', 400, 'NO_SECTIONS_FOUND');
    }

    const targetWords = config.targetChunkWords;
    const chunks: DocumentChunk[] = [];

    let currentSections: ContentSection[] = [];
    let currentWords = 0;

    const commitChunk = () => {
      if (currentSections.length > 0) {
        const sectionTitles = currentSections
          .map((s) => s.heading)
          .filter((h): h is string => Boolean(h && h.trim()));

        const blockIds = currentSections.flatMap((s) =>
          s.blocks.map((b) => b.id).filter((id): id is string => Boolean(id)),
        );

        const primaryTitle =
          sectionTitles[0] ||
          (chunks.length === 0 ? document.title : `Part ${chunks.length + 1}`);

        chunks.push({
          chunkIndex: chunks.length + 1,
          totalChunks: 0, // updated at end
          sections: currentSections,
          wordCount: currentWords,
          sectionTitles,
          blockIds,
          suggestedTitle: primaryTitle,
        });

        currentSections = [];
        currentWords = 0;
      }
    };

    for (const section of document.sections) {
      const sectionWords = this.countSectionWords(section);

      // Group into manageable chapters: max 2 sections per chapter if document has multiple sections,
      // or whenever words reach targetChunkWords
      const maxSectionsPerChunk = document.sections.length > 2 ? 2 : 3;

      if (currentWords > 0 && (currentWords + sectionWords > targetWords * 1.3 || currentSections.length >= maxSectionsPerChunk)) {
        commitChunk();
      }

      currentSections.push(section);
      currentWords += sectionWords;

      if (currentWords >= targetWords || currentSections.length >= maxSectionsPerChunk) {
        commitChunk();
      }
    }

    commitChunk();

    // Set totalChunks across all chunks
    for (const chunk of chunks) {
      chunk.totalChunks = chunks.length;
    }

    return chunks;
  }

  /**
   * Accurately calculates words in a section including headers, blocks, and tables.
   */
  public static countSectionWords(section: ContentSection): number {
    let words = 0;
    if (section.heading) {
      words += section.heading.trim().split(/\s+/).length;
    }
    for (const block of section.blocks) {
      if (block.content) {
        words += block.content.trim().split(/\s+/).length;
      }
      if (block.items) {
        words += block.items.join(' ').trim().split(/\s+/).length;
      }
      if (block.tableData) {
        for (const row of block.tableData) {
          words += row.join(' ').trim().split(/\s+/).length;
        }
      }
    }
    return words;
  }
}
