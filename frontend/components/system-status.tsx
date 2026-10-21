'use client';

/** Live service health. Nothing here defaults to "online". */
import * as React from 'react';

import { useSystemStatus } from '@/hooks/use-api';
import { cn, HEALTH_LABELS, SERVICE_LABELS } from '@/lib/utils';
import type { HealthState } from '@/types/api';

const DOT_COLOURS: Record<HealthState, string> = {
  available: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unavailable: 'bg-red-500',
  not_configured: 'bg-slate-300',
  checking: 'bg-slate-300 animate-pulse',
};

export function StatusDot({ state, className }: { state: HealthState; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT_COLOURS[state], className)}
    />
  );
}

export function SystemStatusPanel() {
  const { data, error, isLoading } = useSystemStatus();

  return (
    <section aria-label="สถานะระบบ" className="rounded-xl bg-surface-muted px-3 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">สถานะระบบ</p>

      {isLoading && !data ? (
        <p className="text-xs text-ink-muted" role="status">
          กำลังตรวจสอบสถานะระบบ...
        </p>
      ) : null}

      {error && !data ? (
        <p className="text-xs text-red-600" role="status">
          ไม่สามารถเชื่อมต่อได้
        </p>
      ) : null}

      {data ? (
        <ul className="space-y-1.5">
          {data.services.map((service) => (
            <li key={service.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                <StatusDot state={service.state} />
                {SERVICE_LABELS[service.key] ?? service.key}
              </span>
              <span
                className="truncate text-[11px] text-ink-subtle"
                title={service.detail ?? undefined}
              >
                {HEALTH_LABELS[service.state] ?? service.state}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {data?.local_only_mode ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
          Local Only Mode เปิดใช้งาน
        </p>
      ) : null}
    </section>
  );
}
