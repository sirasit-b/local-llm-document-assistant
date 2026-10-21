'use client';

/**
 * Streaming chat against the backend's SSE endpoint.
 *
 * The provider and model travel in the request body, so switching engines never
 * reloads anything. Sending to an external engine requires an explicit
 * acknowledgement, which the backend also enforces.
 */
import * as React from 'react';

import { API_BASE_URL } from '@/lib/api';
import type { ChatMessageView, Citation, ProviderKey } from '@/types/api';

export const EXTERNAL_CONFIRMATION_CODE = 'external_confirmation_required';

interface SendOptions {
  message: string;
  provider: ProviderKey;
  model: string;
  documentScope: string[];
  acknowledgeExternal: boolean;
}

interface StreamMeta {
  conversation_id: string;
  provider: string;
  model: string;
  external: boolean;
  has_context: boolean;
  citations: Citation[];
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

export function useChat() {
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<{ code: string; message: string } | null>(null);
  const conversationId = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = React.useCallback(() => {
    stop();
    conversationId.current = null;
    setMessages([]);
    setError(null);
  }, [stop]);

  const send = React.useCallback(async (options: SendOptions) => {
    const question = options.message.trim();
    if (!question) return;

    setError(null);
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    const patchAssistant = (patch: Partial<ChatMessageView>) =>
      setMessages((current) =>
        current.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      );

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: question,
          provider: options.provider,
          model: options.model || null,
          conversation_id: conversationId.current,
          document_scope: options.documentScope,
          acknowledge_external: options.acknowledgeExternal,
        }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        const code = body?.error?.code ?? 'request_failed';
        const message = body?.error?.message ?? 'ไม่สามารถส่งคำถามได้';
        setMessages((current) => current.filter((m) => m.id !== assistantId));
        setError({ code, message });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const parsed = parseSseBlock(block);
          separator = buffer.indexOf('\n\n');
          if (!parsed) continue;

          if (parsed.event === 'meta') {
            const meta = JSON.parse(parsed.data) as StreamMeta;
            conversationId.current = meta.conversation_id;
            patchAssistant({
              provider: meta.provider,
              model: meta.model,
              citations: meta.citations,
            });
          } else if (parsed.event === 'delta') {
            answer += (JSON.parse(parsed.data) as { text: string }).text;
            patchAssistant({ content: answer, pending: false });
          } else if (parsed.event === 'error') {
            const payload = JSON.parse(parsed.data) as { message: string };
            patchAssistant({ pending: false, error: payload.message });
          } else if (parsed.event === 'done') {
            // The backend drops citations when the model refused for lack of support.
            const payload = JSON.parse(parsed.data) as { citations?: Citation[] };
            patchAssistant({
              pending: false,
              ...(payload.citations ? { citations: payload.citations } : {}),
            });
          }
        }
      }
      patchAssistant({ pending: false });
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') {
        patchAssistant({ pending: false });
      } else {
        patchAssistant({ pending: false, error: 'การเชื่อมต่อขัดข้องระหว่างรับคำตอบ' });
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return { messages, isStreaming, error, send, stop, reset, clearError: () => setError(null) };
}
