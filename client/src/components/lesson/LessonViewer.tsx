import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GeneratedLesson } from '../../types/lesson';
import { StructuredContent } from '../../types/structured-content';
import { AudioStatus } from '../../types/pipeline';
import { formatDuration } from '../../lib/format';
import { lessonDurationSeconds, segmentForChapter } from '../../lib/lesson-audio';
import { resolveAudioUrl } from '../../lib/audio-url';
import { ChapterNav } from './ChapterNav';
import { ChapterContent } from './ChapterContent';
import { AudioPlayer } from './AudioPlayer';

interface LessonViewerProps {
  lesson: GeneratedLesson;
  extractedContent: StructuredContent | null;
  audioStatus: AudioStatus;
  audioError: string | null;
  onReset: () => void;
  onRegenerateAudio: () => void;
}

function sourceLine(content: StructuredContent | null): string | null {
  if (!content) return null;
  if (content.source.type === 'url' && content.source.url) return content.source.url;
  if (content.source.type === 'pdf') return content.source.filename || 'PDF';
  if (content.source.type === 'text') return 'Pasted text';
  return null;
}

export function LessonViewer({
  lesson,
  extractedContent,
  audioStatus,
  audioError,
  onReset,
  onRegenerateAudio,
}: LessonViewerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const index = Math.min(activeIndex, Math.max(0, lesson.chapters.length - 1));
  const chapter = lesson.chapters[index];
  const segment = segmentForChapter(lesson, index);
  const generating = audioStatus === 'generating';
  const playable =
    !generating && segment?.status === 'completed' && Boolean(segment.audioUrl)
      ? resolveAudioUrl(segment.audioUrl, `${segment.createdAt}:${segment.fileSizeBytes}`)
      : null;

  const knownDuration = segment?.status === 'completed' ? segment.durationSeconds : 0;
  const totalDuration = lessonDurationSeconds(lesson);

  let statusText = 'Audio has not been generated';
  if (generating) statusText = 'Generating audio';
  else if (segment?.status === 'failed') statusText = 'Audio failed for this chapter';
  else if (segment?.status === 'completed') statusText = 'Audio ready';
  else if (audioStatus === 'failed') statusText = 'Audio generation failed';
  else if (audioStatus === 'ready' && !playable) statusText = 'No audio file for this chapter';

  const chapterNotice =
    audioError ||
    (segment?.status === 'failed'
      ? segment.error || 'This chapter did not get an audio file.'
      : null) ||
    (!generating && !playable ? 'This chapter does not have audio yet.' : null);

  const goTo = (next: number) => {
    const last = lesson.chapters.length - 1;
    setActiveIndex(Math.min(last, Math.max(0, next)));
  };

  if (!chapter) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-stone-600">This lesson has no chapters.</p>
        <button type="button" onClick={onReset} className="mt-4 text-sm font-medium underline">
          Start over
        </button>
      </div>
    );
  }

  const coverage = Math.round((lesson.validation?.coverageScore ?? 0) * 100);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <button
        type="button"
        onClick={onReset}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        New lesson
      </button>

      <header className="mt-6 max-w-3xl">
        <p className="text-sm text-stone-500">{lesson.subject}</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-stone-900">{lesson.documentTitle}</h1>
        <p className="mt-4 text-base leading-7 text-stone-600">{lesson.lessonOverview}</p>
        <p className="mt-4 text-sm leading-6 text-stone-500">
          {lesson.purpose}
          {sourceLine(extractedContent) ? ` · ${sourceLine(extractedContent)}` : ''}
          {extractedContent ? ` · ${extractedContent.wordCount.toLocaleString()} words` : ''}
          {totalDuration > 0 ? ` · ${formatDuration(totalDuration)} audio` : ''}
        </p>
        {lesson.validation && (
          <p className="mt-2 text-sm text-stone-500">
            Estimated section coverage {coverage}% ({lesson.validation.sourceCoverage}). This does not guarantee every source detail is included.
          </p>
        )}
      </header>

      {lesson.keyConcepts.length > 0 && (
        <dl className="mt-8 max-w-3xl space-y-4">
          {lesson.keyConcepts.map((concept) => (
            <div key={concept.name}>
              <dt className="text-sm font-medium text-stone-900">{concept.name}</dt>
              <dd className="mt-1 text-sm leading-6 text-stone-600">{concept.explanation}</dd>
            </div>
          ))}
        </dl>
      )}

      {lesson.validation?.warnings && lesson.validation.warnings.length > 0 && (
        <ul className="mt-6 max-w-3xl space-y-1 text-sm leading-6 text-stone-600">
          {lesson.validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {extractedContent && extractedContent.sections.length > 0 && (
        <details className="mt-6 max-w-3xl">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">
            Source sections ({extractedContent.sections.length})
          </summary>
          <ul className="mt-3 space-y-1 text-sm text-stone-600">
            {extractedContent.sections.map((section, sectionIndex) => (
              <li key={section.id || sectionIndex}>
                {section.heading || 'Untitled section'}
                {section.pageNumber ? ` · p. ${section.pageNumber}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-10 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <ChapterNav lesson={lesson} activeIndex={index} onSelect={goTo} />
        <div className="mt-6 min-w-0 lg:mt-0">
          <ChapterContent
            chapter={chapter}
            index={index}
            count={lesson.chapters.length}
            onPrevious={() => goTo(index - 1)}
            onNext={() => goTo(index + 1)}
            onFinish={onReset}
          />
        </div>
      </div>

      <div className="mt-8 pb-2">
        <AudioPlayer
          src={playable}
          knownDuration={knownDuration}
          lessonDuration={totalDuration}
          chapterTitle={chapter.title}
          chapterPosition={index + 1}
          chapterCount={lesson.chapters.length}
          statusText={statusText}
          notice={chapterNotice}
          generating={generating}
          onPrevious={() => goTo(index - 1)}
          onNext={() => goTo(index + 1)}
          onRegenerate={onRegenerateAudio}
        />
      </div>
    </div>
  );
}
