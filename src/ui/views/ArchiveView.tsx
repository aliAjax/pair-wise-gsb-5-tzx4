import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Check, FileLock2, Fingerprint, History,
  Link2, Plus, Search, ShieldCheck, X,
} from 'lucide-react';
import type { ArchiveState } from '../../archive/types';
import {
  selectPackage, selectProvenanceChain, selectReceptionsOfPackage,
  selectRevisionsOf, selectStats,
} from '../../archive/selectors';
import { Badge } from '../widgets';
import { fmtDateTime, shortFp, statusMeta } from '../format';

interface Props {
  state: ArchiveState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReceive: () => void;
  onRevise: (packageId: string) => void;
  onSupplement: (packageId: string) => void;
}

export default function ArchiveView({ state, selectedId, onSelect, onReceive, onRevise, onSupplement }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'archived' | 'pending-evidence' | 'superseded' | 'frozen'>('all');
  const stats = selectStats(state);
  const current = selectPackage(state, selectedId);

  const filtered = useMemo(() => state.packages.filter((p) => {
    if (filter === 'frozen') return p.frozen;
    if (filter !== 'all' && p.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${p.id} ${p.component} ${p.version} ${p.fingerprint} ${p.verifier}`.toLowerCase().includes(q);
  }), [state.packages, query, filter]);

  return (
    <section className="workspace">
      <div className="table-pane">
        <div className="pane-head">
          <div>
            <h2>证据包归档台</h2>
            <p>每个证据包记录组件、版本、来源、文件指纹与核验人 · 同一指纹仅归属一个组件</p>
          </div>
          <div className="tools">
            <div className="search">
              <Search size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索组件 / 指纹 / 核验人" />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">全部 {stats.total}</option>
              <option value="archived">已归档 {stats.archived}</option>
              <option value="pending-evidence">待补证 {stats.pending}</option>
              <option value="superseded">已取代 {stats.superseded}</option>
              <option value="frozen">已移交冻结 {stats.frozen}</option>
            </select>
            <button className="primary sm" onClick={onReceive}><Plus size={14} />接收证据包</button>
          </div>
        </div>
        <div className="table pkg-table">
          <div className="tr th">
            <span>组件 / 证据包</span><span>版本</span><span>文件指纹</span><span>核验人</span><span>状态</span>
          </div>
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`tr ${p.id === selectedId ? 'selected' : ''} ${p.status === 'pending-evidence' ? 'row-warn' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="dep-name">
                <span className={`pkg-dot ${p.frozen ? 'dot-frozen' : p.status === 'pending-evidence' ? 'dot-warn' : ''}`} />
                {p.component}
                <small className="pkg-id">{p.id}</small>
              </span>
              <span className="muted">{p.version}</span>
              <span className="fp-cell" title={p.fingerprint || '缺指纹'}>
                <Fingerprint size={11} /> {shortFp(p.fingerprint)}
              </span>
              <span className="muted">{p.verifier}</span>
              <span className={`cell-status ${statusMeta[p.status].cls}`}>
                {p.frozen
                  ? <><FileLock2 size={12} /> 已移交</>
                  : p.status === 'archived'
                    ? <><Check size={12} /> {statusMeta[p.status].label}</>
                    : <><AlertTriangle size={12} /> {statusMeta[p.status].label}</>}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">没有符合条件的证据包</div>}
        </div>
      </div>

      {current ? (
        <PackageDetail
          state={state}
          packageId={current.id}
          onClose={() => onSelect(null)}
          onRevise={onRevise}
          onSupplement={onSupplement}
        />
      ) : (
        <div className="detail detail-placeholder">
          <ShieldCheck size={26} />
          <b>选择左侧证据包查看归档详情</b>
          <p>来源链、接收批次、移交记录与指纹快照均可在此核验。归档数据只追加，移交后不可覆盖。</p>
        </div>
      )}
    </section>
  );
}

function PackageDetail({
  state, packageId, onClose, onRevise, onSupplement,
}: {
  state: ArchiveState;
  packageId: string;
  onClose: () => void;
  onRevise: (id: string) => void;
  onSupplement: (id: string) => void;
}) {
  const pkg = selectPackage(state, packageId)!;
  const chain = selectProvenanceChain(state, packageId);
  const revisions = selectRevisionsOf(state, packageId);
  const receptions = selectReceptionsOfPackage(state, packageId);
  const handover = state.handovers.find((h) => h.packageId === packageId);
  const release = handover ? state.releases.find((r) => r.id === handover.releaseBatchId) : undefined;
  const meta = statusMeta[pkg.status];

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-icon"><Fingerprint size={19} /></div>
        <div className="detail-head-main">
          <span>EVIDENCE PACKAGE · {pkg.id}</span>
          <h2>{pkg.component} <small>{pkg.version}</small></h2>
        </div>
        <div className="detail-tags">
          <Badge cls={meta.cls}>{meta.label}</Badge>
          {pkg.frozen && <Badge cls="frozen"><FileLock2 size={11} /> 已移交冻结</Badge>}
        </div>
        <button className="close" onClick={onClose}><X size={16} /></button>
      </div>

      {pkg.frozen && (
        <div className="frozen-banner">
          <FileLock2 size={14} />
          已移交至 {release?.name}（{pkg.releaseBatchId}），证据包冻结；如需更正只能改证新建包，来源链保留本包。
        </div>
      )}

      <dl className="kv-grid">
        <div><dt>组件</dt><dd>{pkg.component}</dd></div>
        <div><dt>版本</dt><dd>{pkg.version}</dd></div>
        <div><dt>核验人</dt><dd>{pkg.verifier}</dd></div>
        <div className="kv-wide"><dt>来源</dt><dd>{pkg.source || <span className="missing">缺失</span>}</dd></div>
        <div className="kv-wide">
          <dt>文件指纹（SHA-256）</dt>
          <dd className="fp-full">{pkg.fingerprint
            ? <code>{pkg.fingerprint}</code>
            : <span className="missing"><AlertTriangle size={12} /> 缺失 —— 补齐前不得进入可发布清单</span>}
          </dd>
        </div>
        <div className="kv-wide"><dt>备注</dt><dd className="muted">{pkg.note || '—'}</dd></div>
      </dl>

      <div className="chain-box">
        <div className="chain-title"><History size={13} /> 来源链（改证保留）</div>
        <div className="chain">
          {[...chain].reverse().map((node, i) => (
            <span key={node.id} className="chain-node-wrap">
              {i > 0 && <ArrowRight size={12} className="chain-arrow" />}
              <span className={`chain-node ${node.id === packageId ? 'chain-current' : ''} ${node.status === 'superseded' ? 'chain-old' : ''}`}>
                {node.id} · {node.component}@{node.version}
                {node.status === 'superseded' && <small>已取代</small>}
              </span>
            </span>
          ))}
          {revisions.map((r) => (
            <span key={`rev-${r.id}`} className="chain-node-wrap">
              <ArrowRight size={12} className="chain-arrow" />
              <span className="chain-node chain-current">
                {r.id} · {r.component}@{r.version}<small>改证新包</small>
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="ledger-lines">
        <div className="chain-title"><Link2 size={13} /> 接收与移交留痕</div>
        <div className="line"><span className="line-dot ok" />
          接收于 <b>{pkg.receivedInBatch}</b> · {fmtDateTime(pkg.receivedAt)}
          {pkg.completedInBatch && <> · 证据补齐于 <b>{pkg.completedInBatch}</b></>}
        </div>
        {receptions.map((r) => (
          <div key={r.id} className="line">
            <span className={`line-dot ${r.outcome.startsWith('rejected') ? 'risk' : r.outcome === 'quarantined' ? 'warn' : 'ok'}`} />
            {r.id} · {fmtDateTime(r.receivedAt)} · {r.reason}
          </div>
        ))}
        {handover && (
          <div className="line"><span className="line-dot frozen" />
            移交记录 <b>{handover.id}</b> → {handover.releaseBatchId} · {fmtDateTime(handover.handedOverAt)} · {handover.handedOverBy}
            <code className="snapshot" title="移交时冻结的指纹快照">快照 {shortFp(handover.fingerprintSnapshot, 8, 6)}</code>
          </div>
        )}
      </div>

      <div className="detail-actions">
        {pkg.status === 'pending-evidence' && !pkg.frozen && (
          <button className="primary sm" onClick={() => onSupplement(pkg.id)}>补齐证据</button>
        )}
        {!pkg.frozen && pkg.status !== 'pending-evidence' && (
          <button className="outline sm" onClick={() => onRevise(pkg.id)}>改证（新建包）</button>
        )}
        {pkg.frozen && <span className="lock-note"><FileLock2 size={12} /> 归档批次不可覆盖</span>}
      </div>
    </div>
  );
}
