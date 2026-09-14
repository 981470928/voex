<template>
  <VoexModal
    :model-value="modelValue"
    title="分享文件"
    :width="500"
    :busy="busy"
    :mask-closable="false"
    @close="$emit('update:modelValue', false)"
  >
    <div class="file-share">
      <p class="file-share__name">{{ fileName }}</p>
      <p class="file-share__hint">
        任何获得链接的人都能访问此文件，无需登录。链接不会开放项目目录。
      </p>
      <form novalidate class="file-share__form" @submit.prevent="create">
        <fieldset :disabled="busy">
          <legend>链接权限</legend>
          <label class="file-share__choice"
            ><input v-model="permission" type="radio" value="read" :name="permissionId" />只读<span
              >查看正文和附件</span
            ></label
          >
          <label class="file-share__choice"
            ><input v-model="permission" type="radio" value="edit" :name="permissionId" />编辑<span
              >查看附件、修改正文</span
            ></label
          >
        </fieldset>
        <button
          type="submit"
          class="file-share__button file-share__button--primary"
          :disabled="busy || loading"
        >
          {{ creating ? '正在创建…' : '创建链接' }}
        </button>
      </form>
      <div v-if="createdUrl" class="file-share__created" role="status">
        <p>链接已创建，关闭后无法再次查看。请复制保存。</p>
        <label :for="urlId">{{ createdPermission === 'edit' ? '编辑链接' : '只读链接' }}</label>
        <input
          :id="urlId"
          ref="urlField"
          :type="showUrl ? 'text' : 'password'"
          :value="createdUrl"
          readonly
          autocomplete="off"
          spellcheck="false"
          @focus="urlField?.select()"
        />
        <div class="file-share__actions">
          <button
            type="button"
            class="file-share__button"
            :aria-pressed="showUrl"
            @click="showUrl = !showUrl"
          >
            {{ showUrl ? '隐藏链接' : '显示链接' }}
          </button>
          <button type="button" class="file-share__button" @click="copy">复制链接</button>
        </div>
      </div>
      <p v-if="error" class="file-share__error" role="alert">{{ error }}</p>
      <section class="file-share__history" aria-label="分享记录">
        <h3>分享记录</h3>
        <p v-if="loading" role="status">正在加载分享记录…</p>
        <div v-else-if="loadError" role="alert">
          <p>{{ loadError }}</p>
          <button type="button" class="file-share__button" @click="load">重试</button>
        </div>
        <p v-else-if="!shares.length" class="file-share__hint">还没有分享链接。</p>
        <ul v-else>
          <li v-for="share in shares.slice(0, shown)" :key="share.id" class="file-share__record">
            <div>
              <p>
                {{ share.permission === 'edit' ? '编辑链接' : '只读链接'
                }}<span v-if="share.revoked_at"> · 已撤销</span>
              </p>
              <small>{{ share.created_by.name }} · {{ formatTime(share.created_at) }}</small>
            </div>
            <button
              v-if="!share.revoked_at && share.can_revoke"
              type="button"
              class="file-share__button file-share__button--danger"
              :disabled="busy"
              @click="revoke(share)"
            >
              撤销
            </button>
          </li>
        </ul>
        <button
          v-if="shown < shares.length"
          type="button"
          class="file-share__button"
          @click="shown += 10"
        >
          显示更多
        </button>
      </section>
    </div>
  </VoexModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { VoexModal } from '@/plugins/voex-modal';
import { useConfirm } from '@/composables/useConfirm';
import { useNotificationStore } from '@/stores/notification';
import { MessageType } from '@/constant/status';
import { errorMessage } from '@/utils/error';
import { formatTime } from '@/utils/workspace';
import {
  createFileShare,
  fileShareUrl,
  listFileShares,
  revokeFileShare,
  type FileShare,
  type SharePermission,
} from '@/service/api/share-api';

const props = defineProps<{ modelValue: boolean; fileKey: string; fileName: string }>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
const shares = ref<FileShare[]>([]);
const permission = ref<SharePermission>('read');
const createdPermission = ref<SharePermission>('read');
const createdUrl = ref('');
const createdId = ref('');
const showUrl = ref(false);
const loading = ref(false);
const creating = ref(false);
const revoking = ref(false);
const busy = computed(() => creating.value || revoking.value);
const error = ref('');
const loadError = ref('');
const shown = ref(10);
const urlField = ref<HTMLInputElement>();
const permissionId = useId();
const urlId = useId();
const { confirm } = useConfirm();
const notification = useNotificationStore();
let controller: AbortController | undefined;

async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listFileShares(props.fileKey, request.signal);
    if (!request.signal.aborted) shares.value = result;
  } catch (cause) {
    if (!request.signal.aborted) loadError.value = errorMessage(cause, '分享记录加载失败');
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}

async function create() {
  if (busy.value || loading.value) return;
  creating.value = true;
  error.value = '';
  try {
    if (
      createdUrl.value &&
      !(await confirm({
        title: '创建另一条链接',
        content: '当前链接关闭后无法再次查看。请确认已复制保存，再创建新的链接。',
        confirmText: '创建另一条',
        cancelText: '返回复制',
      }))
    )
      return;
    const result = await createFileShare(props.fileKey, permission.value);
    createdUrl.value = fileShareUrl(result.token);
    createdId.value = result.id;
    createdPermission.value = result.permission;
    showUrl.value = false;
    await load();
  } catch (cause) {
    error.value = `${errorMessage(cause, '链接创建结果未确认')}。请检查分享记录；未取得链接的记录可以撤销后重新创建。`;
    await load();
  } finally {
    creating.value = false;
  }
}

async function revoke(share: FileShare) {
  if (busy.value || share.revoked_at || !share.can_revoke) return;
  revoking.value = true;
  error.value = '';
  try {
    const accepted = await confirm({
      type: MessageType.WARNING,
      title: '撤销分享链接',
      content:
        '撤销后，持有此链接的人将无法继续通过该链接访问文件。其他链接和项目成员权限不受影响。',
      confirmText: '撤销链接',
    });
    if (!accepted) return;
    await revokeFileShare(props.fileKey, share.id);
    if (share.id === createdId.value) createdUrl.value = '';
    notification.show('分享链接已撤销', 'success');
    await load();
  } catch (cause) {
    error.value = errorMessage(cause, '撤销失败，请重试');
  } finally {
    revoking.value = false;
  }
}

async function copy() {
  error.value = '';
  try {
    await navigator.clipboard.writeText(createdUrl.value);
    notification.show('分享链接已复制', 'success');
  } catch {
    showUrl.value = true;
    await nextTick();
    urlField.value?.focus();
    urlField.value?.select();
    error.value = '浏览器未允许复制，请选中链接并使用 Ctrl / ⌘ C 复制。';
  }
}

watch(
  () => [props.modelValue, props.fileKey] as const,
  ([visible]) => {
    controller?.abort();
    createdUrl.value = '';
    createdId.value = '';
    showUrl.value = false;
    error.value = '';
    shares.value = [];
    shown.value = 10;
    if (visible) void load();
  },
  { immediate: true }
);
onBeforeUnmount(() => controller?.abort());
</script>

<style scoped lang="stylus">
.file-share
  display grid
  gap 16px
  color var(--color-text-primary)
  font-size 13px
  line-height 1.65
  &__name
    font-weight 600
    overflow-wrap anywhere
  &__hint, small
    color var(--color-text-secondary)
  &__form
    display grid
    gap 12px
    fieldset
      display grid
      gap 8px
      padding 0
      border 0
    legend
      margin-bottom 8px
      font-weight 600
  &__choice
    display flex
    align-items center
    gap 8px
    min-height 36px
    cursor pointer
    input
      accent-color var(--color-accent)
    span
      margin-left auto
      color var(--color-text-secondary)
      font-size 12px
  &__button
    min-height 36px
    padding 6px 12px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    background var(--color-bg-panel)
    color var(--color-text-primary)
    cursor pointer
    white-space nowrap
    &:hover:not(:disabled)
      background var(--color-accent-tint)
      border-color var(--color-accent)
    &:active:not(:disabled)
      filter brightness(.94)
    &:disabled
      opacity .55
      cursor not-allowed
    &--primary
      color var(--color-brand-text)
      background var(--color-brand-bg)
      &:hover:not(:disabled)
        background var(--color-brand-bg)
        opacity .9
    &--danger
      color var(--color-red)
  &__created
    display grid
    gap 8px
    padding 12px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    background var(--color-bg-translucent)
    input
      width 100%
      box-sizing border-box
      height 38px
      padding 8px
      border 1px solid var(--color-border-primary)
      border-radius 6px
      background var(--color-bg-primary)
      color var(--color-text-primary)
  &__actions
    display flex
    gap 8px
  &__error
    color var(--color-red)
  &__history
    min-height 100px
    h3
      margin-bottom 8px
      font-size 13px
    ul
      list-style none
      padding 0
      max-height 250px
      overflow-y auto
  &__record
    display flex
    align-items center
    justify-content space-between
    gap 12px
    padding 10px 0
    border-bottom 1px solid var(--color-border-primary)
    div
      min-width 0
      overflow-wrap anywhere
  button:focus-visible, input:focus-visible
    outline 2px solid var(--color-accent)
    outline-offset 2px
</style>
