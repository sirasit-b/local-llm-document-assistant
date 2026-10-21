'use client';

import { Menu, X } from 'lucide-react';
import * as React from 'react';

import { SidebarContent } from '@/components/sidebar';
import { Button } from '@/components/ui/primitives';

/** Desktop-first shell; the sidebar collapses into a sheet on small screens. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
        <SidebarContent />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop"
            role="dialog"
            aria-modal="true"
            aria-label="เมนูหลัก"
          >
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="ปิดเมนู">
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">Local LLM</p>
            <p className="text-xs text-ink-muted">Document Assistant</p>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
