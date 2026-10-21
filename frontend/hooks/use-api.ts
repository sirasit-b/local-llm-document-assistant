'use client';

/** SWR-backed hooks. Components never fetch on their own. */
import useSWR from 'swr';

import { api } from '@/lib/api';
import type { ProviderKey } from '@/types/api';

const STATUS_REFRESH_MS = 20_000;
const DOCUMENT_REFRESH_MS = 4_000;

export function useSystemStatus() {
  return useSWR('system-status', api.systemStatus, {
    refreshInterval: STATUS_REFRESH_MS,
    revalidateOnFocus: true,
  });
}

export function useDocuments(params: { q?: string; kind?: string; processing_status?: string } = {}) {
  return useSWR(['documents', params], () => api.documents(params), {
    // Documents move through the pipeline in the background, so poll while any
    // of them is still being processed.
    refreshInterval: (data) =>
      data?.items.some((d) => d.processing_status !== 'ready' && d.processing_status !== 'failed')
        ? DOCUMENT_REFRESH_MS
        : 0,
  });
}

export function useStatistics() {
  return useSWR('statistics', api.statistics);
}

export function useProviders() {
  return useSWR('providers', api.providers);
}

export function useProviderModels(key: ProviderKey | null) {
  return useSWR(key ? ['provider-models', key] : null, () => api.providerModels(key as ProviderKey));
}

export function useProviderHealth(key: ProviderKey | null) {
  return useSWR(key ? ['provider-health', key] : null, () => api.providerHealth(key as ProviderKey), {
    refreshInterval: STATUS_REFRESH_MS,
  });
}

export function useSettings() {
  return useSWR('settings', api.settings);
}

export function useOcrJobs() {
  return useSWR('ocr-jobs', api.ocrJobs, {
    refreshInterval: (data) =>
      data?.some((job) => job.status === 'pending' || job.status === 'running')
        ? DOCUMENT_REFRESH_MS
        : 0,
  });
}

export function useOcrHealth() {
  return useSWR('ocr-health', api.ocrHealth, { refreshInterval: STATUS_REFRESH_MS });
}

export function useSources() {
  return useSWR('sources', api.sources);
}
