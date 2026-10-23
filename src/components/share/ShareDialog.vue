<template>
  <VoexModal
    :model-value="modelValue"
    title="分享文件"
    :width="560"
    :busy="busy"
    :mask-closable="false"
    @close="$emit('update:modelValue', false)"
  >
    <div class="file-share">
      <p class="file-share__name">{{ fileName }}</p>
      <p class="file-share__hint">
        每份文件有固定的只读和编辑链接。关闭链接不会收回已经授予的权限。
      </p>
      <p v-if="loading" role="status">正在读取分享设置…</p>
      <div v-else-if="loadError" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="file-share__button" @click="load">重新读取</button>
      </div>
      <template v-else-if="settings">
        <section v-for="link in settings.links" :key="link.permission" class="file-share__created">
          <div class="file-share__actions">
            <strong>{{ link.permission === 'edit' ? '编辑链接' : '只读链接' }}</strong>
            <button
              v-if="settings.can_manage"
              type="button"
              role="switch"
              :aria-label="link.permission === 'edit' ? '编辑链接' : '只读链接'"
              :aria-checked="link.enabled"
              :disabled="busy"
              class="file-share__button"
              @click="toggle(link)"
            >
              {{ link.enabled ? '已开启' : '已关闭' }}
            </button>
            <span v-else>{{ link.enabled ? '已开启' : '已关闭，需项目编辑者开启' }}</span>
          </div>
          <label :for="id + '-' + link.permission">{{
            link.permission === 'edit' ? '编辑链接地址' : '只读链接地址'
          }}</label>
          <input
            :id="id + '-' + link.permission"
            :type="shown[link.permission] ? 'text' : 'password'"
            :value="fileShareUrl(link.token)"
            readonly
            autocomplete="off"
            spellcheck="false"
          />
          <div class="file-share__actions">
            <button
              type="button"
              class="file-share__button"
              :aria-pressed="shown[link.permission]"
              @click="shown[link.permission] = !shown[link.permission]"
            >
              {{ shown[link.permission] ? '隐藏链接' : '显示链接' }}
            </button>
            <button
              type="button"
              class="file-share__button"
              :disabled="busy || !link.enabled"
              @click="copy(link)"
            >
              复制链接
            </button>
          </div>
        </section>
        <section v-if="settings.can_manage" class="file-share__history" aria-label="文件权限管理">
          <h3>文件权限管理</h3>
          <p class="file-share__hint">
            团队只读成员可取消额外编辑权限；外部用户可移除文件授权。链接仍开启时，再次访问可重新获得权限。
          </p>
          <p v-if="!settings.access.length">暂无可取消的额外授权。</p>
          <ul v-else>
            <li v-for="grant in settings.access" :key="grant.user_id" class="file-share__record">
              <div>
                <p>{{ grant.name }}</p>
                <small
                  >{{ grant.member ? '团队成员' : '外部用户' }} ·
                  {{ grant.permission === 'edit' ? '可编辑' : '只读' }}</small
                >
              </div>
              <button
                type="button"
                class="file-share__button file-share__button--danger"
                :disabled="busy"
                @click="revoke(grant)"
              >
                {{ grant.member ? '取消编辑权限' : '移除权限' }}
              </button>
            </li>
          </ul>
        </section>
      </template>
      <p class="file-share__error" role="alert">{{ error }}</p>
    </div>
  </VoexModal>
</template>
<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { VoexModal } from '@/plugins/voex-modal';
import { useConfirm } from '@/composables/useConfirm';
import { useNotificationStore } from '@/stores/notification';
import { errorMessage } from '@/utils/error';
import {
  getFileSharing,
  setFileSharing,
  revokeFileAccess,
  fileShareUrl,
  type SharingSettings,
  type ShareLink,
  type FileGrant,
} from '@/service/api/share-api';
const props = defineProps<{ modelValue: boolean; fileKey: string; fileName: string }>();
defineEmits<{ 'update:modelValue': [boolean] }>();
const id = useId();
const settings = ref<SharingSettings | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const loadError = ref('');
const shown = reactive({ read: false, edit: false });
const { confirm } = useConfirm();
const notification = useNotificationStore();
let controller: AbortController | undefined;
let disposed = false;
async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getFileSharing(props.fileKey, request.signal);
    if (!request.signal.aborted) settings.value = result;
  } catch (cause) {
    if (!request.signal.aborted) loadError.value = errorMessage(cause, '分享设置读取失败');
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
async function toggle(link: ShareLink) {
  if (busy.value || !settings.value?.can_manage) return;
  busy.value = true;
  error.value = '';
  try {
    const accepted = await confirm({
      title: link.enabled ? '关闭分享链接' : '开启分享链接',
      content: link.enabled
        ? '关闭后，无已有权限的人不能通过此链接访问或获得权限；已有授权不受影响。'
        : '获得此链接的人可以阅读；登录后可获得对应的文件权限。',
      confirmText: link.enabled ? '关闭链接' : '开启链接',
    });
    if (!accepted || disposed) return;
    await setFileSharing(props.fileKey, link.permission, !link.enabled);
    if (!disposed) await load();
  } catch (cause) {
    if (!disposed) error.value = errorMessage(cause, '分享开关更新失败');
  } finally {
    busy.value = false;
  }
}
async function revoke(grant: FileGrant) {
  if (busy.value || !settings.value?.can_manage) return;
  busy.value = true;
  error.value = '';
  try {
    const accepted = await confirm({
      title: grant.member ? '取消文件编辑权限' : '移除文件权限',
      content: `${grant.member ? '取消后仍保留项目只读权限。' : '移除后不再拥有此文件的独立授权。'}如果分享链接仍开启，对方再次访问可重新获得权限。`,
      confirmText: grant.member ? '取消编辑权限' : '移除权限',
    });
    if (!accepted || disposed) return;
    await revokeFileAccess(props.fileKey, grant.user_id);
    if (!disposed) await load();
  } catch (cause) {
    if (!disposed) error.value = errorMessage(cause, '权限更新失败');
  } finally {
    busy.value = false;
  }
}
async function copy(link: ShareLink) {
  try {
    await navigator.clipboard.writeText(fileShareUrl(link.token));
    notification.show('分享链接已复制', 'success');
  } catch {
    shown[link.permission] = true;
    error.value = '复制失败，请选中链接手动复制。';
  }
}
watch(
  () => [props.modelValue, props.fileKey] as const,
  ([visible]) => {
    controller?.abort();
    settings.value = null;
    error.value = '';
    shown.read = false;
    shown.edit = false;
    if (visible) void load();
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  controller?.abort();
});
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
