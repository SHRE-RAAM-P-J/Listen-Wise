/**
 * Client-side type definitions for structured content.
 * Mirrors the server models.
 */

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
  id?: string;
  type: BlockType;
  content: string;
  level?: number;
  language?: string;
  url?: string;
  alt?: string;
  tableData?: string[][];
  items?: string[];
  partiallyUnderstood?: boolean;
  note?: string;
  pageNumber?: number;
}

export interface ContentSection {
  id?: string;
  heading?: string;
  headingLevel?: number;
  blocks: ContentBlock[];
  pageNumber?: number;
}

export type SourceType = 'url' | 'pdf' | 'text';

export interface SourceMetadata {
  type: SourceType;
  url?: string;
  filename?: string;
  extractedAt: string;
  fileSizeBytes?: number;
}

export interface StructuredContent {
  title: string;
  description?: string;
  authors?: string[];
  source: SourceMetadata;
  sections: ContentSection[];
  wordCount: number;
  language: string;
  sourceReferences?: string[];
  extractionWarnings?: string[];
}
