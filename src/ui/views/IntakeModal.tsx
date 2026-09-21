import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileWarning, GitBranch } from 'lucide-react';
import type { ArchiveState, IntakeSubmission } from '../../archive/types';
import { inspectIntake } from '../../intake/validator';
import { receiveSubmission } from '../../intake/service';
import { FIELD_LABELS } from '../format';
import { Field, Modal } from '../widgets';

interface Props {
  state: ArchiveState;
  clerk: string;
  revisesPackageId?: string | null;
  onClose: () => void;
  onDone: (msg: string, packageId: string | null) => void;
}

export default function IntakeModal({ state, clerk, revisesPackageId = null, onClose, onDone }: Props) {
  const predecessor = revisesPackageId ? state.packages.find((p) => p.id === revisesPackageId) : null;
  const isRevision = Boolean(predecessor);

  const [component, setComponent] = useState(predecessor?.component ?? '');
  const [version, setVersion] = useState(predecessor?.version ?? '');
  const [source, setSource] = useState(predecessor?.source ?? '');
  const [fingerprint, setFingerprint] = useState('');
  const [verifier, setVerifier] = useState(clerk);
  const [note, setNote] = useState(isRevision ? '' : '');
  const [submitted, setSubmitted] = useState<null | {
    kind: 'conflict' | 'duplicate' | 'mismatch';
    verdict: ReturnType<typeof inspectIntake>;
    sub: IntakeSubmission;
  }>(null);
  const [discrepancy, setDiscrepancy] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sub: IntakeSubmission = useMemo(() => ({
    component, version, source, fingerprint, verifier, note,
    supersedes: isRevision ? predecessor!.id : null,
    isRevision,
  }), [component, version, source, fingerprint, verifier, note, isRevision, predecessor]);

  const liveVerdict = useMemo(() => inspectIntake(state, sub), [state, sub]);

  const validateBeforeSubmit = (): string | null => {
    if (!component.trim()) return '组件名称必填';
    if (!version.trim()) return '版本必填';
    if (!verifier.trim()) return '核验人必填';
    if (!fingerprint.trim()) return '文件指纹必填；若确无指纹请说明情况，系统将隔离为待补证（仍需来源与核验人）';
    return null;
  };

  const firstSubmit = () => {
    const err = validateBeforeSubmit();
    if (err) { setError(err); return; }
    if (isRevision && !note.trim()) { setError('改证新包必须填写变更理由'); return; }
    setError(null);
    if (liveVerdict.code === 'fingerprint-conflict') {
      setSubmitted({ kind: 'conflict', verdict: liveVerdict, sub });
    } else if (liveVerdict.code === 'fingerprint-mismatch') {
      setSubmitted({ kind: 'mismatch', verdict: liveVerdict, sub });
    } else if (liveVerdict.code === 'duplicate') {
      setSubmitted({ kind: 'duplicate', verdict: liveVerdict, sub });
    } else if (liveVerdict.code === 'invalid') {
      setError(liveVerdict.reasons.join('；'));
    } else {
      persist(sub);
    }
  };

  const persist = (payload: IntakeSubmission, noteForReject?: string) => {
    const result = receiveSubmission(payload, clerk, noteForReject);
    if (result.verdict.code === 'accept') onDone(`已归档为新证据包（接收批次 ${result.batchId}）`, result.packageId);
    else if (result.verdict.code === 'revision-accept') onDone(`改证新包已归档（${result.batchId}），来源链已保留`, result.packageId);
    else if (result.verdict.code === 'quarantine') onDone(`证据缺失，已隔离待补证（${result.batchId}），不得进入可发布清单`, result.packageId);
    else onDone(`重复/冲突件已登记退回（${result.batchId}），既有归档批次保持不变`, result.packageId);
  };

  const confirmRejection = () => {
    if (!submitted) return;
    if (!discrepancy.trim()) { setError('必须填写差异说明后才能登记退回'); return; }
    persist(submitted.sub, discrepancy.trim());
  };

  // ---- 第二步：差异确认面板 ----
  if (submitted && (submitted.kind === 'conflict' || submitted.kind === 'duplicate' || submitted.kind === 'mismatch')) {
    const v = submitted.verdict;
    const owner = v.code === 'fingerprint-conflict' || v.code === 'fingerprint-mismatch' || v.code === 'duplicate' ? v.owner : null;
    return (
      <Modal
        title={
          submitted.kind === 'duplicate' ? '重复接收确认'
            : submitted.kind === 'conflict' ? '指纹归属冲突'
              : '同指纹元数据不符'
        }
        subtitle={
          submitted.kind === 'duplicate'
            ? `组件、版本、指纹与已归档包 ${owner?.id} 完全一致`
            : `该文件指纹已归属其他证据包，同一指纹只能归属一个组件`
        }
        onClose={onClose}
        footer={
          <>
            <button className="outline" onClick={onClose}>取消，修改提交件</button>
            <button className="danger" onClick={confirmRejection}>登记差异并退回</button>
          </>
        }
      >
        <div className={`notice ${submitted.kind === 'duplicate' ? 'notice-warn' : 'notice-risk'}`}>
          {submitted.kind === 'duplicate' ? <FileWarning size={15} /> : <AlertTriangle size={15} />}
          <div>
            <b>{submitted.kind === 'duplicate'
              ? `重复件：${owner?.component}@${owner?.version} 已在 ${owner?.receivedInBatch} 归档`
              : `指纹已归属 ${owner?.id}（${owner?.component}@${owner?.version}）`}</b>
            <p>本次接收将<b>生成新的接收批次和退回记录</b>，提交原件快照留痕；已归档批次与证据包保持不变。</p>
          </div>
        </div>

        {v && 'diffs' in v && v.diffs.length > 0 && (
          <table className="diff-table">
            <thead><tr><th>字段</th><th>本次提交</th><th>已归档（{owner?.id}）</th></tr></thead>
            <tbody>
              <tr><td>文件指纹</td><td><code>{submitted.sub.fingerprint}</code></td><td><code>{owner?.fingerprint}</code></td></tr>
              {v.diffs.map((d) => (
                <tr key={d.field}>
                  <td>{FIELD_LABELS[d.field] ?? d.field}</td>
                  <td>{d.submitted || <span className="missing">空</span>}</td>
                  <td>{d.archived || <span className="missing">空</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {v && 'diffs' in v && v.diffs.length === 0 && (
          <div className="same-fp-note">指纹、组件、版本、来源、核验人全部一致——没有实质差异。</div>
        )}

        <Field label="差异 / 再次提交说明" required hint="将原样写入接收记录">
          <textarea
            className="ipt"
            rows={3}
            value={discrepancy}
            onChange={(e) => { setDiscrepancy(e.target.value); setError(null); }}
            placeholder="说明本次为何重复提交、与既有归档包的差异，以及退回处置意见"
          />
        </Field>
        {error && <div className="form-error">{error}</div>}
      </Modal>
    );
  }

  // ---- 第一步：表单 ----
  const liveHint =
    liveVerdict.code === 'quarantine'
      ? `证据不完整（${(liveVerdict.missingFields ?? []).map((f) => FIELD_LABELS[f] ?? f).join('、')}），提交后将隔离为待补证，不进入可发布清单`
      : liveVerdict.code === 'fingerprint-conflict'
        ? `指纹已归属其他组件（${'owner' in liveVerdict ? liveVerdict.owner.id : ''}），提交后需登记差异并退回`
        : liveVerdict.code === 'duplicate'
          ? '与已归档包完全一致，属于重复接收'
          : liveVerdict.code === 'fingerprint-mismatch'
            ? '同指纹但元数据与归档不一致，需登记差异并退回'
            : null;

  return (
    <Modal
      title={isRevision ? '改证：新建证据包' : '接收证据包'}
      subtitle={isRevision
        ? `来源链保留：新包将取代 ${predecessor!.id}（${predecessor!.component}@${predecessor!.version}），旧包不删除`
        : '填写组件、版本、来源、文件指纹与核验人'}
      onClose={onClose}
      footer={<><button className="outline" onClick={onClose}>取消</button><button className="primary" onClick={firstSubmit}>
        <CheckCircle2 size={14} /> 提交接收
      </button></>}
    >
      {isRevision && (
        <div className="notice notice-revision">
          <GitBranch size={15} />
          <div>
            <b>改证规则</b>
            <p>已移交冻结的包不可覆盖；本次将创建新证据包，指纹必须不同，来源链指向 {predecessor!.id}，旧包保留为「已取代」。</p>
          </div>
        </div>
      )}
      <div className="form-grid">
        <Field label="组件" required>
          <input className="ipt" value={component} onChange={(e) => setComponent(e.target.value)} placeholder="例如 chart.js" />
        </Field>
        <Field label="版本" required>
          <input className="ipt" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 4.4.4" />
        </Field>
      </div>
      <Field label="来源" hint="离线镜像 / 介质 / 交接单">
        <input className="ipt" value={source} onChange={(e) => setSource(e.target.value)} placeholder="例如 npm 离线镜像 registry.example.local" />
      </Field>
      <Field label="文件指纹（SHA-256）" hint="64 位十六进制；留空将按缺证隔离">
        <input className="ipt mono" value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="粘贴 sha256sum 输出" spellCheck={false} />
      </Field>
      <div className="form-grid">
        <Field label="核验人" required><input className="ipt" value={verifier} onChange={(e) => setVerifier(e.target.value)} /></Field>
        <Field label={isRevision ? '变更理由（必填）' : '接收备注'}>
          <input className="ipt" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isRevision ? '说明改证原因' : '可选'} />
        </Field>
      </div>

      {liveHint && <div className={`live-hint ${liveVerdict.code === 'quarantine' ? 'warn' : 'risk'}`}>{liveHint}</div>}
      {error && <div className="form-error">{error}</div>}
      {isRevision && !note.trim() && <div className="form-error muted-error">改证新包需要填写变更理由</div>}
    </Modal>
  );
}
