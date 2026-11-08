import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LessonChapter } from '../../types/lesson';
import { Transcript } from './Transcript';

interface ChapterContentProps {
  chapter: LessonChapter;
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
}

export function ChapterContent({
  chapter,
  index,
  count,
  onPrevious,
  onNext,
  onFinish,
}: ChapterContentProps) {
  const references = (chapter.sourceReferences || []).filter(
    (reference) => reference.sectionTitle || reference.blockId || reference.pageNumber,
  );
  const isLast = index >= count - 1;

  return (
    <article className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        Chapter {index + 1} of {count}
      </p>
      <h2 className="mt-2 font-serif text-3xl leading-tight text-stone-900">{chapter.title}</h2>
      {chapter.overview && (
        <p className="mt-4 text-base leading-7 text-stone-600">{chapter.overview}</p>
      )}

      {chapter.conceptsCovered.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Concepts in this chapter">
          {chapter.conceptsCovered.map((concept) => (
            <li key={concept} className="rounded-full bg-stone-200/70 px-3 py-1 text-xs text-stone-700">
              {concept}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Transcript text={chapter.teachingScript} />
      </div>

      {chapter.transitionToNext && (
        <p className="mt-8 border-t border-stone-200 pt-6 text-sm leading-6 text-stone-600">
          <span className="font-medium text-stone-800">Next: </span>
          {chapter.transitionToNext}
        </p>
      )}

      {references.length > 0 && (
        <p className="mt-6 text-sm leading-6 text-stone-500">
          <span className="font-medium text-stone-700">Sources: </span>
          {references
            .map((reference) => {
              const label = reference.sectionTitle || reference.blockId || 'Source';
              return reference.pageNumber ? `${label} (p. ${reference.pageNumber})` : label;
            })
            .join(' · ')}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-stone-200 pt-6">
        <button
          type="button"
          onClick={onPrevious}
          disabled={index === 0}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-stone-800 hover:bg-white disabled:cursor-not-allowed disabled:text-stone-400"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800"
          >
            New lesson
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800"
          >
            Next chapter
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
