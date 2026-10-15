import http from './https';
import type { DocumentPermissions, FileDetails, FilePath } from './document-api';
import type { SharedFile } from './share-api';
import type { DownloadOptions } from './upload-api';

export interface RecentFile {
  file_key: string;
  file_name: string;
  viewed_at: string;
  access: 'project' | 'share' | 'unavailable';
  permissions: DocumentPermissions;
  path: FilePath | null;
}

export interface RecentFilesResult {
  items: RecentFile[];
  total: number;
  limit: number;
}

const filePath = (key: string) => `/recent-files/${encodeURIComponent(key)}`;

export function queryRecentFiles(limit: number, signal?: AbortSignal) {
  return http.get<unknown, RecentFilesResult>('/recent-files', { params: { limit }, signal });
}

export function removeRecentFile(key: string) {
  return http.delete<unknown, { success: boolean }>(filePath(key));
}

export function getRecentFile(key: string, signal?: AbortSignal) {
  return http.get<unknown, SharedFile>(filePath(key), { signal });
}

export function getRecentFileDetails(key: string, signal?: AbortSignal) {
  return http.get<unknown, FileDetails>(`${filePath(key)}/details`, { signal });
}

export function updateRecentFile(key: string, file_content: string, revision: number) {
  return http.put<unknown, { success: boolean; revision: number }>(filePath(key), {
    file_content,
    revision,
  });
}

export function downloadRecentAttachment(key: string, hash: string, options: DownloadOptions = {}) {
  return http.get<unknown, Blob>(`${filePath(key)}/attachments/${encodeURIComponent(hash)}`, {
    ...options,
    responseType: 'blob',
    timeout: 0,
  });
}
