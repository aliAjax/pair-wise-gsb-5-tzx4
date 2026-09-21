import { useSyncExternalStore } from 'react';
import { getState, subscribe } from '../archive/store';
import type { ArchiveState } from '../archive/types';

// 页面层通过该 hook 订阅归档账本；刷新后由 localStorage 恢复，组件/指纹/批次/移交一致。
export function useArchive(): ArchiveState {
  return useSyncExternalStore(subscribe, getState, getState);
}
