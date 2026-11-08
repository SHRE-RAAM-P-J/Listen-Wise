import { useCallback, useRef, useState } from 'react';
import {
  extractFromPdfApi,
  extractFromTextApi,
  extractFromUrlApi,
  generateLessonApi,
  generateLessonAudioApi,
} from '../services/api';
import { GeneratedLesson } from '../types/lesson';
import { StructuredContent } from '../types/structured-content';
import {
  AudioStatus,
  FailurePoint,
  InputMode,
  Screen,
  StageId,
  StageView,
  createStages,
  idleStages,
} from '../types/pipeline';
import { isAbortError, toUserMessage } from '../lib/errors';
import { applyAudioResult } from '../lib/lesson-audio';
import { validatePdfFile, validateSource } from '../lib/source';
import { ApiRequestError } from '../services/api';

type StartAt = 'extract' | 'lesson' | 'audio';

function stagesFor(active: StageId[], complete: StageId[], failed: StageId[] = []): StageView[] {
  return createStages((id) => {
    if (failed.includes(id)) return 'failed';
    if (complete.includes(id)) return 'complete';
    if (active.includes(id)) return 'active';
    return 'pending';
  });
}

export function useLessonPipeline() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [stages, setStages] = useState<StageView[]>(idleStages);
  const [content, setContent] = useState<StructuredContent | null>(null);
  const [lesson, setLesson] = useState<GeneratedLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failurePoint, setFailurePoint] = useState<FailurePoint>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [failureType, setFailureType] = useState<'temporary' | 'permanent' | 'source' | 'request' | null>(null);
  const [failureRetryable, setFailureRetryable] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('missing');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<StructuredContent | null>(null);
  const lessonRef = useRef<GeneratedLesson | null>(null);

  const rememberContent = (value: StructuredContent | null) => {
    contentRef.current = value;
    setContent(value);
  };

  const rememberLesson = (value: GeneratedLesson | null) => {
    lessonRef.current = value;
    setLesson(value);
  };

  const beginRun = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++runId.current;
    setBusy(true);
    setError(null);
    setFailurePoint(null);
    setFailureCode(null);
    setFailureType(null);
    setFailureRetryable(false);
    setFailureCode(null);
    setFailureType(null);
    setFailureRetryable(false);
    return { id, signal: controller.signal };
  };

  const isCurrent = (id: number) => runId.current === id;

  const execute = useCallback(async (startAt: StartAt) => {
    const { id, signal } = beginRun();
    setScreen('processing');

    try {
      let extracted = contentRef.current;
      if (startAt === 'extract') {
        const extractionStages = stagesFor(['reading', 'extracting'], []);
        if (mode === 'pdf') {
          const extractionStage = extractionStages.find((stage) => stage.id === 'extracting');
          if (extractionStage) {
            extractionStage.description = 'Checking for selectable text and recognizing scanned pages with OCR. Large or low-quality scans may take longer.';
          }
        }
        setStages(extractionStages);
        rememberContent(null);
        rememberLesson(null);
        setAudioStatus('missing');
        setAudioError(null);

        if (mode === 'url') {
          extracted = await extractFromUrlApi(url.trim(), signal);
        } else if (mode === 'pdf' && pdfFile) {
          extracted = await extractFromPdfApi(pdfFile, signal);
        } else {
          extracted = await extractFromTextApi(text.trim(), undefined, signal);
        }
        if (!isCurrent(id)) return;
        rememberContent(extracted);
        setStages(stagesFor([], ['reading', 'extracting']));
      }

      let nextLesson = lessonRef.current;
      if (startAt === 'extract' || startAt === 'lesson') {
        if (!extracted) {
          throw new Error('Extracted content is missing. Start again from your source.');
        }
        setStages(stagesFor(['understanding', 'chapters'], ['reading', 'extracting']));
        setAudioStatus('missing');
        setAudioError(null);
        nextLesson = await generateLessonApi(extracted, signal);
        if (!isCurrent(id)) return;
        rememberLesson(nextLesson);
        setStages(stagesFor([], ['reading', 'extracting', 'understanding', 'chapters']));
      }

      if (!nextLesson) {
        throw new Error('The lesson is missing. Generate it again.');
      }

      setStages(stagesFor(['audio'], ['reading', 'extracting', 'understanding', 'chapters']));
      setAudioStatus('generating');
      setAudioError(null);

      try {
        const audioResult = await generateLessonAudioApi(nextLesson, undefined, signal);
        if (!isCurrent(id)) return;
        const merged = applyAudioResult(nextLesson, audioResult);
        rememberLesson(merged);
        if (!audioResult.allChaptersCompleted) {
          const message = 'Some chapters did not finish generating audio. You can retry audio or open the lesson and listen to chapters that are ready.';
          setStages(stagesFor([], ['reading', 'extracting', 'understanding', 'chapters'], ['audio']));
          setAudioStatus('failed');
          setAudioError(message);
          setError(message);
          setFailurePoint('audio');
          setFailureCode('TTS_PARTIAL_FAILURE');
          setFailureType('temporary');
          setFailureRetryable(true);
          return;
        }
        setStages(stagesFor([], ['reading', 'extracting', 'understanding', 'chapters', 'audio']));
        setAudioStatus('ready');
        setFailurePoint(null);
        setScreen('lesson');
      } catch (err: unknown) {
        if (isAbortError(err) || !isCurrent(id)) return;
        const requestError = err instanceof ApiRequestError ? err : null;
        setStages(stagesFor([], ['reading', 'extracting', 'understanding', 'chapters'], ['audio']));
        setAudioStatus('failed');
        setAudioError(toUserMessage(err, 'Audio generation failed.'));
        setFailurePoint('audio');
        setFailureCode(requestError?.code || 'TTS_FAILURE');
        setFailureType(requestError?.failureType || 'temporary');
        setFailureRetryable(requestError?.retryable ?? true);
        setError(toUserMessage(err, 'Audio generation failed.'));
      }
    } catch (err: unknown) {
      if (isAbortError(err) || !isCurrent(id)) return;
      const message = toUserMessage(err, 'The lesson could not be created.');
      setError(message);
      const errorCode = err instanceof ApiRequestError ? err.code : undefined;
      const requestError = err instanceof ApiRequestError ? err : null;
      setFailureCode(errorCode || null);
      setFailureType(requestError?.failureType || null);
      setFailureRetryable(requestError?.retryable ?? false);
      if (startAt === 'extract' && !contentRef.current) {
        setStages(stagesFor([], [], ['reading', 'extracting']));
        setFailurePoint('source');
      } else if (errorCode === 'SOURCE_CONTENT_UNAVAILABLE' || errorCode === 'SOURCE_VALIDATION_FAILED') {
        setStages(
          errorCode === 'SOURCE_CONTENT_UNAVAILABLE'
            ? stagesFor([], [], ['reading', 'extracting'])
            : stagesFor([], ['reading', 'extracting'], ['understanding', 'chapters']),
        );
        setFailurePoint('source');
      } else {
        setStages(stagesFor([], ['reading', 'extracting'], ['understanding', 'chapters']));
        setFailurePoint('lesson');
      }
    } finally {
      if (isCurrent(id)) setBusy(false);
    }
  }, [mode, url, text, pdfFile]);

  const submit = () => {
    if (busy) return;
    const message = validateSource({ mode, url, text, pdfFile });
    setValidationMessage(message);
    if (message) return;
    void execute('extract');
  };

  const selectPdf = (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      setValidationMessage(null);
      return;
    }
    const message = validatePdfFile(file);
    if (message) {
      setPdfFile(null);
      setValidationMessage(message);
      return;
    }
    setPdfFile(file);
    setValidationMessage(null);
  };

  const retry = () => {
    if (busy) return;
    if (failurePoint === 'audio' && lessonRef.current) {
      void execute('audio');
      return;
    }
    if (failurePoint === 'lesson' && contentRef.current) {
      void execute('lesson');
      return;
    }
    const message = validateSource({ mode, url, text, pdfFile });
    setValidationMessage(message);
    if (message) {
      setScreen('home');
      return;
    }
    void execute('extract');
  };

  const regenerateAudio = async () => {
    const currentLesson = lessonRef.current;
    if (!currentLesson || busy) return;
    const { id, signal } = beginRun();
    setAudioStatus('generating');
    setAudioError(null);
    setError(null);
    try {
      const audioResult = await generateLessonAudioApi(currentLesson, undefined, signal);
      if (!isCurrent(id)) return;
      const merged = applyAudioResult(currentLesson, audioResult);
      rememberLesson(merged);
      if (!audioResult.allChaptersCompleted) {
        setAudioStatus('failed');
        setAudioError('Some chapters did not finish generating audio.');
        setFailurePoint('audio');
        setFailureCode('TTS_PARTIAL_FAILURE');
        setFailureType('temporary');
        setFailureRetryable(true);
        return;
      }
      setAudioStatus('ready');
      setFailurePoint(null);
      setStages(stagesFor([], ['reading', 'extracting', 'understanding', 'chapters', 'audio']));
    } catch (err: unknown) {
      if (isAbortError(err) || !isCurrent(id)) return;
      const requestError = err instanceof ApiRequestError ? err : null;
      setAudioStatus('failed');
      setAudioError(toUserMessage(err, 'Audio generation failed.'));
      setFailurePoint('audio');
      setFailureCode(requestError?.code || 'TTS_FAILURE');
      setFailureType(requestError?.failureType || 'temporary');
      setFailureRetryable(requestError?.retryable ?? true);
    } finally {
      if (isCurrent(id)) setBusy(false);
    }
  };

  const openLesson = () => {
    if (!lessonRef.current) return;
    setScreen('lesson');
  };

  const reset = () => {
    runId.current += 1;
    abortRef.current?.abort();
    setBusy(false);
    setScreen('home');
    setStages(idleStages());
    rememberContent(null);
    rememberLesson(null);
    setError(null);
    setFailurePoint(null);
    setFailureCode(null);
    setFailureType(null);
    setFailureRetryable(false);
    setAudioStatus('missing');
    setAudioError(null);
    setValidationMessage(null);
  };

  const changeMode = (next: InputMode) => {
    setMode(next);
    setValidationMessage(null);
  };

  const chooseSource = (nextMode: InputMode) => {
    runId.current += 1;
    abortRef.current?.abort();
    setBusy(false);
    setScreen('home');
    setStages(idleStages());
    rememberContent(null);
    rememberLesson(null);
    setError(null);
    setFailurePoint(null);
    setFailureCode(null);
    setFailureType(null);
    setFailureRetryable(false);
    setAudioStatus('missing');
    setAudioError(null);
    setValidationMessage(null);
    setMode(nextMode);
  };

  return {
    screen,
    mode,
    url,
    text,
    pdfFile,
    validationMessage,
    stages,
    content,
    lesson,
    error,
    failurePoint,
    failureCode,
    failureType,
    failureRetryable,
    audioStatus,
    audioError,
    busy,
    setUrl: (value: string) => {
      setUrl(value);
      setValidationMessage(null);
    },
    setText: (value: string) => {
      setText(value);
      setValidationMessage(null);
    },
    selectPdf,
    changeMode,
    submit,
    retry,
    regenerateAudio,
    openLesson,
    chooseSource,
    reset,
  };
}
