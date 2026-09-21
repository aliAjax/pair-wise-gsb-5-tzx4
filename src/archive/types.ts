// 离线证据包归档台 —— 领域模型
// 证据包 / 接收批次 / 发布批次的核心结构，归档数据层与接收校验层共用。

/** 文件指纹（SHA-256，64 位十六进制）。同一指纹全局只能归属一个组件。 */
export type Fingerprint = string;

/** 证据包状态：已归档（在档可移交）/ 已移交（进入发布批次后冻结） */
export type PackageStatus = 'archived' | 'handed';

/** 证据来源类型 */
export type SourceKind = '内部构建' | '供应商交付' | '镜像同步' | '安全扫描' | '手动上传';

/** 一个离线证据包：记录组件、版本、来源、文件指纹和核验人 */
export interface EvidencePackage {
  id: string;
  component: string;
  version: string;
  source: string;
  fingerprint: string;
  verifier: string;
  receivedAt: string; // ISO 时间
  note: string;
  status: PackageStatus;
  /** 缺证原因；非空表示该包证据不完整，不得进入可发布清单 */
  missingEvidence: string | null;
  /** 改证新建的包通过该字段指向被其替换的旧包，构成来源链 */
  supersedesId: string | null;
  /** 移交后回填的发布批次号 */
  releaseBatchId: string | null;
}

/** 接收批次：一次接收动作的不可变归档记录 */
export interface IntakeBatch {
  id: string; // RC-YYYYMMDD-NN
  receivedAt: string;
  receiver: string; // 接收人
  /** 本次实际归档入库的包 */
  packageIds: string[];
  /** 重复/冲突未入库的接收尝试，用于说明差异 */
  rejections: IntakeRejection[];
  /** 接收时证据不全、登记为缺证的包 id */
  incompleteIds: string[];
  sealed: boolean; // 接收批次一经封存不可变更
}

/** 重复接收时记录的差异说明（不改动已归档批次） */
export interface IntakeRejection {
  receivedAt: string;
  component: string;
  version: string;
  source: string;
  fingerprint: string;
  verifier: string;
  reason: string; // duplicate | conflict
  detail: string; // 与已归档包的差异说明
  existingPackageId: string;
}

/** 发布批次：证据包移交后冻结，不可覆盖 */
export interface ReleaseBatch {
  id: string; // REL-YYYYMMDD-NN
  createdAt: string;
  creator: string;
  label: string;
  /** 移交时的不可变快照 */
  entries: ReleaseEntry[];
  locked: boolean;
}

export interface ReleaseEntry {
  packageId: string;
  component: string;
  version: string;
  fingerprint: string;
  verifier: string;
  source: string;
  /** 该包后来是否已被新包替换（仅展示来源链，不改动批次快照） */
  supersededById: string | null;
}

/** 归档库整体状态 */
export interface ArchiveState {
  packages: EvidencePackage[];
  intakeBatches: IntakeBatch[];
  releaseBatches: ReleaseBatch[];
  /** 自增序列，保证刷新后批次号稳定不重复 */
  counters: { intake: number; release: number };
}

/** 接收表单（核验人/指纹可缺，缺证登记） */
export interface IntakeInput {
  component: string;
  version: string;
  source: string;
  fingerprint: string; // 允许空串：缺证
  verifier: string; // 允许空串：缺证
  note?: string;
  receiver: string;
}
