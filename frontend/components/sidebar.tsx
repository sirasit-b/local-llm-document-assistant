'use client';

import {
  Database,
  FileSearch,
  Files,
  MessageSquareText,
  Settings,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { SystemStatusPanel } from '@/components/system-status';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'ถามตอบเอกสาร', icon: MessageSquareText },
  { href: '/documents', label: 'เอกสารของฉัน', icon: Files },
  { href: '/upload', label: 'อัปโหลดเอกสาร', icon: Upload },
  { href: '/ocr', label: 'OCR เอกสาร', icon: FileSearch },
  { href: '/sources', label: 'แหล่งข้อมูล', icon: Database },
  { href: '/settings', label: 'ตั้งค่าระบบ', icon: Settings },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <p className="text-base font-semibold leading-tight text-ink">Local LLM</p>
        <p className="text-sm text-ink-muted">Document Assistant</p>
      </div>

      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <SystemStatusPanel />
      </div>
    </div>
  );
}
