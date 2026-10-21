'use client';

import { Database, Plug, Trash2 } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useSources } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const SOURCE_TYPES = [
  { value: 'database', label: 'Database' },
  { value: 'rest_api', label: 'REST API' },
  { value: 'erp', label: 'ERP' },
  { value: 'crm', label: 'CRM' },
  { value: 'file_storage', label: 'File Storage' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  available: 'เชื่อมต่อได้',
  unavailable: 'เชื่อมต่อไม่ได้',
  unknown: 'ยังไม่ได้ทดสอบ',
  unsupported: 'ยังไม่รองรับการทดสอบ',
};

export default function SourcesPage() {
  const { data: sources, error, isLoading, mutate } = useSources();
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [sourceType, setSourceType] = React.useState<string>('rest_api');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      await api.createSource({
        name,
        source_type: sourceType,
        base_url: baseUrl || null,
        config: {},
      });
      setName('');
      setBaseUrl('');
      setShowForm(false);
      await mutate();
    } catch (cause) {
      setFormError((cause as Error).message);
    }
  };

  const test = async (id: string) => {
    setBusyId(id);
    try {
      await api.testSource(id);
      await mutate();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('ต้องการลบแหล่งข้อมูลนี้หรือไม่')) return;
    setBusyId(id);
    try {
      await api.deleteSource(id);
      await mutate();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <PageHeader
        title="แหล่งข้อมูล"
        description="เชื่อมต่อระบบภายในองค์กรเพื่อเพิ่มข้อมูลให้ AI ค้นหาได้"
        action={
          <Button onClick={() => setShowForm((value) => !value)}>
            <Plug className="h-4 w-4" aria-hidden />
            เพิ่มแหล่งข้อมูล
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>เพิ่มแหล่งข้อมูลใหม่</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="source-name">ชื่อแหล่งข้อมูล</Label>
                <Input
                  id="source-name"
                  value={name}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="source-type">ประเภท</Label>
                <Select
                  id="source-type"
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value)}
                >
                  {SOURCE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="source-url">Base URL</Label>
                <Input
                  id="source-url"
                  value={baseUrl}
                  placeholder="https://"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
                <p className="text-xs text-ink-subtle">
                  ข้อมูลยืนยันตัวตนจะถูกตั้งค่าโดยผู้ดูแลระบบที่ฝั่ง Backend เท่านั้น
                </p>
              </div>
              {formError ? <ErrorState message={formError} /> : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  ยกเลิก
                </Button>
                <Button type="submit">บันทึก</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {isLoading && !sources ? <LoadingState rows={3} /> : null}

      {error ? (
        <ErrorState message="ไม่สามารถโหลดรายการแหล่งข้อมูลได้" onRetry={() => void mutate()} />
      ) : null}

      {sources && sources.length === 0 && !showForm ? (
        <EmptyState
          icon={Database}
          title="ยังไม่มีแหล่งข้อมูลเชื่อมต่อ"
          description="เชื่อมต่อแหล่งข้อมูลภายในเพื่อเพิ่มข้อมูลให้ AI สามารถค้นหาได้"
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plug className="h-4 w-4" aria-hidden />
              เพิ่มแหล่งข้อมูล
            </Button>
          }
        />
      ) : null}

      {sources && sources.length > 0 ? (
        <div className="space-y-3">
          {sources.map((source) => (
            <Card key={source.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{source.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge>{source.source_type}</Badge>
                    <Badge tone={source.last_status === 'available' ? 'success' : 'neutral'}>
                      {STATUS_LABELS[source.last_status ?? 'unknown'] ?? source.last_status}
                    </Badge>
                    {source.base_url ? <span className="truncate">{source.base_url}</span> : null}
                    {source.last_checked_at ? (
                      <span>ตรวจสอบล่าสุด {formatDateTime(source.last_checked_at)}</span>
                    ) : null}
                  </p>
                  {source.last_error ? (
                    <p className="mt-1 text-xs text-red-600">{source.last_error}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === source.id}
                    onClick={() => void test(source.id)}
                  >
                    ทดสอบการเชื่อมต่อ
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busyId === source.id}
                    onClick={() => void remove(source.id)}
                    aria-label={`ลบ ${source.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
