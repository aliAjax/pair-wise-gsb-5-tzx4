import { useState } from 'react';
import { ClipboardList, FileWarning, Inbox } from 'lucide-react';
import type { ArchiveState } from '../../archive/types';
import { selectReceptionsOfBatch } from '../../archive/selectors';
import { Badge } from '../widgets';
import { FIELD_LABELS, fmtDateTime, outcomeMeta, shortFp } from '../format';

export default function IntakeLedgerView({ state }: { state: ArchiveState }) {
  const [openId, setOpenId] = useState<string | null>(state.batches[state.batches.length - 1]?.id ?? null);

  return (
    <section className="ledger-view">
      <div className="ledger-head">
        <div>
          <h2><Inbox size={17} /> 接收批次台账</h2>
          <p>每次接收动作（接收、隔离、补证、改证、退回）都形成不可修改的批次与接收记录。</p>
        </div>
        <div className="ledger-legend">
          <Badge cls="ok">接收/补证</Badge><Badge cls="revision">改证</Badge>
          <Badge cls="warn">隔离</Badge><Badge cls="risk">退回</Badge>
        </div>
      </div>

      <div className="batch-list">
        {[...state.batches].reverse().map((b) => {
          const records = selectReceptionsOfBatch(state, b.id);
          const open = openId === b.id;
          return (
            <div key={b.id} className={`batch-card ${open ? 'open' : ''}`}>
              <button className="batch-head" onClick={() => setOpenId(open ? null : b.id)}>
                <span className="batch-id"><ClipboardList size={14} /> {b.id}</span>
                <span className="batch-summary">{b.summary}</span>
                <span className="batch-meta">{fmtDateTime(b.receivedAt)} · 经手人 {b.clerk} · {records.length} 条记录</span>
                <span className="batch-badges">
                  {records.map((r) => (
                    <Badge key={r.id} cls={outcomeMeta[r.outcome].cls} title={`${r.id} ${outcomeMeta[r.outcome].label}`}>
                      {outcomeMeta[r.outcome].label}
                    </Badge>
                  ))}
                </span>
              </button>
              {open && (
                <div className="record-list">
                  {records.map((r) => {
                    const meta = outcomeMeta[r.outcome];
                    return (
                      <div key={r.id} className={`record-card rec-${meta.cls}`}>
                        <div className="record-top">
                          <span className="record-id">{r.id}</span>
                          <Badge cls={meta.cls}>{meta.label}</Badge>
                          <span className="muted">{fmtDateTime(r.receivedAt)}</span>
                          {r.packageId && <span className="record-pkg">关联 {r.packageId}</span>}
                        </div>
                        <p className="record-reason">{r.reason}</p>

                        <div className="submit-grid">
                          <span><em>组件</em>{r.submitted.component || '—'}</span>
                          <span><em>版本</em>{r.submitted.version || '—'}</span>
                          <span><em>核验人</em>{r.submitted.verifier || '—'}</span>
                          <span className="span2"><em>来源</em>{r.submitted.source || '—'}</span>
                          <span className="span2"><em>提交指纹</em>
                            <code>{shortFp(r.submitted.fingerprint, 16, 10) || '—'}</code>
                          </span>
                          {r.submitted.supersedes && <span className="span2"><em>来源链</em>取代 {r.submitted.supersedes}</span>}
                        </div>

                        {r.missingFields && (
                          <div className="record-flag warn">
                            <FileWarning size={13} /> 缺失字段：{r.missingFields.map((f) => FIELD_LABELS[f] ?? f).join('、')}
                          </div>
                        )}
                        {r.diffAgainst && (
                          <div className="record-flag risk">
                            <div><FileWarning size={13} /> 与 {r.diffAgainst.packageId} 的字段差异：</div>
                            <ul>
                              {r.diffAgainst.fields.map((d) => (
                                <li key={d.field}>
                                  <b>{FIELD_LABELS[d.field] ?? d.field}</b>：
                                  提交「{d.submitted || '空'}」 ≠ 归档「{d.archived || '空'}」
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {r.discrepancyNote && <div className="record-note">差异说明：{r.discrepancyNote}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
