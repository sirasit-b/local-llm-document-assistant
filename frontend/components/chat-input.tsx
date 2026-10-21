'use client';

import { Paperclip, Send, Square } from 'lucide-react';
import * as React from 'react';

import { DocumentScopePicker } from '@/components/document-scope';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { DocumentRecord } from '@/types/api';

export function ChatInput({
  documents,
  scope,
  onScopeChange,
  onSend,
  onStop,
  onAttach,
  isStreaming,
  disabled,
  disabledReason,
}: {
  documents: DocumentRecord[];
  scope: string[];
  onScopeChange: (next: string[]) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onAttach: (files: File[]) => void;
  isStreaming: boolean;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [value, setValue] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const submit = () => {
    const message = value.trim();
    if (!message || disabled || isStreaming) return;
    onSend(message);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const autoGrow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onAttach(files);
      }}
      className={cn(
        'rounded-2xl border bg-white p-3 shadow-card transition-colors',
        dragging ? 'border-brand-600 bg-brand-50/40' : 'border-line',
      )}
    >
      <label htmlFor="chat-input" className="sr-only">
        คำถามเกี่ยวกับเอกสารของคุณ
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        value={value}
        rows={2}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          autoGrow(event.target);
        }}
        onKeyDown={onKeyDown}
        placeholder="พิมพ์คำถามเกี่ยวกับเอกสารของคุณ..."
        className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-ink placeholder:text-ink-subtle focus:outline-none disabled:cursor-not-allowed"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) onAttach(files);
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            aria-label="แนบไฟล์"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            แนบไฟล์
          </Button>
          <DocumentScopePicker documents={documents} value={scope} onChange={onScopeChange} />
        </div>

        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Button variant="secondary" size="sm" onClick={onStop}>
              <Square className="h-3.5 w-3.5" aria-hidden />
              หยุดสร้างคำตอบ
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={submit}
            disabled={disabled || isStreaming || value.trim().length === 0}
            title={disabled ? disabledReason : undefined}
          >
            <Send className="h-4 w-4" aria-hidden />
            ส่งคำถาม
          </Button>
        </div>
      </div>

      {disabled && disabledReason ? (
        <p className="mt-2 px-2 text-xs text-ink-muted">{disabledReason}</p>
      ) : null}
    </div>
  );
}
