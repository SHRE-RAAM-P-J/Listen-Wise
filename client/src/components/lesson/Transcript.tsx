import { scriptParagraphs } from '../../lib/format';

interface TranscriptProps {
  text: string;
}

export function Transcript({ text }: TranscriptProps) {
  const paragraphs = scriptParagraphs(text);

  return (
    <section id="chapter-transcript" aria-labelledby="chapter-transcript-heading" className="scroll-mt-24">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Teaching script</p>
      <h3 id="chapter-transcript-heading" className="mt-1 text-lg font-semibold text-stone-900">
        Transcript
      </h3>
      {paragraphs.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">This chapter has no transcript.</p>
      ) : (
        <div className="mt-4 space-y-5 font-serif text-lg leading-8 text-stone-800">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}
    </section>
  );
}
