'use client';

import { ChevronDown, Library } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { DocumentRecord } from '@/types/api';

/** Restrict retrieval to a subset of the ready documents. */
export function DocumentScopePicker({
  documents,
  value,
  onChange,
}: {
  documents: DocumentRecord[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const ready = documents.filter((d) => d.processing_status === 'ready');
  const label =
    value.length === 0 ? 'เอกสารทั้งหมด' : `เลือกไว้ ${value.length} ฉบับ`;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        disabled={ready.length === 0}
      >
        <Library className="h-4 w-4" aria-hidden />
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="ขอบเขตเอกสาร"
          className="absolute bottom-full z-30 mb-2 max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-pop scrollbar-thin"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn(
              'mb-1 w-full rounded-lg px-3 py-2 text-left text-sm',
              value.length === 0 ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-surface-muted',
            )}
          >
            เอกสารทั้งหมด
          </button>
          {ready.map((document) => (
            <label
              key={document.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={value.includes(document.id)}
                onChange={() => toggle(document.id)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span className="min-w-0 truncate text-ink">{document.filename}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
