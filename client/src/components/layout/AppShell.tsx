import { ReactNode } from 'react';
import { Headphones } from 'lucide-react';
import { BackendConnection } from '../../hooks/useBackendStatus';
import { HealthResponse } from '../../services/api';

interface AppShellProps {
  children: ReactNode;
  backendStatus: BackendConnection;
  backendMeta: HealthResponse | null;
  onHome: () => void;
}

export function AppShell({ children, backendStatus, backendMeta, onHome }: AppShellProps) {
  const statusText =
    backendStatus === 'connected'
      ? 'Server connected'
      : backendStatus === 'checking'
        ? 'Checking server'
        : 'Server offline';

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f5f2] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f6f5f2]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-3 rounded-lg text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white">
              <Headphones className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-tight">ListenWise</span>
              <span className="hidden text-xs text-stone-500 sm:block">Read less. Understand more.</span>
            </span>
          </button>
          <p
            className="flex items-center gap-2 text-xs text-stone-500"
            title={backendMeta ? `Version ${backendMeta.version}` : undefined}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                backendStatus === 'connected'
                  ? 'bg-emerald-600'
                  : backendStatus === 'checking'
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
              }`}
              aria-hidden="true"
            />
            <span>{statusText}</span>
          </p>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>ListenWise</p>
          <p>Read less. Understand more.</p>
        </div>
      </footer>
    </div>
  );
}
