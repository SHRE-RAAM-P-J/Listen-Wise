import { AppShell } from './components/layout/AppShell';
import { useBackendStatus } from './hooks/useBackendStatus';
import { useLessonPipeline } from './hooks/useLessonPipeline';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { ProcessingPage } from './pages/ProcessingPage';

export default function App() {
  const backend = useBackendStatus();
  const pipeline = useLessonPipeline();

  return (
    <AppShell
      backendStatus={backend.status}
      backendMeta={backend.meta}
      onHome={pipeline.reset}
    >
      {pipeline.screen === 'home' && (
        <HomePage
          mode={pipeline.mode}
          url={pipeline.url}
          text={pipeline.text}
          pdfFile={pipeline.pdfFile}
          validationMessage={pipeline.validationMessage}
          serverNote={
            backend.status === 'disconnected'
              ? 'The ListenWise server is not responding. Start it, then generate a lesson.'
              : null
          }
          busy={pipeline.busy}
          onModeChange={pipeline.changeMode}
          onUrlChange={pipeline.setUrl}
          onTextChange={pipeline.setText}
          onPdfChange={pipeline.selectPdf}
          onSubmit={pipeline.submit}
        />
      )}

      {pipeline.screen === 'processing' && (
        <ProcessingPage
          stages={pipeline.stages}
          content={pipeline.content}
          lesson={pipeline.lesson}
          error={pipeline.error}
          failurePoint={pipeline.failurePoint}
          busy={pipeline.busy}
          onRetry={pipeline.retry}
          onOpenLesson={pipeline.openLesson}
          onStartOver={pipeline.reset}
        />
      )}

      {pipeline.screen === 'lesson' && pipeline.lesson && (
        <LessonPage
          lesson={pipeline.lesson}
          extractedContent={pipeline.content}
          audioStatus={pipeline.audioStatus}
          audioError={pipeline.audioError}
          onReset={pipeline.reset}
          onRegenerateAudio={() => {
            void pipeline.regenerateAudio();
          }}
        />
      )}
    </AppShell>
  );
}
