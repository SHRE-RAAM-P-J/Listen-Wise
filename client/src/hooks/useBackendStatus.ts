import { useEffect, useState } from 'react';
import { checkBackendHealth, HealthResponse } from '../services/api';

export type BackendConnection = 'checking' | 'connected' | 'disconnected';

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendConnection>('checking');
  const [meta, setMeta] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    checkBackendHealth(controller.signal)
      .then((data) => {
        setStatus('connected');
        setMeta(data);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('disconnected');
        setMeta(null);
      });
    return () => controller.abort();
  }, []);

  return { status, meta };
}
