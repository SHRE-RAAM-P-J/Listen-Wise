export type InputMode = 'url' | 'pdf' | 'text';

export type Screen = 'home' | 'processing' | 'lesson';

export type StageId = 'reading' | 'extracting' | 'understanding' | 'chapters' | 'audio';

export type StageState = 'pending' | 'active' | 'complete' | 'failed';

export type FailurePoint = 'source' | 'lesson' | 'audio' | null;

export type AudioStatus = 'missing' | 'generating' | 'ready' | 'failed';

export interface SourceDraft {
  mode: InputMode;
  url: string;
  text: string;
  pdfFile: File | null;
}

export interface StageView {
  id: StageId;
  label: string;
  description: string;
  state: StageState;
}

export const STAGE_ORDER: StageId[] = [
  'reading',
  'extracting',
  'understanding',
  'chapters',
  'audio',
];

export const STAGE_COPY: Record<StageId, { label: string; description: string }> = {
  reading: {
    label: 'Reading the source',
    description: 'Opening the webpage, PDF, or text you submitted.',
  },
  extracting: {
    label: 'Extracting document content',
    description: 'Headings, sections, and body text from the extraction response.',
  },
  understanding: {
    label: 'Understanding concepts',
    description: 'The teaching engine is reading the extracted document.',
  },
  chapters: {
    label: 'Creating lesson chapters',
    description: 'Chapters are ready when the lesson response arrives.',
  },
  audio: {
    label: 'Generating audio',
    description: 'Speech is ready when synthesis returns a playable file for each chapter.',
  },
};

export function createStages(
  stateFor: (id: StageId) => StageState,
): StageView[] {
  return STAGE_ORDER.map((id) => ({
    id,
    label: STAGE_COPY[id].label,
    description: STAGE_COPY[id].description,
    state: stateFor(id),
  }));
}

export function idleStages(): StageView[] {
  return createStages(() => 'pending');
}
