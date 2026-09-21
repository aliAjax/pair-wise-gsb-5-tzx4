// 接收校验层：接收规则的唯一入口，纯函数，不依赖 React / localStorage。
// 规则：
//  1. 同一文件指纹全局只能归属一个组件；
//  2. 指纹重复时不入库，必须给出与已归档包的差异说明，且已归档批次保持不变；
//  3. 核验人或指纹缺失 → 登记为缺证包，不进入可发布清单；
//  4. 改证只能新建包（supersedePackage），来源链由数据层维护。
import type { ArchiveState, EvidencePackage, IntakeInput, IntakeRejection } from './types';
import { findByFingerprint } from './archive';

export const SHA256_RE = /^[0-9a-f]{64}$/;

export type IntakeVerdict =
  | { kind: 'accept'; missing: string | null }
  | { kind: 'duplicate'; existing: EvidencePackage; rejection: IntakeRejection }
  | { kind: 'invalid'; errors: string[] };

const nowIso = () => new Date().toISOString();

/** 描述本次接收与已归档包之间的字段差异 */
function diffAgainst(input: IntakeInput, existing: EvidencePackage): string {
  const diffs: string[] = [];
  if (input.component.trim() !== existing.component)
    diffs.push(`组件不同：提交「${input.component.trim()}」vs 在档「${existing.component}」`);
  if (input.version.trim() !== existing.version)
    diffs.push(`版本不同：提交「${input.version.trim()}」vs 在档「${existing.version}」`);
  if (input.source.trim() !== existing.source)
    diffs.push(`来源不同：提交「${input.source.trim()}」vs 在档「${existing.source}」`);
  if (input.verifier.trim() !== existing.verifier)
    diffs.push(`核验人不同：提交「${input.verifier.trim() || '（空缺）'}」vs 在档「${existing.verifier}」`);
  if (diffOnNote(input.note, existing.note))
    diffs.push('备注内容不同');
  return diffs.length ? diffs.join('；') : '字段完全一致，属于重复提交';
}

function diffOnNote(a?: string, b?: string): boolean {
  return (a ?? '').trim() !== (b ?? '').trim();
}

/**
 * 裁定一次接收：
 * - accept(含 missing)：可入库；missing 非空时为缺证登记
 * - duplicate：指纹已在档，返回带差异说明的拒绝记录（归档方据此另立接收批次）
 * - invalid：表单不合法，连缺证登记都不允许
 */
export function reviewIntake(state: ArchiveState, input: IntakeInput): IntakeVerdict {
  const errors: string[] = [];
  if (!input.component.trim()) errors.push('缺少组件名称');
  if (!input.version.trim()) errors.push('缺少版本');
  if (!input.source.trim()) errors.push('缺少来源');
  if (!input.receiver.trim()) errors.push('缺少接收人');
  const fp = input.fingerprint.trim().toLowerCase();
  if (fp && !SHA256_RE.test(fp)) errors.push('文件指纹须为 64 位 SHA-256 十六进制串');
  if (errors.length) return { kind: 'invalid', errors };

  const missingParts: string[] = [];
  if (!fp) missingParts.push('缺少文件指纹');
  if (!input.verifier.trim()) missingParts.push('缺少核验人签字');
  const missing = missingParts.length ? missingParts.join('、') : null;

  if (fp) {
    const existing = findByFingerprint(state, fp);
    if (existing) {
      const sameComponent = existing.component === input.component.trim();
      const rejection: IntakeRejection = {
        receivedAt: nowIso(),
        component: input.component.trim(),
        version: input.version.trim(),
        source: input.source.trim(),
        fingerprint: fp,
        verifier: input.verifier.trim(),
        reason: sameComponent ? 'duplicate' : 'conflict',
        detail: sameComponent
          ? `指纹已归属组件「${existing.component}」（包 ${existing.id}）；${diffAgainst(input, existing)}。已归档批次不变。`
          : `指纹冲突：同一指纹已归属其他组件「${existing.component}」（包 ${existing.id}）；${diffAgainst(input, existing)}。已归档批次不变。`,
        existingPackageId: existing.id,
      };
      return { kind: 'duplicate', existing, rejection };
    }
  }

  return { kind: 'accept', missing };
}

/**
 * 改证裁定：新包必须带全新指纹且证据齐全；
 * 新指纹若与别的组件在档指纹相同，同样按冲突拒绝。
 */
export function reviewRevision(
  state: ArchiveState,
  old: EvidencePackage,
  input: IntakeInput,
): IntakeVerdict {
  const verdict = reviewIntake(state, input);
  if (verdict.kind === 'invalid') return verdict;
  // 原指纹不可复用（即便 reviewIntake 因指纹命中旧包本身判为重复，也在此明确拒绝）
  if (input.fingerprint.trim().toLowerCase() === old.fingerprint) {
    return { kind: 'invalid', errors: ['改证必须提交新的文件指纹，原指纹不可复用'] };
  }
  if (verdict.kind === 'duplicate') return verdict;
  // verdict.kind === 'accept'
  if (verdict.missing) {
    return { kind: 'invalid', errors: [`改证新包证据必须齐全（${verdict.missing}）`] };
  }
  return verdict;
}
