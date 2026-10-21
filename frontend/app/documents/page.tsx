'use client';

import { Eye, FileText, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { DocumentPreviewDialog, type PreviewTarget } from '@/components/document-preview';
import { PageHeader } from '@/components/page-header';
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useDocuments, useStatistics } from '@/hooks/use-api';
import { api } from '@/lib/api';
import {
  formatBytes,
  formatDateTime,
  INDEX_LABELS,
  KIND_LABELS,
  PROCESSING_LABELS,
} from '@/lib/utils';
import type { DocumentRecord } from '@/types/api';

function StatusBadge({ document }: { document: DocumentRecord }) {
  const status = document.processing_status;
  if (status === 'ready') return <Badge tone="success">{PROCESSING_LABELS.ready}</Badge>;
  if (status === 'failed') {
    return (
      <Badge tone="danger" title={document.error_message ?? undefined}>
        {PROCESSING_LABELS.failed}
      </Badge>
    );
  }
  return <Badge tone="info">{PROCESSING_LABELS[status] ?? status}</Badge>;
}

export default function DocumentsPage() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { data, error, isLoading, mutate } = useDocuments({
    q: query || undefined,
    kind: kind || undefined,
    processing_status: status || undefined,
  });
  const statistics = useStatistics();

  const documents = data?.items ?? [];
  const hasFilters = Boolean(query || kind || status);

  const remove = async (id: string) => {
    if (!window.confirm('ต้องการลบเอกสารนี้ออกจากระบบหรือไม่')) return;
    setBusyId(id);
    setActionError(null);
    try {
      await api.deleteDocument(id);
      await mutate();
      await statistics.mutate();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reprocess = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await api.reprocessDocument(id);
      await mutate();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title="เอกสารของฉัน"
        description="จัดการเอกสารที่ใช้เป็นฐานความรู้ของ AI"
        action={
          <Button onClick={() => router.push('/upload')}>
            <Upload className="h-4 w-4" aria-hidden />
            อัปโหลดเอกสาร
          </Button>
        }
      />

      {statistics.data && statistics.data.total_documents > 0 ? (
        <section aria-label="สถิติเอกสาร" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'เอกสารทั้งหมด', value: statistics.data.total_documents.toLocaleString('th-TH') },
            { label: 'พร้อมใช้งาน', value: statistics.data.ready.toLocaleString('th-TH') },
            { label: 'กำลังประมวลผล', value: statistics.data.processing.toLocaleString('th-TH') },
            { label: 'พื้นที่จัดเก็บ', value: formatBytes(statistics.data.storage_bytes) },
          ].map((item) => (
            <Card key={item.label} className="px-4 py-3">
              <p className="text-xs text-ink-muted">{item.label}</p>
              <p className="mt-1 text-xl font-semibold text-ink">{item.value}</p>
            </Card>
          ))}
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาชื่อเอกสาร"
          aria-label="ค้นหาชื่อเอกสาร"
          className="w-full sm:max-w-xs"
        />
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          aria-label="กรองตามประเภทไฟล์"
          className="w-full sm:w-44"
        >
          <option value="">ทุกประเภทไฟล์</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="กรองตามสถานะประมวลผล"
          className="w-full sm:w-48"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(PROCESSING_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {actionError ? <ErrorState message={actionError} className="mb-4" /> : null}

      {isLoading && !data ? <LoadingState rows={5} /> : null}

      {error ? (
        <ErrorState message="ไม่สามารถโหลดรายการเอกสารได้" onRetry={() => void mutate()} />
      ) : null}

      {data && documents.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={FileText}
            title="ไม่พบเอกสารที่ตรงกับเงื่อนไข"
            description="ลองปรับคำค้นหาหรือตัวกรอง"
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="ยังไม่มีเอกสารในระบบ"
            description="อัปโหลดเอกสารเพื่อเริ่มสร้าง Knowledge Base ของคุณ"
            action={
              <Button onClick={() => router.push('/upload')}>
                <Upload className="h-4 w-4" aria-hidden />
                อัปโหลดเอกสาร
              </Button>
            }
          />
        )
      ) : null}

      {documents.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">รายการเอกสารในระบบ</caption>
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">ชื่อเอกสาร</th>
                  <th scope="col" className="px-4 py-3 font-medium">ประเภท</th>
                  <th scope="col" className="px-4 py-3 font-medium">ขนาด</th>
                  <th scope="col" className="px-4 py-3 font-medium">วันที่เพิ่ม</th>
                  <th scope="col" className="px-4 py-3 font-medium">Processing</th>
                  <th scope="col" className="px-4 py-3 font-medium">Index</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((document) => (
                  <tr key={document.id} className="hover:bg-surface-muted/60">
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-ink">{document.filename}</p>
                      {document.error_message ? (
                        <p className="truncate text-xs text-red-600">{document.error_message}</p>
                      ) : (
                        <p className="text-xs text-ink-subtle">
                          {document.chunk_count > 0 ? `${document.chunk_count} chunks` : '—'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {KIND_LABELS[document.kind] ?? document.kind}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{formatBytes(document.size_bytes)}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatDateTime(document.created_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge document={document} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {INDEX_LABELS[document.index_status] ?? document.index_status}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreview({ documentId: document.id })}
                          aria-label={`ดูตัวอย่าง ${document.filename}`}
                        >
                          <Eye className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === document.id}
                          onClick={() => void reprocess(document.id)}
                          aria-label={`ประมวลผล ${document.filename} ใหม่`}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === document.id}
                          onClick={() => void remove(document.id)}
                          aria-label={`ลบ ${document.filename}`}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <DocumentPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
