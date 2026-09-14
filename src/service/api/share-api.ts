import axios from 'axios';
import http, { authHttp } from './https';
import {
  acceptSession,
  accessToken,
  accessExpiresAt,
  authUser,
  type AuthSession,
  type Creator,
} from '../auth-session';
import type { DocumentPermissions, FileInfo } from './document-api';

export type SharePermission = 'read' | 'edit';

export interface FileShare {
  id: string;
  permission: SharePermission;
  created_at: string;
  revoked_at: string | null;
  created_by: Creator;
  can_revoke: boolean;
}

export interface CreatedFileShare {
  id: string;
  token: string;
  permission: SharePermission;
  created_at: string;
}

export interface SharedFile {
  file_key: string;
  file_name: string;
  file_content: string | null;
  created_at: string;
  updated_at: string;
  creator: Creator;
  revision: number;
  privileges: { mode: 'inherit' };
  permissions: DocumentPermissions;
  attachments: FileInfo[];
}

export function listFileShares(fileKey: string, signal?: AbortSignal) {
  return http.get<unknown, FileShare[]>(`/document/${encodeURIComponent(fileKey)}/shares`, {
    signal,
  });
}

export function createFileShare(fileKey: string, permission: SharePermission) {
  return http.post<unknown, CreatedFileShare>(`/document/${encodeURIComponent(fileKey)}/shares`, {
    permission,
  });
}

export function revokeFileShare(fileKey: string, shareId: string) {
  return http.delete<unknown, { success: boolean }>(
    `/document/${encodeURIComponent(fileKey)}/shares/${encodeURIComponent(shareId)}`
  );
}

export function fileShareUrl(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}share#${encodeURIComponent(token)}`;
}

// Public links remain usable when a login session is absent or expired.
// Do not use the authenticated client's recovery interceptor here.
const sharedHttp = axios.create({ baseURL: '/api', timeout: 30000, withCredentials: true });

export async function restoreOptionalShareSession() {
  if (accessToken.value && accessExpiresAt.value > Date.now() + 30000) return;
  try {
    const { data } = await authHttp.post<AuthSession>('/auth/refresh');
    if (!authUser.value || authUser.value.id === data.user.id) acceptSession(data);
  } catch {
    // A failed optional login must not interrupt anonymous file access.
  }
}

function shareHeaders(token: string) {
  return {
    'X-Share-Token': token,
    ...(accessToken.value && accessExpiresAt.value > Date.now()
      ? { Authorization: `Bearer ${accessToken.value}` }
      : {}),
  };
}

export async function getSharedFile(token: string, signal?: AbortSignal) {
  const { data } = await sharedHttp.get<SharedFile>('/shared-file', {
    headers: shareHeaders(token),
    signal,
  });
  return data;
}

export async function updateSharedFile(token: string, file_content: string, revision: number) {
  const { data } = await sharedHttp.put<{ success: boolean; revision: number }>(
    '/shared-file',
    { file_content, revision },
    { headers: shareHeaders(token) }
  );
  return data;
}

export async function downloadSharedAttachment(token: string, hash: string, signal?: AbortSignal) {
  const { data } = await sharedHttp.get<Blob>(
    `/shared-file/attachments/${encodeURIComponent(hash)}`,
    { headers: shareHeaders(token), responseType: 'blob', signal }
  );
  return data;
}
