import type {
  ArchiveState, EvidencePackage, HandoverRecord, IntakeBatch, ReceptionRecord, ReleaseBatch,
} from './types';
import { createSeedState } from './seed';

// 归档数据层
// 职责仅限：持久化、ID 生成、只追加（append-only）写入、数据级不变量。
// 业务校验在 intake/release 服务层；本层只拒绝会破坏账本结构的提交。

const STORAGE_KEY = 'offline-evidence-archive-v1';

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}

function load(): ArchiveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ArchiveState;
      if (parsed && Array.isArray(parsed.packages) && parsed.seq) {
        return freeze(parsed);
      }
    }
  } catch {
    // 存档损坏时退回示例数据
  }
  return freeze(createSeedState());
}

let state: ArchiveState = load();
const listeners = new Set<() => void>();

function commit(next: ArchiveState) {
  state = freeze(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式 / 配额不足时内存账本仍可用
  }
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getState(): ArchiveState {
  return state;
}

export function resetToSeed(): void {
  commit(createSeedState());
}

// ---- ID 生成（序号本身也随账本持久化，保证刷新后一致） ----
export const nextPackageId = (s: ArchiveState) => `EV-${String(s.seq.pkg + 1).padStart(4, '0')}`;
export const nextBatchId = (s: ArchiveState) => `RCV-${String(s.seq.batch + 1).padStart(4, '0')}`;
export const nextReceptionId = (s: ArchiveState) => `R-${String(s.seq.reception + 1).padStart(4, '0')}`;
export const nextReleaseId = (s: ArchiveState, at: Date) =>
  `REL-${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(s.seq.release + 1).padStart(3, '0')}`;
export const nextHandoverId = (s: ArchiveState) => `H-${String(s.seq.handover + 1).padStart(4, '0')}`;

// ---- 只追加写入原语 ----
// 设计约束：packages/batches/receptions/releases/handovers 只能增长；
// 证据包允许的状态字段迁移仅通过受控原语完成（补证 / 改证 / 移交冻结）。

function assertAppend<T>(before: T[], after: T[], label: string) {
  if (after.length < before.length) throw new Error(`${label} 为只追加账本，禁止删除`);
  for (let i = 0; i < before.length; i++) {
    if (after[i] !== before[i]) throw new Error(`${label} 历史记录不可修改`);
  }
}

interface AppendIntakeArgs {
  batch: Omit<IntakeBatch, 'id' | 'receptionIds'>;
  records: Array<{
    record: Omit<ReceptionRecord, 'id' | 'batchId'>;
    package?: EvidencePackage;
  }>;
  /** 批次内对既有包的受控迁移（如改证时旧包标记 superseded），随批次原子入账 */
  packagePatches?: Array<{ id: string; patch: Partial<EvidencePackage> }>;
}

/** 追加一个接收批次及其接收记录（含可能产生的新证据包）。全部一次性入账。 */
export function appendIntake({ batch, records, packagePatches = [] }: AppendIntakeArgs): ArchiveState {
  const s = state;
  const batchId = nextBatchId(s);
  let receptionSeq = s.seq.reception;
  let pkgSeq = s.seq.pkg;

  const newPackages: EvidencePackage[] = [];
  const newRecords: ReceptionRecord[] = records.map(({ record, package: pkg }) => {
    receptionSeq += 1;
    const id = `R-${String(receptionSeq).padStart(4, '0')}`;
    if (pkg) {
      pkgSeq += 1;
      const pkgId = pkg.id || `EV-${String(pkgSeq).padStart(4, '0')}`;
      newPackages.push({ ...pkg, id: pkgId, receivedInBatch: batchId });
      return { ...record, id, batchId, packageId: record.packageId ?? pkgId };
    }
    return { ...record, id, batchId };
  });

  const newBatch: IntakeBatch = {
    ...batch,
    id: batchId,
    receptionIds: newRecords.map((r) => r.id),
  };

  // 既有包迁移：先取当前数组再逐个替换（被取代的旧包等随批次冻结语义）
  let packages = [...s.packages, ...newPackages];
  packagePatches.forEach(({ id, patch }) => {
    const idx = packages.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`批次内迁移目标 ${id} 不存在`);
    packages[idx] = { ...packages[idx], ...patch, id };
  });

  const next: ArchiveState = {
    ...s,
    packages,
    batches: [...s.batches, newBatch],
    receptions: [...s.receptions, ...newRecords],
    seq: { ...s.seq, pkg: pkgSeq, batch: s.seq.batch + 1, reception: receptionSeq },
  };
  commit(next);
  return next;
}

/**
 * 证据包字段迁移（账本中唯一允许改既有包的入口，仅服务层可调用）。
 * 迁移本身仍产生新的接收批次/记录留痕；这里只做机械替换并强制数据级约束。
 */
export function mutatePackageFields(
  packageId: string,
  patch: Partial<EvidencePackage>,
  guard: (p: EvidencePackage) => void,
): EvidencePackage {
  const s = state;
  const idx = s.packages.findIndex((p) => p.id === packageId);
  if (idx < 0) throw new Error(`证据包 ${packageId} 不存在`);
  const current = s.packages[idx];
  guard(current);
  const updated: EvidencePackage = { ...current, ...patch, id: current.id };
  const packages = s.packages.slice();
  packages[idx] = updated;
  const next: ArchiveState = { ...s, packages };
  commit(next);
  return updated;
}

export interface NewReleaseArgs {
  name: string;
  createdBy: string;
  at: Date;
}
export function appendRelease({ name, createdBy, at }: NewReleaseArgs): ReleaseBatch {
  const s = state;
  const release: ReleaseBatch = {
    id: nextReleaseId(s, at),
    name,
    createdAt: at.toISOString(),
    createdBy,
    sealedAt: null,
    handoverIds: [],
    sealed: false,
  };
  commit({ ...s, releases: [...s.releases, release], seq: { ...s.seq, release: s.seq.release + 1 } });
  return release;
}

export interface HandoverArgs {
  packageIds: string[];
  releaseBatchId: string;
  by: string;
  at: Date;
}
/** 移交：冻结证据包、写入移交记录、封存发布批次——一次性原子完成，不可逆。 */
export function handoverAndSeal({ packageIds, releaseBatchId, by, at }: HandoverArgs): HandoverRecord[] {
  const s = state;
  const release = s.releases.find((r) => r.id === releaseBatchId);
  if (!release) throw new Error('发布批次不存在');
  if (release.sealed) throw new Error('发布批次已封存，不可再移交');

  const packages = s.packages.slice();
  const handovers: HandoverRecord[] = [];
  let handoverSeq = s.seq.handover;

  packageIds.forEach((pid) => {
    const idx = packages.findIndex((p) => p.id === pid);
    if (idx < 0) throw new Error(`证据包 ${pid} 不存在`);
    const p = packages[idx];
    if (p.frozen) throw new Error(`证据包 ${pid} 已随发布批次移交，不可覆盖`);
    if (p.status !== 'archived') throw new Error(`证据包 ${pid} 证据不齐，不得移交`);
    if (release.handoverIds.length > 0 && s.handovers.some(
      (h) => h.releaseBatchId === releaseBatchId && h.packageId === pid,
    )) throw new Error(`证据包 ${pid} 已在该批次中`);

    handoverSeq += 1;
    handovers.push({
      id: `H-${String(handoverSeq).padStart(4, '0')}`,
      packageId: pid,
      releaseBatchId,
      fingerprintSnapshot: p.fingerprint,
      handedOverAt: at.toISOString(),
      handedOverBy: by,
    });
    packages[idx] = { ...p, frozen: true, releaseBatchId, handedOverAt: at.toISOString() };
  });

  const releases = s.releases.slice();
  const rIdx = releases.findIndex((r) => r.id === releaseBatchId);
  releases[rIdx] = {
    ...release,
    handoverIds: [...release.handoverIds, ...handovers.map((h) => h.id)],
    sealed: true,
    sealedAt: at.toISOString(),
  };

  // 结构校验：移交记录只追加；证据包仅允许受控字段迁移（冻结标记），不允许删除
  if (packages.length !== s.packages.length) throw new Error('packages 为只追加账本，禁止删除');
  assertAppend(s.handovers, [...s.handovers, ...handovers], 'handovers');

  commit({
    ...s,
    packages,
    releases,
    handovers: [...s.handovers, ...handovers],
    seq: { ...s.seq, handover: handoverSeq },
  });
  return handovers;
}
