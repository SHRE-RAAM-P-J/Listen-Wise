import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Info,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { GeneratedLesson } from '../types/lesson';
import { StructuredContent } from '../types/structured-content';

interface LessonViewerProps {
  lesson: GeneratedLesson;
  extractedContent?: StructuredContent | null;
  onReset: () => void;
}

export const LessonViewer: React.FC<LessonViewerProps> = ({
  lesson,
  extractedContent,
  onReset,
}) => {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const activeChapter = lesson.chapters[activeChapterIndex] || lesson.chapters[0];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in-50 duration-300">
      {/* Top action / back bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-3.5 py-2 rounded-lg hover:bg-stone-50 transition shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>New Material</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>AI Lesson Generated</span>
          </span>
          <span className="text-xs text-stone-400">
            {lesson.chapters.length} {lesson.chapters.length === 1 ? 'Chapter' : 'Chapters'}
          </span>
        </div>
      </div>

      {/* Lesson Header Banner */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-medium text-brand-600 tracking-wide uppercase">
          <Sparkles className="w-4 h-4" />
          <span>{lesson.subject}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 text-balance">
          {lesson.documentTitle}
        </h1>

        <p className="text-sm sm:text-base text-stone-600 leading-relaxed text-balance">
          {lesson.lessonOverview}
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-stone-500 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-stone-400" />
            <span><strong>Purpose:</strong> {lesson.purpose}</span>
          </div>
          {extractedContent?.wordCount && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              <span>Source: ~{extractedContent.wordCount} words</span>
            </div>
          )}
        </div>
      </div>

      {/* Key Concepts Strip */}
      {lesson.keyConcepts && lesson.keyConcepts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-600 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-brand-600" />
            <span>Core Grounded Concepts</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {lesson.keyConcepts.map((concept, idx) => (
              <div
                key={idx}
                className="bg-white p-4 rounded-xl border border-stone-200/80 shadow-2xs space-y-1.5"
              >
                <h4 className="text-xs font-semibold text-stone-900">{concept.name}</h4>
                <p className="text-xs text-stone-600 leading-relaxed">{concept.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chapter Reader Container */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
        {/* Chapter Tabs Navigation */}
        <div className="border-b border-stone-200 bg-stone-50/70 p-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {lesson.chapters.map((ch, idx) => {
              const isActive = idx === activeChapterIndex;
              return (
                <button
                  key={ch.id || idx}
                  type="button"
                  onClick={() => setActiveChapterIndex(idx)}
                  className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-white text-stone-900 shadow-2xs border border-stone-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100/60'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-brand-600 text-white' : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[180px]">{ch.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Chapter Teaching Content */}
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
              Chapter {activeChapterIndex + 1} of {lesson.chapters.length}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
              {activeChapter.title}
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-1 italic">
              {activeChapter.overview}
            </p>
          </div>

          {/* Concepts Covered Tags */}
          {activeChapter.conceptsCovered && activeChapter.conceptsCovered.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeChapter.conceptsCovered.map((c, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-100"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Full Teaching Script */}
          <div className="prose prose-stone max-w-none text-sm sm:text-base leading-relaxed text-stone-800 space-y-4 pt-2">
            {activeChapter.teachingScript.split('\n\n').map((paragraph, pIdx) => (
              <p key={pIdx} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Transition Hook */}
          {activeChapter.transitionToNext && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Bridge to Next Chapter
              </span>
              <p className="text-xs sm:text-sm text-stone-700 italic">
                "{activeChapter.transitionToNext}"
              </p>
            </div>
          )}

          {/* Source Attribution & Traceability */}
          {activeChapter.sourceReferences && activeChapter.sourceReferences.length > 0 && (
            <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className="font-semibold text-stone-600">Source References:</span>
              {activeChapter.sourceReferences.map((ref, rIdx) => (
                <span
                  key={rIdx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[11px]"
                  title={ref.blockId ? `Block ID: ${ref.blockId}` : undefined}
                >
                  <span>{ref.sectionTitle || ref.blockId || 'Source block'}</span>
                  {ref.pageNumber && <span>(p. {ref.pageNumber})</span>}
                </span>
              ))}
            </div>
          )}

          {/* Chapter Navigation Buttons */}
          <div className="pt-4 flex items-center justify-between border-t border-stone-100">
            <button
              type="button"
              disabled={activeChapterIndex === 0}
              onClick={() => setActiveChapterIndex((prev) => Math.max(0, prev - 1))}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Previous Chapter
            </button>

            {activeChapterIndex < lesson.chapters.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveChapterIndex((prev) => prev + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition"
              >
                <span>Next Chapter</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition"
              >
                <span>Finish Lesson</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Validation & Transparency Banner */}
      <div className="bg-stone-50 rounded-2xl border border-stone-200/90 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
              Pedagogical & Factual Validation
            </h3>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-md ${
              lesson.validation.sourceCoverage === 'passed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            Coverage: {Math.round(lesson.validation.coverageScore * 100)}%
          </span>
        </div>

        {lesson.validation.warnings && lesson.validation.warnings.length > 0 && (
          <div className="space-y-1.5 text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Coverage & Interpretation Notices</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
              {lesson.validation.warnings.map((warn, wIdx) => (
                <li key={wIdx}>{warn}</li>
              ))}
            </ul>
          </div>
        )}

        {lesson.validation.unsupportedClaims && lesson.validation.unsupportedClaims.length > 0 && (
          <div className="space-y-1.5 text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Unsupported Claim Flags</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
              {lesson.validation.unsupportedClaims.map((claim, cIdx) => (
                <li key={cIdx}>
                  <strong>{claim.claim}:</strong> {claim.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-stone-400">
          ListenWise uses the original source as its factual authority. Teaching scripts are section-grounded without arbitrary model hallucinations.
        </p>
      </div>
    </div>
  );
};
