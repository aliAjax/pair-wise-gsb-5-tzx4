import { appendRelease, getState, handoverAndSeal } from '../archive/store';
import type { ReleaseBatch } from '../archive/types';

// 移交服务：证据包移交到发布批次。
// 规则：只允许证据齐全（archived）且未冻结的包进入；封存与移交一次性原子完成，不可覆盖。

export interface CreateReleaseResult {
  release: ReleaseBatch;
}

export function createReleaseBatch(name: string, createdBy: string): ReleaseBatch {
  const state = getState();
  if (state.releases.some((r) => !r.sealed)) {
    throw new Error('已存在未封存的发布批次，请先完成移交并封存');
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error('发布批次名称必填');
  return appendRelease({ name: trimmed, createdBy, at: new Date() });
}

export interface HandoverResult {
  releaseId: string;
  handoverIds: string[];
  sealedAt: string;
}

/** 移交并封存：返回新产生的移交记录 id */
export function handover(packageIds: string[], releaseBatchId: string, by: string): HandoverResult {
  const state = getState();
  const release = state.releases.find((r) => r.id === releaseBatchId);
  if (!release) throw new Error('发布批次不存在');
  if (release.sealed) throw new Error(`发布批次 ${releaseBatchId} 已封存，不能再追加证据包`);

  const unique = Array.from(new Set(packageIds));
  if (unique.length === 0) throw new Error('请至少选择一个证据包');

  // 服务层预检（数据层另有最终防护）
  unique.forEach((pid) => {
    const pkg = state.packages.find((p) => p.id === pid);
    if (!pkg) throw new Error(`证据包 ${pid} 不存在`);
    if (pkg.status === 'pending-evidence') throw new Error(`${pid}（${pkg.component}）缺少证据，不得进入发布批次`);
    if (pkg.status === 'superseded') throw new Error(`${pid}（${pkg.component}）已被改证新包取代，不得进入发布批次`);
    if (pkg.frozen) throw new Error(`${pid}（${pkg.component}）已随 ${pkg.releaseBatchId} 移交，不可覆盖`);
  });

  const at = new Date();
  const records = handoverAndSeal({ packageIds: unique, releaseBatchId, by, at });
  return { releaseId: releaseBatchId, handoverIds: records.map((r) => r.id), sealedAt: at.toISOString() };
}
