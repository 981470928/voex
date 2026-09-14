<template>
  <div class="notification" aria-live="polite" aria-atomic="true">
    <div
      v-if="store.message"
      class="notification__message"
      :class="`notification__message--${store.tone}`"
    >
      <SvgIcon v-if="store.tone === 'success'" name="resolved" :size="20" aria-hidden="true" />
      <SvgIcon v-else name="info" :size="20" aria-hidden="true" />
      <span>{{ store.message }}</span>
      <button class="notification__close" aria-label="关闭提示" @click="store.dismiss">
        <SvgIcon name="close" :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { useNotificationStore } from '@/stores/notification';
const store = useNotificationStore();
</script>

<style scoped lang="stylus">
.notification
  position fixed
  z-index 2000
  bottom 28px
  left 50%
  transform translateX(-50%)
  max-width calc(100vw - 32px)
  pointer-events none
  &__message
    display flex
    align-items center
    gap 10px
    padding 12px 16px
    border 1px solid var(--color-border-primary)
    border-radius 8px
    background var(--color-bg-secondary)
    color var(--color-text-primary)
    box-shadow var(--shadow-medium)
    font-size 14px
    line-height 1.6
    overflow-wrap anywhere
    pointer-events auto
    > svg
      flex-shrink 0
      color var(--color-blue)
    &--error > svg
      color var(--color-red)
    &--success > svg
      color var(--color-green)
  &__close
    display inline-flex
    padding 4px
    color var(--color-text-secondary)
    border-radius 4px
    &:hover
      background var(--color-bg-translucent)
</style>
