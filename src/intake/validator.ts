import type { ArchiveState, EvidencePackage, IntakeSubmission } from '../archive/types';

// 接收校验层（与归档数据、页面分开）
// 纯函数：给定账本快照与提交件，返回核验结论；不写任何数据。

export type VerdictCode =
  | 'accept'          // 新件，证据齐全
  | 'quarantine'      // 已接收但证据缺失，隔离待补证
  | 'revision-accept' // 改证，准予新建包
  | 'invalid'         // 必填项缺失/格式不合法
  | 'fingerprint-conflict' // 指纹已归属其他组件
  | 'fingerprint-mismatch' // 同组件同指纹但其他元数据不一致
  | 'duplicate';      // 完全重复接收

export interface FieldDiff {
  field: string;
  label: string;
  submitted: string;
  archived: string;
}

export type Verdict =
  | { code: 'accept' | 'quarantine' | 'revision-accept'; missingFields?: string[]; twin?: EvidencePackage }
  | { code: 'invalid'; reasons: string[] }
  | {
      code: 'fingerprint-conflict' | 'fingerprint-mismatch' | 'duplicate';
      owner: EvidencePackage;
      diffs: FieldDiff[];
    };

export const FINGERPRINT_RE = /^[a-f0-9]{64}$/;

export function normalizeFingerprint(fp: string): string {
  return fp.trim().toLowerCase().replace(/\s+/g, '');
}

const FIELD_LABELS: Record<string, string> = {
  component: '组件',
  version: '版本',
  source: '来源',
  fingerprint: '文件指纹',
  verifier: '核验人',
};

function buildDiffs(sub: IntakeSubmission, owner: EvidencePackage): FieldDiff[] {
  const values: Array<[string, string, string]> = [
    ['component', sub.component.trim(), owner.component],
    ['version', sub.version.trim(), owner.version],
    ['source', sub.source.trim(), owner.source],
    ['verifier', sub.verifier.trim(), owner.verifier],
    ['fingerprint', normalizeFingerprint(sub.fingerprint), owner.fingerprint],
  ];
  return values
    .filter(([, a, b]) => a !== b)
    .map(([field, submitted, archived]) => ({
      field, label: FIELD_LABELS[field] ?? field, submitted, archived,
    }));
}

/**
 * 核验一次接收提交：
 *  1. 必填项（组件/版本）与指纹格式
 *  2. 指纹归属：同一指纹只能归属一个组件
 *     - 归属其他组件 → fingerprint-conflict，退回并列出字段差异
 *     - 归属同组件同版本但元数据不一致 → fingerprint-mismatch，退回
 *     - 组件/版本/来源/核验人全部一致 → duplicate，重复接收退回
 *  3. 改证（isRevision + supersedes）：新指纹、必须指向同组件的已归档包
 *  4. 证据缺失（来源/指纹/核验人缺项）→ quarantine 隔离
 *  5. 其余 → accept
 */
export function inspectIntake(state: ArchiveState, rawSub: IntakeSubmission): Verdict {
  const sub: IntakeSubmission = {
    ...rawSub,
    component: rawSub.component.trim(),
    version: rawSub.version.trim(),
    source: rawSub.source.trim(),
    fingerprint: normalizeFingerprint(rawSub.fingerprint),
    verifier: rawSub.verifier.trim(),
    note: rawSub.note.trim(),
  };

  const invalidReasons: string[] = [];
  if (!sub.component) invalidReasons.push('组件名称必填');
  if (!sub.version) invalidReasons.push('版本必填');
  if (rawSub.fingerprint.trim() && !FINGERPRINT_RE.test(sub.fingerprint)) {
    invalidReasons.push('文件指纹必须为 64 位十六进制 SHA-256');
  }
  if (sub.isRevision) {
    if (!sub.supersedes) {
      invalidReasons.push('改证新包必须在来源链中指定被取代的证据包');
    } else {
      const predecessor = state.packages.find((p) => p.id === sub.supersedes);
      if (!predecessor) {
        invalidReasons.push('来源链指向的证据包不存在');
      } else {
        if (predecessor.component !== sub.component) {
          invalidReasons.push(`改证包组件必须与来源链一致（${predecessor.component}）`);
        }
        if (predecessor.frozen) {
          invalidReasons.push(`${predecessor.id} 已随发布批次移交冻结，不能作为改证来源`);
        }
        if (sub.fingerprint && predecessor.fingerprint === sub.fingerprint) {
          invalidReasons.push('改证包指纹与来源包相同，未产生新证据；重复件请走接收登记');
        }
      }
    }
  }
  if (invalidReasons.length) return { code: 'invalid', reasons: invalidReasons };

  // 指纹唯一性 / 重复接收判定
  if (sub.fingerprint) {
    const owner = state.packages.find((p) => p.fingerprint === sub.fingerprint);
    if (owner) {
      const diffs = buildDiffs(sub, owner);
      if (owner.component !== sub.component) {
        return { code: 'fingerprint-conflict', owner, diffs };
      }
      // 同组件：改证件的新指纹理论上不会命中；命中说明根本就是同一个件
      if (owner.version === sub.version && diffs.length === 0) {
        return { code: 'duplicate', owner, diffs: [] };
      }
      return { code: 'fingerprint-mismatch', owner, diffs };
    }
  }

  // 证据完整性
  const missingFields: string[] = [];
  if (!sub.source) missingFields.push('source');
  if (!sub.fingerprint) missingFields.push('fingerprint');
  if (!sub.verifier) missingFields.push('verifier');
  if (missingFields.length) return { code: 'quarantine', missingFields };

  return { code: sub.isRevision ? 'revision-accept' : 'accept' };
}

/** 补证核验：仅允许对「待补证、未冻结」的包补齐来源/指纹/核验人。 */
export function inspectSupplement(
  state: ArchiveState,
  packageId: string,
  patch: { source: string; fingerprint: string; verifier: string },
): Verdict {
  const pkg = state.packages.find((p) => p.id === packageId);
  if (!pkg) return { code: 'invalid', reasons: [`证据包 ${packageId} 不存在`] };
  if (pkg.frozen) return { code: 'invalid', reasons: [`${packageId} 已移交冻结，证据不可变更（如需更正请走改证新包）`] };
  if (pkg.status !== 'pending-evidence') return { code: 'invalid', reasons: [`${packageId} 不是待补证状态`] };

  const source = patch.source.trim();
  const fingerprint = normalizeFingerprint(patch.fingerprint);
  const verifier = patch.verifier.trim();

  const reasons: string[] = [];
  if (!source) reasons.push('来源必填');
  if (!fingerprint) reasons.push('文件指纹必填');
  else if (!FINGERPRINT_RE.test(fingerprint)) reasons.push('文件指纹必须为 64 位十六进制 SHA-256');
  if (!verifier) reasons.push('核验人必填');
  if (reasons.length) return { code: 'invalid', reasons };

  const owner = state.packages.find((p) => p.fingerprint === fingerprint && p.id !== packageId);
  if (owner) {
    return {
      code: 'fingerprint-conflict',
      owner,
      diffs: [{ field: 'fingerprint', label: '文件指纹', submitted: fingerprint, archived: owner.fingerprint }],
    };
  }
  return { code: 'accept' };
}
