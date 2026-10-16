<template>
  <div
    ref="shortcutScope"
    class="edit-page"
    :class="{ 'edit-page--mobile': isMobile }"
    @keydown.capture="handleEditorActivity"
    @pointerdown.capture="handleEditorActivity"
    @input.capture="handleEditorActivity"
    @wheel.capture.passive="handleEditorActivity"
    @compositionstart.capture="handleCompositionStart"
    @compositionend.capture="handleCompositionEnd"
  >
    <nav
      class="edit-page__rail"
      :class="{ 'edit-page__rail--loading': !workspaceReady }"
      :inert="!workspaceReady"
      :aria-hidden="!workspaceReady"
      aria-label="编辑页操作"
    >
      <button
        ref="aiPanelButton"
        type="button"
        class="edit-page__icon-button"
        title="AI（A）"
        aria-label="AI"
        aria-keyshortcuts="A"
        :aria-expanded="activePanel === 'ai'"
        aria-controls="editor-side-panel"
        :disabled="!documentReady"
        @click="togglePanel('ai', $event)"
      >
        <SvgIcon name="ai" :size="20" />
      </button>
      <button
        ref="fileListButton"
        type="button"
        class="edit-page__icon-button"
        title="项目列表（L）"
        aria-label="项目列表"
        aria-keyshortcuts="L"
        :aria-expanded="activePanel === 'projects'"
        aria-controls="editor-side-panel"
        @click="togglePanel('projects', $event)"
      >
        <SvgIcon name="folder" :size="20" />
      </button>
      <button
        type="button"
        class="edit-page__icon-button"
        title="导出"
        aria-label="导出"
        :disabled="!documentReady || busy"
        @click="handleExportDocument"
      >
        <SvgIcon name="download" :size="18" />
      </button>
      <button
        type="button"
        class="edit-page__icon-button"
        :title="canShare ? '分享' : '分享（需要项目分享权限）'"
        aria-label="分享"
        :disabled="!documentReady || !canShare || busy"
        @click="showShare = true"
      >
        <SvgIcon name="share" :size="18" />
      </button>
      <button
        ref="attachmentListButton"
        type="button"
        class="edit-page__icon-button"
        title="附件（F）"
        aria-label="附件"
        aria-keyshortcuts="F"
        :aria-expanded="activePanel === 'attachments'"
        aria-controls="editor-side-panel"
        :disabled="!documentReady"
        @click="togglePanel('attachments', $event)"
      >
        <SvgIcon name="attachment" :size="20" />
      </button>
      <DownloadQueue variant="popover" />
      <button
        v-if="isDev"
        ref="debugToolButton"
        type="button"
        class="edit-page__icon-button"
        :title="exportingSchema ? '正在读取已保存的文档数据' : 'debugTool'"
        aria-label="debugTool"
        aria-haspopup="menu"
        :aria-expanded="debugMenuOpen"
        :aria-busy="exportingSchema"
        :disabled="exportingSchema || !documentReady"
        @click="toggleDebugMenu"
        @keydown.down.prevent="toggleDebugMenu"
      >
        <SvgIcon name="bug" :size="18" />
      </button>
      <RouterLink
        :to="desktopLocation(undefined, undefined, projectTree?.project.team_key)"
        class="edit-page__icon-button"
        title="返回主页"
        aria-label="返回主页"
      >
        <SvgIcon name="home" :size="18" />
      </RouterLink>
    </nav>

    <!-- Center: Editor -->
    <main class="edit-page__center">
      <div class="edit-page__header">
        <div class="edit-page__heading">
          <span
            class="edit-page__title"
            :title="activeDoc?.file_name"
            @dblclick="activeDoc && handleRenameDoc(activeDoc)"
          >
            {{ activeDoc?.file_name || (documentLoading ? '正在加载文档…' : '请选择文档') }}
          </span>
          <span
            v-if="documentReady"
            class="edit-page__sync-status"
            :class="{ 'edit-page__sync-status--error': !!saveError && !showSavingAnimation }"
            role="img"
            :aria-label="syncStatus"
            :title="syncStatus"
          >
            <SvgIcon v-if="showSavingAnimation" name="sync" :size="16" class="edit-page__spinner" />
            <template v-else>
              <SvgIcon name="cloud" :size="20" />
              <span class="edit-page__heartbeat" aria-hidden="true" />
            </template>
          </span>
        </div>
      </div>
      <div v-if="saveError" class="edit-page__save-error" role="alert">
        <p>{{ saveError }}</p>
        <div>
          <button
            type="button"
            class="edit-page__button edit-page__button--secondary"
            @click="showDraft = true"
          >
            复制本地内容
          </button>
          <button
            v-if="saveConflict"
            type="button"
            class="edit-page__button edit-page__button--secondary"
            :disabled="saving"
            @click="reloadAfterSaveError"
          >
            重新加载
          </button>
          <button
            v-else
            type="button"
            class="edit-page__button edit-page__button--secondary"
            :disabled="saving"
            @click="retrySave"
          >
            重试保存
          </button>
        </div>
      </div>
      <div class="edit-page__body" :aria-busy="documentLoading">
        <div v-if="documentLoading" class="edit-page__loading">
          <LoadingSkeleton variant="document" label="正在加载文档正文" />
        </div>
        <div
          v-if="displayedDocument && (!editorLoadError || workspaceReady)"
          class="edit-page__editor"
          :class="{ 'edit-page__editor--loading': !documentReady }"
          :inert="!workspaceReady"
          :aria-hidden="!workspaceReady"
        >
          <MilkdownProvider :key="displayedDocument.instance">
            <MilkdownEditor
              ref="editorRef"
              :default-value="displayedDocument.document.file_content ?? ''"
              :document-key="displayedDocument.document.file_key"
              :attachments="attachments"
              :upload-attachments="triggerFileUpload"
              :import-images="importImages"
              :load-image="loadImage"
              :on-preview-attachment="handlePreviewAttachment"
              :readonly="!documentReady || !canWrite || aiBusy"
              :loading="!documentReady"
              :show-toolbar="workspaceReady && !isMobile"
              @ready="displayedDocument.onReady"
              @load-error="displayedDocument.onError"
              @change="displayedDocument.onChange"
            />
          </MilkdownProvider>
        </div>
        <div
          v-if="pageLoadError || (!documentLoading && !displayedDocument)"
          class="edit-page__placeholder"
          :class="{ 'edit-page__placeholder--over-editor': displayedDocument && workspaceReady }"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p role="status">{{ pageLoadError || '文件不存在' }}</p>
          <button
            v-if="pageLoadError"
            class="edit-page__button edit-page__button--secondary"
            @click="loadDocument"
          >
            重新加载
          </button>
          <RouterLink :to="{ name: 'home' }">返回主页</RouterLink>
        </div>
      </div>
    </main>

    <VoexDrawer
      id="editor-side-drawer"
      :enabled="isMobile"
      :model-value="panelReady && !!activePanel"
      :title="panelTitle"
      side="right"
      :width="activePanel === 'ai' ? 380 : 320"
      @update:model-value="!$event && closePanel()"
    >
      <Transition
        name="edit-panel"
        :duration="{ enter: reducedMotion ? 0 : 300, leave: reducedMotion ? 0 : 200 }"
        @before-enter="panelOpening = true"
        @after-enter="handlePanelOpened"
        @enter-cancelled="panelOpening = false"
      >
        <section
          v-show="panelReady && activePanel"
          id="editor-side-panel"
          ref="sidePanel"
          class="edit-page__panel"
          :class="{
            'edit-page__panel--ai': activePanel === 'ai',
            'edit-page__panel--mobile': isMobile,
            'edit-page__panel--loading': !panelReady,
          }"
          :aria-label="panelTitle"
          :inert="!panelReady || !activePanel || panelOpening"
          tabindex="-1"
          @keydown.esc="handlePanelEscape"
        >
          <div class="edit-page__panel-content">
            <AIEditorPanel
              v-if="aiMounted"
              v-show="activePanel === 'ai'"
              :document-key="activeDocKey"
              :document-name="activeDoc?.file_name ?? ''"
              :can-write="canWrite"
              :busy="busy || saving || loading || dirty || aiBusy"
              :prepare="prepareAIDocument"
              :apply="applyDocumentReview"
              :normalize="normalizeAIContent"
              :capabilities="aiCapabilities"
              @close="closePanel"
            />
            <EditorLeftContainer
              v-show="activePanel === 'projects'"
              :mobile="isMobile"
              :tree="projectTree"
              :active-doc-key="activeDocKey"
              :loading="loading"
              :creating="creating"
              :busy="busy"
              :error="loadError"
              @toggle="closePanel"
              @create="handleCreateDoc"
              @delete="handleDeleteDoc"
              @rename="handleRenameDoc"
            />
            <AttachmentPanel
              v-show="activePanel === 'attachments'"
              :mobile="isMobile"
              :can-upload="canWrite && !busy"
              :attachments="attachments"
              :uploading-files="uploadingFiles"
              :active-doc-key="activeDocKey"
              :is-dragging="isDragging"
              @close="closePanel"
              @upload="triggerFileUpload"
              @update:is-dragging="isDragging = $event"
              @download="handleAttachmentDownload"
              @delete="handleDeleteAttachment"
              @insert="handleInsertAttachment"
              @preview="handlePreviewAttachment"
              @drop="handleDrop"
            />
          </div>
        </section>
      </Transition>
    </VoexDrawer>
    <VoexContextMenu
      v-if="isDev"
      v-model="debugMenuOpen"
      :items="debugMenuItems"
      :x="debugMenuPosition.x"
      :y="debugMenuPosition.y"
      :trigger="debugToolButton"
      label="debugTool"
      @select="handleDebugAction"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onErrorCaptured, ref, shallowRef, watch } from 'vue';
import AIEditorPanel from '@/components/ai/AIEditorPanel.vue';
import LoadingSkeleton from '@/components/LoadingSkeleton.vue';
import type { FileCapabilities } from '@/agent/editor-tools';
import SvgIcon from '@/components/SvgIcon.vue';
import VoexDrawer from '@/components/VoexDrawer.vue';
import DownloadQueue from '@/components/DownloadQueue.vue';
import { useDownloadStore } from '@/stores/download';
import { desktopLocation } from '@/utils/workspace';
import { isMobile } from '@/utils/platform';
import MilkdownEditor from '@/views/edit/milkdown/MilkdownEditor.vue';
import EditorLeftContainer from '@/views/edit/EditorLeftContainer.vue';
import AttachmentPanel from '@/views/edit/AttachmentPanel.vue';
import { useDocumentPage } from '@/composables/useDocumentPage';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { MilkdownProvider } from '@milkdown/vue';
import { getDocument, type DocumentInfo, type FileInfo } from '@/service/api/document-api';
import http from '@/service/api/https';
import { useConfirm } from '@/composables/useConfirm';
import { useDialog } from '@/composables/useDialog';
import { ModalType } from '@/stores/modal';
import { MessageType } from '@/constant/status';
import { useNotificationStore } from '@/stores/notification';
import { errorMessage } from '@/utils/error';
import type { ApiError } from '@/service/api/index';
import {
  VoexContextMenu,
  type ContextMenuItem,
  type ContextMenuOption,
} from '@/plugins/context-menu';

const isDev = import.meta.env.DEV;
const debugToolButton = ref<HTMLButtonElement | null>(null);
const debugMenuOpen = ref(false);
const debugMenuPosition = ref({ x: 0, y: 0 });
const exportingSchema = ref(false);
let schemaExportController: AbortController | undefined;
type EditorPanel = 'ai' | 'projects' | 'attachments';
const shortcutScope = ref<HTMLElement | null>(null);
const aiPanelButton = ref<HTMLButtonElement | null>(null);
const fileListButton = ref<HTMLButtonElement | null>(null);
const attachmentListButton = ref<HTMLButtonElement | null>(null);
const activePanel = ref<EditorPanel | null>(null);
const sidePanel = ref<HTMLElement | null>(null);
const panelOpening = ref(false);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = ref(motionPreference.matches);
function updateMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
motionPreference.addEventListener('change', updateMotionPreference);
onBeforeUnmount(() => motionPreference.removeEventListener('change', updateMotionPreference));
const panelTrigger = ref<HTMLButtonElement | null>(null);
const downloadStore = useDownloadStore();
const panelTitle = computed(() =>
  activePanel.value === 'ai'
    ? 'AI 文档助手'
    : activePanel.value === 'projects'
      ? '项目列表'
      : '附件'
);
const showShare = ref(false);
const showDraft = ref(false);
const aiMounted = ref(false);
watch(activePanel, (panel) => {
  if (panel === 'ai') aiMounted.value = true;
});

async function togglePanel(panel: EditorPanel, event: MouseEvent) {
  if (activePanel.value === panel) {
    closePanel();
    return;
  }
  await openPanel(panel, event.currentTarget as HTMLButtonElement);
}

async function openPanel(panel: EditorPanel, trigger: HTMLButtonElement | null) {
  if (activePanel.value === panel || !trigger || trigger.disabled) return;
  if (!documentReady.value && panel !== 'projects') return;
  panelTrigger.value = trigger;
  trigger.focus({ preventScroll: true });
  downloadStore.expanded = false;
  activePanel.value = panel;
  await nextTick();
  if (!isMobile && !panelOpening.value) sidePanel.value?.focus({ preventScroll: true });
}

async function handlePanelOpened() {
  panelOpening.value = false;
  await nextTick();
  if (
    !isMobile &&
    documentReady.value &&
    activePanel.value &&
    !downloadStore.expanded &&
    document.activeElement === panelTrigger.value
  )
    sidePanel.value?.focus({ preventScroll: true });
}

function closePanel() {
  activePanel.value = null;
  if (!isMobile) void nextTick(() => panelTrigger.value?.focus({ preventScroll: true }));
}

function handlePanelEscape(event: KeyboardEvent) {
  if (isMobile || downloadStore.expanded || event.defaultPrevented || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  closePanel();
}
const notification = useNotificationStore();
const { confirm } = useConfirm();

const {
  projectTree,
  activeDocKey,
  attachments,
  uploadingFiles,
  loading,
  loadError,
  creating,
  busy,
  aiBusy,
  prepareAIDocument,
  applyDocumentReview,
  dirty,
  canWrite,
  saving,
  saveError,
  saveConflict,
  canShare,
  currentContent,
  retrySave,
  reloadAfterSaveError,
  isDragging,
  editorRef,
  activeDoc,
  editorReady,
  handleEditorReady,
  handleEditorChange,
  handleEditorActivity,
  handleCompositionStart,
  handleCompositionEnd,
  loadDocument,
  handleCreateDoc,
  handleDeleteDoc,
  handleRenameDoc,
  handleDownload,
  handlePreview,
  handleDeleteAttachment,
  triggerFileUpload,
  importImages,
  loadImage,
  handleDrop,
} = useDocumentPage();

const workspaceReady = ref(false);
const displayedDocument = shallowRef<{
  document: DocumentInfo;
  instance: number;
  onReady: (markdown: string) => void;
  onError: (message: string) => void;
  onChange: (markdown: string) => void;
} | null>(null);
let editorInstance = 0;
watch(
  activeDoc,
  (doc) => {
    if (!doc) return;
    const previous = displayedDocument.value;
    const instance =
      !previous || loading.value || previous.document.file_key !== doc.file_key
        ? ++editorInstance
        : previous.instance;
    const ownsEditor = () =>
      activeDoc.value === doc && displayedDocument.value?.instance === instance;
    displayedDocument.value = {
      document: doc,
      instance,
      onReady: (markdown) => {
        if (ownsEditor()) handleEditorReady(markdown);
      },
      onError: (message) => {
        if (ownsEditor()) editorLoadError.value = message;
      },
      onChange: (markdown) => {
        if (ownsEditor() && documentReady.value) handleEditorChange(markdown);
      },
    };
  },
  { flush: 'sync', immediate: true }
);

const editorLoadError = ref('');
const pageLoadError = computed(() => loadError.value || editorLoadError.value);
const documentReady = computed(
  () => !pageLoadError.value && !loading.value && editorReady.value && !!activeDocKey.value
);
const panelReady = computed(() => documentReady.value || activePanel.value === 'projects');
const documentLoading = computed(
  () => !pageLoadError.value && (loading.value || (!!activeDocKey.value && !editorReady.value))
);
onErrorCaptured(() => {
  if (!activeDocKey.value || editorReady.value) return;
  editorLoadError.value = '编辑器初始化失败，请重新加载文档。';
  return false;
});
watch(
  documentReady,
  (ready) => {
    if (ready) workspaceReady.value = true;
    else downloadStore.expanded = false;
  },
  { flush: 'sync' }
);

useKeyboardShortcuts({
  scope: shortcutScope,
  enabled: () => workspaceReady.value,
  shortcuts: [
    {
      key: 'a',
      enabled: () => documentReady.value,
      run: () => void openPanel('ai', aiPanelButton.value),
    },
    { key: 'l', run: () => void openPanel('projects', fileListButton.value) },
    {
      key: 'f',
      enabled: () => documentReady.value,
      run: () => void openPanel('attachments', attachmentListButton.value),
    },
  ],
});

function normalizeAIContent(content: string) {
  if (!editorRef.value) throw new Error('编辑器尚未就绪');
  return editorRef.value.normalizeMarkdown(content);
}

const aiCapabilities: FileCapabilities = {
  canCreate: () => !!projectTree.value?.project.permissions.write,
  canRename: () => canWrite.value,
  exportDocument: async (signal) => {
    const key = activeDocKey.value;
    if (!key || busy.value || saving.value || dirty.value)
      throw new Error('请先等待当前文档保存完成再导出');
    const saved = await getDocument(key, signal);
    signal.throwIfAborted();
    if (key !== activeDocKey.value) throw new Error('文档已切换，导出已取消');
    const url = URL.createObjectURL(
      new Blob([saved.file_content ?? ''], { type: 'text/markdown;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeExportName(saved.file_name)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

const debugMenuItems = computed<ContextMenuItem[]>(() => [
  {
    value: 'export-schema',
    label: '导出 Schema',
    icon: 'download',
    disabled: !activeDocKey.value || loading.value || busy.value || exportingSchema.value,
    description: !activeDocKey.value
      ? '请先打开文档'
      : loading.value
        ? '正在加载文档'
        : busy.value
          ? '请等待当前操作完成'
          : exportingSchema.value
            ? '正在读取已保存的文档数据'
            : '导出数据库中已保存的完整文档数据',
  },
]);

const localContent = computed(() => {
  void showDraft.value;
  return editorRef.value?.getMarkdown() ?? currentContent.value;
});
useDialog(ModalType.SHARE_DIALOG, {
  visible: () => showShare.value && !!activeDoc.value && canShare.value,
  key: () => activeDocKey.value,
  props: () => ({ fileKey: activeDocKey.value, fileName: activeDoc.value!.file_name }),
  onClose: () => {
    showShare.value = false;
  },
});
useDialog(ModalType.LOCAL_DRAFT_DIALOG, {
  visible: () => showDraft.value,
  props: () => ({ content: localContent.value }),
  onClose: () => {
    showDraft.value = false;
  },
});
watch(activeDocKey, () => {
  editorLoadError.value = '';
  if (isMobile && activePanel.value !== 'projects') activePanel.value = null;
  showShare.value = false;
  showDraft.value = false;
  debugMenuOpen.value = false;
  cancelSchemaExport();
});

const MIN_SAVE_ANIMATION_DURATION = 1000;
const showSavingAnimation = ref(false);
let saveAnimationStartedAt = 0;
let saveAnimationTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  [saving, activeDocKey],
  ([isSaving, key], [, previousKey]) => {
    clearTimeout(saveAnimationTimer);
    if (key !== previousKey) showSavingAnimation.value = false;
    if (!key) return;
    if (isSaving) {
      saveAnimationStartedAt = performance.now();
      showSavingAnimation.value = true;
      return;
    }
    if (!showSavingAnimation.value) return;
    const remaining = MIN_SAVE_ANIMATION_DURATION - (performance.now() - saveAnimationStartedAt);
    if (remaining <= 0) {
      showSavingAnimation.value = false;
    } else {
      saveAnimationTimer = setTimeout(() => {
        showSavingAnimation.value = false;
      }, Math.ceil(remaining));
    }
  },
  { flush: 'sync' }
);

onBeforeUnmount(() => {
  cancelSchemaExport();
  clearTimeout(saveAnimationTimer);
});

const syncStatus = computed(() => {
  if (showSavingAnimation.value) return '正在自动保存';
  if (saveError.value) return saveError.value;
  if (dirty.value) return '等待自动保存';
  return '修改已保存';
});

function handleAttachmentDownload(file: FileInfo) {
  if (isMobile) closePanel();
  handleDownload(file);
}

function handleInsertAttachment(file: FileInfo) {
  if (!canWrite.value) return;
  editorRef.value?.insertAttachment(file);
  if (isMobile) closePanel();
}

function handlePreviewAttachment(file: FileInfo) {
  void handlePreview(file);
}

function sanitizeExportName(name: string) {
  const cleanName = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  const baseName = cleanName || 'document';
  return baseName.replace(/\.[^.]+$/u, '') || 'document';
}

function toggleDebugMenu(event: MouseEvent | KeyboardEvent) {
  if (!isDev || !debugToolButton.value || (event instanceof KeyboardEvent && event.isComposing))
    return;
  const rect = debugToolButton.value.getBoundingClientRect();
  debugMenuPosition.value = { x: rect.right + 8, y: rect.top };
  debugMenuOpen.value = !debugMenuOpen.value;
}

function cancelSchemaExport() {
  schemaExportController?.abort();
  schemaExportController = undefined;
  exportingSchema.value = false;
}

async function handleDebugAction(item: ContextMenuOption) {
  if (
    !isDev ||
    item.value !== 'export-schema' ||
    item.disabled ||
    !activeDocKey.value ||
    loading.value ||
    busy.value ||
    exportingSchema.value
  )
    return;

  const fileKey = activeDocKey.value;
  const controller = new AbortController();
  schemaExportController = controller;
  exportingSchema.value = true;
  try {
    const savedDocument = await getDocument(fileKey, controller.signal);
    if (
      controller.signal.aborted ||
      schemaExportController !== controller ||
      activeDocKey.value !== fileKey
    )
      return;
    const blob = new Blob([JSON.stringify(savedDocument, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeExportName(savedDocument.file_name)}.schema.json`;
      link.click();
      notification.show('已开始下载已保存的文档数据', 'success');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (cause) {
    if (!controller.signal.aborted && schemaExportController === controller) {
      notification.show(errorMessage(cause, '导出已保存文档失败'), 'error', 0);
    }
  } finally {
    if (schemaExportController === controller) {
      schemaExportController = undefined;
      exportingSchema.value = false;
    }
  }
}

function buildExportFilename(includeAttachments: boolean) {
  const sourceName = activeDoc.value?.file_name || 'document';
  const baseName = sanitizeExportName(sourceName);
  return `${baseName}.${includeAttachments ? 'zip' : 'voex'}`;
}

async function exportDocument(includeAttachments: boolean) {
  return http.get<ApiError, Blob>(`/document/${encodeURIComponent(activeDocKey.value)}/export`, {
    params: { include_attachments: includeAttachments },
    responseType: 'blob',
  });
}

async function handleExportDocument() {
  if (!activeDocKey.value || !activeDoc.value || busy.value) return;
  const includeAttachments = await confirm({
    type: MessageType.WARNING,
    title: '导出文档',
    content: '是否导出附件？默认不导出附件。关闭则仅导出 .voex。',
    confirmText: '是，导出附件（zip）',
    cancelText: '否，仅导出 .voex',
  });
  try {
    const blob = await exportDocument(includeAttachments);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildExportFilename(includeAttachments);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) {
    notification.show(errorMessage(cause, '导出失败'), 'error', 0);
  }
}
</script>

<style lang="stylus">
/* ============================================================
   EDIT PAGE - BEM NAMING
   ============================================================ */
.edit-page
  display flex
  height 100dvh
  min-width 0
  overflow hidden
  position relative
  background var(--color-bg-primary)

  &__rail
    display flex
    flex-direction column
    align-items center
    flex-shrink 0
    width 64px
    gap 12px
    padding 12px 10px
    padding-top unquote('max(12px, env(safe-area-inset-top))')
    padding-bottom unquote('max(12px, env(safe-area-inset-bottom))')
    overflow-y auto

    &--loading
      visibility hidden
      pointer-events none

  &__panel
    --edit-panel-width: 320px
    display flex
    flex-direction column
    flex-shrink 0
    width var(--edit-panel-width)
    min-width 0
    min-height 0
    margin 8px 8px 8px 0
    border-radius var(--border-radius-container)
    background var(--color-bg-panel)
    overflow hidden

    &--ai
      --edit-panel-width: 380px

    &--loading
      visibility hidden

    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset -2px

    &--mobile
      --edit-panel-width: 100%
      width 100%
      height 100%
      margin 0
      border-radius 0

      .ai-panel__header
        display none

  &__panel-content
    width var(--edit-panel-width)
    height 100%
    min-height 0
    flex-shrink 0
    opacity 1

  &__editor
    min-height 100%

    &--loading
      height 100%
      overflow hidden

      .milkdown
        visibility hidden
        pointer-events none

  &__loading
    position absolute
    inset 0
    padding-top 45px
    overflow hidden

  /* ---------- Center: editor ---------- */
  &__center
    --edit-content-width: 860px
    --edit-content-gutter: 52px
    flex 1
    display flex
    flex-direction column
    min-width 0


  &__header
    display flex
    align-items center
    gap 12px
    width 100%
    max-width var(--edit-content-width)
    margin 0 auto
    padding 0 var(--edit-content-gutter)
    flex-shrink 0
    text-align left
    height 56px
    line-height 56px

  &__heading
    display flex
    align-items center
    flex 1
    min-width 0
    gap 8px

  &__icon-button
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    width 36px
    height 36px
    padding 0
    border 0
    border-radius 50%
    background var(--color-bg-translucent)
    color var(--color-text-secondary)
    cursor pointer
    transition background .15s, color .15s
    text-decoration none

    &[aria-expanded='true']
      background var(--color-accent-tint)
      color var(--color-accent)

    &:hover:not(:disabled)
      background var(--color-accent-tint)
      color var(--color-text-primary)

    &:active:not(:disabled)
      background var(--color-bg-quaternary)

    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px

    &:disabled
      opacity .5
      cursor not-allowed

  &--mobile
    .edit-page__center
      --edit-content-gutter: 16px

    .edit-page__header
      height auto
      min-height 56px
      padding 6px var(--edit-content-gutter)
      padding-top unquote('max(6px, env(safe-area-inset-top))')
      padding-left unquote('max(var(--edit-content-gutter), env(safe-area-inset-left))')
      padding-right unquote('max(var(--edit-content-gutter), env(safe-area-inset-right))')
      gap 6px
      line-height 1.4

    .edit-page__heading
      gap 4px

    .edit-page__icon-button
      width 44px
      height 44px

    .milkdown-editor__content
      padding 20px 16px 72px
      padding-bottom unquote('max(72px, env(safe-area-inset-bottom))')

    .edit-page__save-error
      padding 10px 16px

    .edit-page__loading
      padding-top 0

    .loading-skeleton--document
      padding 20px 16px 72px

  @media (prefers-reduced-motion: reduce)
    &__icon-button
      transition none

  &__save-error
    padding 12px 20px
    background var(--color-accent-tint)
    font-size 13px
    line-height 1.6
    p
      color var(--color-red)
    > div
      display flex
      flex-wrap wrap
      gap 8px
      margin-top 8px

  &__title
    overflow hidden
    text-overflow ellipsis
    white-space nowrap
    font-size 14px
    font-weight 600
    color var(--color-text-primary)
    cursor default

  &__sync-status
    position relative
    display inline-flex
    align-items center
    justify-content center
    width 24px
    height 24px
    flex-shrink 0
    color var(--color-text-secondary)

    &--error .edit-page__heartbeat
      background var(--color-danger, #dc3545)
      animation none

  &__heartbeat
    position absolute
    left 0
    bottom 4px
    width 8px
    height 8px
    border 2px solid var(--color-bg-primary)
    border-radius 50%
    background #22c55e
    // 仅模拟连接心跳，不发起网络探测。
    animation edit-page-heartbeat 2s ease-in-out infinite

  &__spinner
    animation edit-page-spin 1s linear infinite

  @media (prefers-reduced-motion: reduce)
    &__heartbeat, &__spinner
      animation none

  &__body
    position relative
    flex 1
    min-height 0
    overflow-y auto
    scrollbar-width none
    background transparent

    &::-webkit-scrollbar
      display none
      width 0
      height 0

    .milkdown-editor, .milkdown, .milkdown-editor__content
      background transparent

    .milkdown-editor__toolbar
      width 100%
      max-width var(--edit-content-width)
      margin 0 auto
      padding-left var(--edit-content-gutter)
      padding-right var(--edit-content-gutter)
      border-bottom 0

    .milkdown-editor__content
      max-width var(--edit-content-width)
      padding-left var(--edit-content-gutter)
      padding-right var(--edit-content-gutter)

    .milkdown-editor__separator
      width 0
      background transparent

  &__loading .loading-skeleton--document
    max-width var(--edit-content-width)
    padding-left var(--edit-content-gutter)
    padding-right var(--edit-content-gutter)

  @media (max-width: 960px)
    &__center
      --edit-content-gutter: 24px

    &__panel:not(.edit-page__panel--mobile)
      --edit-panel-width: unquote('min(320px, calc(100vw - 80px))')
      position absolute
      z-index 20
      top 0
      right 0
      bottom 0
      box-shadow var(--shadow-medium)

      &.edit-page__panel--ai
        --edit-panel-width: unquote('min(380px, calc(100vw - 80px))')

    &__header
      gap 8px

  &__placeholder
    &--over-editor
      position absolute
      inset 45px 0 0
      height auto

    display flex
    flex-direction column
    align-items center
    justify-content center
    height 100%
    color var(--color-text-tertiary)
    gap 16px
    a
      color var(--color-link-primary)
    svg
      width 64px
      height 64px
      margin-bottom 16px
    p
      font-size 15px

  /* ---------- Buttons ---------- */
  &__button
    display inline-flex
    align-items center
    gap 6px
    padding 8px 16px
    border none
    border-radius 8px
    font-size 13px
    font-weight 500
    cursor pointer
    transition all .15s
    &:disabled
      opacity .5
      cursor not-allowed
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:active:not(:disabled)
      filter brightness(.94)
    svg
      width 16px
      height 16px

    &--secondary
      background var(--color-bg-translucent)
      color var(--color-text-secondary)
      border 1px solid var(--color-border-primary)
      &:hover:not(:disabled)
        background var(--color-accent-tint)

.edit-panel-enter-active, .edit-panel-leave-active
  transition width 200ms ease, margin-right 200ms ease

.edit-panel-enter-from:not(.edit-page__panel--mobile),
.edit-panel-leave-to:not(.edit-page__panel--mobile)
  width 0
  margin-right 0

.edit-panel-enter-active .edit-page__panel-content
  transition opacity 100ms ease 200ms

.edit-panel-leave-active .edit-page__panel-content
  transition opacity 100ms ease

.edit-panel-enter-from .edit-page__panel-content,
.edit-panel-leave-to .edit-page__panel-content
  opacity 0

#editor-side-drawer
  &.voex-modal-enter-from, &.voex-modal-leave-to
    opacity 1

  .voex-modal
    border 0
    background var(--color-bg-panel)
    transition transform 200ms ease

  .voex-modal__header
    border-bottom 0
    animation edit-panel-content-in 300ms ease both

@keyframes edit-panel-content-in
  0%, 66.666%
    opacity 0
  100%
    opacity 1

@media (prefers-reduced-motion: reduce)
  .edit-panel-enter-active, .edit-panel-leave-active,
  .edit-panel-enter-active .edit-page__panel-content,
  .edit-panel-leave-active .edit-page__panel-content,
  #editor-side-drawer .voex-modal
    transition none

  #editor-side-drawer .voex-modal__header
    animation none

@keyframes edit-page-spin
  from
    transform rotate(0deg)
  to
    transform rotate(360deg)

@keyframes edit-page-heartbeat
  0%,100%
    background-color var(--color-green)
  50%
    background-color #166534
</style>
