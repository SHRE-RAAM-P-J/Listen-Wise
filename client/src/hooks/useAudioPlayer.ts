import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toUserMessage } from '../lib/errors';

function mediaErrorMessage(audio: HTMLAudioElement): string {
  const code = audio.error?.code;
  if (code === MediaError.MEDIA_ERR_NETWORK || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'The audio file is missing or could not be loaded. Regenerate the audio and try again.';
  }
  if (code === MediaError.MEDIA_ERR_DECODE) {
    return 'The browser could not decode this audio file.';
  }
  if (code === MediaError.MEDIA_ERR_ABORTED) {
    return 'Playback was interrupted before the audio could load.';
  }
  return 'This audio could not be played.';
}

export function useAudioPlayer(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadToken = useRef(0);
  const seeking = useRef(false);
  const continuePlayback = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const rateRef = useRef(rate);
  volumeRef.current = volume;
  mutedRef.current = muted;
  rateRef.current = rate;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (!seeking.current) setCurrentTime(audio.currentTime || 0);
    };
    const onDuration = () => {
      const next = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(next > 0 ? next : 0);
      audio.playbackRate = rateRef.current;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      continuePlayback.current = false;
      setPlaying(false);
    };
    const onError = () => {
      if (!audio.getAttribute('src')) return;
      setError(mediaErrorMessage(audio));
      setPlaying(false);
      setReady(false);
      continuePlayback.current = false;
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useLayoutEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = ++loadToken.current;

    audio.pause();
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setReady(false);
    setError(null);

    const onCanPlay = () => {
      if (loadToken.current !== token) return;
      setReady(true);
      if (!continuePlayback.current) return;
      void audio.play().catch((err: unknown) => {
        continuePlayback.current = false;
        setPlaying(false);
        setError(toUserMessage(err, 'Playback could not start. Press play to try again.'));
      });
    };

    audio.addEventListener('canplay', onCanPlay);

    if (!src) {
      continuePlayback.current = false;
      audio.removeAttribute('src');
      audio.load();
    } else {
      audio.playbackRate = rateRef.current;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      audio.src = src;
      audio.load();
    }

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [src]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted, src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      continuePlayback.current = true;
      void audio.play().catch((err: unknown) => {
        continuePlayback.current = false;
        setPlaying(false);
        setError(toUserMessage(err, 'Playback could not start. Press play to try again.'));
      });
      return;
    }
    continuePlayback.current = false;
    audio.pause();
  }, [src]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : time;
    const next = Math.min(Math.max(0, time), max);
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const beginSeek = useCallback(() => {
    seeking.current = true;
  }, []);

  const releaseSeek = useCallback(() => {
    seeking.current = false;
  }, []);

  const setVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    setVolumeState(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((current) => !current);
  }, []);

  const setRate = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setRateState(value);
  }, []);

  return {
    audioRef,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    rate,
    error,
    ready,
    toggle,
    seekTo,
    beginSeek,
    releaseSeek,
    setVolume,
    toggleMute,
    setRate,
  };
}
