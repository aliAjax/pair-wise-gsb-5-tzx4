// 归档数据层：只负责证据包/批次的状态演化、持久化与查询。
// 不包含任何接收规则判断（规则见 intake.ts），不依赖 React / DOM。
import type {
  ArchiveState, EvidencePackage, Fingerprint, IntakeBatch, IntakeInput,
  IntakeRejection, ReleaseBatch,
} from './types';

const STORAGE_KEY = 'evidence-archive-v1';

// ---------------------------------------------------------------------------
// 初始归档数据：展示完整的来源链与缺证场景
// ---------------------------------------------------------------------------
export const initialState: ArchiveState = (() => {
  const t = (d: string) => new Date(d + 'T09:00:00+08:00').toISOString();

  const pkg = (p: Partial<EvidencePackage> & {
    id: string; component: string; version: string; source: string;
    fingerprint: string; verifier: string;
  }): EvidencePackage => ({
    receivedAt: t('2026-09-10'), status: 'archived',
    note: '', missingEvidence: null, supersedesId: null, releaseBatchId: null, ...p,
  });

  const packages: EvidencePackage[] = [
    pkg({ id: 'pkg-1001', component: 'react', version: '18.3.1', source: 'npm registry',
      fingerprint: 'c5be7301bb3ce420275c2bc81a002802dbd61b7c59997464b3c9639d944dae2f',
      verifier: '周敏', receivedAt: t('2026-09-10'), note: 'MIT 组件，构建产物比对一致' }),
    pkg({ id: 'pkg-1002', component: 'lodash', version: '4.17.21', source: 'npm registry',
      fingerprint: 'adaac4144887ebc2c1b682380ff385210f681fc58b4bc1ef3986148cf8dcd28a',
      verifier: '周敏', receivedAt: t('2026-09-10') }),
    pkg({ id: 'pkg-1003', component: 'chart.js', version: '4.4.4', source: '内部制品库',
      fingerprint: '62ced490d8e9454ae5e6eddc5345c355b3f53ee80beeca244fd2bce94835c230',
      verifier: '陈航', receivedAt: t('2026-09-12') }),
    pkg({ id: 'pkg-1004', component: 'highlight.js', version: '11.10.0', source: '内部制品库',
      fingerprint: '4932efc1ffd76608a72ae607dd23bdc22d51354fab6eb3c14ad24d7926cb19bf',
      verifier: '陈航', receivedAt: t('2026-09-12') }),
    pkg({ id: 'pkg-1005', component: 'legacy-parser', version: '2.1.0', source: '供应商交付',
      fingerprint: '7538ffc1f5c4c87506be914fd6ecf21dfddfded3f17103ac4618fe7bb57d9529',
      verifier: '周敏', receivedAt: t('2026-09-14'), note: '初版证据，核验签名过期',
      status: 'handed', releaseBatchId: 'rel-20260915-01' }),
    pkg({ id: 'pkg-1006', component: 'legacy-parser', version: '2.1.0', source: '供应商交付（补签）',
      fingerprint: 'dbec8adea90728f155c71f8fea80a2046f7608716a9619985f887b8d84a6651d',
      verifier: '林晓', receivedAt: t('2026-09-16'), note: '修正签名后的补证，替换 pkg-1005',
      supersedesId: 'pkg-1005' }),
    pkg({ id: 'pkg-1007', component: 'offline-report-lib', version: '1.2.0', source: '镜像同步',
      fingerprint: '5934ff064279a12513ac0bbd9faf189b98cd8dc05d60d22e6200754e78cf9a63',
      verifier: '', receivedAt: t('2026-09-18'), note: '镜像站同步，核验单未随包到达',
      missingEvidence: '缺少核验人签字' }),
  ];

  const intakeBatches: IntakeBatch[] = [
    { id: 'rc-20260910-01', receivedAt: t('2026-09-10'), receiver: '周敏',
      packageIds: ['pkg-1001', 'pkg-1002'], rejections: [], incompleteIds: [], sealed: true },
    { id: 'rc-20260912-01', receivedAt: t('2026-09-12'), receiver: '陈航',
      packageIds: ['pkg-1003', 'pkg-1004'], rejections: [], incompleteIds: [], sealed: true },
    { id: 'rc-20260914-01', receivedAt: t('2026-09-14'), receiver: '周敏',
      packageIds: ['pkg-1005'], rejections: [], incompleteIds: [], sealed: true },
    { id: 'rc-20260916-01', receivedAt: t('2026-09-16'), receiver: '林晓',
      packageIds: ['pkg-1006'], rejections: [], incompleteIds: [], sealed: true },
    { id: 'rc-20260918-01', receivedAt: t('2026-09-18'), receiver: '陈航',
      packageIds: ['pkg-1007'], rejections: [], incompleteIds: ['pkg-1007'], sealed: true },
  ];

  const releaseBatches: ReleaseBatch[] = [
    { id: 'rel-20260915-01', createdAt: t('2026-09-15'), creator: '发布管理员',
      label: '九月中离线基线', locked: true,
      entries: [
        { packageId: 'pkg-1001', component: 'react', version: '18.3.1',
          fingerprint: 'c5be7301bb3ce420275c2bc81a002802dbd61b7c59997464b3c9639d944dae2f',
          verifier: '周敏', source: 'npm registry', supersededById: null },
        { packageId: 'pkg-1002', component: 'lodash', version: '4.17.21',
          fingerprint: 'adaac4144887ebc2c1b682380ff385210f681fc58b4bc1ef3986148cf8dcd28a',
          verifier: '周敏', source: 'npm registry', supersededById: null },
        { packageId: 'pkg-1003', component: 'chart.js', version: '4.4.4',
          fingerprint: '62ced490d8e9454ae5e6eddc5345c355b3f53ee80beeca244fd2bce94835c230',
          verifier: '陈航', source: '内部制品库', supersededById: null },
        { packageId: 'pkg-1004', component: 'highlight.js', version: '11.10.0',
          fingerprint: '4932efc1ffd76608a72ae607dd23bdc22d51354fab6eb3c14ad24d7926cb19bf',
          verifier: '陈航', source: '内部制品库', supersededById: null },
        { packageId: 'pkg-1005', component: 'legacy-parser', version: '2.1.0',
          fingerprint: '7538ffc1f5c4c87506be914fd6ecf21dfddfded3f17103ac4618fe7bb57d9529',
          verifier: '周敏', source: '供应商交付', supersededById: 'pkg-1006' },
      ] },
  ];

  return { packages, intakeBatches, releaseBatches, counters: { intake: 1, release: 1 } };
})();

// ---------------------------------------------------------------------------
// 纯函数操作：返回新状态，绝不就地修改；批次封存后不再被任何操作触碰
// ---------------------------------------------------------------------------

const nextBatchId = (kind: 'rc' | 'rel', n: number, date = new Date()) => {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${kind}-${ymd}-${String(n).padStart(2, '0')}`;
};

export interface ReceivedRecord {
  pkg: EvidencePackage;
  rejection: IntakeRejection | null;
}

/**
 * 归档一批已经由接收校验层裁定的接收项。
 * accepted：允许入库（含缺证登记）；rejections：重复/冲突，仅写入新批次的差异说明。
 * 已归档的历史批次保持不变——差异只追加到本次新批次上。
 */
export function receivePackages(
  state: ArchiveState,
  receiver: string,
  accepted: Array<{ input: IntakeInput; missing: string | null }>,
  rejections: IntakeRejection[],
  now: Date = new Date(),
): ArchiveState {
  const seq = state.counters.intake + 1;
  const batchId = nextBatchId('rc', seq, now);
  const receivedAt = now.toISOString();

  const newPkgs: EvidencePackage[] = accepted.map(({ input, missing }, i) => ({
    id: `pkg-${Date.now().toString(36)}-${seq}-${i}`,
    component: input.component.trim(),
    version: input.version.trim(),
    source: input.source.trim(),
    fingerprint: input.fingerprint.trim().toLowerCase(),
    verifier: input.verifier.trim(),
    receivedAt,
    note: (input.note ?? '').trim(),
    status: 'archived',
    missingEvidence: missing,
    supersedesId: null,
    releaseBatchId: null,
  }));

  const batch: IntakeBatch = {
    id: batchId, receivedAt, receiver: receiver.trim() || '未署名',
    packageIds: newPkgs.map(p => p.id),
    rejections,
    incompleteIds: newPkgs.filter(p => p.missingEvidence).map(p => p.id),
    sealed: true, // 接收即封存
  };

  return {
    ...state,
    packages: [...state.packages, ...newPkgs],
    intakeBatches: [...state.intakeBatches, batch],
    counters: { ...state.counters, intake: seq },
  };
}

/**
 * 改证：新建一个包并保留来源链（supersedesId 指向旧包）。
 * 旧包与其所在的发布批次都不改动；新包是全新接收，另行生成接收批次。
 */
export function supersedePackage(
  state: ArchiveState,
  oldId: string,
  input: IntakeInput,
  missing: string | null,
  now: Date = new Date(),
): ArchiveState {
  const seq = state.counters.intake + 1;
  const receivedAt = now.toISOString();
  const newPkg: EvidencePackage = {
    id: `pkg-${Date.now().toString(36)}-${seq}`,
    component: input.component.trim(),
    version: input.version.trim(),
    source: input.source.trim(),
    fingerprint: input.fingerprint.trim().toLowerCase(),
    verifier: input.verifier.trim(),
    receivedAt,
    note: (input.note ?? '').trim(),
    status: 'archived',
    missingEvidence: missing,
    supersedesId: oldId,
    releaseBatchId: null,
  };
  const batch: IntakeBatch = {
    id: nextBatchId('rc', seq, now), receivedAt, receiver: input.receiver.trim(),
    packageIds: [newPkg.id], rejections: [],
    incompleteIds: missing ? [newPkg.id] : [], sealed: true,
  };
  return {
    ...state,
    packages: [...state.packages, newPkg],
    intakeBatches: [...state.intakeBatches, batch],
    counters: { ...state.counters, intake: seq },
  };
}

export interface HandoverResult {
  state: ArchiveState;
  batch: ReleaseBatch | null;
  /** 阻止移交的包 id -> 原因 */
  blocked: Array<{ id: string; component: string; reason: string }>;
}

/**
 * 移交到发布批次：全部候选都必须证据齐全，否则整批拒绝（原子操作）。
 * 移交后包冻结为 handed，发布批次锁定，任何后续操作不可覆盖。
 */
export function handover(
  state: ArchiveState,
  packageIds: string[],
  label: string,
  creator: string,
  now: Date = new Date(),
): HandoverResult {
  const blocked: HandoverResult['blocked'] = [];
  const entries: ReleaseBatch['entries'] = [];

  for (const id of packageIds) {
    const p = state.packages.find(x => x.id === id);
    if (!p) { blocked.push({ id, component: id, reason: '包不存在' }); continue; }
    if (p.status === 'handed') { blocked.push({ id, component: p.component, reason: '已移交，发布批次不可覆盖' }); continue; }
    if (p.missingEvidence) { blocked.push({ id, component: p.component, reason: `证据不完整：${p.missingEvidence}` }); continue; }
    if (isSuperseded(state, p.id)) { blocked.push({ id, component: p.component, reason: '已被改证新包替换' }); continue; }
    entries.push({
      packageId: p.id, component: p.component, version: p.version,
      fingerprint: p.fingerprint, verifier: p.verifier, source: p.source,
      supersededById: null,
    });
  }

  if (blocked.length > 0) return { state, batch: null, blocked };

  const seq = state.counters.release + 1;
  const batch: ReleaseBatch = {
    id: nextBatchId('rel', seq, now), createdAt: now.toISOString(),
    creator: creator.trim() || '发布管理员', label: label.trim() || '未命名发布批次',
    entries, locked: true,
  };
  const handedIds = new Set(entries.map(e => e.packageId));
  return {
    state: {
      ...state,
      releaseBatches: [...state.releaseBatches, batch],
      counters: { ...state.counters, release: seq },
      packages: state.packages.map(p => handedIds.has(p.id)
        ? { ...p, status: 'handed' as const, releaseBatchId: batch.id } : p),
    },
    batch,
    blocked: [],
  };
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export function findByFingerprint(state: ArchiveState, fp: Fingerprint): EvidencePackage | undefined {
  const v = fp.trim().toLowerCase();
  return state.packages.find(p => p.fingerprint === v);
}

/** 是否被另一个在档/已移交的包通过来源链替换 */
export function isSuperseded(state: ArchiveState, id: string): boolean {
  return state.packages.some(p => p.supersedesId === id);
}

/** 证据齐全、在档、未被替换 —— 可发布清单的唯一准入条件 */
export function isPublishable(state: ArchiveState, p: EvidencePackage): boolean {
  return p.status === 'archived' && !p.missingEvidence && !isSuperseded(state, p.id);
}

export function publishablePackages(state: ArchiveState): EvidencePackage[] {
  return state.packages.filter(p => isPublishable(state, p));
}

export function packageChain(state: ArchiveState, p: EvidencePackage): EvidencePackage[] {
  const byId = new Map(state.packages.map(x => [x.id, x]));
  // 找到链头
  let head = p;
  while (head.supersedesId) {
    const prev = byId.get(head.supersedesId);
    if (!prev) break;
    head = prev;
  }
  const chain = [head];
  let cur = head;
  while (true) {
    const next = state.packages.find(x => x.supersedesId === cur.id);
    if (!next) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// 持久化：刷新后组件、指纹、接收批次与移交记录必须一致
// ---------------------------------------------------------------------------

/** 结构 + 引用完整性校验，任一不过则回到初始归档 */
export function validateState(s: unknown): s is ArchiveState {
  if (!s || typeof s !== 'object') return false;
  const st = s as ArchiveState;
  if (!Array.isArray(st.packages) || !Array.isArray(st.intakeBatches) || !Array.isArray(st.releaseBatches)) return false;

  const pkgIds = new Set<string>();
  for (const p of st.packages) {
    if (!p.id || !p.component || !p.version || !p.source) return false;
    if (typeof p.fingerprint !== 'string' || typeof p.verifier !== 'string') return false;
    if (!['archived', 'handed'].includes(p.status)) return false;
    if (pkgIds.has(p.id)) return false;
    pkgIds.add(p.id);
  }
  // 同一指纹只能归属一个组件
  const fpOwner = new Map<string, string>();
  for (const p of st.packages) {
    if (!p.fingerprint) continue;
    const owner = fpOwner.get(p.fingerprint);
    if (owner && owner !== p.component) return false;
    fpOwner.set(p.fingerprint, p.component);
  }
  // 批次引用必须闭合
  for (const b of st.intakeBatches) {
    if (!b.id || !Array.isArray(b.packageIds) || !Array.isArray(b.rejections)) return false;
    if (!b.packageIds.every(id => pkgIds.has(id))) return false;
    if (!b.incompleteIds.every(id => pkgIds.has(id))) return false;
  }
  for (const r of st.releaseBatches) {
    if (!r.id || !Array.isArray(r.entries)) return false;
    if (!r.entries.every(e => pkgIds.has(e.packageId))) return false;
  }
  return true;
}

export function loadState(): ArchiveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(initialState);
    const parsed = JSON.parse(raw);
    return validateState(parsed) ? parsed : structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

export function saveState(state: ArchiveState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 离线配额失败时忽略 */ }
}
