'use client';

import { ShieldAlert } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/primitives';

/**
 * Explicit confirmation before anything is sent to an external provider.
 * The backend requires the same acknowledgement, so this is not the only guard.
 */
export function ExternalEngineDialog({
  open,
  providerLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  providerLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="external-dialog-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-pop"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
          <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
        </span>
        <h2 id="external-dialog-title" className="mt-4 text-lg font-semibold text-ink">
          ยืนยันการประมวลผลผ่านบริการภายนอก
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          คุณกำลังใช้ {providerLabel} ข้อมูลที่เกี่ยวข้องกับคำถาม
          รวมถึงเนื้อหาบางส่วนจากเอกสารที่ค้นพบ อาจถูกส่งออกไปยังบริการภายนอกเพื่อประมวลผล
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button onClick={onConfirm}>ยืนยันและส่งคำถาม</Button>
        </div>
      </div>
    </div>
  );
}
