import http from './https';

export interface SystemInfo {
  version: string;
  schemaVersion: string;
  upgradeEnabled: boolean;
  canUpgrade: boolean;
}

export interface SystemRelease {
  version: string;
  fromVersions: string[];
  schemaVersion: string;
  createdAt: string;
  notes: string;
}

export interface UpgradeJob {
  id: string;
  version: string;
  previousVersion: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted';
  step: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  backup?: string;
}

export interface UpgradeWatch {
  job: UpgradeJob;
  watchToken: string;
}

export const MAX_UPGRADE_PACKAGE_BYTES = 2 * 1024 ** 3;
export const UPGRADE_WATCH_STORAGE_KEY = 'voex-system-upgrade-watch';
export interface SavedUpgradeWatch {
  accountID: string;
  jobID: string;
  token: string;
}

export function readSavedUpgradeWatch(): SavedUpgradeWatch | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(UPGRADE_WATCH_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    if (
      !('accountID' in saved) ||
      typeof saved.accountID !== 'string' ||
      !saved.accountID ||
      saved.accountID.length > 128
    )
      return null;
    if (
      !('jobID' in saved) ||
      typeof saved.jobID !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(saved.jobID)
    )
      return null;
    if (
      !('token' in saved) ||
      typeof saved.token !== 'string' ||
      !/^[A-Za-z0-9._~+/=-]{16,2048}$/.test(saved.token)
    )
      return null;
    return { accountID: saved.accountID, jobID: saved.jobID, token: saved.token };
  } catch {
    return null;
  }
}

export function getSystemInfo(signal?: AbortSignal) {
  return http.get<unknown, SystemInfo>('/system/info', { signal });
}

export function listSystemReleases(signal?: AbortSignal) {
  return http.get<unknown, { items: SystemRelease[] }>('/system/releases', { signal });
}

export function getCurrentSystemUpgrade(signal?: AbortSignal) {
  return http.get<unknown, { job: UpgradeJob | null; watchToken?: string }>(
    '/system/upgrades/current',
    { signal }
  );
}

export function uploadSystemPackage(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (loaded: number, total?: number) => void } = {}
) {
  const form = new FormData();
  form.append('file', file);
  return http.post<unknown, { release: SystemRelease }>('/system/packages', form, {
    timeout: 0,
    signal: options.signal,
    onUploadProgress: (event) => options.onProgress?.(event.loaded, event.total),
  });
}

export function startSystemUpgrade(version: string, requestId: string, signal?: AbortSignal) {
  return http.post<unknown, UpgradeWatch>('/system/upgrades', { version, requestId }, { signal });
}

export class UpgradeWatchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// The watch endpoint remains available while the application is restarting.
// Its job-scoped token must not trigger the application's session refresh interceptor.
export async function watchSystemUpgrade(jobID: string, token: string, signal: AbortSignal) {
  const response = await fetch(`/api/upgrade-status/${encodeURIComponent(jobID)}`, {
    headers: { 'X-Upgrade-Watch-Token': token },
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new UpgradeWatchError(
      response.status === 401 || response.status === 403 || response.status === 404
        ? '升级任务不存在或状态凭证已失效，请在服务恢复后重新读取任务'
        : '暂时无法读取升级状态，正在重新连接',
      response.status
    );
  }
  return (await response.json()) as { job: UpgradeJob };
}
