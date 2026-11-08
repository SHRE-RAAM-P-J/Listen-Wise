import { GeneratedLesson } from '../../types/lesson';
import { formatDuration } from '../../lib/format';
import { segmentForChapter } from '../../lib/lesson-audio';

interface ChapterNavProps {
  lesson: GeneratedLesson;
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function ChapterNav({ lesson, activeIndex, onSelect }: ChapterNavProps) {
  return (
    <nav aria-label="Chapters" className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <p className="mb-3 hidden text-xs font-medium uppercase tracking-wide text-stone-500 lg:block">Chapters</p>
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {lesson.chapters.map((chapter, index) => {
          const selected = index === activeIndex;
          const segment = segmentForChapter(lesson, index);
          const duration =
            segment?.status === 'completed' && segment.durationSeconds > 0
              ? formatDuration(segment.durationSeconds)
              : null;
          return (
            <li key={chapter.id || index} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={selected ? 'true' : undefined}
                className={`flex w-full min-w-[12rem] items-start gap-3 rounded-xl px-3 py-3 text-left lg:min-w-0 ${
                  selected ? 'bg-white text-stone-900 ring-1 ring-stone-200' : 'text-stone-600 hover:bg-white/70'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    selected ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700'
                  }`}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{chapter.title}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {duration || (segment?.status === 'failed' ? 'Audio failed' : 'No audio yet')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
