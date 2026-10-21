'use client';

/** Preview panel: PDF where the browser can render it, extracted text otherwise. */
import { ExternalLink, Search, X } from 'lucide-react';
import * as React from 'react';

import { Button, Input } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DocumentPreview as DocumentPreviewData } from '@/types/api';

export interface PreviewTarget {
  documentId: string;
  page?: number | null;
  highlight?: string | null;
}

function highlightText(content: string, needle: string): React.ReactNode {
  const term = needle.trim();
  if (!term) return content;
  const index = content.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return content;
  return (
    <>
      {content.slice(0, index)}
      <mark className="rounded bg-amber-100 px-0.5">{content.slice(index, index + term.length)}</mark>
      {content.slice(index + term.length)}
    </>
  );
}

export function DocumentPreviewDialog({
  target,
  onClose,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<DocumentPreviewData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  const load = React.useCallback((documentId: string) => {
    setLoading(true);
    setError(null);
    api
      .documentPreview(documentId)
      .then(setData)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!target) {
      setData(null);
      setQuery('');
      return;
    }
    setPage(target.page ?? 1);
    setQuery(target.highlight ? target.highlight.slice(0, 60) : '');
    load(target.documentId);
  }, [target, load]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!target) return null;

  const pages = data?.pages ?? [];
  const matches = query.trim()
    ? pages.filter((p) => p.content.toLowerCase().includes(query.trim().toLowerCase()))
    : pages;
  const current = pages.find((p) => p.page_number === page) ?? pages[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ดูตัวอย่างเอกสาร"
        className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-pop"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">
              {data?.document.filename ?? 'กำลังโหลด...'}
            </p>
            {data ? (
              <p className="text-xs text-ink-muted">
                {data.document.page_count ?? pages.length} หน้า · {data.document.chunk_count} chunks
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {data ? (
              <a
                href={api.documentFileUrl(data.document.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-muted hover:bg-surface-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                เปิดไฟล์ต้นฉบับ
              </a>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="ปิด">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="หน้าเอกสาร"
            className="hidden w-44 shrink-0 overflow-y-auto border-r border-line bg-surface-muted p-2 sm:block"
          >
            {matches.map((item) => (
              <button
                key={item.page_number}
                type="button"
                onClick={() => setPage(item.page_number)}
                className={cn(
                  'mb-1 w-full rounded-lg px-3 py-2 text-left text-sm',
                  item.page_number === current?.page_number
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-ink-muted hover:bg-white',
                )}
              >
                หน้า {item.page_number}
              </button>
            ))}
            {matches.length === 0 && !loading ? (
              <p className="px-3 py-2 text-xs text-ink-subtle">ไม่พบหน้าที่ตรงกับคำค้น</p>
            ) : null}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2">
              <Search className="h-4 w-4 text-ink-subtle" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาภายในเอกสาร"
                aria-label="ค้นหาภายในเอกสาร"
                className="h-8 border-0 px-0 focus:ring-0"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
              {loading ? <LoadingState rows={6} /> : null}
              {error ? (
                <ErrorState message={error} onRetry={() => load(target.documentId)} />
              ) : null}
              {!loading && !error && pages.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีเนื้อหาที่ดึงได้จากเอกสารนี้"
                  description="เอกสารอาจยังประมวลผลไม่เสร็จ หรือดึงข้อความไม่สำเร็จ"
                />
              ) : null}
              {current ? (
                <article className="whitespace-pre-wrap text-sm leading-7 text-ink">
                  {highlightText(current.content, query)}
                </article>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
