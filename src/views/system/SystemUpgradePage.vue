<template>
  <main class="system-page team-ui">
    <header class="system-page__header">
      <div>
        <h1>系统升级</h1>
        <p class="team-ui__hint">导入离线升级包，再选择版本开始升级。</p>
      </div>
      <button
        class="team-ui__button"
        type="button"
        :disabled="
          loading || uploading || starting || jobActive || !!watchJobID || !!pendingRequest
        "
        @click="initialize"
      >
        <SvgIcon name="refresh" :size="14" />刷新
      </button>
    </header>
    <div class="system-page__body">
      <section
        v-if="job || watchJobID"
        class="system-page__section system-page__task"
        aria-label="升级任务"
      >
        <div class="system-page__heading">
          <h2>{{ job ? statusLabels[job.status] : '正在恢复升级任务' }}</h2>
          <span v-if="job" class="team-ui__badge"
            >{{ job.previousVersion }} → {{ job.version }}</span
          >
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p>{{ job ? stepLabel(job) : '正在读取升级进度，请保持此页打开。' }}</p>
          <p v-if="job?.message" class="system-page__message">{{ job.message }}</p>
          <p v-if="watchError" class="team-ui__hint">{{ watchError }}</p>
        </div>
        <p v-if="jobActive || watchJobID" class="team-ui__hint">
          升级期间服务会暂时不可用。短暂断连时会自动重新连接，刷新页面后可继续查看任务。
        </p>
        <p v-if="job && !jobActive" class="team-ui__hint">
          {{
            job.status === 'succeeded'
              ? '升级已完成。重新加载页面以使用新版本。'
              : '升级未完成，请核对恢复结果和备份后再决定是否重试。'
          }}
        </p>
        <p v-if="job?.backup" class="team-ui__hint">升级前备份已保留。</p>
        <p v-if="storageError" class="team-ui__error" role="alert">{{ storageError }}</p>
        <div class="team-ui__actions">
          <button
            v-if="watchError && watchJobID && !watchAuthFailed"
            class="team-ui__button"
            type="button"
            @click="pollNow"
          >
            重新连接
          </button>
          <button
            v-if="watchAuthFailed"
            class="team-ui__button"
            type="button"
            :disabled="discovering"
            @click="recoverTask"
          >
            重新读取任务
          </button>
          <button
            v-if="jobActive && !watchJobID"
            class="team-ui__button"
            type="button"
            :disabled="loading || discovering"
            @click="initialize"
          >
            重新读取任务
          </button>
          <button
            v-if="job?.status === 'succeeded'"
            class="team-ui__button"
            type="button"
            @click="reloadPage"
          >
            重新加载页面
          </button>
        </div>
      </section>
      <div v-if="loading && !info" class="team-ui__state" role="status">正在读取系统版本…</div>
      <div v-if="loadError" class="system-page__feedback" role="alert">
        <p class="team-ui__error">{{ loadError }}</p>
        <button
          class="team-ui__button"
          type="button"
          :disabled="loading || jobActive || !!watchJobID"
          @click="initialize"
        >
          重新读取
        </button>
      </div>
      <section v-if="info" class="system-page__section" aria-labelledby="system-version-heading">
        <h2 id="system-version-heading">当前版本</h2>
        <dl class="system-page__versions">
          <div>
            <dt>应用版本</dt>
            <dd>{{ info.version }}</dd>
          </div>
          <div>
            <dt>数据版本</dt>
            <dd>{{ info.schemaVersion }}</dd>
          </div>
        </dl>
        <p v-if="!info.upgradeEnabled" class="team-ui__hint" role="status">
          此环境尚未启用离线升级，请联系维护人员完成配置后重新读取。
        </p>
        <p v-else-if="!info.canUpgrade" class="team-ui__hint" role="status">
          当前账号没有升级权限，请联系维护人员。
        </p>
      </section>
      <section class="system-page__section" aria-labelledby="system-import-heading">
        <h2 id="system-import-heading">导入升级包</h2>
        <p id="system-package-help" class="team-ui__hint">
          选择已签名的 .tar.gz、.tgz 或 .tar 离线升级包，最大 2
          GiB。导入仅校验并保存升级包，不会开始升级。
        </p>
        <div class="team-ui__field">
          <label for="system-package">升级包</label>
          <input
            id="system-package"
            ref="packageInput"
            class="system-page__file"
            type="file"
            accept=".tar.gz,.tgz,.tar"
            :disabled="!allowed || locked || !!pendingRequest"
            :aria-invalid="!!uploadError"
            aria-describedby="system-package-help system-package-feedback"
            @change="selectPackage"
          />
        </div>
        <p v-if="packageFile" class="team-ui__hint">
          {{ packageFile.name }} · {{ formatBytes(packageFile.size) }}
        </p>
        <div v-if="uploading" class="system-page__progress" role="status">
          <progress :value="uploadedBytes" :max="uploadTotal || 1" aria-label="升级包上传进度" />
          <span
            >{{ formatBytes(uploadedBytes) }} / {{ formatBytes(uploadTotal)
            }}{{ uploadedBytes >= uploadTotal ? ' · 正在校验升级包…' : '' }}</span
          >
        </div>
        <div
          id="system-package-feedback"
          class="system-page__feedback"
          :role="uploadError ? 'alert' : 'status'"
        >
          <p v-if="uploadError" class="team-ui__error">{{ uploadError }}</p>
          <p v-else-if="uploadMessage">{{ uploadMessage }}</p>
        </div>
        <div class="team-ui__actions">
          <button
            class="team-ui__button"
            type="button"
            :disabled="!allowed || locked || !!pendingRequest || !packageValid"
            :aria-busy="uploading"
            @click="importPackage"
          >
            {{ uploadError && packageFile ? '重试导入' : '导入升级包' }}
          </button>
          <button v-if="uploading" class="team-ui__button" type="button" @click="cancelUpload">
            取消导入
          </button>
        </div>
      </section>
      <section class="system-page__section" aria-labelledby="system-release-heading">
        <div class="system-page__heading">
          <h2 id="system-release-heading">选择升级版本</h2>
          <button
            class="team-ui__button"
            type="button"
            :disabled="releasesLoading || locked || !info"
            @click="loadReleases"
          >
            刷新版本
          </button>
        </div>
        <p v-if="releasesLoading" class="team-ui__hint" role="status">正在读取已导入的版本…</p>
        <p v-if="releasesError" class="team-ui__error" role="alert">
          {{ releasesError }}，请刷新版本重试。
        </p>
        <p v-else-if="!releasesLoading && !releases.length" class="team-ui__hint">
          还没有已导入的版本。先导入升级包，再选择目标版本。
        </p>
        <div v-if="releases.length" class="team-ui__field">
          <label for="system-release">目标版本</label>
          <select
            id="system-release"
            v-model="selectedVersion"
            class="team-ui__input"
            :disabled="!allowed || locked || !!pendingRequest || releasesLoading"
            aria-describedby="system-release-help"
          >
            <option value="">选择已导入的版本</option>
            <option
              v-for="release in releases"
              :key="release.version"
              :value="release.version"
              :disabled="!isCompatible(release)"
            >
              {{ release.version
              }}{{
                release.version === info?.version
                  ? ' · 当前版本'
                  : !isCompatible(release)
                    ? ' · 与当前版本不兼容'
                    : ''
              }}
            </option>
          </select>
        </div>
        <p id="system-release-help" class="team-ui__hint">
          仅可选择支持从当前应用版本升级的离线包。开始前请通知其他使用者暂停编辑。
        </p>
        <div v-if="selectedRelease" class="system-page__release">
          <p class="team-ui__hint">
            发布于 {{ formatDate(selectedRelease.createdAt) }} · 数据版本
            {{ selectedRelease.schemaVersion }}
          </p>
          <p class="system-page__notes">{{ selectedRelease.notes || '此版本没有更新说明。' }}</p>
        </div>
        <p v-if="startError" class="team-ui__error" role="alert">{{ startError }}</p>
        <p v-if="pendingRequest && !starting && !jobActive" class="team-ui__hint">
          启动结果尚未确认。重试会使用同一请求标识，避免重复升级。
        </p>
        <button
          class="team-ui__button team-ui__button--primary"
          type="button"
          :disabled="
            !allowed ||
            locked ||
            (!pendingRequest && (!selectedRelease || !isCompatible(selectedRelease)))
          "
          :aria-busy="starting"
          @click="startUpgrade"
        >
          {{ pendingRequest && !starting ? '重试确认启动' : '开始升级' }}
        </button>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import SvgIcon from '@/components/SvgIcon.vue';
import { useConfirm } from '@/composables/useConfirm';
import { MessageType } from '@/constant/status';
import { authUser, authenticated } from '@/service/auth-session';
import { refreshSession } from '@/service/api/https';
import { errorMessage } from '@/utils/error';
import {
  getSystemInfo,
  listSystemReleases,
  getCurrentSystemUpgrade,
  uploadSystemPackage,
  startSystemUpgrade,
  watchSystemUpgrade,
  UpgradeWatchError,
  MAX_UPGRADE_PACKAGE_BYTES,
  readSavedUpgradeWatch,
  UPGRADE_WATCH_STORAGE_KEY,
  type SystemInfo,
  type SystemRelease,
  type UpgradeJob,
} from '@/service/api/system-api';

const { confirm } = useConfirm();
const info = ref<SystemInfo | null>(null);
const loading = ref(false);
const discovering = ref(false);
const loadError = ref('');
const releases = ref<SystemRelease[]>([]);
const releasesLoading = ref(false);
const releasesError = ref('');
const selectedVersion = ref('');
const packageInput = ref<HTMLInputElement>();
const packageFile = ref<File | null>(null);
const packageValid = computed(
  () =>
    !!packageFile.value &&
    isPackageName(packageFile.value.name) &&
    packageFile.value.size > 0 &&
    packageFile.value.size <= MAX_UPGRADE_PACKAGE_BYTES
);
const uploading = ref(false);
const uploadedBytes = ref(0);
const uploadTotal = ref(0);
const uploadError = ref('');
const uploadMessage = ref('');
const starting = ref(false);
const startError = ref('');
const pendingRequest = ref<{ version: string; id: string } | null>(null);
const job = ref<UpgradeJob | null>(null);
const watchJobID = ref('');
const watchError = ref('');
const watchAuthFailed = ref(false);
const storageError = ref('');
const allowed = computed(
  () => authenticated.value && !!info.value?.upgradeEnabled && info.value.canUpgrade
);
const jobActive = computed(() => job.value?.status === 'queued' || job.value?.status === 'running');
const locked = computed(
  () =>
    loading.value ||
    discovering.value ||
    uploading.value ||
    starting.value ||
    jobActive.value ||
    !!watchJobID.value
);
const selectedRelease = computed(() =>
  releases.value.find((release) => release.version === selectedVersion.value)
);
const statusLabels: Record<UpgradeJob['status'], string> = {
  queued: '升级已排队',
  running: '正在升级',
  succeeded: '升级成功',
  failed: '升级失败',
  interrupted: '升级已中断',
};
let watchToken = '';
let accountID: string | undefined;
let firstAccountRead = true;
let disposed = false;
let generation = 0;
let infoController: AbortController | undefined;
let releasesController: AbortController | undefined;
let uploadController: AbortController | undefined;
let startController: AbortController | undefined;
let statusController: AbortController | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollFailures = 0;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString('zh-CN')} B`;
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${(bytes / 1024 ** unit).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未记录' : date.toLocaleString('zh-CN');
}
function stepLabel(task: UpgradeJob) {
  if (task.status === 'succeeded') return '新版本已通过检查，服务已恢复。';
  if (task.status === 'failed' || task.status === 'interrupted')
    return '请根据下方结果确认服务状态。';
  const labels: Record<string, string> = {
    queued: '正在等待升级',
    validating: '正在校验升级包',
    backup: '正在备份升级前的数据',
    stopping: '正在暂停服务',
    migrating: '正在更新数据',
    starting: '正在启动新版本',
    healthcheck: '正在检查服务',
    rollback: '正在恢复升级前的版本',
    completed: '正在确认升级结果',
  };
  return labels[task.step] || '正在处理升级，请稍候。';
}
function isCompatible(release: SystemRelease) {
  return (
    !!info.value &&
    release.version !== info.value.version &&
    release.fromVersions.includes(info.value.version)
  );
}
function clearStoredWatch() {
  try {
    sessionStorage.removeItem(UPGRADE_WATCH_STORAGE_KEY);
  } catch {
    /* Storage may be disabled. */
  }
}
function persistWatch() {
  try {
    sessionStorage.setItem(
      UPGRADE_WATCH_STORAGE_KEY,
      JSON.stringify({ accountID, jobID: watchJobID.value, token: watchToken })
    );
    storageError.value = '';
  } catch {
    storageError.value = '浏览器无法保存任务进度，请保持此页打开；返回本页后也可重新读取当前任务。';
  }
}
function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = undefined;
  statusController?.abort();
}
function acceptJob(task: UpgradeJob, token?: string) {
  watchAuthFailed.value = false;
  job.value = task;
  pendingRequest.value = null;
  startError.value = '';
  if (task.status === 'queued' || task.status === 'running') {
    if (token) {
      watchJobID.value = task.id;
      watchToken = token;
      persistWatch();
      pollNow();
    } else {
      watchAuthFailed.value = !!watchJobID.value;
      watchError.value = '任务正在运行，暂时无法读取进度，请稍后重新读取。';
    }
  } else {
    stopPolling();
    watchJobID.value = '';
    watchToken = '';
    watchError.value = '';
    storageError.value = '';
    clearStoredWatch();
  }
}
async function pollStatus() {
  if (disposed || !watchJobID.value || !watchToken) return;
  const current = generation;
  const taskID = watchJobID.value;
  const request = new AbortController();
  statusController = request;
  const timeout = setTimeout(() => request.abort(), 15000);
  try {
    const result = await watchSystemUpgrade(taskID, watchToken, request.signal);
    if (disposed || current !== generation || taskID !== watchJobID.value) return;
    if (result.job.id !== taskID) throw new Error('升级状态暂时不可用，正在重新连接');
    job.value = result.job;
    watchError.value = '';
    pollFailures = 0;
    if (result.job.status !== 'queued' && result.job.status !== 'running') {
      acceptJob(result.job);
      void restoreIdentity();
      return;
    }
  } catch (cause) {
    if (disposed || current !== generation || statusController !== request) return;
    pollFailures++;
    watchAuthFailed.value =
      cause instanceof UpgradeWatchError &&
      (cause.status === 401 || cause.status === 403 || cause.status === 404);
    watchError.value =
      cause instanceof Error && cause.name !== 'AbortError' && !(cause instanceof TypeError)
        ? cause.message
        : '连接暂时中断，正在重新连接；升级任务会继续。';
  } finally {
    clearTimeout(timeout);
    if (statusController === request) {
      statusController = undefined;
      if (!disposed && current === generation && watchJobID.value && !watchAuthFailed.value)
        pollTimer = setTimeout(
          () => void pollStatus(),
          Math.min(10000, 2000 + pollFailures * 2000)
        );
    }
  }
}
function pollNow() {
  stopPolling();
  statusController = undefined;
  void pollStatus();
}
async function recoverTask() {
  if (discovering.value) return;
  const current = generation;
  discovering.value = true;
  try {
    if (!authenticated.value) await refreshSession();
    if (disposed || current !== generation) return;
    const request = new AbortController();
    infoController = request;
    const result = await getCurrentSystemUpgrade(request.signal);
    if (disposed || current !== generation || request.signal.aborted) return;
    if (result.job) {
      acceptJob(result.job, result.watchToken);
      if (!jobActive.value) await loadResources();
    } else {
      stopPolling();
      watchJobID.value = '';
      watchToken = '';
      clearStoredWatch();
      watchError.value = '';
      watchAuthFailed.value = false;
      job.value = null;
      await loadResources();
      if (!disposed && current === generation)
        loadError.value = '未找到当前任务，请核对服务状态后重试。';
    }
  } catch (cause) {
    if (!disposed && current === generation)
      watchError.value = errorMessage(cause, '任务读取失败，请在服务恢复后重试');
  } finally {
    if (current === generation) discovering.value = false;
  }
}
async function restoreIdentity() {
  const current = generation;
  try {
    if (!authenticated.value) await refreshSession();
    if (!disposed && current === generation) await loadResources();
  } catch {
    if (!disposed && current === generation)
      loadError.value = '任务已结束，暂时无法恢复登录会话。请在服务恢复后重新加载页面。';
  }
}
async function loadReleases() {
  releasesController?.abort();
  const request = new AbortController();
  releasesController = request;
  releasesLoading.value = true;
  releasesError.value = '';
  try {
    const result = await listSystemReleases(request.signal);
    if (request.signal.aborted || disposed) return;
    releases.value = result.items;
    if (
      !pendingRequest.value &&
      !result.items.some((release) => release.version === selectedVersion.value)
    )
      selectedVersion.value = '';
  } catch (cause) {
    if (!request.signal.aborted && !disposed)
      releasesError.value = errorMessage(cause, '版本列表读取失败');
  } finally {
    if (releasesController === request) releasesLoading.value = false;
  }
}
async function loadResources() {
  infoController?.abort();
  const request = new AbortController();
  infoController = request;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getSystemInfo(request.signal);
    if (!request.signal.aborted && !disposed) info.value = result;
  } catch (cause) {
    if (!request.signal.aborted && !disposed)
      loadError.value = errorMessage(cause, '系统信息读取失败');
  } finally {
    if (infoController === request) loading.value = false;
  }
  if (!request.signal.aborted && !disposed) await loadReleases();
}
async function initialize() {
  if (pendingRequest.value) return;
  if (!authenticated.value) {
    await restoreIdentity();
    return;
  }
  if (discovering.value) return;
  const current = generation;
  discovering.value = true;
  await loadResources();
  if (disposed || current !== generation || watchJobID.value || !info.value) {
    if (current === generation) discovering.value = false;
    return;
  }
  const request = infoController;
  try {
    const result = await getCurrentSystemUpgrade(request?.signal);
    if (disposed || current !== generation || request?.signal.aborted) return;
    if (result.job) acceptJob(result.job, result.watchToken);
  } catch (cause) {
    if (!disposed && current === generation && !request?.signal.aborted)
      loadError.value = errorMessage(cause, '当前升级任务读取失败');
  } finally {
    if (current === generation) discovering.value = false;
  }
}
function isPackageName(name: string) {
  return /\.(tar|tar\.gz|tgz)$/i.test(name);
}
function selectPackage(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0] ?? null;
  packageFile.value = selected;
  uploadMessage.value = '';
  uploadError.value =
    selected && !isPackageName(selected.name)
      ? '请选择 .tar.gz、.tgz 或 .tar 离线升级包。'
      : selected && selected.size > MAX_UPGRADE_PACKAGE_BYTES
        ? '升级包不能超过 2 GiB，请选择符合限制的离线包。'
        : selected && !selected.size
          ? '升级包为空，请重新选择。'
          : '';
}
async function importPackage() {
  const selected = packageFile.value;
  if (!selected || !allowed.value || locked.value || pendingRequest.value) return;
  if (!isPackageName(selected.name) || selected.size > MAX_UPGRADE_PACKAGE_BYTES || !selected.size)
    return;
  const current = generation;
  const request = new AbortController();
  uploadController = request;
  uploading.value = true;
  uploadError.value = '';
  uploadMessage.value = '';
  uploadedBytes.value = 0;
  uploadTotal.value = selected.size;
  try {
    const result = await uploadSystemPackage(selected, {
      signal: request.signal,
      onProgress: (loaded, total) => {
        if (current === generation && !request.signal.aborted) {
          uploadedBytes.value = loaded;
          uploadTotal.value = total ?? selected.size;
        }
      },
    });
    if (disposed || current !== generation || request.signal.aborted) return;
    uploadMessage.value = `版本 ${result.release.version} 已导入并通过校验。选择版本后可开始升级。`;
    packageFile.value = null;
    if (packageInput.value) packageInput.value.value = '';
    await loadReleases();
    if (!disposed && current === generation) selectedVersion.value = result.release.version;
  } catch (cause) {
    if (!disposed && current === generation && !request.signal.aborted)
      uploadError.value = errorMessage(cause, '升级包导入失败，请重试');
  } finally {
    if (uploadController === request) uploading.value = false;
  }
}
function cancelUpload() {
  uploadController?.abort();
  uploading.value = false;
  uploadError.value = '导入已取消，可重新导入所选升级包。';
}
function requestUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function startUpgrade() {
  if (
    !allowed.value ||
    locked.value ||
    (!pendingRequest.value && (!selectedRelease.value || !isCompatible(selectedRelease.value)))
  )
    return;
  const current = generation;
  const version = pendingRequest.value?.version ?? selectedRelease.value!.version;
  starting.value = true;
  startError.value = '';
  try {
    if (!pendingRequest.value) {
      const accepted = await confirm({
        type: MessageType.WARNING,
        title: `升级到 ${version}`,
        content: `开始升级后将暂停服务，其他使用者需要停止编辑。系统会先备份现有数据；升级失败时可能恢复升级前的版本和数据。请确认已安排维护时间，并保留必要的独立备份。`,
        confirmText: '开始升级',
        cancelText: '暂不升级',
      });
      if (!accepted || disposed || current !== generation) return;
      pendingRequest.value = { version, id: requestUUID() };
    }
    const request = new AbortController();
    startController = request;
    const result = await startSystemUpgrade(version, pendingRequest.value.id, request.signal);
    if (disposed || current !== generation || request.signal.aborted) return;
    acceptJob(result.job, result.watchToken);
  } catch (cause) {
    if (!disposed && current === generation)
      startError.value = errorMessage(cause, '启动升级失败，请重试确认结果');
  } finally {
    if (current === generation) starting.value = false;
  }
}
function reloadPage() {
  window.location.reload();
}
function cancelRequests() {
  stopPolling();
  infoController?.abort();
  releasesController?.abort();
  uploadController?.abort();
  startController?.abort();
}
watch(
  () => authUser.value?.id,
  (id) => {
    const saved = firstAccountRead ? readSavedUpgradeWatch() : null;
    const initialRead = firstAccountRead;
    firstAccountRead = false;
    if (id && id === accountID && (watchJobID.value || job.value)) {
      if (!watchJobID.value) void loadResources();
      return;
    }
    generation++;
    cancelRequests();
    if (!initialRead || (saved && id && saved.accountID !== id)) clearStoredWatch();
    accountID = id;
    info.value = null;
    releases.value = [];
    selectedVersion.value = '';
    job.value = null;
    watchJobID.value = '';
    watchToken = '';
    pendingRequest.value = null;
    uploading.value = false;
    starting.value = false;
    discovering.value = false;
    packageFile.value = null;
    uploadError.value = '';
    uploadMessage.value = '';
    startError.value = '';
    watchError.value = '';
    watchAuthFailed.value = false;
    storageError.value = '';
    if (packageInput.value) packageInput.value.value = '';
    document.title = '系统升级 · Voex';
    if (initialRead && saved && (!id || saved.accountID === id)) {
      accountID = saved.accountID;
      watchJobID.value = saved.jobID;
      watchToken = saved.token;
      pollNow();
      return;
    }
    clearStoredWatch();
    if (id) void initialize();
  },
  { immediate: true }
);
onBeforeRouteLeave(
  async () =>
    !starting.value &&
    (!uploading.value ||
      (await confirm({
        title: '离开升级包导入',
        content: '离开会中止本次导入。已经完成校验的升级包会保留，可返回此页查看。',
        confirmText: '离开并中止',
        cancelText: '继续导入',
      })))
);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  cancelRequests();
});
</script>

<style scoped lang="stylus">
@import '../../components/team/team.styl'
.system-page
  position relative
  z-index 1
  display flex
  flex-direction column
  height 100%
  min-height 0
  &__header
    display flex
    align-items center
    justify-content space-between
    flex-wrap wrap
    gap 12px
    flex-shrink 0
    padding 22px 24px
    border-bottom 1px solid var(--color-border-translucent)
    h1
      margin 0
      font-size 20px
      color var(--color-text-primary)
    p
      margin 5px 0 0
  &__body
    min-height 0
    overflow-y auto
    scrollbar-gutter stable
    padding 0 24px 24px
  &__section
    max-width 760px
    padding 24px 0
    border-bottom 1px solid var(--color-border-translucent)
    h2
      margin 0 0 12px
      color var(--color-text-primary)
      font-size 15px
      font-weight 600
    p
      margin 8px 0 12px
  &__heading
    display flex
    align-items center
    justify-content space-between
    flex-wrap wrap
    gap 12px
    margin-bottom 12px
    h2
      margin 0
  &__task
    border-left 2px solid var(--color-accent)
    padding-left 16px
    margin-top 24px
  &__versions
    display flex
    flex-wrap wrap
    gap 24px 64px
    margin 0
    dt
      color var(--color-text-tertiary)
      font-size 12px
    dd
      margin 4px 0 0
      color var(--color-text-primary)
      font-size 17px
      font-variant-numeric tabular-nums
      overflow-wrap anywhere
  &__file
    max-width 100%
    font inherit
    color var(--color-text-secondary)
    cursor pointer
    &::file-selector-button
      padding 6px 12px
      margin-right 12px
      border 1px solid var(--color-border-primary)
      border-radius 6px
      background var(--color-bg-translucent)
      color var(--color-text-primary)
      font inherit
      cursor pointer
    &:hover:not(:disabled)::file-selector-button
      background var(--color-bg-quaternary)
    &:active:not(:disabled)::file-selector-button
      opacity .8
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:disabled
      opacity .5
      cursor not-allowed
  &__feedback
    min-height 24px
    overflow-wrap anywhere
  &__progress
    display grid
    gap 8px
    font-size 12px
    font-variant-numeric tabular-nums
    progress
      width 100%
      height 8px
      accent-color var(--color-accent)
  &__notes, &__message
    white-space pre-wrap
    overflow-wrap anywhere
  &__release
    padding 0 0 12px
  select
    cursor pointer
    &:hover:not(:disabled)
      border-color var(--color-accent)
    &:disabled
      opacity .5
      cursor not-allowed
@media (max-width: 700px)
  .system-page__header
    padding 16px
  .system-page__body
    padding 0 16px 24px
</style>
