import { useEffect, useState } from 'react';
import {
  Archive, ChevronDown, ClipboardList, Download, FileLock2, Fingerprint,
  Inbox, PackageCheck, Plus, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { useArchive } from './useArchive';
import { resetToSeed } from '../archive/store';
import { selectStats } from '../archive/selectors';
import ArchiveView from './views/ArchiveView';
import IntakeLedgerView from './views/IntakeLedgerView';
import ReleaseView from './views/ReleaseView';
import IntakeModal from './views/IntakeModal';
import SupplementModal from './views/SupplementModal';

type Tab = 'archive' | 'intake' | 'release';
interface Toast { id: number; msg: string; kind: 'ok' | 'err' }

const CURRENT_USER = '周岚';

export default function App() {
  const state = useArchive();
  const stats = selectStats(state);
  const [tab, setTab] = useState<Tab>('archive');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [revisesId, setRevisesId] = useState<string | null>(null);
  const [supplementId, setSupplementId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  const goArchive = (id: string) => { setSelectedId(id); setTab('archive'); };

  const openRevise = (id: string) => { setRevisesId(id); setShowIntake(true); };
  const openReceive = () => { setRevisesId(null); setShowIntake(true); };

  const exportLedger = () => {
    const lines: string[] = [];
    lines.push('# 离线证据包归档台账');
    lines.push('');
    lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
    lines.push('');
    lines.push('## 证据包');
    lines.push('| 证据包 | 组件 | 版本 | 来源 | 文件指纹 | 核验人 | 状态 | 接收批次 | 发布批次 |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    state.packages.forEach((p) => {
      lines.push(`| ${p.id} | ${p.component} | ${p.version} | ${p.source} | ${p.fingerprint} | ${p.verifier} | ${p.status}${p.frozen ? '(冻结)' : ''} | ${p.receivedInBatch} | ${p.releaseBatchId ?? '—'} |`);
    });
    lines.push('');
    lines.push('## 接收批次');
    state.batches.forEach((b) => lines.push(`- ${b.id} · ${b.receptionIds.length} 条 · ${b.summary} · ${b.receivedAt} · ${b.clerk}`));
    lines.push('');
    lines.push('## 发布批次 / 移交');
    state.releases.forEach((r) => lines.push(
      `- ${r.id} · ${r.name} · ${r.sealed ? `已封存 ${r.sealedAt}` : '待封存'} · 移交 ${r.handoverIds.length} 件`,
    ));
    state.handovers.forEach((h) => lines.push(`  - ${h.id}: ${h.packageId} → ${h.releaseBatchId} 快照 ${h.fingerprintSnapshot}`));

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'evidence-archive-ledger.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon"><Fingerprint size={18} /></div>
          <div><b>Evidence Vault</b><small>offline archive desk</small></div>
        </div>
        <div className="nav-title">ARCHIVE DESK</div>
        <button className={`nav ${tab === 'archive' ? 'active' : ''}`} onClick={() => setTab('archive')}>
          <Archive size={16} /> 证据包归档台 <span>{stats.total}</span>
        </button>
        <button className={`nav ${tab === 'intake' ? 'active' : ''}`} onClick={() => setTab('intake')}>
          <Inbox size={16} /> 接收批次 <span>{stats.batches}</span>
        </button>
        <button className={`nav ${tab === 'release' ? 'active' : ''}`} onClick={() => setTab('release')}>
          <PackageCheck size={16} /> 可发布 / 发布批次 <span>{stats.publishable}</span>
        </button>
        <div className="nav-title" style={{ marginTop: 18 }}>IMMUTABLE LEDGER</div>
        <div className="nav-static"><ClipboardList size={15} /><span>接收记录 {state.receptions.length} 条（含退回 {stats.rejected}）</span></div>
        <div className="nav-static"><FileLock2 size={15} /><span>移交记录 {state.handovers.length} 条 · 封存 {state.releases.filter((r) => r.sealed).length} 批</span></div>

        <div className="aside-bottom">
          <div className="mini-card">
            <ShieldCheck size={16} />
            <div>
              <b>只追加归档</b>
              <small>批次/移交不可修改 · 改证新建包并保留来源链</small>
            </div>
          </div>
          <button className="reset-btn" onClick={() => { if (confirm('恢复为示例归档数据？当前账本将被清除。')) { resetToSeed(); setSelectedId(null); notify('已恢复示例数据'); } }}>
            <RotateCcw size={12} /> 恢复示例数据
          </button>
          <div className="user">
            <div className="avatar">周</div><span>{CURRENT_USER} · 核验人</span><ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">OFFLINE RELEASE / <b>EVIDENCE ARCHIVE</b></div>
            <h1>离线证据包归档台</h1>
            <p>组件、版本、来源、文件指纹、核验人逐项归档；刷新后账本一致，缺证包不得发布。</p>
          </div>
          <div className="head-actions">
            <button className="outline" onClick={exportLedger}><Download size={15} />导出台账</button>
            <button className="primary" onClick={openReceive}><Plus size={16} />接收证据包</button>
          </div>
        </header>

        <section className="summary">
          <div><span>证据包总数</span><b>{stats.total}</b><small>{stats.archived} 归档 · {stats.pending} 待补证</small></div>
          <div><span>可发布</span><b className="teal">{stats.publishable}</b><small>证据齐全且未移交</small></div>
          <div><span>拦截不可发布</span><b className="orange">{stats.blocked}</b><small>缺证 / 已取代 / 已移交</small></div>
          <div><span>已冻结移交</span><b className="navy">{stats.frozen}</b><small>封存批次不可覆盖</small></div>
        </section>

        {tab === 'archive' && (
          <ArchiveView
            state={state}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReceive={openReceive}
            onRevise={openRevise}
            onSupplement={(id) => setSupplementId(id)}
          />
        )}
        {tab === 'intake' && <IntakeLedgerView state={state} />}
        {tab === 'release' && (
          <ReleaseView state={state} clerk={CURRENT_USER} notify={notify} goArchive={goArchive} />
        )}
      </main>

      {showIntake && (
        <IntakeModal
          state={state}
          clerk={CURRENT_USER}
          revisesPackageId={revisesId}
          onClose={() => setShowIntake(false)}
          onDone={(msg, pid) => {
            setShowIntake(false);
            notify(msg);
            if (pid) setSelectedId(pid);
          }}
        />
      )}
      {supplementId && (
        <SupplementModal
          state={state}
          packageId={supplementId}
          clerk={CURRENT_USER}
          onClose={() => setSupplementId(null)}
          onDone={(msg) => { setSupplementId(null); notify(msg); }}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'ok' ? <ShieldCheck size={14} /> : <Archive size={14} />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
