import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { GeneratedLesson } from '../types/lesson';
import { StructuredContent } from '../types/structured-content';
import { FailurePoint, StageView } from '../types/pipeline';

interface ProcessingPageProps {
  stages: StageView[];
  content: StructuredContent | null;
  lesson: GeneratedLesson | null;
  error: string | null;
  failurePoint: FailurePoint;
  busy: boolean;
  onRetry: () => void;
  onOpenLesson: () => void;
  onStartOver: () => void;
}

function statusWord(state: StageView['state']): string {
  if (state === 'complete') return 'Complete';
  if (state === 'active') return 'In progress';
  if (state === 'failed') return 'Failed';
  return 'Waiting';
}

function sourceLabel(content: StructuredContent): string {
  if (content.source.type === 'url') return content.source.url || 'Webpage';
  if (content.source.type === 'pdf') return content.source.filename || 'PDF';
  return 'Pasted text';
}

export function ProcessingPage({
  stages,
  content,
  lesson,
  error,
  failurePoint,
  busy,
  onRetry,
  onOpenLesson,
  onStartOver,
}: ProcessingPageProps) {
  const active = stages.filter((stage) => stage.state === 'active');
  const headline =
    active.length > 0
      ? active.map((stage) => stage.label).join(' · ')
      : error
        ? 'Something needs attention'
        : 'Preparing your lesson';

  const readingPair = stages.filter((stage) => stage.id === 'reading' || stage.id === 'extracting');
  const lessonPair = stages.filter((stage) => stage.id === 'understanding' || stage.id === 'chapters');
  const showExtractNote = readingPair.every((stage) => stage.state === 'active');
  const showLessonNote = lessonPair.every((stage) => stage.state === 'active');

  const retryLabel =
    failurePoint === 'audio' ? 'Retry audio' : failurePoint === 'lesson' ? 'Retry lesson' : 'Try again';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="text-sm font-medium text-stone-500">Creating your lesson</p>
      <h1 className="mt-3 font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">{headline}</h1>
      <p className="sr-only" aria-live="polite">
        {headline}
      </p>

      {(showExtractNote || showLessonNote) && (
        <p className="mt-4 text-sm leading-6 text-stone-600">
          {showExtractNote
            ? 'Reading and extraction finish together when the extraction response arrives. Nothing is marked complete before that.'
            : 'Understanding and chapter creation finish together when the lesson response arrives.'}
        </p>
      )}

      <ol className="mt-8 space-y-5">
        {stages.map((stage) => (
          <li key={stage.id} className="flex gap-3" aria-current={stage.state === 'active' ? 'step' : undefined}>
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
              {stage.state === 'complete' && <Check className="h-4 w-4 text-emerald-700" />}
              {stage.state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-stone-700" />}
              {stage.state === 'failed' && <AlertCircle className="h-4 w-4 text-rose-700" />}
              {stage.state === 'pending' && <span className="h-2 w-2 rounded-full bg-stone-300" />}
            </span>
            <div>
              <p className={`text-sm font-medium ${stage.state === 'pending' ? 'text-stone-400' : 'text-stone-900'}`}>
                {stage.label}
                <span className="sr-only">, {statusWord(stage.state)}</span>
              </p>
              <p className={`mt-1 text-sm leading-6 ${stage.state === 'pending' ? 'text-stone-400' : 'text-stone-600'}`}>
                {stage.description}
              </p>
              {stage.state === 'failed' && (
                <p className="mt-1 text-sm font-medium text-rose-800">Failed</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {content && (
        <section className="mt-10 border-t border-stone-200 pt-8" aria-labelledby="extracted-document-title">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Extraction complete</p>
          <h2 id="extracted-document-title" className="mt-2 font-serif text-2xl text-stone-900">
            {content.title || 'Untitled document'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {sourceLabel(content)} · {content.wordCount.toLocaleString()} words · {content.sections.length}{' '}
            {content.sections.length === 1 ? 'section' : 'sections'}
          </p>
          {content.extractionWarnings && content.extractionWarnings.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-stone-600">
              {content.extractionWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          )}
          {content.sections.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">No sections were detected in this document.</p>
          ) : (
            <ul className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
              {content.sections.map((section, index) => (
                <li key={section.id || index} className="text-sm text-stone-700">
                  <span className="text-stone-400">{index + 1}.</span>{' '}
                  {section.heading || 'Untitled section'}
                  {section.pageNumber ? ` · p. ${section.pageNumber}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {lesson && (
        <p className="mt-6 text-sm text-stone-700">
          Lesson ready: {lesson.documentTitle}. {lesson.chapters.length}{' '}
          {lesson.chapters.length === 1 ? 'chapter' : 'chapters'}.
        </p>
      )}

      {error && (
        <div role="alert" className="mt-8 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
          <p className="text-sm font-medium text-rose-950">
            {failurePoint === 'audio'
              ? 'Audio generation failed'
              : failurePoint === 'lesson'
                ? 'The lesson could not be created'
                : 'The source could not be read'}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-rose-900">{error}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {busy ? 'Working' : retryLabel}
            </button>
            {lesson && (
              <button
                type="button"
                onClick={onOpenLesson}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50"
              >
                Open lesson
              </button>
            )}
            <button
              type="button"
              onClick={onStartOver}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
