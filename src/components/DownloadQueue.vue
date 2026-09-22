<template>
  <Teleport to="body">
    <div ref="root" class="download-queue" @keydown.esc.stop.prevent="close">
      <button
        ref="trigger"
        type="button"
        class="download-queue__trigger"
        :aria-expanded="store.expanded"
        aria-controls="download-queue-panel"
        @click="store.expanded = !store.expanded"
      >
        <SvgIcon name="download" :size="18" />
        <span>下载</span>
        <span v-if="store.activeCount" class="download-queue__count">{{ store.activeCount }}</span>
        <SvgIcon
          name="chevron-right"
          :size="14"
          class="download-queue__chevron"
          :class="{ 'download-queue__chevron--expanded': store.expanded }"
        />
      </button>
      <section
        v-show="store.expanded"
        id="download-queue-panel"
        class="download-queue__panel"
        aria-labelledby="download-queue-title"
      >
        <header class="download-queue__header">
          <div>
            <h2 id="download-queue-title">下载列表</h2>
            <p aria-live="polite">{{ summary }}</p>
          </div>
          <button
            type="button"
            class="download-queue__action"
            :disabled="!hasFinished"
            @click="store.clearFinished"
          >
            清除记录
          </button>
          <button
            type="button"
            class="download-queue__action download-queue__close"
            aria-label="收起下载列表"
            title="收起下载列表"
            @click="close"
          >
            <SvgIcon name="close" :size="16" />
          </button>
        </header>
        <ul v-if="store.items.length" class="download-queue__list" aria-label="下载任务">
          <li v-for="item in displayedItems" :key="item.id" class="download-queue__item">
            <div class="download-queue__row">
              <SvgIcon name="page" :size="18" class="download-queue__file-icon" />
              <span class="download-queue__name">{{ item.name }}</span>
              <button
                v-if="item.status === 'queued' || item.status === 'downloading'"
                type="button"
                class="download-queue__action"
                :aria-label="'中止下载：' + item.name"
                @click="cancel(item.id)"
              >
                中止
              </button>
            </div>
            <div class="download-queue__details">
              <span
                class="download-queue__status"
                :class="{ 'download-queue__status--failed': item.status === 'failed' }"
                aria-live="polite"
                >{{ statusText[item.status] }}</span
              >
              <span v-if="item.status === 'downloading'" class="download-queue__bytes">
                {{ formatBytes(item.loaded) }}
                <template v-if="item.total !== null">
                  / {{ formatBytes(item.total) }} · {{ percent(item) }}%
                </template>
              </span>
            </div>
            <progress
              v-if="item.status === 'downloading'"
              class="download-queue__progress"
              :value="item.total === null ? undefined : percent(item)"
              max="100"
              :aria-label="item.name + '下载进度'"
            />
            <p v-if="item.error" class="download-queue__error">{{ item.error }}</p>
          </li>
        </ul>
        <p v-else class="download-queue__empty">暂无下载任务<br />点击附件的下载按钮开始</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import {
  isDownloadActive,
  useDownloadStore,
  type DownloadItem,
  type DownloadStatus,
} from '@/stores/download';

const store = useDownloadStore();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const displayedItems = computed(() => [
  ...store.items.filter(isDownloadActive),
  ...store.items.filter((item) => !isDownloadActive(item)).reverse(),
]);
const hasFinished = computed(() => store.items.some((item) => !isDownloadActive(item)));
const summary = computed(() =>
  store.activeCount ? store.activeCount + ' 个任务进行中' : '当前没有进行中的下载'
);
const statusText: Record<DownloadStatus, string> = {
  queued: '排队等待',
  downloading: '正在下载',
  saving: '正在交给浏览器',
  completed: '已交给浏览器',
  canceled: '已中止',
  failed: '下载失败',
};
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

function formatBytes(bytes: number) {
  if (bytes < 1024) return numberFormat.format(bytes) + ' B';
  if (bytes < 1024 ** 2) return numberFormat.format(bytes / 1024) + ' KB';
  if (bytes < 1024 ** 3) return numberFormat.format(bytes / 1024 ** 2) + ' MB';
  return numberFormat.format(bytes / 1024 ** 3) + ' GB';
}

function percent(item: DownloadItem) {
  return item.total ? Math.min(100, Math.floor((item.loaded / item.total) * 100)) : 0;
}

function close() {
  store.expanded = false;
  trigger.value?.focus();
}

async function cancel(id: number) {
  store.cancel(id);
  await nextTick();
  trigger.value?.focus();
}

function onOutsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) store.expanded = false;
}

onMounted(() => document.addEventListener('pointerdown', onOutsidePointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer));
</script>

<style scoped lang="stylus">
.download-queue
  position fixed
  left calc(16px + env(safe-area-inset-left))
  bottom calc(16px + env(safe-area-inset-bottom))
  z-index 1200
  color var(--color-text-primary)
  font-size 13px
  line-height 1.5
  &__trigger
    display flex
    align-items center
    gap 8px
    min-height 44px
    padding 8px 14px
    border 1px solid var(--color-border-secondary)
    border-radius 8px
    background var(--color-bg-secondary)
    color var(--color-text-primary)
    box-shadow var(--shadow-medium)
  &__count
    min-width 20px
    padding 0 5px
    border-radius 4px
    background var(--color-brand-bg)
    color var(--color-brand-text)
    font-size 12px
    text-align center
    font-variant-numeric tabular-nums
  &__chevron
    transform rotate(-90deg)
    &--expanded
      transform rotate(90deg)
  &__panel
    position absolute
    bottom calc(100% + 8px)
    left 0
    display flex
    flex-direction column
    width 360px
    max-width calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right))
    max-height calc(100dvh - 100px - env(safe-area-inset-bottom) - env(safe-area-inset-top))
    border 1px solid var(--color-border-secondary)
    border-radius 8px
    background var(--color-bg-secondary)
    box-shadow var(--shadow-medium)
    overflow hidden
  &__header
    display flex
    align-items center
    gap 4px
    flex-shrink 0
    padding 12px
    border-bottom 1px solid var(--color-border-primary)
    > div
      flex 1
      min-width 0
    h2
      margin 0
      font-size 14px
      font-weight 600
    p
      margin 3px 0 0
      font-size 12px
      color var(--color-text-tertiary)
  &__action
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    min-height 36px
    padding 6px 8px
    border-radius 6px
    color var(--color-text-secondary)
    font-size 12px
    white-space nowrap
  &__close
    width 36px
  &__trigger, &__action
    cursor pointer
    &:hover:not(:disabled)
      background var(--color-bg-tertiary)
    &:active:not(:disabled)
      background var(--color-bg-quaternary)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:disabled
      opacity .45
      cursor not-allowed
  &__list
    min-height 0
    max-height 360px
    overflow-y auto
    overscroll-behavior contain
    scrollbar-gutter stable
    margin 0
    padding 0
    list-style none
  &__item
    padding 12px 14px
    & + &
      border-top 1px solid var(--color-border-primary)
  &__row
    display flex
    align-items flex-start
    gap 8px
  &__file-icon
    margin-top 2px
    color var(--color-text-tertiary)
  &__name
    flex 1
    min-width 0
    overflow-wrap anywhere
  &__details
    display flex
    flex-wrap wrap
    justify-content space-between
    gap 4px 10px
    margin-top 6px
    color var(--color-text-tertiary)
    font-size 12px
  &__bytes
    font-variant-numeric tabular-nums
  &__progress
    display block
    width 100%
    height 6px
    margin-top 8px
    border 0
    border-radius 3px
    overflow hidden
    accent-color var(--color-accent)
    &::-webkit-progress-bar
      background var(--color-bg-quaternary)
    &::-webkit-progress-value
      background var(--color-accent)
    &::-moz-progress-bar
      background var(--color-accent)
  &__status--failed, &__error
    color var(--color-red)
  &__error
    margin 6px 0 0
    font-size 12px
    overflow-wrap anywhere
  &__empty
    margin 0
    padding 28px 16px
    color var(--color-text-tertiary)
    text-align center

@media print
  .download-queue
    display none
</style>
