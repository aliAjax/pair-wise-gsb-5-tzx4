import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { ArchiveState } from '../../archive/types';
import { inspectSupplement } from '../../intake/validator';
import { supplementEvidence } from '../../intake/service';
import { Field, Modal } from '../widgets';
import { shortFp } from '../format';

interface Props {
  state: ArchiveState;
  packageId: string;
  clerk: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export default function SupplementModal({ state, packageId, clerk, onClose, onDone }: Props) {
  const pkg = state.packages.find((p) => p.id === packageId)!;
  const [source, setSource] = useState(pkg.source);
  const [fingerprint, setFingerprint] = useState(pkg.fingerprint);
  const [verifier, setVerifier] = useState(pkg.verifier || clerk);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verdict = useMemo(
    () => inspectSupplement(state, packageId, { source, fingerprint, verifier }),
    [state, packageId, source, fingerprint, verifier],
  );

  const submit = () => {
    if (verdict.code === 'invalid') { setError(verdict.reasons.join('；')); return; }
    if (verdict.code === 'fingerprint-conflict') {
      setError(`指纹已归属 ${verdict.owner.id}（${verdict.owner.component}@${verdict.owner.version}），不能用于补证`);
      return;
    }
    const result = supplementEvidence(packageId, { source, fingerprint, verifier, note }, clerk);
    if (result.verdict.code === 'accept') {
      onDone(`补证完成（${result.batchId}），${packageId} 已归档；原始接收批次 ${pkg.receivedInBatch} 保持不变`);
    } else {
      setError('补证被退回，详见新接收记录');
    }
  };

  return (
    <Modal
      title={`补齐证据 · ${packageId}`}
      subtitle={`${pkg.component}@${pkg.version} · 原接收批次 ${pkg.receivedInBatch} 不变，补证动作另入新批次`}
      onClose={onClose}
      footer={<><button className="outline" onClick={onClose}>取消</button>
        <button className="primary" onClick={submit}><CheckCircle2 size={14} /> 补证并归档</button></>}
    >
      <div className="notice notice-warn">
        <span>当前为「待补证」隔离状态，指纹缺失：{shortFp(pkg.fingerprint) || '无'}。补齐并核验后才允许进入可发布清单。</span>
      </div>
      <Field label="来源" required>
        <input className="ipt" value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <Field label="文件指纹（SHA-256）" required>
        <input className="ipt mono" value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} spellCheck={false}
          placeholder="64 位十六进制" />
      </Field>
      <Field label="核验人" required>
        <input className="ipt" value={verifier} onChange={(e) => setVerifier(e.target.value)} />
      </Field>
      <Field label="补证说明" hint="写入补证接收记录">
        <textarea className="ipt" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="例如：供应商补交 sha256 校验单 JS-2026-052，离线重算一致" />
      </Field>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
