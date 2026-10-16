import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { isAxiosError } from 'axios';
import MilkdownEditor from '@/views/edit/milkdown/MilkdownEditor.vue';
import { listFiles, deleteAttachment, downloadFile } from '@/service/api/upload-api';
import {
  getDocument,
  updateDocument,
  deleteDocument,
  type DocumentInfo,
  type DocumentSummary,
  type FileInfo,
} from '@/service/api/document-api';
import { getProjectTree, type ProjectTree } from '@/service/api/workspace-api';
import { FILE_ACCEPT, originalGetImportFiles } from '@/utils/dom';
import { desktopLocation, formatTime } from '@/utils/workspace';
import { errorMessage } from '@/utils/error';
import { useUploadStore } from '@/stores/upload';
import { useDownloadStore } from '@/stores/download';
import { usePreviewerStore } from '@/stores/previewer';
import { useModalStore, ModalType } from '@/stores/modal';
import { useNotificationStore } from '@/stores/notification';
import { usePermissionStore } from '@/stores/permission';
import { useTeamStore } from '@/stores/team';
import { MessageType } from '@/constant/status';
import { useConfirm } from './useConfirm';
import { useCreateDocument } from './useCreateDocument';
import { applyAIReview } from '@/service/api/ai-api';
import type { DocumentSnapshot, ReviewSnapshot } from '@/agent/types';

const AUTO_SAVE_DELAY = 2000;

interface SaveRequest {
  key: string;
  markdown: string;
  generation: number;
}

export function useDocumentPage() {
  const route = useRoute();
  const router = useRouter();
  const activeDoc = ref<DocumentInfo | null>(null);
  const projectTree = ref<ProjectTree | null>(null);
  const attachments = ref<FileInfo[]>([]);
  const loading = ref(true);
  const loadError = ref('');
  const saving = ref(false);
  const saveError = ref('');
  const saveConflict = ref(false);
  const busy = ref(false);
  const aiBusy = ref(false);
  const isDragging = ref(false);
  const editorRef = ref<InstanceType<typeof MilkdownEditor> | null>(null);
  const editorReady = ref(false);
  const currentContent = ref('');
  const savedContent = ref('');
  const modal = useModalStore();
  const notification = useNotificationStore();
  const permission = usePermissionStore();
  const teams = useTeamStore();
  const previewer = usePreviewerStore();
  const uploadStore = useUploadStore();
  const downloadStore = useDownloadStore();
  const { uploadingFiles } = storeToRefs(uploadStore);
  const { confirm } = useConfirm();
  const { creating, openCreateDocument } = useCreateDocument();
  const activeDocKey = computed(() => activeDoc.value?.file_key ?? '');
  const editorContent = computed(() => activeDoc.value?.file_content ?? '');
  const canWrite = computed(
    () => permission.document(activeDoc.value, projectTree.value?.project).write
  );
  const canShare = computed(
    () => permission.document(activeDoc.value, projectTree.value?.project).share
  );
  const dirty = computed(() => editorReady.value && currentContent.value !== savedContent.value);
  let controller: AbortController | undefined;
  let generation = 0;
  let attachmentGeneration = 0;
  let navigationCheck: Promise<boolean> | undefined;
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: SaveRequest | undefined;
  let failedSave: SaveRequest | undefined;
  let composing = false;
  let disposed = false;

  function canAutoSave() {
    return (
      !disposed &&
      !composing &&
      !navigationCheck &&
      !!activeDocKey.value &&
      editorReady.value &&
      canWrite.value &&
      !saveError.value &&
      !busy.value &&
      !aiBusy.value
    );
  }

  function clearSaveQueue() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
    pendingSave = undefined;
    failedSave = undefined;
    saveError.value = '';
    saveConflict.value = false;
    composing = false;
  }

  function isCurrentSave(request: SaveRequest) {
    return !disposed && request.generation === generation && request.key === activeDocKey.value;
  }

  async function drainSaveQueue() {
    if (!canAutoSave() || saving.value || (!failedSave && !pendingSave)) return;
    saving.value = true;
    try {
      while (canAutoSave()) {
        // 未开始的请求只保留最新快照；失败后等待用户明确恢复。
        const request = failedSave ?? pendingSave;
        if (!request) break;
        if (request === pendingSave) pendingSave = undefined;
        if (!isCurrentSave(request)) {
          if (request === failedSave) failedSave = undefined;
          continue;
        }
        if (!failedSave && request.markdown === savedContent.value) continue;
        try {
          // revision 原子校验阻止旧内容覆盖新版本；失败后仅手动恢复。
          const result = await updateDocument(
            request.key,
            { file_content: request.markdown, revision: activeDoc.value!.revision },
            { timeout: 30000 }
          );
          if (!result.success) throw new Error('自动保存失败，编辑内容已保留');
          if (isCurrentSave(request)) activeDoc.value!.revision = result.revision;
        } catch (cause) {
          if (isCurrentSave(request)) {
            failedSave = request;
            saveConflict.value = isAxiosError(cause) && cause.response?.status === 409;
            saveError.value = saveConflict.value
              ? '其他人已更新此文件，自动保存已暂停。请先复制本地内容，再重新加载并合并修改。'
              : errorMessage(cause, '自动保存失败，编辑内容已保留。请重试保存。');
          }
          break;
        }
        if (!isCurrentSave(request)) continue;
        failedSave = undefined;
        saveError.value = '';
        savedContent.value = request.markdown;
        activeDoc.value!.file_content = request.markdown;
      }
    } finally {
      saving.value = false;
      // 旧文件的请求结束后，也允许新文件已经到期的最新快照继续处理。
      if (canAutoSave() && (failedSave || pendingSave)) void drainSaveQueue();
    }
  }

  function handleEditorActivity() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
    pendingSave = undefined;
    if (!canAutoSave() || (!dirty.value && !saving.value && !failedSave)) return;
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = undefined;
      if (!canAutoSave()) return;
      const markdown = editorRef.value?.getMarkdown() ?? currentContent.value;
      currentContent.value = markdown;
      pendingSave = { key: activeDocKey.value, markdown, generation };
      void drainSaveQueue();
    }, AUTO_SAVE_DELAY);
  }

  function handleCompositionStart() {
    composing = true;
    handleEditorActivity();
  }

  function handleCompositionEnd() {
    composing = false;
    handleEditorActivity();
  }

  function handleEditorReady(markdown: string) {
    savedContent.value = markdown;
    currentContent.value = markdown;
    editorReady.value = true;
  }

  function handleEditorChange(markdown: string) {
    currentContent.value = markdown;
    handleEditorActivity();
  }

  function hasUnsavedChanges() {
    return (
      editorReady.value &&
      (!!failedSave ||
        (editorRef.value?.getMarkdown() ?? currentContent.value) !== savedContent.value)
    );
  }

  async function mayLeave() {
    if (saving.value || aiBusy.value) return false;
    if (!hasUnsavedChanges()) return true;
    if (!navigationCheck) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = undefined;
      pendingSave = undefined;
      navigationCheck = confirm({
        type: MessageType.WARNING,
        title: '尚有未保存的修改',
        content: `「${activeDoc.value?.file_name}」的修改尚未保存。离开后将丢失这些修改。`,
        confirmText: '放弃修改并离开',
        cancelText: '继续编辑',
      });
    }
    let accepted = false;
    try {
      accepted = await navigationCheck;
      if (accepted) clearSaveQueue();
      return accepted;
    } finally {
      navigationCheck = undefined;
      if (!accepted) handleEditorActivity();
    }
  }

  onBeforeRouteLeave(mayLeave);
  onBeforeRouteUpdate((to, from) =>
    to.params.file_key !== from.params.file_key ? mayLeave() : true
  );

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnsavedChanges() && !saving.value && !aiBusy.value) return;
    event.preventDefault();
    event.returnValue = '';
  }
  window.addEventListener('beforeunload', beforeUnload);

  async function loadDocument() {
    clearSaveQueue();
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const current = ++generation;
    attachmentGeneration++;
    loading.value = true;
    loadError.value = '';
    activeDoc.value = null;
    projectTree.value = null;
    attachments.value = [];
    editorReady.value = false;
    try {
      const key = String(route.params.file_key ?? '');
      const doc = await getDocument(key, signal);
      const tree = await getProjectTree(doc.project_key, signal);
      if (signal.aborted || current !== generation) return;
      activeDoc.value = doc;
      projectTree.value = tree;
      await loadAttachments();
    } catch (cause) {
      if (signal.aborted || current !== generation) return;
      loadError.value = errorMessage(cause, '文件加载失败');
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  async function refreshTree() {
    const key = activeDoc.value?.project_key;
    if (!key) return;
    const current = generation;
    const next = await getProjectTree(key);
    if (current === generation) projectTree.value = next;
  }

  async function prepareAIDocument(): Promise<DocumentSnapshot> {
    if (
      !activeDoc.value ||
      !editorReady.value ||
      loading.value ||
      saving.value ||
      busy.value ||
      aiBusy.value
    )
      throw new Error('请等待文档加载或保存完成');
    if (saveError.value || hasUnsavedChanges())
      throw new Error('请先等待当前编辑保存完成，再发送 AI 指令');
    const doc = activeDoc.value;
    // Capturing context is read-only, including when Milkdown normalizes stored Markdown.
    // Only the explicit apply action may persist an AI draft.
    return {
      file_key: doc.file_key,
      file_name: doc.file_name,
      project_key: doc.project_key,
      folder_key: doc.folder_key,
      content: doc.file_content ?? '',
      revision: doc.revision,
      writable: canWrite.value,
    };
  }

  async function applyDocumentReview(review: ReviewSnapshot) {
    if (
      !activeDoc.value ||
      !editorReady.value ||
      !canWrite.value ||
      saving.value ||
      busy.value ||
      aiBusy.value
    )
      throw new Error('当前文档不可应用修改，请等待保存完成');
    if (hasUnsavedChanges() || saveError.value)
      throw new Error('当前正文还有未保存的修改，请先完成保存后再审阅');
    const key = activeDocKey.value;
    const change = review.changes.find((item) => item.kind === 'update' && item.file_key === key);
    if (
      change &&
      (activeDoc.value.revision !== change.revision ||
        activeDoc.value.file_name !== change.before_name ||
        (activeDoc.value.file_content ?? '') !== change.before_content)
    )
      throw new Error('文档已发生变化，请基于最新内容重新生成建议；旧建议仍可查看');
    for (const item of review.changes) {
      if (
        item.project_key !== activeDoc.value.project_key ||
        item.folder_key !== activeDoc.value.folder_key
      )
        throw new Error('请回到生成该建议的文件夹后再应用');
      if (item.kind === 'update' && item.file_key !== key)
        throw new Error('请回到生成该建议的文档后再应用');
      editorRef.value!.normalizeMarkdown(item.after_content);
    }
    aiBusy.value = true;
    clearTimeout(autoSaveTimer);
    pendingSave = undefined;
    try {
      const results = await applyAIReview(review);
      review.status = 'applied';
      if (disposed || activeDocKey.value !== key) return;
      const result = results.find((item) => item.file_key === key);
      if (results.some((item) => item.replayed)) {
        // A previous attempt may have committed before its response was lost.
        // Read the current server version instead of restoring that old snapshot over later edits.
        try {
          const latest = await getDocument(key);
          if (disposed || activeDocKey.value !== key) return;
          activeDoc.value = latest;
          editorRef.value!.setMarkdown(latest.file_content ?? '');
          currentContent.value = editorRef.value!.getMarkdown();
          savedContent.value = currentContent.value;
          failedSave = undefined;
          saveError.value = '';
        } catch {
          saveError.value = '该审阅已应用，但最新正文同步失败，请重新加载文档。';
          saveConflict.value = true;
          throw new Error(saveError.value);
        }
      } else if (change && result) {
        activeDoc.value!.file_name = result.file_name;
        activeDoc.value!.file_content = change.after_content;
        activeDoc.value!.revision = result.revision;
        try {
          editorRef.value!.setMarkdown(change.after_content);
        } catch {
          saveError.value = 'AI 修改已保存，但编辑器同步失败。请重新加载文档。';
          saveConflict.value = true;
          throw new Error(saveError.value);
        }
        currentContent.value = editorRef.value!.getMarkdown();
        savedContent.value = currentContent.value;
        failedSave = undefined;
        saveError.value = '';
      }
      notification.show('AI 修改已应用并保存', 'success');
      teams.invalidateProjects();
      // Refresh failure must not mislabel an already committed review as failed.
      try {
        await refreshTree();
      } catch {
        notification.show('修改已保存，目录刷新失败，请稍后刷新', 'error');
      }
    } finally {
      aiBusy.value = false;
      handleEditorActivity();
    }
  }

  function retrySave() {
    if (saveConflict.value || saving.value || !canWrite.value) return;
    saveError.value = '';
    failedSave = undefined;
    const markdown = editorRef.value?.getMarkdown() ?? currentContent.value;
    currentContent.value = markdown;
    pendingSave = { key: activeDocKey.value, markdown, generation };
    void drainSaveQueue();
  }

  async function reloadAfterSaveError() {
    if (saving.value) return;
    if (hasUnsavedChanges()) {
      const accepted = await confirm({
        type: MessageType.WARNING,
        title: '重新加载文件',
        content: '重新加载会丢弃本页尚未保存的修改。请先复制需要保留的内容。',
        confirmText: '丢弃修改并重新加载',
        cancelText: '保留修改',
      });
      if (!accepted) return;
    }
    await loadDocument();
  }

  function handleCreateDoc() {
    if (!permission.folder(projectTree.value?.project).write || !activeDoc.value) return;
    openCreateDocument({
      project_key: activeDoc.value.project_key,
      folder_key: activeDoc.value.folder_key,
    });
  }

  function handleRenameDoc(doc: DocumentSummary) {
    if (!permission.document(doc, projectTree.value?.project).rename || busy.value) return;
    modal.showModal(ModalType.INPUT_DIALOG, {
      title: '重命名文件',
      tips: '文件名称',
      defaultValue: doc.file_name,
      okText: '保存',
      onOK: async (name) => {
        await updateDocument(doc.file_key, { file_name: name });
        if (activeDoc.value?.file_key === doc.file_key) activeDoc.value.file_name = name;
        notification.show('名称已更新', 'success');
        await refreshTree();
      },
    });
  }

  async function handleDeleteDoc(doc: DocumentSummary) {
    if (!permission.document(doc, projectTree.value?.project).remove || busy.value || saving.value)
      return;
    busy.value = true;
    const current = generation;
    const location = route.fullPath;
    try {
      const accepted = await confirm({
        type: MessageType.WARNING,
        title: '将文件移入回收站',
        content: `将「${doc.file_name}」移入回收站？已保存的正文和附件关联会保留，可在 30 天保留期限内恢复。${activeDocKey.value === doc.file_key && hasUnsavedChanges() ? '本页尚未保存的修改会丢失。' : ''}`,
        confirmText: '移入回收站',
      });
      if (!accepted || disposed || current !== generation || route.fullPath !== location) return;
      const result = await deleteDocument(doc.file_key);
      if (!result.success) throw new Error('移入回收站失败，请刷新后重试');
      teams.invalidateProjects();
      if (disposed || current !== generation) return;
      notification.show('文件已移入回收站', 'success');
      if (activeDocKey.value === doc.file_key) {
        const destination = desktopLocation(
          doc.project_key,
          doc.folder_key,
          projectTree.value?.project.team_key
        );
        clearSaveQueue();
        editorReady.value = false;
        activeDoc.value = null;
        attachments.value = [];
        generation++;
        attachmentGeneration++;
        await router.push(destination);
      } else await refreshTree();
    } catch (cause) {
      notification.show(errorMessage(cause), 'error', 0);
    } finally {
      busy.value = false;
    }
  }

  async function loadAttachments() {
    const key = activeDocKey.value;
    const current = ++attachmentGeneration;
    if (!key) return;
    try {
      const files = await listFiles(key);
      if (key === activeDocKey.value && current === attachmentGeneration) attachments.value = files;
    } catch (cause) {
      if (key === activeDocKey.value && current === attachmentGeneration)
        notification.show(errorMessage(cause, '附件加载失败'), 'error', 0);
    }
  }

  function handleDownload(file: FileInfo) {
    const key = activeDocKey.value;
    if (!key) return;
    downloadStore.enqueue(file, { kind: 'document', fileKey: key });
  }

  async function handlePreview(file: FileInfo) {
    if (!activeDocKey.value) return;
    try {
      await previewer.open(activeDocKey.value, file);
    } catch (cause) {
      notification.show(errorMessage(cause), 'error', 0);
    }
  }

  async function handleDeleteAttachment(file: FileInfo) {
    const key = activeDocKey.value;
    if (!key || !canWrite.value || busy.value) return;
    busy.value = true;
    try {
      const accepted = await confirm({
        type: MessageType.ERROR,
        title: '删除附件',
        content: `删除附件「${file.name}」？此操作无法撤销。`,
        confirmText: '删除',
      });
      if (!accepted) return;
      await deleteAttachment(key, file.hash);
      if (activeDocKey.value === key) await loadAttachments();
    } catch (cause) {
      notification.show(errorMessage(cause), 'error', 0);
    } finally {
      busy.value = false;
    }
  }

  async function uploadAttachments(files: FileList | File[]): Promise<FileInfo[]> {
    const key = activeDocKey.value;
    if (!key || !canWrite.value) return [];
    const uploaded = await uploadStore.uploadFiles(files, key);
    if (key !== activeDocKey.value) return [];
    await loadAttachments();
    if (key !== activeDocKey.value) return [];
    return uploaded.map(
      (file) => attachments.value.find((attachment) => attachment.hash === file.hash) ?? file
    );
  }

  async function triggerFileUpload(): Promise<FileInfo[]> {
    const key = activeDocKey.value;
    if (!key || !canWrite.value) return [];
    const files = await originalGetImportFiles(FILE_ACCEPT.ALL);
    if (!files.length || key !== activeDocKey.value) return [];
    return uploadAttachments(files);
  }

  function loadImage(
    hash: string,
    signal: AbortSignal,
    documentKey = activeDocKey.value
  ): Promise<Blob> {
    return downloadFile(documentKey, hash, { signal });
  }

  async function handleDrop(event: DragEvent) {
    isDragging.value = false;
    if (event.dataTransfer?.files) await uploadAttachments(event.dataTransfer.files);
  }

  watch(() => route.params.file_key, loadDocument, { immediate: true });
  watch([busy, canWrite, editorReady], handleEditorActivity);
  watch(
    [activeDoc, loadError, loading, dirty],
    () => {
      document.title = `${loading.value ? '正在加载文件' : loadError.value ? '文件不可用' : `${dirty.value ? '* ' : ''}${activeDoc.value?.file_name ?? '文件'}`} · Voex`;
    },
    { deep: true, immediate: true }
  );
  onBeforeUnmount(() => {
    disposed = true;
    clearSaveQueue();
    controller?.abort();
    generation++;
    attachmentGeneration++;
    window.removeEventListener('beforeunload', beforeUnload);
  });

  return {
    projectTree,
    activeDoc,
    activeDocKey,
    editorContent,
    attachments,
    uploadingFiles,
    loading,
    loadError,
    creating,
    saving,
    saveError,
    saveConflict,
    busy,
    aiBusy,
    prepareAIDocument,
    applyDocumentReview,
    dirty,
    canWrite,
    canShare,
    currentContent,
    retrySave,
    reloadAfterSaveError,
    editorReady,
    isDragging,
    editorRef,
    handleCreateDoc,
    handleDeleteDoc,
    handleRenameDoc,
    handleEditorReady,
    handleEditorChange,
    handleEditorActivity,
    handleCompositionStart,
    handleCompositionEnd,
    handleDownload,
    handlePreview,
    handleDeleteAttachment,
    triggerFileUpload,
    importImages: uploadAttachments,
    loadImage,
    handleDrop,
    loadAttachments,
    loadDocument,
    formatTime,
  };
}
