'use client';

import { CheckCircle2, CloudUpload, FileText, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useDocuments } from '@/hooks/use-api';
import { uploadDocuments } from '@/lib/api';
import { cn, formatBytes, PROCESSING_LABELS } from '@/lib/utils';

const ACCEPTED = '.pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png';

const PIPELINE_STEPS = [
  'ตรวจสอบไฟล์',
  'ดึงข้อความ',
  'OCR (ถ้าจำเป็น)',
  'ทำความสะอาดข้อความ',
  'แบ่งเนื้อหา',
  'สร้าง Embedding',
  'จัดทำดัชนี Vector',
  'พร้อมใช้งาน',
];

interface UploadEntry {
  name: string;
  size: number;
  percent: number;
  state: 'uploading' | 'done' | 'error';
  message?: string;
}

export default function UploadPage() {
  const [entries, setEntries] = React.useState<UploadEntry[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { data, mutate } = useDocuments();

  const start = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setEntries(
      files.map((file) => ({ name: file.name, size: file.size, percent: 0, state: 'uploading' })),
    );

    try {
      await uploadDocuments(files, (percent) =>
        setEntries((current) => current.map((entry) => ({ ...entry, percent }))),
      );
      setEntries((current) =>
        current.map((entry) => ({ ...entry, percent: 100, state: 'done' as const })),
      );
      await mutate();
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      setEntries((current) =>
        current.map((entry) => ({ ...entry, state: 'error' as const, message })),
      );
    }
  };

  const processing = (data?.items ?? []).filter(
    (document) => document.processing_status !== 'ready' && document.processing_status !== 'failed',
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <PageHeader
        title="อัปโหลดเอกสาร"
        description="รองรับ PDF, Word, Excel, PowerPoint, Text, CSV และรูปภาพ"
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void start(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          'rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors',
          dragging ? 'border-brand-600 bg-brand-50/40' : 'border-line',
        )}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
          <CloudUpload className="h-5 w-5 text-brand-600" aria-hidden />
        </span>
        <p className="mt-3 text-base font-semibold text-ink">ลากไฟล์มาวางที่นี่</p>
        <p className="mt-1 text-sm text-ink-muted">หรือเลือกไฟล์จากเครื่องของคุณ</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            void start(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <Button className="mt-4" onClick={() => inputRef.current?.click()}>
          เลือกไฟล์
        </Button>
      </div>

      {error ? <ErrorState message={error} className="mt-4" /> : null}

      {entries.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>สถานะการอัปโหลด</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.name} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {entry.state === 'uploading' ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />
                    ) : entry.state === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
                    )}
                    <span className="truncate text-ink">{entry.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">{formatBytes(entry.size)}</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={entry.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`ความคืบหน้าการอัปโหลด ${entry.name}`}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      entry.state === 'error' ? 'bg-red-500' : 'bg-brand-600',
                    )}
                    style={{ width: `${entry.percent}%` }}
                  />
                </div>
                {entry.message ? <p className="text-xs text-red-600">{entry.message}</p> : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {processing.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>กำลังประมวลผล</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {processing.map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="truncate text-ink">{document.filename}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {PROCESSING_LABELS[document.processing_status] ?? document.processing_status}
                </span>
              </div>
            ))}
            <p className="pt-2 text-xs text-ink-subtle">
              ดูรายการทั้งหมดได้ที่{' '}
              <Link href="/documents" className="text-brand-600 hover:underline">
                เอกสารของฉัน
              </Link>
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>ขั้นตอนการประมวลผลเอกสาร</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
            {PIPELINE_STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-xs text-ink-subtle">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
