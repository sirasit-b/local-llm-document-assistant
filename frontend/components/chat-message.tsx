'use client';

import { Check, Copy, FileText, RefreshCw } from 'lucide-react';
import * as React from 'react';

import type { PreviewTarget } from '@/components/document-preview';
import { Badge, Button } from '@/components/ui/primitives';
import { InlineSpinner } from '@/components/ui/states';
import type { ChatMessageView, Citation } from '@/types/api';

function CitationList({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (target: PreviewTarget) => void;
}) {
  if (citations.length === 0) return null;
  return (
    <section className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        แหล่งอ้างอิง
      </p>
      <ul className="space-y-2">
        {citations.map((citation) => (
          <li key={`${citation.document_id}-${citation.chunk_index}`}>
            <button
              type="button"
              onClick={() =>
                onOpen({
                  documentId: citation.document_id,
                  page: citation.page_number,
                  highlight: citation.excerpt,
                })
              }
              className="w-full rounded-xl border border-line px-3 py-2 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <FileText className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
                <span className="truncate">
                  [{citation.index}] {citation.document_name}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {citation.page_number ? `หน้า ${citation.page_number}` : 'ไม่ระบุหน้า'} · ความเกี่ยวข้อง{' '}
                {Math.round(citation.score * 100)}%
              </span>
              <span className="mt-1 block line-clamp-2 text-xs text-ink-subtle">
                {citation.excerpt}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChatMessageItem({
  message,
  onOpenCitation,
  onRegenerate,
}: {
  message: ChatMessageView;
  onOpenCitation: (target: PreviewTarget) => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[46rem] rounded-2xl bg-brand-600 px-4 py-3 text-sm leading-6 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <article className="max-w-[52rem] rounded-2xl border border-line bg-white px-5 py-4 shadow-card">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={message.provider === 'openai' ? 'warning' : 'success'}>
          {message.provider === 'openai' ? 'OpenAI API' : 'Local AI'}
        </Badge>
        {message.model ? <span className="text-xs text-ink-subtle">{message.model}</span> : null}
      </header>

      {message.pending && !message.content ? (
        <InlineSpinner label="กำลังสร้างคำตอบ..." />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-7 text-ink">{message.content}</div>
      )}

      {message.error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message.error}
        </p>
      ) : null}

      <CitationList citations={message.citations ?? []} onOpen={onOpenCitation} />

      {!message.pending && message.content ? (
        <footer className="mt-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </Button>
          {onRegenerate ? (
            <Button variant="ghost" size="sm" onClick={onRegenerate}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              สร้างคำตอบใหม่
            </Button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
