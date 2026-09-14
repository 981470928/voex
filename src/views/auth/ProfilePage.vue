<template>
  <AuthLayout title="账户资料" description="更新大家看到的你。" wide>
    <form
      class="auth-form"
      novalidate
      :aria-busy="busy || loading"
      @submit.prevent="save"
      @keydown.enter="guardComposition"
    >
      <p v-if="loading" class="profile-page__status" role="status">正在加载资料…</p>
      <p class="profile-page__account">
        账号 <span>{{ authUser?.account }}</span>
      </p>
      <ProfileFields
        ref="profileFields"
        v-model="profile"
        :errors="errors"
        :disabled="busy || loading"
        @composition="composing = $event"
      />
      <AvatorPicker
        v-model="avator"
        :current="removeAvator ? '' : authUser?.avator"
        :disabled="busy || loading"
        @remove="removeAvator = true"
      />
      <p v-if="uploading" class="profile-page__status" role="status">
        正在上传头像 {{ progress }}%
      </p>
      <p class="auth-form__error" role="alert">{{ error }}</p>
      <button class="auth-form__submit" type="submit" :disabled="busy || loading || !dirty">
        <span v-if="busy" class="auth-form__spinner" aria-hidden="true" />{{
          busy ? '正在保存…' : '保存资料'
        }}
      </button>
      <button v-if="uploading" class="auth-form__link" type="button" @click="cancelUpload">
        取消上传
      </button>
      <button
        v-if="loadFailed"
        class="auth-form__link"
        type="button"
        :disabled="loading"
        @click="load"
      >
        重新加载资料
      </button>
      <RouterLink class="auth-form__link" to="/home">返回工作台</RouterLink>
    </form>
    <div class="profile-page__logout">
      <button type="button" class="auth-form__link" :disabled="busy || signingOut" @click="signOut">
        {{ signingOut ? '正在退出…' : '退出登录' }}
      </button>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRouter } from 'vue-router';
import AuthLayout from '@/components/auth/AuthLayout.vue';
import ProfileFields from '@/components/auth/ProfileFields.vue';
import AvatorPicker from '@/components/auth/AvatorPicker.vue';
import { authUser } from '@/service/auth-session';
import { getProfile, logout, updateProfile } from '@/service/api/auth-api';
import { uploadAsset } from '@/service/api/upload-api';
import { profileErrors } from '@/utils/auth';
import { errorMessage } from '@/utils/error';
import { useNotificationStore } from '@/stores/notification';
import { useConfirm } from '@/composables/useConfirm';

const router = useRouter();
const notification = useNotificationStore();
const { confirm } = useConfirm();
const profile = ref({ name: '', email: '', phone: '' });
const initial = ref('');
const avator = ref<File | null>(null);
const removeAvator = ref(false);
const errors = reactive({ name: '', email: '', phone: '' });
const profileFields = ref<InstanceType<typeof ProfileFields>>();
const busy = ref(false);
const loading = ref(false);
const loadFailed = ref(false);
const signingOut = ref(false);
const uploading = ref(false);
const progress = ref(0);
const composing = ref(false);
const error = ref('');
const dirty = computed(
  () => JSON.stringify(profile.value) !== initial.value || !!avator.value || removeAvator.value
);
let controller: AbortController | undefined;
let uploadedAvator = '';
let approvedLeave = false;
let disposed = false;
function populate() {
  const user = authUser.value;
  profile.value = { name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '' };
  initial.value = JSON.stringify(profile.value);
}
populate();
async function load() {
  loading.value = true;
  loadFailed.value = false;
  error.value = '';
  try {
    await getProfile();
    if (!disposed) populate();
  } catch (cause) {
    if (!disposed) {
      error.value = errorMessage(cause, '资料加载失败');
      loadFailed.value = true;
    }
  } finally {
    loading.value = false;
  }
}
function guardComposition(event: KeyboardEvent) {
  if (event.isComposing || composing.value) event.preventDefault();
}
function cancelUpload() {
  controller?.abort();
}
async function save() {
  if (busy.value || loading.value || composing.value || !dirty.value) return;
  Object.assign(errors, profileErrors(profile.value));
  await nextTick();
  if (Object.values(errors).some(Boolean)) return profileFields.value?.focusError();
  busy.value = true;
  error.value = '';
  try {
    if (avator.value && !uploadedAvator) {
      controller = new AbortController();
      uploading.value = true;
      progress.value = 0;
      const asset = await uploadAsset(avator.value, 'avator', {
        signal: controller.signal,
        onProgress: (value) => {
          progress.value = value;
        },
      });
      uploadedAvator = asset.url;
      uploading.value = false;
    }
    await updateProfile({
      ...profile.value,
      name: profile.value.name.trim(),
      avator: uploadedAvator || (removeAvator.value ? '' : (authUser.value?.avator ?? '')),
    });
    avator.value = null;
    removeAvator.value = false;
    populate();
    notification.show('资料已保存', 'success');
  } catch (cause) {
    error.value = controller?.signal.aborted
      ? '上传已取消，资料尚未保存'
      : errorMessage(cause, '保存失败，已保留修改');
  } finally {
    busy.value = false;
    uploading.value = false;
    controller = undefined;
  }
}
async function mayLeave() {
  if (busy.value || signingOut.value) return false;
  if (approvedLeave || !dirty.value) return true;
  return confirm({
    title: '资料尚未保存',
    content: '离开后将丢失本次资料修改。',
    confirmText: '放弃修改并离开',
    cancelText: '继续编辑',
  });
}
async function signOut() {
  if (busy.value || signingOut.value) return;
  if (
    !(await confirm({
      title: '退出登录',
      content: dirty.value
        ? '资料尚未保存。退出后将丢失本次修改。'
        : '退出当前账号，返回登录页面。',
      confirmText: '退出登录',
      cancelText: '取消',
    }))
  )
    return;
  signingOut.value = true;
  error.value = '';
  try {
    await logout();
    approvedLeave = true;
    signingOut.value = false;
    await router.replace({ name: 'login' });
  } catch (cause) {
    error.value = errorMessage(cause, '退出失败，请重试');
  } finally {
    signingOut.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !busy.value) return;
  event.preventDefault();
  event.returnValue = '';
}
watch(avator, () => {
  uploadedAvator = '';
});
onBeforeRouteLeave(mayLeave);
onMounted(() => {
  document.title = '账户资料 · Voex';
  void load();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  disposed = true;
  controller?.abort();
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style scoped lang="stylus">
.profile-page__account
  display flex
  align-items flex-start
  gap 14px
  margin-bottom 20px
  color var(--auth-muted)
  font-size 12px
  line-height 1.7

  span
    flex 1
    min-width 0
    text-align right
    overflow-wrap anywhere
    white-space pre-wrap
    color var(--color-text-secondary)

.profile-page__status
  min-height 24px
  color var(--auth-muted)
  font-size 12px

.profile-page__logout
  display flex
  justify-content center
  border-top 1px solid var(--auth-border)
  margin-top 22px
  padding-top 14px
</style>
