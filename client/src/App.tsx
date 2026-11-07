import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  Globe,
  FileUp,
  FileText,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Volume2,
  BookOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  checkBackendHealth,
  HealthResponse,
  extractFromUrlApi,
  extractFromPdfApi,
  extractFromTextApi,
  generateLessonApi,
} from './services/api';
import { StructuredContent } from './types/structured-content';
import { GeneratedLesson } from './types/lesson';
import { LessonViewer } from './components/LessonViewer';

type InputMode = 'url' | 'pdf' | 'text';
type ProcessStatus = 'idle' | 'extracting' | 'understanding' | 'ready' | 'error';

export default function App() {
  const [mode, setMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [backendMeta, setBackendMeta] = useState<HealthResponse | null>(null);

  // Lesson generation state
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [generatedLesson, setGeneratedLesson] = useState<GeneratedLesson | null>(null);
  const [extractedContent, setExtractedContent] = useState<StructuredContent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check backend health on mount
  useEffect(() => {
    let isMounted = true;
    checkBackendHealth()
      .then((data) => {
        if (isMounted) {
          setBackendStatus('connected');
          setBackendMeta(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setBackendStatus('disconnected');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        setFeedbackMessage('Please select a valid PDF file.');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setFeedbackMessage('File size exceeds the 20MB limit.');
        return;
      }
      setPdfFile(file);
      setFeedbackMessage(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        setFeedbackMessage('Please drop a valid PDF file.');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setFeedbackMessage('File size exceeds the 20MB limit.');
        return;
      }
      setPdfFile(file);
      setFeedbackMessage(null);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleGenerateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    // Validate input before initiating
    if (mode === 'url') {
      if (!url.trim()) {
        setFeedbackMessage('Please enter a webpage URL.');
        return;
      }
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setFeedbackMessage('Please enter a valid HTTP or HTTPS URL.');
          return;
        }
      } catch {
        setFeedbackMessage('Please enter a valid URL (e.g. https://example.com/article).');
        return;
      }
    } else if (mode === 'pdf') {
      if (!pdfFile) {
        setFeedbackMessage('Please upload a PDF file.');
        return;
      }
    } else if (mode === 'text') {
      if (!text.trim()) {
        setFeedbackMessage('Please paste the text content you want to learn.');
        return;
      }
      if (wordCount < 10) {
        setFeedbackMessage('Please provide at least a few sentences for a meaningful lesson.');
        return;
      }
    }

    try {
      // ── Step 1: Content Extraction ───────────────────────────
      setStatus('extracting');
      setStatusMessage('Extracting canonical content structure, headings, tables & formulas...');

      let ccr: StructuredContent;
      if (mode === 'url') {
        ccr = await extractFromUrlApi(url.trim());
      } else if (mode === 'pdf' && pdfFile) {
        ccr = await extractFromPdfApi(pdfFile);
      } else {
        ccr = await extractFromTextApi(text.trim());
      }

      setExtractedContent(ccr);

      // ── Step 2: AI Document Understanding & Lesson Script ───
      setStatus('understanding');
      setStatusMessage(`AI Understanding Engine analyzing "${ccr.title}" and generating teaching chapters...`);

      const lesson = await generateLessonApi(ccr);
      setGeneratedLesson(lesson);
      setStatus('ready');
    } catch (err: any) {
      console.error('[Lesson Generation Error]', err);
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred during lesson generation.');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setGeneratedLesson(null);
    setExtractedContent(null);
    setErrorMessage(null);
    setFeedbackMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 selection:bg-brand-100 selection:text-brand-900">
      {/* Header */}
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleReset}>
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shadow-xs text-white">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-semibold tracking-tight text-stone-900">ListenWise</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-stone-100 text-stone-600 rounded-md border border-stone-200">
                Phase 2
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-stone-500">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === 'connected'
                    ? 'bg-emerald-500'
                    : backendStatus === 'checking'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span className="hidden sm:inline">
                {backendStatus === 'connected'
                  ? `Backend connected (v${backendMeta?.version || '1.0'})`
                  : backendStatus === 'checking'
                  ? 'Connecting to backend...'
                  : 'Backend offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
        {/* If a lesson is ready, show LessonViewer */}
        {status === 'ready' && generatedLesson ? (
          <LessonViewer
            lesson={generatedLesson}
            extractedContent={extractedContent}
            onReset={handleReset}
          />
        ) : status === 'extracting' || status === 'understanding' ? (
          /* Processing State with pedagogical feedback */
          <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-stone-200/90 p-8 sm:p-12 text-center space-y-6 shadow-xs animate-in fade-in-50">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                {status === 'extracting'
                  ? 'Step 1/2: Extracting Structured Knowledge'
                  : 'Step 2/2: Teaching Engine at Work'}
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed text-balance">
                {statusMessage}
              </p>
            </div>

            <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full bg-brand-600 transition-all duration-700 ease-out ${
                  status === 'extracting' ? 'w-2/5 animate-pulse' : 'w-4/5'
                }`}
              />
            </div>

            <p className="text-xs text-stone-400">
              Grounding concepts section-by-section. Preserving formulas, numbers & examples.
            </p>
          </div>
        ) : status === 'error' ? (
          /* Error State with clear retry */
          <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-rose-200 p-8 sm:p-10 text-center space-y-6 shadow-xs animate-in fade-in-50">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-stone-900">
                Could Not Generate Lesson
              </h2>
              <p className="text-sm text-rose-700 bg-rose-50 p-4 rounded-xl border border-rose-100 text-left font-mono text-xs leading-relaxed overflow-x-auto">
                {errorMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-medium hover:bg-stone-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        ) : (
          /* Default Input State */
          <div className="w-full max-w-3xl mx-auto space-y-10 animate-in fade-in-50">
            {/* Hero Branding */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-brand-50 border border-brand-100 text-brand-700">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI-Powered Audio Learning</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-stone-900 text-balance">
                Read less.{' '}
                <span className="text-brand-600">Understand more.</span>
              </h1>
              <p className="text-base sm:text-lg text-stone-600 max-w-2xl mx-auto text-balance font-normal leading-relaxed">
                ListenWise transforms lengthy webpages, complex PDFs, and study notes into structured, natural-sounding audio lessons — explained with clarity like a master teacher.
              </p>
            </div>

            {/* Central Input Box */}
            <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden transition-all duration-200">
              {/* Input Mode Tabs */}
              <div className="grid grid-cols-3 border-b border-stone-200/80 bg-stone-50/50 p-1.5 gap-1.5 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setMode('url');
                    setFeedbackMessage(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
                    mode === 'url'
                      ? 'bg-white text-stone-900 shadow-2xs border border-stone-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60'
                  }`}
                >
                  <Globe className="w-4 h-4 text-brand-600" />
                  <span>Webpage URL</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('pdf');
                    setFeedbackMessage(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
                    mode === 'pdf'
                      ? 'bg-white text-stone-900 shadow-2xs border border-stone-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60'
                  }`}
                >
                  <FileUp className="w-4 h-4 text-brand-600" />
                  <span>Upload PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('text');
                    setFeedbackMessage(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg transition-all ${
                    mode === 'text'
                      ? 'bg-white text-stone-900 shadow-2xs border border-stone-200 font-semibold'
                      : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100/60'
                  }`}
                >
                  <FileText className="w-4 h-4 text-brand-600" />
                  <span>Paste Text</span>
                </button>
              </div>

              {/* Input Form Body */}
              <form onSubmit={handleGenerateLesson} className="p-6 sm:p-8 space-y-6">
                {/* Mode: Webpage URL */}
                {mode === 'url' && (
                  <div className="space-y-2">
                    <label htmlFor="url-input" className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">
                      Article or Webpage Link
                    </label>
                    <div className="relative">
                      <input
                        id="url-input"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://en.wikipedia.org/wiki/Artificial_intelligence"
                        className="w-full px-4 py-3.5 bg-stone-50/50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition text-sm"
                      />
                      {url && (
                        <button
                          type="button"
                          onClick={() => setUrl('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                          aria-label="Clear URL"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      Supports blogs, documentation, research essays, and news articles.
                    </p>
                  </div>
                )}

                {/* Mode: Upload PDF */}
                {mode === 'pdf' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">
                      PDF Document
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {!pdfFile ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                          isDragging
                            ? 'border-brand-500 bg-brand-50/50'
                            : 'border-stone-200 hover:border-brand-400 hover:bg-stone-50/50'
                        }`}
                      >
                        <div className="w-12 h-12 mx-auto rounded-full bg-brand-50 flex items-center justify-center text-brand-600 mb-3">
                          <FileUp className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-stone-800">
                          Drop your PDF file here, or{' '}
                          <span className="text-brand-600 underline underline-offset-2">browse</span>
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Academic papers, manuals, reports up to 20MB
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-xl">
                        <div className="flex items-center gap-3 truncate">
                          <div className="w-10 h-10 rounded-lg bg-brand-100/70 text-brand-700 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="truncate">
                            <p className="text-sm font-medium text-stone-900 truncate">
                              {pdfFile.name}
                            </p>
                            <p className="text-xs text-stone-500">
                              {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPdfFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/50 transition"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Mode: Paste Text */}
                {mode === 'text' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="text-input" className="block text-xs font-semibold text-stone-600 uppercase tracking-wider">
                        Source Text
                      </label>
                      <span className="text-xs text-stone-500">
                        {wordCount} {wordCount === 1 ? 'word' : 'words'}
                      </span>
                    </div>
                    <textarea
                      id="text-input"
                      rows={6}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste your study notes, essay, or book chapter here..."
                      className="w-full px-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition resize-y text-sm"
                    />
                    <p className="text-xs text-stone-500">
                      Paste raw text from textbooks, lectures, transcripts, or notes.
                    </p>
                  </div>
                )}

                {/* Feedback message */}
                {feedbackMessage && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-brand-50/80 border border-brand-100 text-stone-800 text-xs">
                    <AlertCircle className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{feedbackMessage}</span>
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm sm:text-base shadow-sm hover:shadow transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <span>Generate AI Educational Lesson</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>

            {/* Value Props / Architecture preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
              <div className="bg-white/60 backdrop-blur-xs p-5 rounded-xl border border-stone-200/70 text-left space-y-2">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 mb-2">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-stone-900">Logical Structure</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Reconstructs headers, tables, concepts, and relationships instead of shallow summarisation.
                </p>
              </div>

              <div className="bg-white/60 backdrop-blur-xs p-5 rounded-xl border border-stone-200/70 text-left space-y-2">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 mb-2">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-stone-900">Teaching Script</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Paced, pedagogical narration designed for auditory comprehension with zero generic filler.
                </p>
              </div>

              <div className="bg-white/60 backdrop-blur-xs p-5 rounded-xl border border-stone-200/70 text-left space-y-2">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 mb-2">
                  <Volume2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-stone-900">Timbre v2.5 Speech</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Studio-grade speech synthesis with chapter markers, interactive transcript, and player controls (Phase 3).
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 bg-white/60 py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <p>© {new Date().getFullYear()} ListenWise — Read less. Understand more.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-stone-400" />
              <span>Phase 2: AI Understanding Engine</span>
            </span>
            <span className="text-stone-300">•</span>
            <span>English</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
