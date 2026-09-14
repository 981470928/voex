<template>
  <div
    class="edit-page"
    @keydown.capture="handleEditorActivity"
    @pointerdown.capture="handleEditorActivity"
    @input.capture="handleEditorActivity"
    @wheel.capture.passive="handleEditorActivity"
    @compositionstart.capture="handleCompositionStart"
    @compositionend.capture="handleCompositionEnd"
  >
    <!-- Left: EditorLeftContainer -->
    <EditorLeftContainer
      v-show="!sidebarCollapsed"
      :tree="projectTree"
      :active-doc-key="activeDocKey"
      :loading="loading"
      :creating="creating"
      :busy="busy"
      :error="loadError"
      @toggle="sidebarCollapsed = true"
      @create="handleCreateDoc"
      @delete="handleDeleteDoc"
      @rename="handleRenameDoc"
    />

    <!-- Center: Editor -->
  <main class="edit-page__center">
      <div class="edit-page__header">
        <button
          v-if="sidebarCollapsed"
          class="edit-page__sidebar-btn voex-icon-btn_32"
          title="展开侧栏"
          @click="sidebarCollapsed = false"
        >
          <SvgIcon name="sidebar-expand" :size="24" />
        </button>
        <span class="edit-page__title" @dblclick="activeDoc && handleRenameDoc(activeDoc)">
          {{ activeDoc?.file_name || '请选择文档' }}
        </span>
        <span
          v-if="activeDocKey"
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
        <button
          v-if="activeDocKey"
          type="button"
          class="edit-page__button edit-page__button--secondary"
          :disabled="busy"
          @click="handleExportDocument"
        >
          导出
        </button>
        <button
          v-if="canShare"
          type="button"
          class="edit-page__button edit-page__button--secondary edit-page__share-button"
          :disabled="busy"
          @click="showShare = true"
        >
          分享
        </button>
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
      <div class="edit-page__body">
        <MilkdownProvider v-if="activeDocKey">
          <MilkdownEditor
            ref="editorRef"
            :key="activeDocKey"
            :default-value="editorContent"
            :attachments="attachments"
            :upload-attachments="triggerFileUpload"
            :on-preview-attachment="handlePreviewAttachment"
            :readonly="!canWrite"
            @ready="handleEditorReady"
            @change="handleEditorChange"
          />
        </MilkdownProvider>
        <div v-else class="edit-page__placeholder">
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
          <p role="status">{{ loading ? '正在加载文件…' : loadError || '文件不存在' }}</p>
          <button
            v-if="loadError"
            class="edit-page__button edit-page__button--secondary"
            @click="loadDocument"
          >
            重新加载
          </button>
          <RouterLink :to="{ name: 'home' }">返回主页</RouterLink>
        </div>
      </div>
    </main>

    <!-- Right: Attachments -->
    <AttachmentPanel
      :attachments="attachments"
      :uploading-files="uploadingFiles"
      :active-doc-key="activeDocKey"
      :is-dragging="isDragging"
      @update:is-dragging="isDragging = $event"
      @download="handleDownload"
      @delete="handleDeleteAttachment"
      @insert="handleInsertAttachment"
      @preview="handlePreviewAttachment"
      @drop="handleDrop"
    />
    <ShareDialog
      v-if="activeDoc && canShare"
      :key="activeDocKey"
      v-model="showShare"
      :file-key="activeDocKey"
      :file-name="activeDoc.file_name"
    />
    <LocalDraftDialog v-model="showDraft" :content="localContent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import MilkdownEditor from '@/components/milkdown/MilkdownEditor.vue';
import EditorLeftContainer from '@/views/edit/EditorLeftContainer.vue';
import AttachmentPanel from '@/views/edit/AttachmentPanel.vue';
import { useDocumentPage } from '@/composables/useDocumentPage';
import { MilkdownProvider } from '@milkdown/vue';
import type { FileInfo } from '@/service/api/document-api';
import ShareDialog from '@/components/share/ShareDialog.vue';
import LocalDraftDialog from '@/components/share/LocalDraftDialog.vue';
import http from '@/service/api/https';
import { useConfirm } from '@/composables/useConfirm';
import { MessageType } from '@/constant/status';
import { useNotificationStore } from '@/stores/notification';
import { errorMessage } from '@/utils/error';
import type { ApiError } from '@/service/api/index';

const sidebarCollapsed = ref(false);
const showShare = ref(false);
const showDraft = ref(false);
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
  editorContent,
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
  handleDrop,
} = useDocumentPage();

const localContent = computed(() => {
  void showDraft.value;
  return editorRef.value?.getMarkdown() ?? currentContent.value;
});
watch(activeDocKey, () => {
  showShare.value = false;
  showDraft.value = false;
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

onBeforeUnmount(() => clearTimeout(saveAnimationTimer));

const syncStatus = computed(() => {
  if (showSavingAnimation.value) return '正在自动保存';
  if (saveError.value) return saveError.value;
  if (dirty.value) return '等待自动保存';
  return '修改已保存';
});

function handleInsertAttachment(file: FileInfo) {
  if (canWrite.value) editorRef.value?.insertAttachment(file);
}

function handlePreviewAttachment(file: FileInfo) {
  void handlePreview(file);
}

function sanitizeExportName(name: string) {
  const cleanName = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  const baseName = cleanName || 'document';
  return baseName.replace(/\.[^.]+$/u, '') || 'document';
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
  background var(--color-bg-panel)

  /* ---------- Center: editor ---------- */
  &__center
    flex 1
    display flex
    flex-direction column
    min-width 0

  &__header
    display flex
    align-items center
    justify-content center
    gap 12px
    padding 0 52px
    flex-shrink 0
    border-bottom 1px solid var(--color-border-primary)
    text-align center
    height 56px
    line-height 56px

  &__sidebar-btn
    position fixed
    left 12px
    top 12px
    z-index 50

  &__share-button
    margin-left auto
    flex-shrink 0

  &__save-error
    padding 12px 20px
    border-bottom 1px solid var(--color-border-primary)
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
    border 2px solid var(--color-bg-panel)
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
    flex 1
    min-height 0
    overflow-y auto
    background var(--color-bg-primary)

  &__placeholder
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
