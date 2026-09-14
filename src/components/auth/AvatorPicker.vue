<template>
  <div class="avator-picker">
    <div class="avator-picker__row">
      <div class="avator-picker__preview">
        <img
          v-if="preview || current"
          :src="preview || current"
          alt="头像预览"
          width="48"
          height="48"
        />
        <SvgIcon v-else name="users" :size="22" />
      </div>
      <div class="avator-picker__body">
        <label class="avator-picker__label" :for="id">头像（选填）</label>
        <input
          :id="id"
          ref="input"
          class="avator-picker__input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="disabled"
          :aria-describedby="`${id}-help`"
          @change="choose"
        />
        <p :id="`${id}-help`" class="avator-picker__hint">JPEG、PNG、WebP · 最大 5 MiB</p>
      </div>
      <button
        v-if="modelValue || current"
        class="avator-picker__clear"
        type="button"
        :disabled="disabled"
        @click="clear"
      >
        移除
      </button>
    </div>
    <p class="avator-picker__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { avatorFileError } from '@/utils/auth';
const props = defineProps<{ modelValue: File | null; current?: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: File | null]; remove: [] }>();
const id = useId();
const input = ref<HTMLInputElement>();
const preview = ref('');
const error = ref('');
watch(
  () => props.modelValue,
  (file) => {
    if (preview.value) URL.revokeObjectURL(preview.value);
    preview.value = file ? URL.createObjectURL(file) : '';
    if (!file && input.value) input.value.value = '';
  },
  { immediate: true }
);
function choose(event: Event) {
  const element = event.target as HTMLInputElement;
  const file = element.files?.[0];
  if (!file) return;
  error.value = avatorFileError(file);
  if (error.value) {
    element.value = '';
    return;
  }
  emit('update:modelValue', file);
}
function clear() {
  error.value = '';
  emit('update:modelValue', null);
  emit('remove');
}
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value);
});
</script>

<style scoped lang="stylus">
.avator-picker__row
  display flex
  align-items center
  gap 12px

.avator-picker__preview
  display flex
  flex-shrink 0
  align-items center
  justify-content center
  width 48px
  height 48px
  border 1px solid var(--auth-border)
  border-radius 50%
  overflow hidden
  color var(--auth-muted)

  img
    width 100%
    height 100%
    object-fit cover

.avator-picker__body
  min-width 0
  flex 1

.avator-picker__label
  display block
  margin-bottom 4px
  font-size 12px
  color var(--color-text-secondary)

.avator-picker__input
  width 100%
  font-size 11px
  color var(--auth-muted)

  &::file-selector-button
    padding 4px 8px
    border 1px solid var(--auth-border)
    border-radius 5px
    background var(--auth-button)
    color var(--color-text-secondary)
    cursor pointer

  &:hover:not(:disabled)::file-selector-button
    border-color var(--auth-muted)

.avator-picker__hint,
.avator-picker__error
  min-height 21px
  padding-top 5px
  font-size 11px
  color var(--auth-muted)

.avator-picker__error
  color var(--auth-error)

.avator-picker__clear
  min-height 40px
  padding 4px
  color var(--auth-muted)
  font-size 12px

  &:hover:not(:disabled)
    color var(--color-text-primary)
</style>
