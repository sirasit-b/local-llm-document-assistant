'use client';

/**
 * The selected AI Engine and model.
 *
 * The choice is remembered per browser but always re-validated against the
 * engines the administrator has actually enabled; an engine that disappears
 * falls back to the configured default rather than failing silently.
 */
import * as React from 'react';

import { useProviders } from '@/hooks/use-api';
import type { ProviderKey, ProviderSummary } from '@/types/api';

const STORAGE_KEY = 'doc-assistant:engine';

interface EngineSelection {
  provider: ProviderKey;
  model: string;
}

interface EngineContextValue {
  providers: ProviderSummary[];
  isLoading: boolean;
  error: Error | undefined;
  selection: EngineSelection | null;
  activeProvider: ProviderSummary | null;
  select: (next: EngineSelection) => void;
  refresh: () => void;
}

const EngineContext = React.createContext<EngineContextValue | null>(null);

function readStored(): EngineSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EngineSelection;
    if (parsed?.provider === 'local' || parsed?.provider === 'openai') return parsed;
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const { data: providers, error, isLoading, mutate } = useProviders();
  const [selection, setSelection] = React.useState<EngineSelection | null>(null);

  React.useEffect(() => {
    if (!providers) return;

    if (providers.length === 0) {
      setSelection(null);
      return;
    }

    const stored = selection ?? readStored();
    const matched = stored ? providers.find((p) => p.key === stored.provider) : undefined;
    if (matched && stored) {
      const model = stored.model || matched.default_model || '';
      if (selection?.provider !== matched.key || selection?.model !== model) {
        setSelection({ provider: matched.key, model });
      }
      return;
    }

    const fallback = providers.find((p) => p.is_default) ?? providers[0];
    setSelection({ provider: fallback.key, model: fallback.default_model ?? '' });
    // `selection` is intentionally excluded: this effect reconciles it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const select = React.useCallback((next: EngineSelection) => {
    setSelection(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable; the selection still applies this session */
    }
  }, []);

  const value = React.useMemo<EngineContextValue>(
    () => ({
      providers: providers ?? [],
      isLoading,
      error: error as Error | undefined,
      selection,
      activeProvider: providers?.find((p) => p.key === selection?.provider) ?? null,
      select,
      refresh: () => void mutate(),
    }),
    [providers, isLoading, error, selection, select, mutate],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const context = React.useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used inside EngineProvider');
  }
  return context;
}
