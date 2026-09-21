// 归档数据层 —— 领域类型
// 所有归档记录均为只追加（append-only）：接收批次、移交记录一经写入不可修改。

export type PkgStatus = 'archived' | 'pending-evidence' | 'superseded';

/** 证据包：组件 + 版本 + 来源 + 文件指纹 + 核验人 */
export interface EvidencePackage {
  id: string;
  component: string;
  version: string;
  source: string;
  /** 文件指纹（SHA-256，小写十六进制）；证据缺失时为空串 */
  fingerprint: string;
  verifier: string;
  status: PkgStatus;
  /** 改证来源链：本包取代的上一包（始终保留旧包不动） */
  supersedes: string | null;
  /** 最初进入归档台的接收批次 */
  receivedInBatch: string;
  /** 证据补全时的接收批次（原始批次保持不变） */
  completedInBatch: string | null;
  receivedAt: string;
  /** 证据备注（差异说明 / 变更理由） */
  note: string;
  /** 移交到发布批次后冻结：不可再改、不可再移交 */
  frozen: boolean;
  releaseBatchId: string | null;
  handedOverAt: string | null;
}

/** 接收批次：一次提交动作即生成一个批次，仅追加 */
export interface IntakeBatch {
  id: string;
  receivedAt: string;
  clerk: string;
  /** 该批次内每一条处理结果的接收记录 id（冻结快照） */
  receptionIds: string[];
  summary: string;
}

export type ReceptionOutcome =
  | 'accepted'
  | 'quarantined'
  | 'rejected-fingerprint-conflict'
  | 'rejected-fingerprint-mismatch'
  | 'rejected-duplicate'
  | 'rejected-invalid'
  | 'supplemented'
  | 'revision';

/** 接收记录：每一次接收尝试都留痕（拒绝也留痕），不可修改 */
export interface ReceptionRecord {
  id: string;
  batchId: string;
  receivedAt: string;
  /** 产生或关联的证据包 id；拒绝时可能为空 */
  packageId: string | null;
  outcome: ReceptionOutcome;
  /** 提交原件快照 */
  submitted: {
    component: string;
    version: string;
    source: string;
    fingerprint: string;
    verifier: string;
    supersedes: string | null;
    note: string;
  };
  /** 指纹冲突 / 重复时，说明与既有归档的字段差异 */
  diffAgainst?: {
    packageId: string;
    fields: { field: string; submitted: string; archived: string }[];
  };
  /** 重复接收时填写：为什么再次提交 */
  discrepancyNote?: string;
  missingFields?: string[];
  reason: string;
}

/** 发布批次：只追加，封存后不可变更 */
export interface ReleaseBatch {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  sealedAt: string | null;
  /** 封存后冻结的移交记录快照 */
  handoverIds: string[];
  sealed: boolean;
}

/** 移交记录：证据包移交到发布批次，不可逆 */
export interface HandoverRecord {
  id: string;
  packageId: string;
  releaseBatchId: string;
  /** 移交时冻结的指纹快照 */
  fingerprintSnapshot: string;
  handedOverAt: string;
  handedOverBy: string;
}

export interface ArchiveState {
  packages: EvidencePackage[];
  batches: IntakeBatch[];
  receptions: ReceptionRecord[];
  releases: ReleaseBatch[];
  handovers: HandoverRecord[];
  seq: { pkg: number; batch: number; reception: number; release: number; handover: number };
}

/** 一次接收提交 */
export interface IntakeSubmission {
  component: string;
  version: string;
  source: string;
  fingerprint: string;
  verifier: string;
  supersedes: string | null;
  note: string;
  isRevision: boolean;
}
