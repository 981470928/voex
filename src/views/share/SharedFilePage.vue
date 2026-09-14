<template>
  <main class="shared-file">
    <header class="shared-file__header">
      <span class="shared-file__brand">Voex</span>
      <h1>{{ file?.file_name || '分享文件' }}</h1>
      <span v-if="file" class="shared-file__permission">{{
        file.permissions.write ? '可编辑' : '只读'
      }}</span>
      <button
        v-if="file?.permissions.write"
        type="button"
        class="shared-file__button shared-file__button--primary"
        :disabled="!ready || !dirty || saving || conflict || composing || blocked"
        :aria-busy="saving"
        @click="save"
      >
        {{ saving ? '正在保存…' : '保存修改' }}
      </button>
    </header>
    <div v-if="loading || loadError" class="shared-file__state">
      <h2>{{ loading ? '正在打开文件…' : '无法打开分享文件' }}</h2>
      <p :role="loadError ? 'alert' : 'status'">{{ loadError || '正在检查链接并加载正文' }}</p>
      <button v-if="loadError" type="button" class="shared-file__button" @click="load">
        重新加载
      </button>
    </div>
    <template v-else-if="file">
      <div class="shared-file__details">
        <span class="shared-file__creator" aria-hidden="true">{{
          file.creator.name.slice(0, 1)
        }}</span>
        <span>{{ file.creator.name }}</span>
        <span>创建于 {{ formatTime(file.created_at) }}</span>
        <span class="shared-file__save-status" role="status">{{
          saving
            ? '正在保存'
            : dirty
              ? '有未保存的修改'
              : file.permissions.write
                ? '修改后请点击保存'
                : '此链接仅允许阅读'
        }}</span>
      </div>
      <div v-if="saveError" class="shared-file__notice" role="alert">
        <p>{{ saveError }}</p>
        <div class="shared-file__notice-actions">
          <button type="button" class="shared-file__button" @click="showDraft = true">
            复制本地内容
          </button>
          <button
            v-if="conflict || blocked"
            type="button"
            class="shared-file__button"
            :disabled="saving"
            @click="reload"
          >
            重新加载
          </button>
          <button
            v-else
            type="button"
            class="shared-file__button"
            :disabled="saving || composing"
            @click="save"
          >
            重试保存
          </button>
        </div>
      </div>
      <section
        class="shared-file__document"
        aria-label="分享文件正文"
        @compositionstart.capture="composing = true"
        @compositionend.capture="composing = false"
      >
        <MilkdownProvider :key="editorVersion">
          <MilkdownEditor
            ref="editor"
            :default-value="file.file_content ?? ''"
            :attachments="file.attachments"
            :allow-attachments="false"
            :readonly="!file.permissions.write || blocked"
            :on-preview-attachment="previewAttachment"
            @ready="onReady"
            @change="content = $event"
          />
        </MilkdownProvider>
      </section>
      <section
        v-if="file.attachments.length"
        class="shared-file__attachments"
        aria-label="文件附件"
      >
        <h2>
          附件 <span>{{ file.attachments.length }}</span>
        </h2>
        <ul>
          <li v-for="attachment in file.attachments" :key="attachment.hash">
            <span>{{ attachment.name }}</span>
            <button
              type="button"
              class="shared-file__button"
              :disabled="!!attachmentBusy || blocked"
              @click="previewAttachment(attachment)"
            >
              预览
            </button>
            <button
              type="button"
              class="shared-file__button"
              :disabled="!!attachmentBusy || blocked"
              @click="downloadAttachment(attachment)"
            >
              下载
            </button>
          </li>
        </ul>
        <p v-if="attachmentBusy" role="status">正在读取附件…</p>
        <p v-if="attachmentError" class="shared-file__attachment-error" role="alert">
          {{ attachmentError }}
        </p>
      </section>
    </template>
    <LocalDraftDialog v-model="showDraft" :content="localContent" />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { isAxiosError } from 'axios';
import { MilkdownProvider } from '@milkdown/vue';
import MilkdownEditor from '@/components/milkdown/MilkdownEditor.vue';
import LocalDraftDialog from '@/components/share/LocalDraftDialog.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useNotificationStore } from '@/stores/notification';
import { usePreviewerStore } from '@/stores/previewer';
import { MessageType } from '@/constant/status';
import { errorMessage } from '@/utils/error';
import { formatTime } from '@/utils/workspace';
import type { FileInfo } from '@/service/api/document-api';
import {
  downloadSharedAttachment,
  getSharedFile,
  restoreOptionalShareSession,
  updateSharedFile,
  type SharedFile,
} from '@/service/api/share-api';

const route = useRoute();
const { confirm } = useConfirm();
const notification = useNotificationStore();
const previewer = usePreviewerStore();
const file = ref<SharedFile | null>(null);
const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const saving = ref(false);
const conflict = ref(false);
const blocked = ref(false);
const composing = ref(false);
const ready = ref(false);
const content = ref('');
const savedContent = ref('');
const editorVersion = ref(0);
const editor = ref<InstanceType<typeof MilkdownEditor>>();
const showDraft = ref(false);
const attachmentBusy = ref('');
const attachmentError = ref('');
const dirty = computed(() => ready.value && content.value !== savedContent.value);
const localContent = computed(() => {
  void showDraft.value;
  return editor.value?.getMarkdown() ?? content.value;
});
let controller: AbortController | undefined;
let generation = 0;
let token = '';
let leaveCheck: Promise<boolean> | undefined;
let disposed = false;
let optionalSessionAttempted = false;
const objectUrls = new Set<string>();

// Fragment tokens never reach HTTP URLs or referrer headers.
const referrerMeta = document.createElement('meta');
referrerMeta.name = 'referrer';
referrerMeta.content = 'no-referrer';
document.head.append(referrerMeta);

function parseToken() {
  try {
    return decodeURIComponent(route.hash.slice(1));
  } catch {
    return '';
  }
}

async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  const current = ++generation;
  token = parseToken();
  loading.value = true;
  document.title = '正在打开分享文件 · Voex';
  loadError.value = '';
  saveError.value = '';
  attachmentError.value = '';
  attachmentBusy.value = '';
  conflict.value = false;
  blocked.value = false;
  file.value = null;
  ready.value = false;
  previewer.close();
  try {
    if (!token || token.length > 512) throw new Error('分享链接无效，请联系分享者获取完整链接。');
    if (!optionalSessionAttempted) {
      optionalSessionAttempted = true;
      await restoreOptionalShareSession();
    }
    if (request.signal.aborted) return;
    const result = await getSharedFile(token, request.signal);
    if (request.signal.aborted || current !== generation) return;
    file.value = result;
    content.value = result.file_content ?? '';
    savedContent.value = content.value;
    editorVersion.value++;
    document.title = `${result.file_name} · 分享 · Voex`;
  } catch (cause) {
    if (request.signal.aborted || current !== generation) return;
    loadError.value =
      isAxiosError(cause) && cause.response?.status === 404
        ? '分享链接已失效或被撤销，请联系分享者。'
        : errorMessage(cause, '文件加载失败，请重试');
    document.title = '分享文件不可用 · Voex';
  } finally {
    if (current === generation) loading.value = false;
  }
}

function onReady(markdown: string) {
  content.value = markdown;
  savedContent.value = markdown;
  ready.value = true;
}

async function save() {
  if (
    !file.value?.permissions.write ||
    saving.value ||
    conflict.value ||
    composing.value ||
    blocked.value ||
    !ready.value
  )
    return;
  const snapshot = editor.value?.getMarkdown() ?? content.value;
  content.value = snapshot;
  if (snapshot === savedContent.value) return;
  const current = generation;
  saving.value = true;
  saveError.value = '';
  try {
    await restoreOptionalShareSession();
    const result = await updateSharedFile(token, snapshot, file.value.revision);
    if (disposed || current !== generation) return;
    if (!result.success) throw new Error('保存未完成，修改已保留，请重试。');
    file.value.revision = result.revision;
    savedContent.value = snapshot;
    notification.show('修改已保存', 'success');
  } catch (cause) {
    if (disposed || current !== generation) return;
    const status = isAxiosError(cause) ? cause.response?.status : undefined;
    conflict.value = status === 409;
    blocked.value = status === 403 || status === 404;
    saveError.value = conflict.value
      ? '其他人已更新此文件，当前修改尚未保存。请先复制本地内容，再重新加载并合并修改。'
      : blocked.value
        ? '链接已失效或当前编辑权限已取消，修改仍保留在本页。请复制本地内容。'
        : errorMessage(cause, '保存失败，修改已保留，请重试。');
  } finally {
    if (current === generation) saving.value = false;
  }
}

async function reload() {
  if (saving.value) return;
  if (
    dirty.value &&
    !(await confirm({
      type: MessageType.WARNING,
      title: '重新加载文件',
      content: '重新加载会丢弃本页尚未保存的修改。请先复制需要保留的内容。',
      confirmText: '丢弃修改并重新加载',
      cancelText: '保留修改',
    }))
  )
    return;
  await load();
}

async function mayLeave() {
  if (saving.value) return false;
  if (!dirty.value) return true;
  if (!leaveCheck)
    leaveCheck = confirm({
      type: MessageType.WARNING,
      title: '尚有未保存的修改',
      content: '离开后将丢失当前文件尚未保存的修改。',
      confirmText: '放弃修改并离开',
      cancelText: '继续编辑',
    });
  try {
    return await leaveCheck;
  } finally {
    leaveCheck = undefined;
  }
}
onBeforeRouteLeave(mayLeave);
onBeforeRouteUpdate((to, from) => (to.hash !== from.hash ? mayLeave() : true));

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !saving.value) return;
  event.preventDefault();
  event.returnValue = '';
}
window.addEventListener('beforeunload', beforeUnload);

async function readAttachment(attachment: FileInfo, preview: boolean) {
  if (
    attachmentBusy.value ||
    blocked.value ||
    !file.value?.attachments.some((item) => item.hash === attachment.hash)
  )
    return;
  const current = generation;
  attachmentBusy.value = attachment.hash;
  attachmentError.value = '';
  try {
    const blob = await downloadSharedAttachment(token, attachment.hash, controller?.signal);
    if (disposed || current !== generation) return;
    if (preview) {
      previewer.file = new File([blob], attachment.name, { type: attachment.mime });
      previewer.visible = true;
    } else {
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.rel = 'noreferrer';
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrls.delete(url);
      }, 1000);
    }
  } catch (cause) {
    if (!disposed && current === generation)
      attachmentError.value =
        '附件无法读取，请检查链接是否仍然有效后重试。' +
        (isAxiosError(cause) && !cause.response ? ' 当前无法连接服务器。' : '');
  } finally {
    if (current === generation) attachmentBusy.value = '';
  }
}
function previewAttachment(attachment: FileInfo) {
  void readAttachment(attachment, true);
}
function downloadAttachment(attachment: FileInfo) {
  void readAttachment(attachment, false);
}

watch(() => route.hash, load, { immediate: true });
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  token = '';
  controller?.abort();
  previewer.close();
  referrerMeta.remove();
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style scoped lang="stylus">
.shared-file
  min-height 100dvh
  background var(--color-bg-primary)
  color var(--color-text-primary)
  &__header
    display flex
    align-items center
    gap 16px
    min-height 64px
    padding 12px 32px
    border-bottom 1px solid var(--color-border-primary)
    h1
      flex 1
      min-width 0
      overflow-wrap anywhere
      font-size 16px
      font-weight 600
  &__brand
    font-size 18px
    font-weight 650
    color var(--color-text-secondary)
  &__permission
    flex-shrink 0
    padding 4px 8px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    color var(--color-text-secondary)
    font-size 12px
  &__details
    display flex
    align-items center
    flex-wrap wrap
    gap 10px
    max-width 860px
    min-height 68px
    margin 0 auto
    padding 16px 52px
    box-sizing border-box
    color var(--color-text-secondary)
    font-size 12px
  &__creator
    display inline-flex
    align-items center
    justify-content center
    width 24px
    height 24px
    border-radius 50%
    background var(--color-bg-translucent)
  &__save-status
    margin-left auto
  &__document
    max-width 1000px
    margin 0 auto
    min-height 360px
  &__state
    display flex
    flex-direction column
    align-items center
    justify-content center
    gap 18px
    padding 48px 24px
    min-height 360px
    text-align center
    h2
      font-size 20px
    p
      font-size 14px
      color var(--color-text-secondary)
  &__button
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    min-height 36px
    padding 6px 14px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    background var(--color-bg-panel)
    color var(--color-text-primary)
    font-size 13px
    cursor pointer
    &:hover:not(:disabled)
      border-color var(--color-accent)
      background var(--color-accent-tint)
    &:active:not(:disabled)
      filter brightness(.94)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:disabled
      opacity .5
      cursor not-allowed
    &--primary
      min-width 100px
      background var(--color-brand-bg)
      color var(--color-brand-text)
      &:hover:not(:disabled)
        background var(--color-brand-bg)
        opacity .9
  &__notice
    max-width 760px
    margin 0 auto 16px
    padding 14px
    border 1px solid var(--color-red)
    border-radius 6px
    font-size 13px
    line-height 1.7
    p
      color var(--color-red)
  &__notice-actions
    display flex
    flex-wrap wrap
    gap 8px
    margin-top 10px
  &__attachments
    max-width 756px
    margin 0 auto
    padding 24px 0 48px
    border-top 1px solid var(--color-border-primary)
    h2
      font-size 14px
      font-weight 600
      span
        margin-left 6px
        color var(--color-text-secondary)
    ul
      list-style none
      padding 12px 0
    li
      display flex
      align-items center
      gap 8px
      padding 8px 0
      span
        flex 1
        min-width 0
        overflow-wrap anywhere
        font-size 13px
    p
      font-size 13px
  &__attachment-error
    color var(--color-red)
  @media (max-width: 720px)
    &__header
      padding 12px 16px
      gap 10px
      flex-wrap wrap
      h1
        min-width 150px
    &__brand
      display none
    &__details
      padding 16px 32px
    &__save-status
      width 100%
      margin-left 0
    &__notice, &__attachments
      margin-left 16px
      margin-right 16px
</style>
