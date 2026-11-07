/**
 * Client-side type definitions for generated lessons.
 * Mirrors server lesson models.
 */

export interface ChapterSourceReference {
  blockId?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
}

export interface KeyConcept {
  name: string;
  explanation: string;
  sourceReferences: string[];
}

export interface LessonChapter {
  id: string;
  index?: number;
  title: string;
  overview: string;
  conceptsCovered: string[];
  teachingScript: string;
  transitionToNext: string;
  sourceReferences: ChapterSourceReference[];
  estimatedDurationSeconds?: number;
}

export interface UnsupportedClaimItem {
  claim: string;
  chapterId?: string;
  reason: string;
  severity: 'warning' | 'discrepancy';
}

export interface LessonValidation {
  sourceCoverage: 'passed' | 'partial' | 'failed';
  coverageScore: number;
  unsupportedClaims: UnsupportedClaimItem[];
  warnings: string[];
  coveredSectionTitles: string[];
  missingSectionTitles: string[];
}

export interface GeneratedLesson {
  id: string;
  documentTitle: string;
  subject: string;
  purpose: string;
  lessonOverview: string;
  keyConcepts: KeyConcept[];
  chapters: LessonChapter[];
  completeLessonScript: string;
  validation: LessonValidation;
  createdAt: string;
}

export type Lesson = GeneratedLesson;
