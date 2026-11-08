/**
 * Playback URL for a segment returned by POST /api/tts/generate.
 * Relative paths such as /api/tts/audio/:lessonId/:file honor VITE_API_BASE_URL.
 * A cache key forces the browser to load a regenerated file at the same path.
 */
export function resolveAudioUrl(
  audioUrl: string | null | undefined,
  cacheKey?: string | null,
): string | null {
  if (!audioUrl || !audioUrl.trim()) return null;

  const trimmed = audioUrl.trim();
  const absolute = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}${
        trimmed.startsWith('/') ? trimmed : `/${trimmed}`
      }`;

  if (!cacheKey) return absolute;
  const join = absolute.includes('?') ? '&' : '?';
  return `${absolute}${join}v=${encodeURIComponent(cacheKey)}`;
}
