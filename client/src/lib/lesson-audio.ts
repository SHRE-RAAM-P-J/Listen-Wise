import { AudioSegment, GeneratedLesson, LessonAudioResult } from '../types/lesson';

export function segmentForChapter(
  lesson: GeneratedLesson,
  chapterPosition: number,
): AudioSegment | undefined {
  const chapter = lesson.chapters[chapterPosition];
  if (!chapter) return undefined;
  if (chapter.audioSegment) return chapter.audioSegment;
  const chapterIndex = chapter.index ?? chapterPosition + 1;
  return lesson.audioSegments?.find(
    (segment) => segment.chapterId === chapter.id || segment.chapterIndex === chapterIndex,
  );
}

export function applyAudioResult(
  lesson: GeneratedLesson,
  result: LessonAudioResult,
): GeneratedLesson {
  const chapters = lesson.chapters.map((chapter, index) => {
    const chapterIndex = chapter.index ?? index + 1;
    const segment = result.audioSegments.find(
      (item) => item.chapterId === chapter.id || item.chapterIndex === chapterIndex,
    );
    if (!segment) return chapter;
    return {
      ...chapter,
      audioSegment: segment,
      estimatedDurationSeconds: segment.durationSeconds || chapter.estimatedDurationSeconds,
    };
  });

  return {
    ...lesson,
    id: result.lessonId || lesson.id,
    chapters,
    audioSegments: result.audioSegments,
    totalAudioDurationSeconds: result.totalDurationSeconds,
  };
}

export function lessonDurationSeconds(lesson: GeneratedLesson): number {
  if (lesson.totalAudioDurationSeconds && lesson.totalAudioDurationSeconds > 0) {
    return lesson.totalAudioDurationSeconds;
  }
  const segments = lesson.audioSegments ?? [];
  return segments.reduce((sum, segment) => {
    if (segment.status !== 'completed') return sum;
    return sum + (segment.durationSeconds || 0);
  }, 0);
}
