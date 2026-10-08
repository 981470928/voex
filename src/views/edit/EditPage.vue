<template>
  <div
    class="edit-page"
    :class="{ 'edit-page--mobile': isMobile }"
    @keydown.capture="handleEditorActivity"
    @pointerdown.capture="handleEditorActivity"
    @input.capture="handleEditorActivity"
    @wheel.capture.passive="handleEditorActivity"
    @compositionstart.capture="handleCompositionStart"
    @compositionend.capture="handleCompositionEnd"
  >
    <!-- Left: EditorLeftContainer -->
    <VoexDrawer
      id="editor-document-drawer"
      :enabled="isMobile"
      :model-value="drawer.documentOpen"
      title="文档目录"
      side="left"
      :width="320"
      @update:model-value="drawer.setOpen('documents', $event)"
    >
      <EditorLeftContainer
        v-show="isMobile || !sidebarCollapsed"
        :mobile="isMobile"
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
    </VoexDrawer>

    <!-- Center: Editor -->
    <main class="edit-page__center">
      <div class="edit-page__header">
        <button
          v-if="isMobile || sidebarCollapsed"
          type="button"
          class="edit-page__icon-button"
          :title="isMobile ? (drawer.documentOpen ? '折叠文档目录' : '展开文档目录') : '展开侧栏'"
          :aria-label="
            isMobile ? (drawer.documentOpen ? '折叠文档目录' : '展开文档目录') : '展开侧栏'
          "
          :aria-expanded="isMobile ? drawer.documentOpen : undefined"
          :aria-controls="isMobile ? 'editor-document-drawer' : undefined"
          @click="isMobile ? drawer.toggle('documents') : (sidebarCollapsed = false)"
        >
          <SvgIcon :name="drawer.documentOpen ? 'sidebar-collapse' : 'sidebar-expand'" :size="20" />
        </button>
        <div class="edit-page__heading">
          <span
            class="edit-page__title"
            :title="activeDoc?.file_name"
            @dblclick="activeDoc && handleRenameDoc(activeDoc)"
          >
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
        </div>
        <div class="edit-page__header-actions">
          <button
            v-if="activeDocKey"
            type="button"
            class="edit-page__icon-button"
            title="导出"
            aria-label="导出"
            :disabled="busy"
            @click="handleExportDocument"
          >
            <SvgIcon name="download" :size="18" />
          </button>
          <button
            v-if="canShare"
            type="button"
            class="edit-page__icon-button"
            title="分享"
            aria-label="分享"
            :disabled="busy"
            @click="showShare = true"
          >
            <SvgIcon name="share" :size="18" />
          </button>
          <button
            v-if="isMobile"
            type="button"
            class="edit-page__icon-button"
            :title="drawer.attachmentOpen ? '折叠文件列表' : '展开文件列表'"
            :aria-label="drawer.attachmentOpen ? '折叠文件列表' : '展开文件列表'"
            :aria-expanded="drawer.attachmentOpen"
            aria-controls="editor-attachment-drawer"
            @click="drawer.toggle('attachments')"
          >
            <SvgIcon
              :name="drawer.attachmentOpen ? 'sidebar-collapse' : 'sidebar-expand'"
              :size="20"
              class="edit-page__right-sidebar-icon"
            />
          </button>
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
            :show-toolbar="!isMobile"
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
    <VoexDrawer
      id="editor-attachment-drawer"
      :enabled="isMobile"
      :model-value="drawer.attachmentOpen"
      title="文件列表"
      side="right"
      @update:model-value="drawer.setOpen('attachments', $event)"
    >
      <AttachmentPanel
        :mobile="isMobile"
        :can-upload="canWrite && !busy"
        :attachments="attachments"
        :uploading-files="uploadingFiles"
        :active-doc-key="activeDocKey"
        :is-dragging="isDragging"
        @upload="triggerFileUpload"
        @update:is-dragging="isDragging = $event"
        @download="handleDownload"
        @delete="handleDeleteAttachment"
        @insert="handleInsertAttachment"
        @preview="handlePreviewAttachment"
        @drop="handleDrop"
      />
    </VoexDrawer>
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
import VoexDrawer from '@/components/VoexDrawer.vue';
import { useDrawerStore } from '@/stores/drawer';
import { isMobile } from '@/utils/platform';
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

const drawer = useDrawerStore();
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
  drawer.closeAll();
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

onBeforeUnmount(() => {
  clearTimeout(saveAnimationTimer);
  drawer.closeAll();
});

const syncStatus = computed(() => {
  if (showSavingAnimation.value) return '正在自动保存';
  if (saveError.value) return saveError.value;
  if (dirty.value) return '等待自动保存';
  return '修改已保存';
});

function handleInsertAttachment(file: FileInfo) {
  if (!canWrite.value) return;
  editorRef.value?.insertAttachment(file);
  if (isMobile) drawer.closeAll();
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
  min-width 0
  overflow hidden
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
    gap 12px
    padding 0 20px
    flex-shrink 0
    border-bottom 1px solid var(--color-border-primary)
    text-align center
    height 56px
    line-height 56px

  &__heading
    display flex
    align-items center
    flex 1
    min-width 0
    gap 8px

  &__header-actions
    display flex
    align-items center
    gap 8px
    margin-left auto
    flex-shrink 0

  &__icon-button
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    width 36px
    height 36px
    padding 0
    border 1px solid var(--color-border-primary)
    border-radius 50%
    background var(--color-bg-translucent)
    color var(--color-text-secondary)
    cursor pointer
    transition background .15s, color .15s

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

  &__right-sidebar-icon
    transform scaleX(-1)

  &--mobile
    .edit-page__header
      height auto
      min-height 56px
      padding 6px 8px
      padding-top unquote('max(6px, env(safe-area-inset-top))')
      padding-left unquote('max(8px, env(safe-area-inset-left))')
      padding-right unquote('max(8px, env(safe-area-inset-right))')
      gap 6px
      line-height 1.4

    .edit-page__heading, .edit-page__header-actions
      gap 4px

    .edit-page__icon-button
      width 44px
      height 44px

    .milkdown-editor__content
      padding 20px 16px 72px
      padding-bottom unquote('max(72px, env(safe-area-inset-bottom))')

    .edit-page__save-error
      padding 10px 16px

  @media (prefers-reduced-motion: reduce)
    &__icon-button
      transition none

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
