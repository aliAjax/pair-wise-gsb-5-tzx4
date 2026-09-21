import type { ArchiveState, EvidencePackage, HandoverRecord, IntakeBatch, ReceptionRecord, ReleaseBatch } from './types';

// 只读选择器：页面统一从这里取数，不在组件内自行拼账本。

export const selectAllPackages = (s: ArchiveState): EvidencePackage[] => s.packages;
export const selectAllBatches = (s: ArchiveState): IntakeBatch[] => [...s.batches].reverse();
export const selectAllReceptions = (s: ArchiveState): ReceptionRecord[] => [...s.receptions].reverse();
export const selectAllReleases = (s: ArchiveState): ReleaseBatch[] => [...s.releases].reverse();

export function selectPackage(s: ArchiveState, id: string | null): EvidencePackage | undefined {
  return id ? s.packages.find((p) => p.id === id) : undefined;
}

export function selectReceptionsOfBatch(s: ArchiveState, batchId: string): ReceptionRecord[] {
  const batch = s.batches.find((b) => b.id === batchId);
  if (!batch) return [];
  return batch.receptionIds
    .map((id) => s.receptions.find((r) => r.id === id))
    .filter((r): r is ReceptionRecord => Boolean(r));
}

export function selectReceptionsOfPackage(s: ArchiveState, packageId: string): ReceptionRecord[] {
  return s.receptions.filter((r) => r.packageId === packageId);
}

export function selectHandoversOfRelease(s: ArchiveState, releaseId: string): HandoverRecord[] {
  const release = s.releases.find((r) => r.id === releaseId);
  if (!release) return [];
  return release.handoverIds
    .map((id) => s.handovers.find((h) => h.id === id))
    .filter((h): h is HandoverRecord => Boolean(h));
}

export function selectHandoverOfPackage(s: ArchiveState, packageId: string): HandoverRecord | undefined {
  return s.handovers.find((h) => h.packageId === packageId);
}

/** 指纹归属：同一指纹只能归属一个组件（pending/archived/superseded 都计入占用） */
export function selectOwnerOfFingerprint(s: ArchiveState, fingerprint: string): EvidencePackage | undefined {
  const fp = fingerprint.trim().toLowerCase();
  if (!fp) return undefined;
  return s.packages.find((p) => p.fingerprint === fp);
}

/** 来源链：沿 supersedes 向上回溯到初始包 */
export function selectProvenanceChain(s: ArchiveState, packageId: string): EvidencePackage[] {
  const byId = new Map(s.packages.map((p) => [p.id, p]));
  const chain: EvidencePackage[] = [];
  let current = byId.get(packageId);
  const guard = new Set<string>();
  while (current) {
    chain.push(current);
    if (guard.has(current.id)) break;
    guard.add(current.id);
    current = current.supersedes ? byId.get(current.supersedes) : undefined;
  }
  return chain;
}

/** 该包被哪些更新包取代（一般至多一个） */
export function selectRevisionsOf(s: ArchiveState, packageId: string): EvidencePackage[] {
  return s.packages.filter((p) => p.supersedes === packageId);
}

export type BlockedReason = 'pending-evidence' | 'superseded' | 'handed-over';

export interface PublishableEntry {
  pkg: EvidencePackage;
  eligible: boolean;
  blockedReason?: BlockedReason;
}

/**
 * 可发布清单：
 *  - 证据齐全（archived）且尚未移交 → 可发布
 *  - 缺证 / 已被取代 / 已移交封入发布批次 → 不得进入
 */
export function selectPublishableList(s: ArchiveState): PublishableEntry[] {
  return s.packages.map((pkg) => {
    if (pkg.status === 'pending-evidence') return { pkg, eligible: false, blockedReason: 'pending-evidence' };
    if (pkg.status === 'superseded') return { pkg, eligible: false, blockedReason: 'superseded' };
    if (pkg.frozen) return { pkg, eligible: false, blockedReason: 'handed-over' };
    return { pkg, eligible: true };
  });
}

export function selectOpenRelease(s: ArchiveState): ReleaseBatch | undefined {
  return s.releases.find((r) => !r.sealed);
}

export interface ArchiveStats {
  total: number;
  archived: number;
  pending: number;
  superseded: number;
  frozen: number;
  publishable: number;
  blocked: number;
  batches: number;
  releases: number;
  rejected: number;
}

export function selectStats(s: ArchiveState): ArchiveStats {
  const list = selectPublishableList(s);
  return {
    total: s.packages.length,
    archived: s.packages.filter((p) => p.status === 'archived').length,
    pending: s.packages.filter((p) => p.status === 'pending-evidence').length,
    superseded: s.packages.filter((p) => p.status === 'superseded').length,
    frozen: s.packages.filter((p) => p.frozen).length,
    publishable: list.filter((e) => e.eligible).length,
    blocked: list.filter((e) => !e.eligible).length,
    batches: s.batches.length,
    releases: s.releases.length,
    rejected: s.receptions.filter((r) => r.outcome.startsWith('rejected')).length,
  };
}
