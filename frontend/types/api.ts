export type ProviderKey = 'local' | 'openai';

export type HealthState =
  | 'available'
  | 'unavailable'
  | 'degraded'
  | 'checking'
  | 'not_configured';

export type ProcessingStatus =
  | 'pending'
  | 'validating'
  | 'extracting'
  | 'ocr'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'ready'
  | 'failed';

export interface DocumentRecord {
  id: string;
  filename: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  chunk_count: number;
  processing_status: ProcessingStatus;
  index_status: 'not_indexed' | 'indexing' | 'indexed' | 'failed';
  ocr_status: string;
  error_message: string | null;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentList {
  items: DocumentRecord[];
  total: number;
}

export interface DocumentPage {
  page_number: number;
  content: string;
  ocr_confidence: number | null;
}

export interface DocumentPreview {
  document: DocumentRecord;
  pages: DocumentPage[];
}

export interface Citation {
  index: number;
  document_id: string;
  document_name: string;
  page_number: number | null;
  chunk_index: number;
  score: number;
  excerpt: string;
}

export interface ProviderSummary {
  key: ProviderKey;
  label: string;
  enabled: boolean;
  external: boolean;
  privacy_note: string;
  default_model: string | null;
  is_default: boolean;
}

export interface ModelSummary {
  id: string;
  label: string | null;
}

export interface ProviderHealth {
  key: string;
  state: HealthState;
  detail: string | null;
  latency_ms: number | null;
}

export interface ServiceStatus {
  key: string;
  state: HealthState;
  detail: string | null;
  latency_ms: number | null;
}

export interface SystemStatus {
  services: ServiceStatus[];
  local_only_mode: boolean;
  app_env: string;
}

export interface Statistics {
  total_documents: number;
  by_kind: { kind: string; count: number }[];
  storage_bytes: number;
  ready: number;
  failed: number;
  processing: number;
}

export interface EngineSettings {
  local: {
    enabled: boolean;
    provider_type: 'ollama' | 'vllm' | 'openai_compatible';
    base_url: string;
    api_key_masked: string | null;
    default_model: string;
    default_embedding_model: string;
  };
  openai: {
    enabled: boolean;
    base_url: string;
    api_key_masked: string | null;
    default_model: string;
    default_embedding_model: string;
  };
  default_llm_provider: ProviderKey;
  default_embedding_provider: ProviderKey;
  local_only_mode: boolean;
}

export interface DataSource {
  id: string;
  name: string;
  source_type: 'database' | 'rest_api' | 'erp' | 'crm' | 'file_storage';
  base_url: string | null;
  enabled: boolean;
  last_status: string | null;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface OcrJob {
  document_id: string;
  filename: string;
  kind: string;
  status: string;
  confidence: number | null;
  pages_processed: number;
  error_message: string | null;
  created_at: string | null;
}

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  model?: string | null;
  citations?: Citation[];
  pending?: boolean;
  error?: string | null;
}
