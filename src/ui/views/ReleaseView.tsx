import { useMemo, useState } from 'react';
import {
  Ban, CheckCircle2, FileLock2, Fingerprint, PackageCheck, Plus, Send, ShieldOff,
} from 'lucide-react';
import type { ArchiveState } from '../../archive/types';
import {
  selectHandoversOfRelease, selectOpenRelease, selectPublishableList,
} from '../../archive/selectors';
import { createReleaseBatch, handover } from '../../release/service';
import { Badge, Field, Modal } from '../widgets';
import { blockedMeta, fmtDateTime, shortFp, statusMeta } from '../format';

interface Props {
  state: ArchiveState;
  clerk: string;
  notify: (msg: string, kind?: 'ok' | 'err') => void;
  goArchive: (id: string) => void;
}

export default function ReleaseView({ state, clerk, notify, goArchive }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const list = useMemo(() => selectPublishableList(state), [state]);
  const eligible = list.filter((e) => e.eligible);
  const blocked = list.filter((e) => !e.eligible);
  const openRelease = selectOpenRelease(state);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createBatch = () => {
    try {
      const r = createReleaseBatch(newName, clerk);
      notify(`已创建发布批次 ${r.id}：${r.name}`, 'ok');
      setShowCreate(false);
      setNewName('');
    } catch (e) {
      notify((e as Error).message, 'err');
    }
  };

  const doHandover = () => {
    if (!openRelease) return;
    const ids = Array.from(checked);
    try {
      const result = handover(ids, openRelease.id, clerk);
      notify(`已移交 ${result.handoverIds.length} 个证据包并封存 ${openRelease.id}，移交不可逆`, 'ok');
      setChecked(new Set());
    } catch (e) {
      notify((e as Error).message, 'err');
    }
  };

  return (
    <div className="release-stack">
      {/* 可发布清单 */}
      <section className="release-pane">
        <div className="pane-head">
          <div>
            <h2><PackageCheck size={16} /> 可发布清单</h2>
            <p>仅证据齐全、未被取代、未移交的证据包可发布；缺少证据的包不得进入。</p>
          </div>
          <div className="publish-counts">
            <Badge cls="ok">{eligible.length} 个可发布</Badge>
            <Badge cls="warn">{blocked.length} 个被拦截</Badge>
          </div>
        </div>

        <div className="publish-cols">
          <div className="publish-col">
            <div className="col-title ok"><CheckCircle2 size={13} /> 准予发布</div>
            {eligible.length === 0 && <div className="empty">当前没有可发布的证据包</div>}
            {eligible.map(({ pkg }) => (
              <label key={pkg.id} className={`pick-row ${openRelease ? '' : 'no-check'}`}>
                {openRelease
                  ? <input type="checkbox" checked={checked.has(pkg.id)} onChange={() => toggle(pkg.id)} />
                  : <span className="pick-dot" />}
                <span className="pick-main">
                  <b>{pkg.component} <small>{pkg.version}</small></b>
                  <code title={pkg.fingerprint}><Fingerprint size={10} /> {shortFp(pkg.fingerprint, 10, 8)}</code>
                </span>
                <span className="pick-side">
                  <span className="muted">{pkg.id} · {pkg.verifier}</span>
                  <button className="link-btn" onClick={(e) => { e.preventDefault(); goArchive(pkg.id); }}>查看</button>
                </span>
              </label>
            ))}
          </div>
          <div className="publish-col blocked-col">
            <div className="col-title warn"><ShieldOff size={13} /> 禁止进入（{blocked.length}）</div>
            {blocked.map(({ pkg, blockedReason }) => (
              <div key={pkg.id} className="pick-row blocked">
                <span className="ban-icon"><Ban size={13} /></span>
                <span className="pick-main">
                  <b>{pkg.component} <small>{pkg.version}</small></b>
                  <code className={pkg.fingerprint ? '' : 'missing'}>
                    <Fingerprint size={10} /> {shortFp(pkg.fingerprint, 10, 8)}
                  </code>
                </span>
                <span className="pick-side">
                  <Badge cls={blockedMeta[blockedReason!].cls}>{blockedMeta[blockedReason!].label}</Badge>
                  <button className="link-btn" onClick={() => goArchive(pkg.id)}>查看</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 发布批次 */}
      <section className="release-pane">
        <div className="pane-head">
          <div>
            <h2><FileLock2 size={16} /> 发布批次与移交</h2>
            <p>移交后证据包冻结、批次封存，不可覆盖；改证只能新建包并保留来源链。</p>
          </div>
          {!openRelease && <button className="primary sm" onClick={() => setShowCreate(true)}><Plus size={14} /> 新建发布批次</button>}
        </div>

        {openRelease && (
          <div className="open-release">
            <div className="open-release-info">
              <Badge cls="revision">待封存</Badge>
              <b>{openRelease.name}</b>
              <span className="muted">{openRelease.id} · 创建于 {fmtDateTime(openRelease.createdAt)}</span>
            </div>
            <div className="open-release-actions">
              <span className="muted">已选 {checked.size} 个</span>
              <button className="primary sm" disabled={checked.size === 0} onClick={doHandover}>
                <Send size={13} /> 移交并封存
              </button>
            </div>
          </div>
        )}

        <div className="release-list">
          {[...state.releases].reverse().map((r) => {
            const handovers = selectHandoversOfRelease(state, r.id);
            return (
              <div key={r.id} className={`release-card ${r.sealed ? 'sealed' : ''}`}>
                <div className="release-card-head">
                  <span className="batch-id">{r.id}</span>
                  <b>{r.name}</b>
                  {r.sealed
                    ? <Badge cls="frozen"><FileLock2 size={11} /> 已封存</Badge>
                    : <Badge cls="revision">待封存</Badge>}
                  <span className="muted">{fmtDateTime(r.createdAt)} · {r.createdBy}</span>
                </div>
                {r.sealed && r.sealedAt && <div className="sealed-at">封存于 {fmtDateTime(r.sealedAt)} · 移交 {handovers.length} 件，指纹快照随批次冻结</div>}
                <div className="handover-grid">
                  {handovers.map((h) => {
                    const pkg = state.packages.find((p) => p.id === h.packageId);
                    return (
                      <div key={h.id} className="handover-item" onClick={() => goArchive(h.packageId)}>
                        <span className="ho-id">{h.id}</span>
                        <b>{pkg?.component} <small>{pkg?.version}</small></b>
                        <code title={h.fingerprintSnapshot}>{shortFp(h.fingerprintSnapshot, 12, 8)}</code>
                        <span className="muted">{fmtDateTime(h.handedOverAt)} · {h.handedOverBy}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {showCreate && (
        <Modal
          title="新建发布批次"
          subtitle="批次创建后即可勾选可发布清单中的证据包；移交动作将一次性封存。"
          onClose={() => setShowCreate(false)}
          footer={<><button className="outline" onClick={() => setShowCreate(false)}>取消</button>
            <button className="primary" onClick={createBatch}>创建批次</button></>}
          width={440}
        >
          <Field label="批次名称" required>
            <input className="ipt" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="例如 十月离线发布批次" onKeyDown={(e) => e.key === 'Enter' && createBatch()} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
