import type { Metadata } from 'next';
import { Inter, Noto_Sans_Thai } from 'next/font/google';

import './globals.css';

import { AppShell } from '@/components/app-shell';
import { EngineProvider } from '@/components/engine-context';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-thai',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Local LLM – Document Assistant',
  description: 'ค้นหา สรุป และวิเคราะห์ข้อมูลจากเอกสารภายในองค์กรด้วย AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${inter.variable}`}>
      <body
        style={{ ['--font-sans' as string]: `var(--font-noto-thai), var(--font-inter), sans-serif` }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <EngineProvider>
          <AppShell>
            <div id="main-content">{children}</div>
          </AppShell>
        </EngineProvider>
      </body>
    </html>
  );
}
