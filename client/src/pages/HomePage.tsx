import { SourceComposer } from '../components/home/SourceComposer';
import { InputMode } from '../types/pipeline';

interface HomePageProps {
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

export function HomePage(props: HomePageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="mb-10 max-w-2xl">
        <p className="text-sm font-medium text-stone-500">ListenWise</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-stone-900 sm:text-5xl">
          Read less. Understand more.
        </h1>
        <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
          Turn a webpage, a PDF, or your notes into a lesson you can read and hear. ListenWise keeps the structure of the source and teaches it chapter by chapter.
        </p>
      </div>
      <SourceComposer {...props} />
    </div>
  );
}
