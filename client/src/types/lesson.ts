/**
 * Client-side type definitions for generated lessons and audio playback metadata.
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

export interface AudioSegment {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  audioUrl: string;
  audioPath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
}

export interface LessonAudioResult {
  lessonId: string;
  totalDurationSeconds: number;
  audioSegments: AudioSegment[];
  allChaptersCompleted: boolean;
  createdAt: string;
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
  audioSegment?: AudioSegment;
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
  audioSegments?: AudioSegment[];
  totalAudioDurationSeconds?: number;
  createdAt: string;
}

export type Lesson = GeneratedLesson;
