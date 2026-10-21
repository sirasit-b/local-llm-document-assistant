/**
 * Typed access to the backend.
 *
 * Every component reads data through this module or a hook built on it; no
 * component holds business records of its own.
 */
import type {
  DataSource,
  DocumentList,
  DocumentPreview,
  DocumentRecord,
  EngineSettings,
  ModelSummary,
  OcrJob,
  ProviderHealth,
  ProviderKey,
  ProviderSummary,
  Statistics,
  SystemStatus,
} from '@/types/api';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let message = 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้';
  let code = 'unknown_error';
  try {
    const body = await response.json();
    if (body?.error?.message) {
      message = body.error.message;
      code = body.error.code ?? code;
    }
  } catch {
    /* response had no JSON body */
  }
  return new ApiError(message, code, response.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('ไม่สามารถเชื่อมต่อกับ Backend ได้', 'network_error', 0);
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  systemStatus: () => request<SystemStatus>('/api/system/status'),

  documents: (params: { q?: string; kind?: string; processing_status?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<DocumentList>(`/api/documents${query ? `?${query}` : ''}`);
  },
  document: (id: string) => request<DocumentRecord>(`/api/documents/${id}`),
  documentPreview: (id: string) => request<DocumentPreview>(`/api/documents/${id}/preview`),
  documentFileUrl: (id: string) => `${API_BASE_URL}/api/documents/${id}/file`,
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  reprocessDocument: (id: string) =>
    request<DocumentRecord>(`/api/documents/${id}/reprocess`, { method: 'POST' }),
  statistics: () => request<Statistics>('/api/documents/statistics'),

  providers: () => request<ProviderSummary[]>('/api/providers'),
  providerModels: (key: ProviderKey) => request<ModelSummary[]>(`/api/providers/${key}/models`),
  providerHealth: (key: ProviderKey) => request<ProviderHealth>(`/api/providers/${key}/health`),

  settings: () => request<EngineSettings>('/api/settings'),
  saveSettings: (payload: unknown) =>
    request<EngineSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  ocrJobs: () => request<OcrJob[]>('/api/ocr'),
  ocrHealth: () => request<ProviderHealth>('/api/ocr/health'),
  rerunOcr: (id: string) => request<OcrJob>(`/api/ocr/${id}/rerun`, { method: 'POST' }),

  sources: () => request<DataSource[]>('/api/sources'),
  createSource: (payload: unknown) =>
    request<DataSource>('/api/sources', { method: 'POST', body: JSON.stringify(payload) }),
  testSource: (id: string) => request<DataSource>(`/api/sources/${id}/test`, { method: 'POST' }),
  deleteSource: (id: string) => request<void>(`/api/sources/${id}`, { method: 'DELETE' }),
};

/** Upload with real progress, which fetch cannot report. */
export function uploadDocuments(
  files: File[],
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<DocumentRecord[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/documents/upload`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as DocumentRecord[]);
        return;
      }
      let message = 'อัปโหลดไม่สำเร็จ';
      let code = 'upload_failed';
      try {
        const body = JSON.parse(xhr.responseText);
        message = body?.error?.message ?? message;
        code = body?.error?.code ?? code;
      } catch {
        /* no JSON body */
      }
      reject(new ApiError(message, code, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('ไม่สามารถเชื่อมต่อกับ Backend ได้', 'network_error', 0));
    xhr.onabort = () => reject(new ApiError('ยกเลิกการอัปโหลด', 'aborted', 0));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
