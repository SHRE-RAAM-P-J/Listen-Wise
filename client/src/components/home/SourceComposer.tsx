import { FormEvent, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { InputMode } from '../../types/pipeline';
import { formatFileSize, wordCount } from '../../lib/format';

interface SourceComposerProps {
  mode: InputMode;
  url: string;
  text: string;
  pdfFile: File | null;
  validationMessage: string | null;
  serverNote: string | null;
  busy: boolean;
  onModeChange: (mode: InputMode) => void;
  onUrlChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onPdfChange: (file: File | null) => void;
  onSubmit: () => void;
}

const MODES: { id: InputMode; label: string; short: string }[] = [
  { id: 'url', label: 'Webpage', short: 'URL' },
  { id: 'pdf', label: 'PDF', short: 'PDF' },
  { id: 'text', label: 'Pasted text', short: 'Text' },
];

export function SourceComposer({
  mode,
  url,
  text,
  pdfFile,
  validationMessage,
  serverNote,
  busy,
  onModeChange,
  onUrlChange,
  onTextChange,
  onPdfChange,
  onSubmit,
}: SourceComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const words = wordCount(text);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const takeFile = (file: File | undefined) => {
    if (!file) return;
    onPdfChange(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200 bg-white">
      <div role="tablist" aria-label="Source type" className="grid grid-cols-3 gap-1 border-b border-stone-200 p-1.5">
        {MODES.map((item) => {
          const selected = mode === item.id;
          return (
            <button
              key={item.id}
              id={`source-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="source-panel"
              onClick={() => onModeChange(item.id)}
              className={`min-h-11 rounded-lg px-2 text-sm ${
                selected ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="source-panel"
        aria-labelledby={`source-tab-${mode}`}
        className="space-y-5 p-5 sm:p-7"
      >
        {mode === 'url' && (
          <div className="space-y-2">
            <label htmlFor="url-input" className="block text-sm font-medium text-stone-800">
              Webpage URL
            </label>
            <div className="relative">
              <input
                id="url-input"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://example.com/article"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 pr-10 text-sm text-stone-900 placeholder:text-stone-400"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => onUrlChange('')}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100"
                  aria-label="Clear URL"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-sm text-stone-500">Articles, documentation, and public webpages.</p>
          </div>
        )}

        {mode === 'pdf' && (
          <div className="space-y-2">
            <span className="block text-sm font-medium text-stone-800">PDF document</span>
            <input
              ref={fileRef}
              id="pdf-input"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => takeFile(event.target.files?.[0])}
            />
            {!pdfFile ? (
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  takeFile(event.dataTransfer.files?.[0]);
                }}
                className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center"
              >
                <p className="text-sm text-stone-700">Drop a PDF here, or</p>
                <label
                  htmlFor="pdf-input"
                  className="mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4"
                >
                  browse files
                </label>
                <p className="mt-2 text-sm text-stone-500">Up to 20 MB.</p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{pdfFile.name}</p>
                  <p className="text-sm text-stone-500">{formatFileSize(pdfFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPdfChange(null)}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'text' && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="text-input" className="text-sm font-medium text-stone-800">
                Pasted text
              </label>
              <p className="text-xs text-stone-500" aria-live="polite">
                {words} {words === 1 ? 'word' : 'words'}
              </p>
            </div>
            <textarea
              id="text-input"
              name="text"
              rows={8}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="Paste notes, a chapter, or an explanation."
              className="w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm leading-6 text-stone-900 placeholder:text-stone-400"
            />
            <p className="text-sm text-stone-500">A few sentences at minimum. Longer notes make a fuller lesson.</p>
          </div>
        )}

        {validationMessage && (
          <p id="source-feedback" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
            {validationMessage}
          </p>
        )}

        {serverNote && (
          <p role="status" className="text-sm text-stone-600">
            {serverNote}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{busy ? 'Starting lesson' : 'Generate lesson'}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
