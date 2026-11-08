import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '../../lib/format';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

interface AudioPlayerProps {
  src: string | null;
  knownDuration: number;
  lessonDuration: number;
  chapterTitle: string;
  chapterPosition: number;
  chapterCount: number;
  statusText: string;
  notice: string | null;
  generating: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRegenerate: () => void;
}

export function AudioPlayer({
  src,
  knownDuration,
  lessonDuration,
  chapterTitle,
  chapterPosition,
  chapterCount,
  statusText,
  notice,
  generating,
  onPrevious,
  onNext,
  onRegenerate,
}: AudioPlayerProps) {
  const player = useAudioPlayer(src);
  const shownDuration = player.duration > 0 ? player.duration : knownDuration > 0 ? knownDuration : null;
  const seekMax = player.duration > 0 ? player.duration : 0;
  const canSeek = Boolean(src) && seekMax > 0 && !player.error;
  const playbackError = player.error || notice;

  const showTranscript = () => {
    document.getElementById('chapter-transcript')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section
      aria-label="Audio player"
      className="sticky bottom-0 z-30 border-t border-stone-200 bg-[#f6f5f2]/95 px-4 py-3 backdrop-blur-md sm:rounded-2xl sm:border sm:px-5"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <audio ref={player.audioRef} preload="metadata" playsInline hidden />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={player.toggle}
          disabled={!src || Boolean(player.error)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={player.playing ? 'Pause' : 'Play'}
        >
          {player.playing ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">
            Chapter {chapterPosition} of {chapterCount}
            <span className="font-normal text-stone-500"> · {chapterTitle}</span>
          </p>
          <p className="truncate text-xs text-stone-500">{statusText}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-stone-600">
          {formatDuration(player.currentTime)} / {formatDuration(shownDuration)}
        </p>
      </div>

      <label htmlFor="lesson-seek" className="sr-only">
        Seek within chapter
      </label>
      <input
        id="lesson-seek"
        type="range"
        min={0}
        max={seekMax || 0}
        step={0.1}
        value={Math.min(player.currentTime, seekMax || 0)}
        disabled={!canSeek}
        aria-valuemin={0}
        aria-valuemax={Math.round(seekMax || 0)}
        aria-valuenow={Math.round(player.currentTime)}
        aria-valuetext={`${formatDuration(player.currentTime)} of ${formatDuration(shownDuration)}`}
        onPointerDown={player.beginSeek}
        onPointerUp={player.releaseSeek}
        onPointerCancel={player.releaseSeek}
        onKeyDown={player.beginSeek}
        onKeyUp={player.releaseSeek}
        onChange={(event) => player.seekTo(Number(event.target.value))}
        className="mt-2 h-8 w-full accent-stone-900 disabled:opacity-40"
      />

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={chapterPosition <= 1}
          className="min-h-11 text-sm text-stone-700 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          Previous chapter
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={chapterPosition >= chapterCount}
          className="min-h-11 text-sm text-stone-700 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          Next chapter
        </button>

        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-stone-700">
          <span>Speed</span>
          <select
            value={String(player.rate)}
            onChange={(event) => player.setRate(Number(event.target.value))}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
            aria-label="Playback speed"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>

        <div className="inline-flex min-h-11 items-center gap-2">
          <button
            type="button"
            onClick={player.toggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-md text-stone-700 hover:bg-white"
            aria-label={player.muted ? 'Unmute' : 'Mute'}
          >
            {player.muted || player.volume === 0 ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <label htmlFor="lesson-volume" className="sr-only">
            Volume
          </label>
          <input
            id="lesson-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={player.muted ? 0 : player.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            className="h-8 w-24 accent-stone-900"
          />
        </div>

        <p className="text-xs text-stone-500">
          Chapter {formatDuration(knownDuration > 0 ? knownDuration : shownDuration)}
          <span className="px-1">·</span>
          Lesson {formatDuration(lessonDuration > 0 ? lessonDuration : null)}
        </p>

        <button
          type="button"
          onClick={showTranscript}
          className="min-h-11 text-sm text-stone-700 underline decoration-stone-300 underline-offset-4"
        >
          View transcript
        </button>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={generating}
          className="min-h-11 text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline"
        >
          {generating ? 'Generating audio' : src ? 'Regenerate audio' : 'Retry audio'}
        </button>
      </div>

      {playbackError && (
        <p role="alert" className="mt-2 text-sm leading-6 text-rose-800">
          {playbackError}
        </p>
      )}
    </section>
  );
}
