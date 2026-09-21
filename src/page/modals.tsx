// 页面层 —— 弹窗：接收证据包、改证新建包、移交发布批次
import { useMemo, useState } from 'react';
import { AlertTriangle, FileLock2, Info, Link2, X } from 'lucide-react';
import type { ArchiveState, EvidencePackage } from '../archive/types';
import { SHA256_RE, reviewIntake, reviewRevision } from '../archive/intake';
import { shortFp } from './ui';

const FIELDS = [
  { key: 'component', label: '组件', placeholder: '例如 offline-report-lib' },
  { key: 'version', label: '版本', placeholder: '例如 1.2.0' },
  { key: 'source', label: '来源', placeholder: '例如 内部制品库 / 供应商交付' },
] as const;

export function IntakeModal(props: {
  state: ArchiveState;
  receiver: string;
  onClose: () => void;
  onAccept: (payload: { component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string; missing: string | null }) => void;
  onDuplicate: (payload: { component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string }, detail: string,
    existing: EvidencePackage) => void;
}) {
  const { state, onClose, onAccept, onDuplicate } = props;
  const [f, setF] = useState({ component: '', version: '', source: '', fingerprint: '', verifier: '', note: '' });
  const [receiver, setReceiver] = useState(props.receiver);
  const [errors, setErrors] = useState<string[]>([]);
  const [dup, setDup] = useState<null | { detail: string; existing: EvidencePackage }>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF(s => ({ ...s, [k]: e.target.value }));
    setErrors([]);
    setDup(null);
  };

  const makeInput = () => ({ ...f, receiver });

  const submit = () => {
    const verdict = reviewIntake(state, makeInput());
    if (verdict.kind === 'invalid') { setErrors(verdict.errors); return; }
    if (verdict.kind === 'duplicate') {
      setDup({ detail: verdict.rejection.detail, existing: verdict.existing });
      onDuplicate({ ...f, receiver }, verdict.rejection.detail, verdict.existing);
      return;
    }
    onAccept({ ...f, receiver, missing: verdict.missing });
  };

  const genFp = () => {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    setF(s => ({ ...s, fingerprint: Array.from(buf, b => b.toString(16).padStart(2, '0')).join('') }));
  };

  const fpWarn = f.fingerprint.trim() !== '' && !SHA256_RE.test(f.fingerprint.trim().toLowerCase());

  return (
    <ModalShell title="接收离线证据包" subtitle="指纹重复时将只记录差异，已归档批次不会被改动" onClose={onClose}>
      {dup && (
        <div className="alert risk">
          <AlertTriangle size={16} />
          <div><b>重复接收，已拒绝入库</b>
            <p>{dup.detail}</p>
            <p className="muted">在档包 {dup.existing.id} · 指纹 {shortFp(dup.existing.fingerprint)} 保持不变。差异已追加到新的接收批次。</p>
          </div>
        </div>
      )}
      {errors.length > 0 && <ErrorBox errors={errors} />}
      <div className="form-row">
        {FIELDS.map(x => <label key={x.key}>{x.label}
          <input value={f[x.key]} onChange={set(x.key)} placeholder={x.placeholder} /></label>)}
      </div>
      <label className="fp-label">文件指纹（SHA-256）
        <div className="fp-line">
          <input className={fpWarn ? 'bad' : ''} value={f.fingerprint} onChange={set('fingerprint')}
            placeholder="64 位十六进制；留空则按缺证登记" />
          <button type="button" className="ghost" onClick={genFp}>模拟生成</button>
        </div>
        {fpWarn && <small className="err-text">格式不是合法的 SHA-256</small>}
        {!fpWarn && !f.fingerprint && <small className="hint-text">无指纹的包可登记，但不会进入可发布清单</small>}
      </label>
      <div className="form-row">
        <label>核验人<input value={f.verifier} onChange={set('verifier')} placeholder="签字核验人；留空按缺证登记" /></label>
        <label>接收人<input value={receiver} onChange={e => { setReceiver(e.target.value); setErrors([]); }} placeholder="本次接收负责人" /></label>
      </div>
      <label>备注<textarea rows={2} value={f.note} onChange={set('note')} placeholder="交付说明 / 核验备注" /></label>
      <button className="primary full" onClick={submit}>校验并接收</button>
    </ModalShell>
  );
}

export function RevisionModal(props: {
  state: ArchiveState;
  old: EvidencePackage;
  receiver: string;
  onClose: () => void;
  onSubmit: (payload: { component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string }, reason: string) => void;
}) {
  const { state, old, onClose, onSubmit } = props;
  const [f, setF] = useState({
    component: old.component, version: old.version, source: old.source,
    fingerprint: '', verifier: '', note: '',
  });
  const [receiver, setReceiver] = useState(props.receiver);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF(s => ({ ...s, [k]: e.target.value }));
    setErrors([]);
  };

  const submit = () => {
    if (!reason.trim()) { setErrors(['必须填写改证原因，以保留来源链']); return; }
    const verdict = reviewRevision(state, old, { ...f, receiver, note: f.note });
    if (verdict.kind === 'invalid') { setErrors(verdict.errors); return; }
    if (verdict.kind === 'duplicate') { setErrors([verdict.rejection.detail]); return; }
    onSubmit({ ...f, receiver }, reason.trim());
  };

  return (
    <ModalShell title="改证：新建证据包" subtitle="原包与发布批次保持冻结，新包通过来源链指向旧包" onClose={onClose} wide>
      <div className="chain-card">
        <Link2 size={15} />
        <div>
          <b>被替换的在档包 {old.id}</b>
          <p>{old.component} {old.version} · 指纹 {shortFp(old.fingerprint)} · 核验人 {old.verifier || '—'}</p>
          {old.releaseBatchId && <p className="muted"><FileLock2 size={11} /> 已随 {old.releaseBatchId} 移交，该批次快照不可覆盖</p>}
        </div>
      </div>
      {errors.length > 0 && <ErrorBox errors={errors} />}
      <div className="form-row">
        {FIELDS.map(x => <label key={x.key}>{x.label}
          <input value={f[x.key]} onChange={set(x.key)} /></label>)}
      </div>
      <label>新文件指纹（SHA-256，必须与原指纹不同）
        <input value={f.fingerprint} onChange={set('fingerprint')} placeholder="64 位十六进制" />
      </label>
      <div className="form-row">
        <label>核验人<input value={f.verifier} onChange={set('verifier')} /></label>
        <label>接收人<input value={receiver} onChange={e => { setReceiver(e.target.value); setErrors([]); }} /></label>
      </div>
      <label>改证原因（必填，写入来源链）<input value={reason} onChange={e => { setReason(e.target.value); setErrors([]); }}
        placeholder="例如：核验签名过期，供应商补签后重新交付" /></label>
      <label>备注<textarea rows={2} value={f.note} onChange={set('note')} /></label>
      <button className="primary full" onClick={submit}>新建包并保留来源链</button>
    </ModalShell>
  );
}

export function HandoverModal(props: {
  candidates: EvidencePackage[];
  onClose: () => void;
  onConfirm: (label: string, creator: string) => void;
}) {
  const { candidates, onClose, onConfirm } = props;
  const [label, setLabel] = useState('');
  const [creator, setCreator] = useState('发布管理员');

  return (
    <ModalShell title="移交到发布批次" subtitle="移交后批次锁定、不可覆盖；缺证包不允许进入" onClose={onClose}>
      <div className="handover-list">
        {candidates.map(p => (
          <div key={p.id} className="handover-item">
            <b>{p.component}</b><span>{p.version}</span>
            <code>{shortFp(p.fingerprint)}</code><i>{p.verifier}</i>
          </div>
        ))}
      </div>
      <div className="form-row">
        <label>批次名称<input value={label} onChange={e => setLabel(e.target.value)} placeholder="例如 九月末离线基线" autoFocus /></label>
        <label>移交人<input value={creator} onChange={e => setCreator(e.target.value)} /></label>
      </div>
      <div className="alert info"><Info size={15} /><p>共 {candidates.length} 个证据齐全的包将被冻结并写入不可变发布批次。</p></div>
      <button className="primary full" disabled={candidates.length === 0}
        onClick={() => onConfirm(label, creator)}>确认移交并锁定批次</button>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------

export function ModalShell({ title, subtitle, onClose, children, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button onClick={onClose}><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ errors }: { errors: string[] }) {
  return (
    <div className="alert risk">
      <AlertTriangle size={16} />
      <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

/** hook：候选包勾选状态（可发布清单专用） */
export function useSelection(all: string[]) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(all));
  const toggle = (id: string) => setSel(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allSelected = useMemo(() => all.length > 0 && all.every(id => sel.has(id)), [all, sel]);
  const toggleAll = () => setSel(() => allSelected ? new Set() : new Set(all));
  return { sel, toggle, allSelected, toggleAll };
}
