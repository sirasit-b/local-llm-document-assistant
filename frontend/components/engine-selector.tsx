'use client';

import { ChevronDown, Settings2, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { useEngine } from '@/components/engine-context';
import { StatusDot } from '@/components/system-status';
import { Button, Select } from '@/components/ui/primitives';
import { InlineSpinner } from '@/components/ui/states';
import { useProviderHealth, useProviderModels } from '@/hooks/use-api';
import { cn, HEALTH_LABELS } from '@/lib/utils';
import type { ProviderKey, ProviderSummary } from '@/types/api';

/** Model list for one engine, fetched from that engine, never hardcoded. */
function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: ProviderSummary;
  value: string;
  onChange: (model: string) => void;
}) {
  const { data: models, error, isLoading } = useProviderModels(provider.key);
  const id = `model-${provider.key}`;

  if (isLoading) {
    return <InlineSpinner label="กำลังโหลดรายการโมเดล..." />;
  }
  if (error) {
    return <p className="text-xs text-red-600">ไม่สามารถโหลดรายการโมเดลได้</p>;
  }
  if (!models || models.length === 0) {
    return <p className="text-xs text-ink-muted">ยังไม่มีโมเดลบนเซิร์ฟเวอร์นี้</p>;
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        Model
      </label>
      <Select
        id={id}
        value={value || provider.default_model || ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label ?? model.id}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ProviderOption({
  provider,
  selected,
  model,
  onSelect,
  onModelChange,
}: {
  provider: ProviderSummary;
  selected: boolean;
  model: string;
  onSelect: () => void;
  onModelChange: (model: string) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        selected ? 'border-brand-600 bg-brand-50/50' : 'border-line',
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name="ai-engine"
          checked={selected}
          onChange={onSelect}
          className="mt-1 h-4 w-4 accent-brand-600"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            {provider.label}
            {provider.external ? (
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            )}
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">{provider.privacy_note}</span>
        </span>
      </label>

      {selected ? (
        <div className="mt-3 pl-7">
          <ModelPicker provider={provider} value={model} onChange={onModelChange} />
        </div>
      ) : null}
    </div>
  );
}

export function EngineSelector({ className }: { className?: string }) {
  const { providers, selection, select, isLoading, error } = useEngine();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = providers.find((p) => p.key === selection?.provider) ?? null;
  const health = useProviderHealth(active?.key ?? null);

  if (isLoading) {
    return <InlineSpinner label="กำลังตรวจสอบ AI Engine..." />;
  }

  if (error || providers.length === 0) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
        <span className="text-ink-muted">ยังไม่มี AI Engine ที่เปิดใช้งาน</span>
        <Link href="/settings" className="font-medium text-brand-600 hover:underline">
          ตั้งค่า AI Engine
        </Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">AI Engine</p>
      <Button
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="max-w-full justify-between gap-3"
      >
        <span className="flex min-w-0 items-center gap-2">
          {health.data ? <StatusDot state={health.data.state} /> : <StatusDot state="checking" />}
          <span className="truncate">
            {active?.label ?? '-'}
            {selection?.model ? ` · ${selection.model}` : ''}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      </Button>

      {active ? (
        <p className="mt-1 text-xs text-ink-muted">
          {health.data
            ? `${HEALTH_LABELS[health.data.state] ?? health.data.state}${
                health.data.detail ? ` · ${health.data.detail}` : ''
              }`
            : 'กำลังตรวจสอบสถานะ...'}
        </p>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label="เลือก AI Engine"
          className="absolute z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-3 shadow-pop"
        >
          <div className="space-y-2">
            {providers.map((provider) => (
              <ProviderOption
                key={provider.key}
                provider={provider}
                selected={selection?.provider === provider.key}
                model={selection?.provider === provider.key ? selection.model : ''}
                onSelect={() =>
                  select({
                    provider: provider.key as ProviderKey,
                    model: provider.default_model ?? '',
                  })
                }
                onModelChange={(model) => select({ provider: provider.key, model })}
              />
            ))}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              จัดการ AI Engine
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
