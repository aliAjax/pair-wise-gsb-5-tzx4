import type { PkgStatus, ReceptionOutcome } from '../archive/types';
import type { BlockedReason } from '../archive/selectors';

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortFp(fp: string, head = 12, tail = 8): string {
  if (!fp) return '—';
  if (fp.length <= head + tail + 3) return fp;
  return `${fp.slice(0, head)}…${fp.slice(-tail)}`;
}

export const statusMeta: Record<PkgStatus, { label: string; cls: string }> = {
  archived: { label: '已归档', cls: 'ok' },
  'pending-evidence': { label: '待补证', cls: 'warn' },
  superseded: { label: '已取代', cls: 'muted' },
};

export const blockedMeta: Record<BlockedReason, { label: string; cls: string }> = {
  'pending-evidence': { label: '缺少证据', cls: 'warn' },
  superseded: { label: '已被改证取代', cls: 'muted' },
  'handed-over': { label: '已移交封档', cls: 'frozen' },
};

export const outcomeMeta: Record<ReceptionOutcome, { label: string; cls: string }> = {
  accepted: { label: '接收归档', cls: 'ok' },
  quarantined: { label: '缺证隔离', cls: 'warn' },
  'rejected-fingerprint-conflict': { label: '指纹冲突退回', cls: 'risk' },
  'rejected-fingerprint-mismatch': { label: '元数据不符退回', cls: 'risk' },
  'rejected-duplicate': { label: '重复接收退回', cls: 'risk' },
  'rejected-invalid': { label: '形式不符退回', cls: 'risk' },
  supplemented: { label: '补证归档', cls: 'ok' },
  revision: { label: '改证新包', cls: 'revision' },
};

export const FIELD_LABELS: Record<string, string> = {
  source: '来源',
  fingerprint: '文件指纹',
  verifier: '核验人',
  component: '组件',
  version: '版本',
};
