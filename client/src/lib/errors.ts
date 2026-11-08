/** Turn a failed request into a message safe to show in the interface. */
export function toUserMessage(err: unknown, fallback: string): string {
  if (isAbortError(err)) return fallback;

  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const withoutStack = raw
    .split('\n')
    .filter((line) => !/^\s*at\s+/.test(line))
    .join('\n')
    .trim();

  if (!withoutStack) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(withoutStack)) {
    return 'Could not reach the ListenWise server. Check that it is running, then try again.';
  }
  return withoutStack;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
