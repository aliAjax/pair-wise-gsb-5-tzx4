// 页面层 —— 四个视图：证据包归档、可发布清单、接收批次、发布批次
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Check, FileLock2, FileSearch, Inbox, Link2,
  PackageCheck, Search, Send, X, XCircle,
} from 'lucide-react';
import type { ArchiveState, EvidencePackage, IntakeBatch, ReleaseBatch } from '../archive/types';
import { isSuperseded, packageChain, publishablePackages } from '../archive/archive';
import { MissingBadge, STATUS_META, fmtDate, shortFp, visualStatus } from './ui';
import type { VisualStatus } from './ui';
import { useSelection } from './modals';

// ===========================================================================
// 证据包归档（主视图）
// ===========================================================================

const FILTERS: Array<{ key: 'all' | VisualStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'archived', label: '在档可移交' },
  { key: 'incomplete', label: '证据缺失' },
  { key: 'handed', label: '已移交' },
  { key: 'superseded', label: '已替换' },
];

export function PackagesView(props: {
  state: ArchiveState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRevise: (p: EvidencePackage) => void;
  onGoPublish: () => void;
}) {
  const { state, selectedId, onSelect, onRevise, onGoPublish } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | VisualStatus>('all');

  const rows = useMemo(() => state.packages
    .filter(p => visualStatus(state, p) === filter || filter === 'all')
    .filter(p => `${p.component}${p.version}${p.fingerprint}${p.verifier}`.toLowerCase()
      .includes(query.toLowerCase()))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
  [state, query, filter]);

  const current = selectedId ? state.packages.find(p => p.id === selectedId) ?? null : null;

  return (
    <section className="workspace">
      <div className="table-pane">
        <div className="pane-head">
          <div><h2>证据包归档</h2><p>组件 · 版本 · 来源 · 文件指纹 · 核验人</p></div>
          <div className="tools">
            <div className="search"><Search size={15} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索组件 / 指纹 / 核验人" />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
              {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <div className="table pkg-table">
          <div className="tr th"><span>组件 / 版本</span><span>文件指纹</span><span>核验人</span><span>状态</span></div>
          {rows.map(p => {
            const st = visualStatus(state, p);
            const meta = STATUS_META[st];
            return (
              <button key={p.id} className={p.id === selectedId ? 'tr selected' : 'tr'} onClick={() => onSelect(p.id)}>
                <span className="dep-name"><span className={`pkg-dot ${st}`} />
                  {p.component} <i className="ver">{p.version}</i>
                  {p.supersedesId && <Link2 size={11} className="chain-ico" />}
                  <MissingBadge reason={p.missingEvidence} />
                </span>
                <span className="muted mono">{shortFp(p.fingerprint)}</span>
                <span className="muted">{p.verifier || '—'}</span>
                <span className={`status ${meta.cls}`}>{meta.icon} {meta.label}</span>
              </button>
            );
          })}
          {rows.length === 0 && <div className="empty">没有匹配的证据包</div>}
        </div>
      </div>

      {current
        ? <PackageDetail state={state} p={current} onClose={() => onSelect('')} onRevise={onRevise} onGoPublish={onGoPublish} />
        : <DetailPlaceholder />}
    </section>
  );
}

function DetailPlaceholder() {
  return (
    <div className="detail placeholder">
      <FileSearch size={26} />
      <b>选择一个证据包</b>
      <p>查看指纹、核验记录、来源链与移交历史。</p>
    </div>
  );
}

function PackageDetail({ state, p, onClose, onRevise, onGoPublish }: {
  state: ArchiveState; p: EvidencePackage; onClose: () => void;
  onRevise: (p: EvidencePackage) => void; onGoPublish: () => void;
}) {
  const st = visualStatus(state, p);
  const meta = STATUS_META[st];
  const chain = packageChain(state, p);
  const superseder = state.packages.find(x => x.supersedesId === p.id) ?? null;
  const intake = state.intakeBatches.find(b => b.packageIds.includes(p.id));

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-icon alt"><PackageCheck size={20} /></div>
        <div><span>EVIDENCE PACKAGE · {p.id}</span><h2>{p.component} <i className="ver">{p.version}</i></h2></div>
        <button className="close" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="detail-grid two">
        <div><label>来源</label><b>{p.source}</b></div>
        <div><label>接收批次</label><b className="mono small">{intake?.id ?? '—'}</b></div>
        <div className="full"><label>文件指纹 SHA-256</label><b className="mono small fp-full">{p.fingerprint || '未提供'}</b></div>
        <div><label>核验人</label><b>{p.verifier || '未签字'}</b></div>
        <div><label>接收时间</label><b className="small">{fmtDate(p.receivedAt)}</b></div>
      </div>

      {p.missingEvidence && (
        <div className="finding risk">
          <div className="finding-icon"><AlertTriangle size={16} /></div>
          <div><b>证据不完整：{p.missingEvidence}</b>
            <p>该包已登记在档，但被可发布清单与发布批次移交拦截，补齐后请以改证方式新建包。</p></div>
        </div>
      )}

      <div className={`finding ${meta.cls === 'ok' ? 'ok' : meta.cls === 'risk' ? 'risk' : 'warn'}`}>
        <div className="finding-icon">{meta.icon}</div>
        <div><b>{meta.label}</b>
          {p.note && <p>{p.note}</p>}
          {p.status === 'handed' && p.releaseBatchId &&
            <p>已随发布批次 <b className="mono">{p.releaseBatchId}</b> 移交冻结，批次快照不可覆盖。</p>}
          {st === 'superseded' && superseder &&
            <p>已被包 <b>{superseder.id}</b>（{superseder.component} {superseder.version}，
              指纹 {shortFp(superseder.fingerprint)}）通过改证替换。</p>}
        </div>
      </div>

      {chain.length > 1 && (
        <div className="chain-box">
          <div className="chain-title"><Link2 size={13} /> 改证来源链（{chain.length} 个包）</div>
          {chain.map((c, i) => (
            <div key={c.id} className="chain-row">
              <span className={`chain-dot ${c.id === p.id ? 'cur' : ''}`}>{i + 1}</span>
              <div>
                <b>{c.component} {c.version}</b>
                <code className="mono">{shortFp(c.fingerprint)}</code>
                <small>{c.verifier || '缺核验人'} · {fmtDate(c.receivedAt)}
                  {c.releaseBatchId ? ` · 已移交 ${c.releaseBatchId}` : ''}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="detail-actions">
        <button className="outline" onClick={() => onRevise(p)}><Link2 size={14} />改证（新建包）</button>
        {st === 'archived' && <button className="primary" onClick={onGoPublish}><Send size={14} />去可发布清单</button>}
      </div>
    </div>
  );
}

// ===========================================================================
// 可发布清单
// ===========================================================================

export function PublishableView(props: {
  state: ArchiveState;
  onHandover: (ids: string[]) => void;
}) {
  const { state, onHandover } = props;
  const eligible = useMemo(() => publishablePackages(state), [state]);
  const blocked = useMemo(() => state.packages
    .filter(p => !publishablePackages(state).includes(p))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [state]);

  const { sel, toggle, allSelected, toggleAll } = useSelection(eligible.map(p => p.id));

  const reason = (p: EvidencePackage): string => {
    if (p.missingEvidence) return p.missingEvidence;
    if (isSuperseded(state, p.id)) return '已被改证新包替换';
    if (p.status === 'handed') return `已移交 ${p.releaseBatchId ?? ''}，不可重复发布`;
    return '—';
  };

  return (
    <div className="publish-wrap">
      <section className="list-card">
        <div className="pane-head">
          <div><h2><PackageCheck size={16} /> 可发布清单</h2>
            <p>准入条件：证据齐全（含指纹与核验人）+ 在档未移交 + 未被改证替换</p></div>
          <button className="primary" disabled={sel.size === 0}
            onClick={() => onHandover([...sel])}>
            <Send size={14} />移交所选（{sel.size}）
          </button>
        </div>
        <div className="table">
          <div className="tr th"><span className="check-col"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></span>
            <span>组件 / 版本</span><span>文件指纹</span><span>核验人</span><span>来源</span></div>
          {eligible.map(p => (
            <label key={p.id} className={sel.has(p.id) ? 'tr selectable selected' : 'tr selectable'}>
              <span className="check-col"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></span>
              <span className="dep-name"><span className="pkg-dot archived" />{p.component} <i className="ver">{p.version}</i></span>
              <span className="muted mono">{shortFp(p.fingerprint)}</span>
              <span>{p.verifier}</span>
              <span className="muted">{p.source}</span>
            </label>
          ))}
          {eligible.length === 0 && <div className="empty"><AlertTriangle size={18} /> 当前没有证据齐全可移交的包</div>}
        </div>
      </section>

      <section className="list-card blocked-card">
        <div className="pane-head"><div><h2><XCircle size={16} /> 被拦截的包（{blocked.length}）</h2>
          <p>缺少证据或状态不满足要求，不得进入可发布清单</p></div></div>
        <div className="table">
          <div className="tr th"><span>组件 / 版本</span><span>文件指纹</span><span>拦截原因</span></div>
          {blocked.map(p => (
            <div key={p.id} className="tr blocked">
              <span className="dep-name">{p.component} <i className="ver">{p.version}</i>
                <MissingBadge reason={p.missingEvidence} /></span>
              <span className="muted mono">{shortFp(p.fingerprint)}</span>
              <span className="block-reason"><AlertTriangle size={12} />{reason(p)}</span>
            </div>
          ))}
          {blocked.length === 0 && <div className="empty"><Check size={16} /> 所有在档包均满足发布条件</div>}
        </div>
      </section>
    </div>
  );
}

// ===========================================================================
// 接收批次
// ===========================================================================

export function IntakesView({ state, onSelectPackage }: {
  state: ArchiveState; onSelectPackage: (id: string) => void;
}) {
  const batches = [...state.intakeBatches].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return (
    <div className="batches-wrap">
      {batches.map(b => <IntakeBatchCard key={b.id} batch={b} state={state} onSelectPackage={onSelectPackage} />)}
    </div>
  );
}

function IntakeBatchCard({ batch, state, onSelectPackage }: {
  batch: IntakeBatch; state: ArchiveState; onSelectPackage: (id: string) => void;
}) {
  const pkgs = batch.packageIds.map(id => state.packages.find(p => p.id === id)).filter(Boolean) as EvidencePackage[];
  return (
    <section className="list-card batch-card">
      <div className="batch-head">
        <div className="batch-id"><Inbox size={16} /><b className="mono">{batch.id}</b>
          {batch.sealed && <span className="seal"><FileLock2 size={11} />已封存</span>}</div>
        <div className="batch-meta"><span>{fmtDate(batch.receivedAt)}</span><span>接收人：{batch.receiver}</span>
          <span>入库 {pkgs.length}</span>{batch.incompleteIds.length > 0 &&
            <span className="orange">缺证 {batch.incompleteIds.length}</span>}
          {batch.rejections.length > 0 && <span className="red">拒绝 {batch.rejections.length}</span>}
        </div>
      </div>
      <div className="batch-entries">
        {pkgs.map(p => (
          <button key={p.id} className="batch-entry" onClick={() => onSelectPackage(p.id)}>
            <PackageCheck size={14} className={p.missingEvidence ? 'red-ico' : 'green-ico'} />
            <span><b>{p.component} {p.version}</b>
              <code className="mono">{shortFp(p.fingerprint)}</code></span>
            <i>{p.verifier || '缺核验人'}</i>
            {p.missingEvidence && <span className="tag-pill risk">缺证登记</span>}
          </button>
        ))}
      </div>
      {batch.rejections.length > 0 && (
        <div className="reject-box">
          <div className="chain-title"><XCircle size={13} /> 重复接收差异记录（未改动任何已归档批次）</div>
          {batch.rejections.map((r, i) => (
            <div key={i} className="reject-row">
              <AlertTriangle size={13} />
              <div>
                <b>{r.component} {r.version}</b> · 指纹 <code className="mono">{shortFp(r.fingerprint)}</code>
                <p>{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ===========================================================================
// 发布批次
// ===========================================================================

export function ReleasesView({ state }: { state: ArchiveState }) {
  const batches = [...state.releaseBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="batches-wrap">
      {batches.map(b => <ReleaseBatchCard key={b.id} batch={b} />)}
      {batches.length === 0 && (
        <section className="list-card"><div className="empty"><FileLock2 size={18} />还没有发布批次，可发布清单中完成移交后生成。</div></section>
      )}
    </div>
  );
}

function ReleaseBatchCard({ batch }: { batch: ReleaseBatch }) {
  return (
    <section className="list-card batch-card">
      <div className="batch-head">
        <div className="batch-id"><FileLock2 size={16} /><b className="mono">{batch.id}</b>
          {batch.locked && <span className="seal locked">已锁定 · 不可覆盖</span>}</div>
        <div className="batch-meta"><span>{fmtDate(batch.createdAt)}</span><span>移交人：{batch.creator}</span>
          <span>{batch.label}</span><span>{batch.entries.length} 个包</span></div>
      </div>
      <div className="batch-entries">
        {batch.entries.map(e => (
          <div key={e.packageId} className={`batch-entry static${e.supersededById ? ' stale' : ''}`}>
            <FileLock2 size={14} className={e.supersededById ? 'orange-ico' : 'green-ico'} />
            <span><b>{e.component} {e.version}</b>
              <code className="mono">{shortFp(e.fingerprint)}</code></span>
            <i>{e.verifier}</i>
            {e.supersededById
              ? <span className="tag-pill warn"><Link2 size={11} />已被 {e.supersededById} 替换（快照保留）</span>
              : <span className="tag-pill ok"><Check size={11} />快照有效</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ===========================================================================
// 统计卡
// ===========================================================================

export function Stats({ state, goto }: { state: ArchiveState; goto: (v: 'publishable' | 'intakes' | 'releases') => void }) {
  const total = state.packages.length;
  const fingerprints = new Set(state.packages.map(p => p.fingerprint).filter(Boolean)).size;
  const missing = state.packages.filter(p => p.missingEvidence).length;
  const publishable = publishablePackages(state).length;
  return (
    <section className="summary four">
      <div><span>证据包总数</span><b>{total}</b><small>{fingerprints} 个唯一指纹</small></div>
      <div><span>可发布清单</span><b className="teal">{publishable}</b>
        <button className="link-btn" onClick={() => goto('publishable')}>查看清单 <ArrowRight size={11} /></button></div>
      <div><span>缺证在档</span><b className="red">{missing}</b><small>不得进入发布批次</small></div>
      <div><span>发布批次</span><b>{state.releaseBatches.length}</b>
        <button className="link-btn" onClick={() => goto('releases')}>移交记录 <ArrowRight size={11} /></button></div>
    </section>
  );
}
