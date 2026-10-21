'use client';

import { BarChart3, FileSearch, FileText, MessageSquareText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { ChatInput } from '@/components/chat-input';
import { ChatMessageItem } from '@/components/chat-message';
import { DocumentPreviewDialog, type PreviewTarget } from '@/components/document-preview';
import { useEngine } from '@/components/engine-context';
import { EngineSelector } from '@/components/engine-selector';
import { ExternalEngineDialog } from '@/components/external-engine-dialog';
import { Button } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useDocuments } from '@/hooks/use-api';
import { EXTERNAL_CONFIRMATION_CODE, useChat } from '@/hooks/use-chat';
import { uploadDocuments } from '@/lib/api';

const QUICK_ACTIONS = [
  {
    key: 'summarize',
    title: 'สรุปเอกสาร',
    description: 'เลือกเอกสารเพื่อสรุปเนื้อหา',
    icon: FileText,
    prompt: 'สรุปสาระสำคัญของเอกสารที่เลือกเป็นหัวข้อย่อย',
    requiresScope: true,
  },
  {
    key: 'ask',
    title: 'ถามคำถาม',
    description: 'ค้นหาคำตอบจากเอกสาร',
    icon: MessageSquareText,
    prompt: '',
    requiresScope: false,
  },
  {
    key: 'analyze',
    title: 'วิเคราะห์ข้อมูล',
    description: 'วิเคราะห์ข้อมูลจากเอกสารและตาราง',
    icon: BarChart3,
    prompt: 'วิเคราะห์ตัวเลขและตารางที่ปรากฏในเอกสาร พร้อมระบุข้อสังเกตสำคัญ',
    requiresScope: true,
  },
  {
    key: 'ocr',
    title: 'OCR เอกสาร',
    description: 'อ่านข้อความจากไฟล์สแกนหรือรูปภาพ',
    icon: FileSearch,
    prompt: '',
    requiresScope: false,
  },
] as const;

export default function ChatPage() {
  const router = useRouter();
  const { selection, activeProvider } = useEngine();
  const { data: documentList, error: documentsError, isLoading, mutate } = useDocuments();
  const chat = useChat();

  const [scope, setScope] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [pendingQuestion, setPendingQuestion] = React.useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = React.useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = React.useState<string | null>(null);
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.messages]);

  const documents = documentList?.items ?? [];
  const readyCount = documents.filter((d) => d.processing_status === 'ready').length;

  const deliver = React.useCallback(
    (message: string, acknowledgeExternal: boolean) => {
      if (!selection) return;
      setLastQuestion(message);
      void chat.send({
        message,
        provider: selection.provider,
        model: selection.model,
        documentScope: scope,
        acknowledgeExternal,
      });
    },
    [chat, scope, selection],
  );

  const handleSend = (message: string) => {
    if (activeProvider?.external) {
      setPendingQuestion(message);
      return;
    }
    deliver(message, false);
  };

  const handleAttach = async (files: File[]) => {
    setUploadNotice(`กำลังอัปโหลด ${files.length} ไฟล์...`);
    try {
      await uploadDocuments(files, () => undefined);
      setUploadNotice('อัปโหลดสำเร็จ ระบบกำลังประมวลผลเอกสาร');
      void mutate();
    } catch (cause) {
      setUploadNotice((cause as Error).message);
    }
  };

  const runQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    if (action.key === 'ocr') {
      router.push('/ocr');
      return;
    }
    if (readyCount === 0) {
      router.push('/upload');
      return;
    }
    if (!action.prompt) {
      document.getElementById('chat-input')?.focus();
      return;
    }
    handleSend(action.prompt);
  };

  const noEngine = !selection;
  const noDocuments = !isLoading && !documentsError && documents.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-0px)] max-w-5xl flex-col px-4 py-6 lg:px-8">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          ถามอะไรก็ได้จากเอกสารของคุณ
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          ค้นหา สรุป และวิเคราะห์ข้อมูลจากเอกสารภายในองค์กรด้วย AI
        </p>
        <div className="mt-4">
          <EngineSelector />
        </div>
      </header>

      <div
        ref={transcriptRef}
        className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 scrollbar-thin"
      >
        {isLoading ? <LoadingState rows={2} /> : null}

        {documentsError ? (
          <ErrorState
            message="ไม่สามารถโหลดรายการเอกสารได้"
            onRetry={() => void mutate()}
          />
        ) : null}

        {noDocuments && chat.messages.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="ยังไม่มีเอกสาร"
            description="อัปโหลดเอกสารเพื่อเริ่มถามคำถามกับ AI"
            action={
              <Button onClick={() => router.push('/upload')}>
                <Upload className="h-4 w-4" aria-hidden />
                อัปโหลดเอกสาร
              </Button>
            }
          />
        ) : null}

        {!noDocuments && chat.messages.length === 0 && !isLoading ? (
          <section aria-label="การทำงานด่วน" className="grid gap-3 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => runQuickAction(action)}
                  className="rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
                    <Icon className="h-4 w-4 text-brand-600" aria-hidden />
                  </span>
                  <span className="mt-3 block text-sm font-medium text-ink">{action.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{action.description}</span>
                </button>
              );
            })}
          </section>
        ) : null}

        {chat.messages.map((message, index) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            onOpenCitation={setPreview}
            onRegenerate={
              message.role === 'assistant' &&
              index === chat.messages.length - 1 &&
              lastQuestion &&
              !chat.isStreaming
                ? () => handleSend(lastQuestion)
                : undefined
            }
          />
        ))}

        {chat.error && chat.error.code !== EXTERNAL_CONFIRMATION_CODE ? (
          <ErrorState message={chat.error.message} onRetry={() => chat.clearError()} />
        ) : null}
      </div>

      <div className="shrink-0 space-y-2">
        {uploadNotice ? (
          <p className="text-xs text-ink-muted" role="status">
            {uploadNotice}
          </p>
        ) : null}
        <ChatInput
          documents={documents}
          scope={scope}
          onScopeChange={setScope}
          onSend={handleSend}
          onStop={chat.stop}
          onAttach={handleAttach}
          isStreaming={chat.isStreaming}
          disabled={noEngine || readyCount === 0}
          disabledReason={
            noEngine
              ? 'ยังไม่มี AI Engine ที่เปิดใช้งาน กรุณาตั้งค่าที่ ตั้งค่าระบบ'
              : readyCount === 0
                ? 'ยังไม่มีเอกสารที่พร้อมใช้งาน อัปโหลดและรอให้ประมวลผลเสร็จก่อนถามคำถาม'
                : undefined
          }
        />
      </div>

      <ExternalEngineDialog
        open={pendingQuestion !== null}
        providerLabel={activeProvider?.label ?? 'บริการภายนอก'}
        onCancel={() => setPendingQuestion(null)}
        onConfirm={() => {
          const question = pendingQuestion;
          setPendingQuestion(null);
          if (question) deliver(question, true);
        }}
      />

      <DocumentPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
