import { useEffect, useState } from 'react';
import {
  Archive, ChevronDown, FileLock2, Inbox, PackageCheck, Plus, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { EvidencePackage } from './archive/types';
import { handover, loadState, receivePackages, saveState, supersedePackage } from './archive/archive';
import type { ArchiveState } from './archive/types';
import { HandoverModal, IntakeModal, RevisionModal } from './page/modals';
import { IntakesView, PackagesView, PublishableView, ReleasesView, Stats } from './page/views';
import type { View } from './page/ui';

type Modal =
  | { kind: 'intake' }
  | { kind: 'revision'; pkg: EvidencePackage }
  | { kind: 'handover'; ids: string[] }
  | null;

const CURRENT_USER = '陈航';

export default function App() {
  const [state, setState] = useState<ArchiveState>(loadState);
  const [view, setView] = useState<View>('packages');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 刷新后组件、指纹、接收批次与移交记录保持一致
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const goPackage = (id: string) => { setSelectedId(id); setView('packages'); };

  // -- 接收：校验层裁定 → 数据层归档 ------------------------------------------------
  const handleAccept = (payload: {
    component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string; missing: string | null;
  }) => {
    const { missing, ...input } = payload;
    setState(s => receivePackages(s, input.receiver, [{ input, missing }], []));
    setModal(null);
    setToast(missing ? `已按缺证登记「${input.component}」，补齐前不得发布` : `证据包「${input.component}」已接收归档`);
  };

  const handleDuplicate = (payload: {
    component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string;
  }, detail: string, existing: EvidencePackage) => {
    // 重复接收：包不入库；差异写入一个新的接收批次，已归档批次原样保留
    setState(s => receivePackages(s, payload.receiver, [], [{
      receivedAt: new Date().toISOString(),
      component: payload.component, version: payload.version, source: payload.source,
      fingerprint: payload.fingerprint.trim().toLowerCase(), verifier: payload.verifier,
      reason: existing.component === payload.component.trim() ? 'duplicate' : 'conflict',
      detail, existingPackageId: existing.id,
    }]));
    setModal(null);
    setToast(`重复接收已拒绝，差异记录到新接收批次，在档包 ${existing.id} 不变`);
  };

  // -- 改证：只能新建包，来源链指向旧包 ---------------------------------------------
  const handleRevision = (payload: {
    component: string; version: string; source: string; fingerprint: string;
    verifier: string; note: string; receiver: string;
  }, reason: string) => {
    if (modal?.kind !== 'revision') return;
    const old = modal.pkg;
    setState(s => supersedePackage(s, old.id,
      { ...payload, note: `${reason}${payload.note ? `｜${payload.note}` : ''}` }, null));
    setModal(null);
    setToast(`已为「${old.component}」新建改证包，旧包 ${old.id} 与其发布批次保持不变`);
  };

  // -- 移交：证据不齐整批拒绝；成功即锁定不可覆盖 ------------------------------------
  const handleHandoverConfirm = (label: string, creator: string) => {
    if (modal?.kind !== 'handover') return;
    const result = handover(state, modal.ids, label, creator);
    if (result.blocked.length > 0) {
      setToast(`移交被拦截：${result.blocked.map(b => `${b.component}（${b.reason}）`).join('；')}`);
      return;
    }
    setState(result.state);
    setModal(null);
    setToast(`发布批次 ${result.batch?.id} 已移交锁定，不可覆盖`);
  };

  const handoverCandidates = modal?.kind === 'handover'
    ? modal.ids.map(id => state.packages.find(p => p.id === id)).filter(Boolean) as EvidencePackage[]
    : [];

  const nav: Array<{ key: View; icon: React.ReactNode; label: string; badge?: number; danger?: boolean }> = [
    { key: 'packages', icon: <Archive size={16} />, label: '证据包归档', badge: state.packages.length },
    { key: 'publishable', icon: <PackageCheck size={16} />, label: '可发布清单' },
    { key: 'intakes', icon: <Inbox size={16} />, label: '接收批次', badge: state.intakeBatches.length },
    { key: 'releases', icon: <FileLock2 size={16} />, label: '发布批次', badge: state.releaseBatches.length },
  ];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={18} /></div>
          <div><b>Evidence Vault</b><small>OFFLINE ARCHIVE DESK</small></div>
        </div>
        <div className="nav-title">归档台</div>
        {nav.map(n => (
          <button key={n.key} className={view === n.key ? 'nav active' : 'nav'} onClick={() => setView(n.key)}>
            {n.icon}{n.label}
            {n.badge !== undefined && <span>{n.badge}</span>}
          </button>
        ))}
        <div className="aside-bottom">
          <div className="mini-card">
            <Sparkles size={16} />
            <div><b>离线证据库</b><small>指纹唯一 · 批次封存 · 刷新一致</small></div>
          </div>
          <div className="user">
            <div className="avatar">CH</div><span>{CURRENT_USER}</span><ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">OFFLINE VAULT / <b>{viewTitle(view)}</b></div>
            <h1>离线证据包归档台</h1>
            <p>组件、版本、来源、文件指纹与核验人统一归档，移交发布后不可覆盖。</p>
          </div>
          <div className="head-actions">
            <button className="primary" onClick={() => setModal({ kind: 'intake' })}>
              <Plus size={16} />接收证据包
            </button>
          </div>
        </header>

        <Stats state={state} goto={v => setView(v)} />

        {view === 'packages' && (
          <PackagesView state={state} selectedId={selectedId} onSelect={setSelectedId}
            onRevise={pkg => setModal({ kind: 'revision', pkg })}
            onGoPublish={() => setView('publishable')} />
        )}
        {view === 'publishable' && (
          <PublishableView state={state} onHandover={ids => setModal({ kind: 'handover', ids })} />
        )}
        {view === 'intakes' && <IntakesView state={state} onSelectPackage={goPackage} />}
        {view === 'releases' && <ReleasesView state={state} />}

        <footer className="arch-footer">
          归档数据层（archive.ts）、接收校验层（intake.ts）与页面（page/）分开实现；数据保存在本机浏览器，刷新后状态一致。
        </footer>
      </main>

      {modal?.kind === 'intake' && (
        <IntakeModal state={state} receiver={CURRENT_USER}
          onClose={() => setModal(null)} onAccept={handleAccept} onDuplicate={handleDuplicate} />
      )}
      {modal?.kind === 'revision' && (
        <RevisionModal state={state} old={modal.pkg} receiver={CURRENT_USER}
          onClose={() => setModal(null)} onSubmit={handleRevision} />
      )}
      {modal?.kind === 'handover' && (
        <HandoverModal candidates={handoverCandidates}
          onClose={() => setModal(null)} onConfirm={handleHandoverConfirm} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function viewTitle(v: View): string {
  return { packages: 'EVIDENCE PACKAGES', publishable: 'PUBLISHABLE LIST',
    intakes: 'INTAKE BATCHES', releases: 'RELEASE BATCHES' }[v];
}
