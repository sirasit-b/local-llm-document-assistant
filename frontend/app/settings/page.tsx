'use client';

import { RefreshCw, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { useEngine } from '@/components/engine-context';
import { PageHeader } from '@/components/page-header';
import { StatusDot } from '@/components/system-status';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Switch,
} from '@/components/ui/primitives';
import { ErrorState, InlineSpinner, LoadingState } from '@/components/ui/states';
import { useSettings } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { HEALTH_LABELS } from '@/lib/utils';
import type { EngineSettings, HealthState, ModelSummary, ProviderKey } from '@/types/api';

interface EngineFormState {
  enabled: boolean;
  providerType: 'ollama' | 'vllm' | 'openai_compatible';
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  defaultEmbeddingModel: string;
}

function toForm(settings: EngineSettings) {
  return {
    local: {
      enabled: settings.local.enabled,
      providerType: settings.local.provider_type,
      baseUrl: settings.local.base_url,
      apiKey: '',
      defaultModel: settings.local.default_model,
      defaultEmbeddingModel: settings.local.default_embedding_model,
    } satisfies EngineFormState,
    openai: {
      enabled: settings.openai.enabled,
      providerType: 'openai_compatible' as const,
      baseUrl: settings.openai.base_url,
      apiKey: '',
      defaultModel: settings.openai.default_model,
      defaultEmbeddingModel: settings.openai.default_embedding_model,
    } satisfies EngineFormState,
    defaultLlmProvider: settings.default_llm_provider,
    defaultEmbeddingProvider: settings.default_embedding_provider,
    localOnlyMode: settings.local_only_mode,
  };
}

/** Lists the models an engine actually reports, on demand. */
function ModelField({
  id,
  label,
  providerKey,
  value,
  onChange,
}: {
  id: string;
  label: string;
  providerKey: ProviderKey;
  value: string;
  onChange: (next: string) => void;
}) {
  const [models, setModels] = React.useState<ModelSummary[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await api.providerModels(providerKey));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        {models && models.length > 0 ? (
          <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">— ยังไม่เลือก —</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label ?? model.id}
              </option>
            ))}
          </Select>
        ) : (
          <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
        )}
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          โหลดรายการ
        </Button>
      </div>
      {loading ? <InlineSpinner label="กำลังโหลดรายการโมเดล..." /> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {models && models.length === 0 ? (
        <p className="text-xs text-ink-muted">เซิร์ฟเวอร์ยังไม่มีโมเดลที่ใช้งานได้</p>
      ) : null}
    </div>
  );
}

function ConnectionTest({ providerKey }: { providerKey: ProviderKey }) {
  const [state, setState] = React.useState<HealthState | null>(null);
  const [detail, setDetail] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const result = await api.providerHealth(providerKey);
      setState(result.state);
      setDetail(result.detail);
    } catch (cause) {
      setState('unavailable');
      setDetail((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={() => void run()} disabled={loading}>
        ทดสอบการเชื่อมต่อ
      </Button>
      {loading ? <InlineSpinner label="กำลังทดสอบ..." /> : null}
      {!loading && state ? (
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <StatusDot state={state} />
          {HEALTH_LABELS[state] ?? state}
          {detail ? ` · ${detail}` : ''}
        </span>
      ) : null}
      <p className="w-full text-xs text-ink-subtle">
        ต้องบันทึกการตั้งค่าก่อน ผลการทดสอบจึงจะสะท้อนค่าที่กรอกใหม่
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { data, error, isLoading, mutate } = useSettings();
  const engine = useEngine();
  const [form, setForm] = React.useState<ReturnType<typeof toForm> | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
        <PageHeader title="ตั้งค่าระบบ" />
        <LoadingState rows={6} />
      </div>
    );
  }

  if (error || !form || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
        <PageHeader title="ตั้งค่าระบบ" />
        <ErrorState message="ไม่สามารถโหลดการตั้งค่าได้" onRetry={() => void mutate()} />
      </div>
    );
  }

  const patch = (next: Partial<typeof form>) => setForm({ ...form, ...next });
  const patchEngine = (key: 'local' | 'openai', next: Partial<EngineFormState>) =>
    setForm({ ...form, [key]: { ...form[key], ...next } });

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.saveSettings({
        local: {
          enabled: form.local.enabled,
          provider_type: form.local.providerType,
          base_url: form.local.baseUrl,
          api_key: form.local.apiKey,
          default_model: form.local.defaultModel,
          default_embedding_model: form.local.defaultEmbeddingModel,
        },
        openai: {
          enabled: form.openai.enabled,
          base_url: form.openai.baseUrl,
          api_key: form.openai.apiKey,
          default_model: form.openai.defaultModel,
          default_embedding_model: form.openai.defaultEmbeddingModel,
        },
        default_llm_provider: form.defaultLlmProvider,
        default_embedding_provider: form.defaultEmbeddingProvider,
        local_only_mode: form.localOnlyMode,
      });
      await mutate();
      engine.refresh();
      setSaved(true);
    } catch (cause) {
      setSaveError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <PageHeader
        title="ตั้งค่าระบบ"
        description="จัดการ AI Engine, โมเดล และนโยบายความเป็นส่วนตัว"
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>นโยบายความเป็นส่วนตัว</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                Local Only Mode
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                เมื่อเปิดใช้งาน ระบบจะปิดการใช้ OpenAI และปฏิเสธคำขอไปยังบริการภายนอกทุกชนิดที่ฝั่ง Backend
              </p>
            </div>
            <Switch
              checked={form.localOnlyMode}
              onCheckedChange={(next) => patch({ localOnlyMode: next })}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Local AI</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="local-enabled">เปิดใช้งาน</Label>
            <Switch
              id="local-enabled"
              checked={form.local.enabled}
              onCheckedChange={(next) => patchEngine('local', { enabled: next })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="local-type">Provider Type</Label>
            <Select
              id="local-type"
              value={form.local.providerType}
              onChange={(event) =>
                patchEngine('local', {
                  providerType: event.target.value as EngineFormState['providerType'],
                })
              }
            >
              <option value="ollama">Ollama</option>
              <option value="vllm">vLLM</option>
              <option value="openai_compatible">OpenAI-compatible Local Server</option>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="local-url">Base URL</Label>
            <Input
              id="local-url"
              value={form.local.baseUrl}
              placeholder="http://ollama:11434"
              onChange={(event) => patchEngine('local', { baseUrl: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="local-key">Authentication (ถ้ามี)</Label>
            <Input
              id="local-key"
              type="password"
              value={form.local.apiKey}
              placeholder={data.local.api_key_masked ?? 'ไม่ได้ตั้งค่า'}
              onChange={(event) => patchEngine('local', { apiKey: event.target.value })}
            />
            <p className="text-xs text-ink-subtle">
              เว้นว่างไว้เพื่อคงค่าเดิม ระบบจะไม่ส่งค่าจริงกลับมาแสดงอีก
            </p>
          </div>

          <ModelField
            id="local-model"
            label="Default Model"
            providerKey="local"
            value={form.local.defaultModel}
            onChange={(next) => patchEngine('local', { defaultModel: next })}
          />
          <div className="space-y-1">
            <Label htmlFor="local-embed">Default Embedding Model</Label>
            <Input
              id="local-embed"
              value={form.local.defaultEmbeddingModel}
              onChange={(event) =>
                patchEngine('local', { defaultEmbeddingModel: event.target.value })
              }
            />
          </div>

          <ConnectionTest providerKey="local" />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>OpenAI API</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {form.localOnlyMode ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Local Only Mode เปิดอยู่ OpenAI จะถูกปิดใช้งานและซ่อนจากผู้ใช้ทั่วไป
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <Label htmlFor="openai-enabled">เปิดใช้งาน</Label>
            <Switch
              id="openai-enabled"
              checked={form.openai.enabled}
              disabled={form.localOnlyMode}
              onCheckedChange={(next) => patchEngine('openai', { enabled: next })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="openai-url">Base URL</Label>
            <Input
              id="openai-url"
              value={form.openai.baseUrl}
              onChange={(event) => patchEngine('openai', { baseUrl: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="openai-key">API Key</Label>
            <Input
              id="openai-key"
              type="password"
              value={form.openai.apiKey}
              placeholder={data.openai.api_key_masked ?? 'ยังไม่ได้ตั้งค่า'}
              onChange={(event) => patchEngine('openai', { apiKey: event.target.value })}
            />
            <p className="text-xs text-ink-subtle">
              เก็บไว้ที่ฝั่ง Backend เท่านั้น ไม่ถูกส่งกลับมายังหน้าเว็บ
            </p>
          </div>

          <ModelField
            id="openai-model"
            label="Default Model"
            providerKey="openai"
            value={form.openai.defaultModel}
            onChange={(next) => patchEngine('openai', { defaultModel: next })}
          />
          <div className="space-y-1">
            <Label htmlFor="openai-embed">Default Embedding Model</Label>
            <Input
              id="openai-embed"
              value={form.openai.defaultEmbeddingModel}
              onChange={(event) =>
                patchEngine('openai', { defaultEmbeddingModel: event.target.value })
              }
            />
          </div>

          <ConnectionTest providerKey="openai" />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>ค่าเริ่มต้น</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="default-llm">Default LLM Engine</Label>
            <Select
              id="default-llm"
              value={form.defaultLlmProvider}
              onChange={(event) =>
                patch({ defaultLlmProvider: event.target.value as ProviderKey })
              }
            >
              <option value="local">Local AI</option>
              <option value="openai" disabled={form.localOnlyMode}>
                OpenAI API
              </option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="default-embedding">Default Embedding Provider</Label>
            <Select
              id="default-embedding"
              value={form.defaultEmbeddingProvider}
              onChange={(event) =>
                patch({ defaultEmbeddingProvider: event.target.value as ProviderKey })
              }
            >
              <option value="local">Local</option>
              <option value="openai" disabled={form.localOnlyMode}>
                OpenAI
              </option>
            </Select>
            <p className="text-xs text-ink-subtle">
              การเปลี่ยน Embedding Model ต้องประมวลผลเอกสารเดิมใหม่จึงจะค้นหาได้
            </p>
          </div>
        </CardBody>
      </Card>

      {saveError ? <ErrorState message={saveError} className="mb-4" /> : null}
      {saved ? (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          บันทึกการตั้งค่าเรียบร้อย
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setForm(toForm(data))} disabled={saving}>
          ยกเลิกการแก้ไข
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </Button>
      </div>
    </div>
  );
}
