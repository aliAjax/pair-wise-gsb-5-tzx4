// 页面层共享：视图类型、格式化、通用小组件
import type { ReactNode } from 'react';
import { AlertTriangle, Check, FileLock2, Link2, PackageX } from 'lucide-react';
import type { ArchiveState, EvidencePackage } from '../archive/types';
import { isSuperseded } from '../archive/archive';

export type View = 'packages' | 'publishable' | 'intakes' | 'releases';

export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const shortFp = (fp: string): string =>
  fp ? `${fp.slice(0, 8)}…${fp.slice(-8)}` : '—';

/** 包在当前归档中的业务状态（superseded 由来源链推导） */
export type VisualStatus = 'archived' | 'handed' | 'superseded' | 'incomplete';

export function visualStatus(state: ArchiveState, p: EvidencePackage): VisualStatus {
  if (isSuperseded(state, p.id)) return 'superseded';
  if (p.status === 'handed') return 'handed';
  if (p.missingEvidence) return 'incomplete';
  return 'archived';
}

export const STATUS_META: Record<VisualStatus, { label: string; cls: string; icon: ReactNode }> = {
  archived: { label: '在档可移交', cls: 'ok', icon: <Check size={13} /> },
  handed: { label: '已移交冻结', cls: 'handed', icon: <FileLock2 size={13} /> },
  superseded: { label: '已改证替换', cls: 'superseded', icon: <Link2 size={13} /> },
  incomplete: { label: '证据缺失', cls: 'risk', icon: <AlertTriangle size={13} /> },
};

export const NO_EVIDENCE_HINT = '该包证据缺失，不得进入可发布清单';

export function MissingBadge({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <span className="missing-badge" title={reason}><PackageX size={12} />缺证</span>;
}
