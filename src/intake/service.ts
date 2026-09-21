import type { EvidencePackage, IntakeSubmission, ReceptionOutcome, ReceptionRecord } from '../archive/types';
import { appendIntake, getState, mutatePackageFields, nextPackageId } from '../archive/store';
import { inspectIntake, inspectSupplement, normalizeFingerprint, type Verdict } from './validator';

// 接收服务：编排「校验 → 只追加入账」，并生成批次摘要、差异说明与来源链。
// 任何一次提交（含退回）都会产生新的接收批次与接收记录；既有批次永不改动。

export interface ReceiveResult {
  verdict: Verdict;
  batchId: string;
  recordId: string;
  packageId: string | null;
}

const REJECTION_OUTCOME: Record<string, ReceptionOutcome> = {
  'fingerprint-conflict': 'rejected-fingerprint-conflict',
  'fingerprint-mismatch': 'rejected-fingerprint-mismatch',
  duplicate: 'rejected-duplicate',
  invalid: 'rejected-invalid',
};

function summarizeBatch(sub: IntakeSubmission, code: Verdict['code']): string {
  const action =
    code === 'accept' ? '新件归档' :
    code === 'revision-accept' ? '改证新包归档' :
    code === 'quarantine' ? '缺证隔离' :
    code === 'duplicate' ? '重复接收退回' :
    code === 'fingerprint-conflict' ? '指纹归属冲突退回' :
    code === 'fingerprint-mismatch' ? '同指纹元数据不符退回' :
    '形式校验不通过退回';
  return `${action}：${sub.component}@${sub.version || '？'}`;
}

/**
 * 接收一个证据包提交。
 * @param discrepancyNote 重复/冲突时，接收人必须填写的差异说明
 */
export function receiveSubmission(rawSub: IntakeSubmission, clerk: string, discrepancyNote?: string): ReceiveResult {
  const state = getState();
  const verdict = inspectIntake(state, rawSub);
  const sub: IntakeSubmission = {
    ...rawSub,
    component: rawSub.component.trim(),
    version: rawSub.version.trim(),
    source: rawSub.source.trim(),
    fingerprint: normalizeFingerprint(rawSub.fingerprint),
    verifier: rawSub.verifier.trim(),
    note: rawSub.note.trim(),
  };
  const at = new Date().toISOString();

  // ---- 退回类：不产生新包，只追加批次 + 接收记录（原件快照留痕） ----
  if (verdict.code === 'fingerprint-conflict' || verdict.code === 'fingerprint-mismatch' || verdict.code === 'duplicate') {
    if (!discrepancyNote || !discrepancyNote.trim()) {
      throw new Error('重复/冲突接收必须填写差异说明');
    }
    const record: Omit<ReceptionRecord, 'id' | 'batchId'> = {
      receivedAt: at,
      packageId: verdict.owner.id,
      outcome: REJECTION_OUTCOME[verdict.code],
      submitted: {
        component: sub.component, version: sub.version, source: sub.source,
        fingerprint: sub.fingerprint, verifier: sub.verifier,
        supersedes: sub.supersedes, note: sub.note,
      },
      diffAgainst: {
        packageId: verdict.owner.id,
        fields: verdict.diffs.map((d) => ({ field: d.field, submitted: d.submitted, archived: d.archived })),
      },
      discrepancyNote: discrepancyNote.trim(),
      reason:
        verdict.code === 'duplicate'
          ? `重复接收：同组件同指纹已归档于 ${verdict.owner.id}`
          : verdict.code === 'fingerprint-conflict'
            ? `指纹归属冲突：指纹已被 ${verdict.owner.id}（${verdict.owner.component}@${verdict.owner.version}）占用`
            : `同指纹元数据与 ${verdict.owner.id} 不一致，已退回`,
    };
    const next = appendIntake({
      batch: { receivedAt: at, clerk, summary: summarizeBatch(sub, verdict.code) },
      records: [{ record }],
    });
    const created = next.receptions[next.receptions.length - 1];
    return { verdict, batchId: next.batches[next.batches.length - 1].id, recordId: created.id, packageId: verdict.owner.id };
  }

  if (verdict.code === 'invalid') {
    const record: Omit<ReceptionRecord, 'id' | 'batchId'> = {
      receivedAt: at,
      packageId: null,
      outcome: 'rejected-invalid',
      submitted: {
        component: sub.component, version: sub.version, source: sub.source,
        fingerprint: sub.fingerprint, verifier: sub.verifier,
        supersedes: sub.supersedes, note: sub.note,
      },
      reason: `形式校验不通过：${verdict.reasons.join('；')}`,
    };
    const next = appendIntake({
      batch: { receivedAt: at, clerk, summary: summarizeBatch(sub, 'invalid') },
      records: [{ record }],
    });
    const created = next.receptions[next.receptions.length - 1];
    return { verdict, batchId: next.batches[next.batches.length - 1].id, recordId: created.id, packageId: null };
  }

  // ---- 接收类：产生新证据包 ----
  const s = getState();
  const pkgId = nextPackageId(s);
  const status: EvidencePackage['status'] = verdict.code === 'quarantine' ? 'pending-evidence' : 'archived';
  const pkg: EvidencePackage = {
    id: pkgId,
    component: sub.component,
    version: sub.version,
    source: sub.source,
    fingerprint: sub.fingerprint,
    verifier: sub.verifier,
    status,
    supersedes: sub.isRevision ? sub.supersedes : null,
    receivedInBatch: '', // appendIntake 写入批次时回填
    completedInBatch: null,
    receivedAt: at,
    note: sub.note,
    frozen: false,
    releaseBatchId: null,
    handedOverAt: null,
  };

  const outcome: ReceptionOutcome =
    verdict.code === 'quarantine' ? 'quarantined' : verdict.code === 'revision-accept' ? 'revision' : 'accepted';
  const record: Omit<ReceptionRecord, 'id' | 'batchId'> = {
    receivedAt: at,
    packageId: pkgId,
    outcome,
    submitted: {
      component: sub.component, version: sub.version, source: sub.source,
      fingerprint: sub.fingerprint, verifier: sub.verifier,
      supersedes: pkg.supersedes, note: sub.note,
    },
    missingFields: verdict.code === 'quarantine' ? verdict.missingFields : undefined,
    reason:
      verdict.code === 'quarantine'
        ? `缺少证据（${(verdict.missingFields ?? []).join('、')}），隔离待补证，不得进入可发布清单`
        : verdict.code === 'revision-accept'
          ? `改证新建包 ${pkgId}，旧包 ${sub.supersedes} 保留并标记 superseded，来源链完整`
          : '指纹唯一、证据齐全，准予归档',
  };

  const next = appendIntake({
    batch: { receivedAt: at, clerk, summary: summarizeBatch(sub, verdict.code) },
    records: [{ record, package: pkg }],
    packagePatches:
      verdict.code === 'revision-accept' && sub.supersedes
        ? [{ id: sub.supersedes, patch: { status: 'superseded', note: appendSupersedeNote(getState(), sub.supersedes, pkgId) } }]
        : [],
  });
  const batchId = next.batches[next.batches.length - 1].id;
  return { verdict, batchId, recordId: next.receptions[next.receptions.length - 1].id, packageId: pkgId };
}

function appendSupersedeNote(state: ReturnType<typeof getState>, oldId: string, newId: string): string {
  const old = state.packages.find((p) => p.id === oldId);
  const base = old?.note ?? '';
  const line = `已被 ${newId} 取代（改证新包保留来源链）`;
  return base.includes(line) ? base : base ? `${base}；${line}` : line;
}

export interface SupplementResult {
  verdict: Verdict;
  batchId: string;
  recordId: string;
}

/** 补证：把待补证包补齐为 archived；原始接收批次不变，补证动作另入新批次。 */
export function supplementEvidence(
  packageId: string,
  patch: { source: string; fingerprint: string; verifier: string; note: string },
  clerk: string,
): SupplementResult {
  const state = getState();
  const verdict = inspectSupplement(state, packageId, patch);
  const at = new Date().toISOString();

  if (verdict.code !== 'accept') {
    // 补证被退回同样留痕
    const rejectReason =
      verdict.code === 'invalid'
        ? `补证退回：${verdict.reasons.join('；')}`
        : verdict.code === 'fingerprint-conflict'
          ? `补证退回：指纹已归属 ${verdict.owner.id}（${verdict.owner.component}@${verdict.owner.version}）`
          : '补证退回';
    const record: Omit<ReceptionRecord, 'id' | 'batchId'> = {
      receivedAt: at,
      packageId,
      outcome: 'rejected-invalid',
      submitted: {
        component: state.packages.find((p) => p.id === packageId)?.component ?? '',
        version: state.packages.find((p) => p.id === packageId)?.version ?? '',
        source: patch.source.trim(), fingerprint: normalizeFingerprint(patch.fingerprint),
        verifier: patch.verifier.trim(), supersedes: null, note: patch.note.trim(),
      },
      reason: rejectReason,
    };
    const next = appendIntake({
      batch: { receivedAt: at, clerk, summary: `补证退回：${packageId}` },
      records: [{ record }],
    });
    return { verdict, batchId: next.batches[next.batches.length - 1].id, recordId: next.receptions[next.receptions.length - 1].id };
  }

  // 先追加批次与接收记录（记录里记录补证后的字段快照）
  const pkg = state.packages.find((p) => p.id === packageId)!;
  const record: Omit<ReceptionRecord, 'id' | 'batchId'> = {
    receivedAt: at,
    packageId,
    outcome: 'supplemented',
    submitted: {
      component: pkg.component, version: pkg.version,
      source: patch.source.trim(), fingerprint: normalizeFingerprint(patch.fingerprint),
      verifier: patch.verifier.trim(), supersedes: null, note: patch.note.trim(),
    },
    reason: `证据补齐，状态由 pending-evidence 转 archived；原始批次 ${pkg.receivedInBatch} 保持不变`,
  };
  const next = appendIntake({
    batch: { receivedAt: at, clerk, summary: `补证归档：${pkg.component}@${pkg.version}（${packageId}）` },
    records: [{ record }],
  });
  const batchId = next.batches[next.batches.length - 1].id;

  // 再做受控字段迁移（数据层强制 pending 且未冻结）
  mutatePackageFields(packageId, {
    source: patch.source.trim(),
    fingerprint: normalizeFingerprint(patch.fingerprint),
    verifier: patch.verifier.trim(),
    status: 'archived',
    completedInBatch: batchId,
    note: patch.note.trim() || pkg.note,
  }, (p) => {
    if (p.frozen) throw new Error(`${packageId} 已冻结，不能补证`);
    if (p.status !== 'pending-evidence') throw new Error(`${packageId} 不是待补证状态`);
  });

  return { verdict, batchId, recordId: next.receptions[next.receptions.length - 1].id };
}
