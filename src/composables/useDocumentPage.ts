import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { isAxiosError } from 'axios';
import MilkdownEditor from '@/components/milkdown/MilkdownEditor.vue';
import { listFiles, downloadFile, deleteAttachment } from '@/service/api/upload-api';
import {
  getDocument,
  updateDocument,
  deleteDocument,
  type DocumentInfo,
  type DocumentSummary,
  type FileInfo,
} from '@/service/api/document-api';
import { getProjectTree, type ProjectTree } from '@/service/api/workspace-api';
import { useFileUpload } from '@/utils/dom';
import { desktopLocation, formatTime } from '@/utils/workspace';
import { errorMessage } from '@/utils/error';
import { useUploadStore } from '@/stores/upload';
import { usePreviewerStore } from '@/stores/previewer';
import { useModalStore, ModalType } from '@/stores/modal';
import { useNotificationStore } from '@/stores/notification';
import { MessageType } from '@/constant/status';
import { useConfirm } from './useConfirm';
import { useCreateDocument } from './useCreateDocument';

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
  const isDragging = ref(false);
  const showDocDrawer = ref(false);
  const showAttachDrawer = ref(false);
  const editorRef = ref<InstanceType<typeof MilkdownEditor> | null>(null);
  const editorReady = ref(false);
  const currentContent = ref('');
  const savedContent = ref('');
  const modal = useModalStore();
  const notification = useNotificationStore();
  const previewer = usePreviewerStore();
  const uploadStore = useUploadStore();
  const { uploadingFiles } = storeToRefs(uploadStore);
  const { selectFiles } = useFileUpload();
  const { confirm } = useConfirm();
  const { creating, openCreateDocument } = useCreateDocument();
  const activeDocKey = computed(() => activeDoc.value?.file_key ?? '');
  const editorContent = computed(() => activeDoc.value?.file_content ?? '');
  const canWrite = computed(() => activeDoc.value?.permissions.write === true);
  const canShare = computed(() => activeDoc.value?.permissions.share === true);
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
      !busy.value
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
    if (saving.value) return false;
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
    if (!hasUnsavedChanges() && !saving.value) return;
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
    showDocDrawer.value = false;
    showAttachDrawer.value = false;
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
    if (!canWrite.value || !activeDoc.value) return;
    openCreateDocument({
      project_key: activeDoc.value.project_key,
      folder_key: activeDoc.value.folder_key,
    });
  }

  function handleRenameDoc(doc: DocumentSummary) {
    if (!canWrite.value || busy.value) return;
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
    if (!canWrite.value || busy.value || saving.value) return;
    busy.value = true;
    try {
      const accepted = await confirm({
        type: MessageType.ERROR,
        title: '删除文件',
        content: `删除「${doc.file_name}」及其附件关联？未保存的内容也将丢失，此操作无法撤销。`,
        confirmText: '删除',
      });
      if (!accepted) return;
      await deleteDocument(doc.file_key);
      notification.show('文件已删除', 'success');
      if (activeDocKey.value === doc.file_key) {
        editorReady.value = false;
        await router.push(
          desktopLocation(doc.project_key, doc.folder_key, projectTree.value?.project.team_key)
        );
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

  async function handleDownload(file: FileInfo) {
    const key = activeDocKey.value;
    if (!key) return;
    try {
      const blob = await downloadFile(key, file.hash);
      if (!blob) throw new Error('附件下载失败');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      notification.show(errorMessage(cause), 'error', 0);
    }
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

  async function uploadAttachments(files: FileList): Promise<FileInfo[]> {
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
    const files = await selectFiles();
    if (!files || key !== activeDocKey.value) return [];
    return uploadAttachments(files);
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
    dirty,
    canWrite,
    canShare,
    currentContent,
    retrySave,
    reloadAfterSaveError,
    editorReady,
    isDragging,
    showDocDrawer,
    showAttachDrawer,
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
    handleDrop,
    loadAttachments,
    loadDocument,
    formatTime,
  };
}
