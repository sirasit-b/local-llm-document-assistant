'use client';

import { FileScan, RefreshCw, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { DocumentPreviewDialog, type PreviewTarget } from '@/components/document-preview';
import { PageHeader } from '@/components/page-header';
import { StatusDot } from '@/components/system-status';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useOcrHealth, useOcrJobs } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDateTime, HEALTH_LABELS, OCR_LABELS } from '@/lib/utils';

function statusTone(status: string) {
  if (status === 'completed') return 'success' as const;
  if (status === 'failed' || status === 'unavailable') return 'danger' as const;
  if (status === 'running' || status === 'pending') return 'info' as const;
  return 'neutral' as const;
}

export default function OcrPage() {
  const router = useRouter();
  const { data: jobs, error, isLoading, mutate } = useOcrJobs();
  const health = useOcrHealth();
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const rerun = async (documentId: string) => {
    setBusyId(documentId);
    setActionError(null);
    try {
      await api.rerunOcr(documentId);
      await mutate();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <PageHeader
        title="OCR เอกสาร"
        description="อ่านข้อความจากไฟล์สแกนหรือรูปภาพ โดยใช้ OCR Engine ที่ตั้งค่าไว้"
        action={
          <Button onClick={() => router.push('/upload')}>
            <Upload className="h-4 w-4" aria-hidden />
            เพิ่มเอกสาร
          </Button>
        }
      />

      <Card className="mb-6 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">สถานะ OCR Engine</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
              <StatusDot state={health.data?.state ?? 'checking'} />
              {health.data
                ? `${HEALTH_LABELS[health.data.state] ?? health.data.state}${
                    health.data.detail ? ` · ${health.data.detail}` : ''
                  }`
                : 'กำลังตรวจสอบสถานะระบบ...'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void health.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            ตรวจสอบอีกครั้ง
          </Button>
        </div>
      </Card>

      {actionError ? <ErrorState message={actionError} className="mb-4" /> : null}

      {isLoading && !jobs ? <LoadingState rows={4} /> : null}

      {error ? (
        <ErrorState message="ไม่สามารถโหลดรายการงาน OCR ได้" onRetry={() => void mutate()} />
      ) : null}

      {jobs && jobs.length === 0 ? (
        <EmptyState
          icon={FileScan}
          title="ยังไม่มีเอกสารสำหรับ OCR"
          description="อัปโหลดไฟล์ PDF สแกน, JPG หรือ PNG เพื่อให้ระบบอ่านข้อความออกมา"
          action={
            <Button onClick={() => router.push('/upload')}>
              <Upload className="h-4 w-4" aria-hidden />
              เพิ่มเอกสาร
            </Button>
          }
        />
      ) : null}

      {jobs && jobs.length > 0 ? (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.document_id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{job.filename}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge tone={statusTone(job.status)}>
                      {OCR_LABELS[job.status] ?? job.status}
                    </Badge>
                    {job.pages_processed > 0 ? <span>{job.pages_processed} หน้า</span> : null}
                    {job.confidence !== null ? (
                      <span>ความมั่นใจ {Math.round(job.confidence * 100)}%</span>
                    ) : null}
                    {job.created_at ? <span>{formatDateTime(job.created_at)}</span> : null}
                  </p>
                  {job.error_message ? (
                    <p className="mt-1 text-xs text-red-600">{job.error_message}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPreview({ documentId: job.document_id })}
                  >
                    ดูข้อความที่อ่านได้
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === job.document_id}
                    onClick={() => void rerun(job.document_id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    ทำ OCR ใหม่
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <DocumentPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
