import http from './https';
import type { ApiError } from './index';

export type TrashType = 'document' | 'folder';

interface TrashItemBase {
  key: string;
  name: string;
  team_key: string;
  project_key: string;
  deleted_by: { id: string; name: string } | null;
  deleted_at: string;
  expires_at: string;
  can_restore: boolean;
}

export type TrashItem =
  | (TrashItemBase & { type: 'document'; folder_key: string | null; document_count?: never })
  | (TrashItemBase & { type: 'folder'; folder_key: null; document_count: number });

export interface TrashListQuery {
  team_key?: string;
  project_key?: string;
  limit?: number;
  offset?: number;
}

export interface TrashListResponse {
  items: TrashItem[];
  total: number;
  limit: number;
  offset: number;
}

export function listTrash(params: TrashListQuery, signal?: AbortSignal) {
  return http.get<ApiError, TrashListResponse>('/trash', { params, signal });
}

export function restoreTrash(type: TrashType, key: string) {
  return http.post<ApiError, { success: true }>(
    `/trash/${type}/${encodeURIComponent(key)}/restore`
  );
}

export function purgeTrash(type: TrashType, key: string) {
  return http.delete<ApiError, { success: true }>(`/trash/${type}/${encodeURIComponent(key)}`);
}
