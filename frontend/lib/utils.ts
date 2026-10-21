import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export const PROCESSING_LABELS: Record<string, string> = {
  pending: 'รอประมวลผล',
  validating: 'ตรวจสอบไฟล์',
  extracting: 'ดึงข้อความ',
  ocr: 'กำลังทำ OCR',
  chunking: 'แบ่งเนื้อหา',
  embedding: 'สร้าง Embedding',
  indexing: 'จัดทำดัชนี',
  ready: 'พร้อมใช้งาน',
  failed: 'ไม่สำเร็จ',
};

export const INDEX_LABELS: Record<string, string> = {
  not_indexed: 'ยังไม่ได้จัดทำดัชนี',
  indexing: 'กำลังจัดทำดัชนี',
  indexed: 'จัดทำดัชนีแล้ว',
  failed: 'ไม่สำเร็จ',
};

export const OCR_LABELS: Record<string, string> = {
  not_required: 'ไม่จำเป็นต้อง OCR',
  pending: 'รอ OCR',
  running: 'กำลัง OCR',
  completed: 'OCR สำเร็จ',
  failed: 'OCR ไม่สำเร็จ',
  unavailable: 'OCR ไม่พร้อมใช้งาน',
};

export const SERVICE_LABELS: Record<string, string> = {
  backend: 'Backend',
  database: 'Database',
  vector_db: 'Vector DB',
  llm: 'LLM',
  embedding: 'Embedding',
  ocr: 'OCR',
};

export const HEALTH_LABELS: Record<string, string> = {
  available: 'พร้อมใช้งาน',
  unavailable: 'ไม่สามารถเชื่อมต่อได้',
  degraded: 'ทำงานได้บางส่วน',
  checking: 'กำลังตรวจสอบ',
  not_configured: 'ยังไม่ได้ตั้งค่า',
};

export const KIND_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
  txt: 'Text',
  csv: 'CSV',
  image: 'รูปภาพ',
};
