/**
 * Canonical structured representation for extracted content (CCR).
 *
 * Every extraction pipeline (URL, PDF, text) converts its output
 * into this format before passing it to the AI learning engine.
 */

// ─── Block types ───────────────────────────────────────────────

export type BlockType =
  | 'title'
  | 'heading'
  | 'paragraph'
  | 'ordered-list'
  | 'unordered-list'
  | 'image'
  | 'image-caption'
  | 'table'
  | 'equation'
  | 'code'
  | 'quote'
  | 'link';

export interface ContentBlock {
  /** Optional deterministic block identifier for traceability. */
  id?: string;

  /** Discriminator for the block kind. */
  type: BlockType;

  /** Primary textual content of the block. */
  content: string;

  /** Heading depth (1–6). Only meaningful when type is 'heading'. */
  level?: number;

  /** Programming language hint. Only meaningful when type is 'code'. */
  language?: string;

  /** URL for images or links. */
  url?: string;

  /** Alt text for images. */
  alt?: string;

  /**
   * Table data: array of rows, each row an array of cell strings.
   * First row is treated as the header row when available.
   */
  tableData?: string[][];

  /** Ordered / unordered list items. */
  items?: string[];

  /**
   * Set to true when the extractor could not fully interpret this
   * block. The raw content is still preserved for downstream use.
   */
  partiallyUnderstood?: boolean;

  /** Optional metadata or context note attached by the extractor. */
  note?: string;

  /** Page number where this block appeared (primarily for PDF extraction). */
  pageNumber?: number;
}

// ─── Section ───────────────────────────────────────────────────

export interface ContentSection {
  /** Optional deterministic section identifier. */
  id?: string;

  /** Optional heading that introduces this section. */
  heading?: string;

  /** Heading depth (1–6) matching the heading hierarchy. */
  headingLevel?: number;

  /** Ordered list of blocks within this section. */
  blocks: ContentBlock[];

  /** Optional page number where section begins. */
  pageNumber?: number;
}

// ─── Document metadata ────────────────────────────────────────

export type SourceType = 'url' | 'pdf' | 'text';

export interface SourceMetadata {
  /** How the content was provided. */
  type: SourceType;

  /** Original URL (for URL sources). */
  url?: string;

  /** Original filename (for PDF uploads). */
  filename?: string;

  /** Timestamp of extraction. */
  extractedAt: string;

  /** File size in bytes if applicable. */
  fileSizeBytes?: number;
}

// ─── Top-level document ───────────────────────────────────────

export interface StructuredContent {
  /** Document title, if detected. */
  title: string;

  /** Brief description or subtitle, if available. */
  description?: string;

  /** Author(s), if detected. */
  authors?: string[];

  /** Information about the source. */
  source: SourceMetadata;

  /** Ordered sections preserving the document's structure. */
  sections: ContentSection[];

  /** Total approximate word count of extracted text. */
  wordCount: number;

  /** Language code (ISO 639-1). Defaults to 'en'. */
  language: string;

  /** Source references and citations extracted from the content. */
  sourceReferences?: string[];

  /** Warnings or notices generated during extraction. */
  extractionWarnings?: string[];
}

/**
 * Ensures all sections and blocks in a StructuredContent document have
 * stable, deterministic IDs for traceability in AI generation.
 */
export function ensureContentIdentifiers(content: StructuredContent): StructuredContent {
  return {
    ...content,
    sections: content.sections.map((section, sIdx) => {
      const sectionId = section.id || `sec-${sIdx + 1}`;
      return {
        ...section,
        id: sectionId,
        blocks: section.blocks.map((block, bIdx) => ({
          ...block,
          id: block.id || `${sectionId}-b${bIdx + 1}`,
        })),
      };
    }),
  };
}
