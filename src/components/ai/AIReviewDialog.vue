<template>
  <VoexModal
    :model-value="!!review"
    title="审阅 AI 修改"
    :width="1100"
    :busy="applying"
    :mask-closable="false"
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="review" class="ai-review">
      <div class="ai-review__summary">
        <span
          >{{ review.changes.length }} 个文件 ·
          {{ review.status === 'applied' ? '已应用并保存' : '待应用，原文件尚未改变' }}</span
        >
        <span>＋ 新增 / − 删除 / ~ 修改</span>
      </div>
      <label class="ai-field" for="ai-review-file"
        >文件
        <select id="ai-review-file" v-model.number="selected" :disabled="applying">
          <option v-for="(item, index) in review.changes" :key="item.file_key" :value="index">
            {{ item.kind === 'create' ? '新建 · ' : '' }}{{ item.after_name }}
          </option>
        </select>
      </label>
      <template v-if="change">
        <p
          v-if="change.before_name !== change.after_name && change.kind !== 'create'"
          class="ai-review__rename"
        >
          重命名：{{ change.before_name }} → {{ change.after_name }}
        </p>
        <div class="ai-review__controls">
          <label><input v-model="onlyChanges" type="checkbox" /> 仅显示差异及附近正文</label>
          <span>只读 · Markdown 源文</span>
        </div>
        <div class="ai-review__diff" tabindex="0" aria-label="文档修改对比，只读">
          <table>
            <thead>
              <tr>
                <th scope="col">变更</th>
                <th scope="col">修改前</th>
                <th scope="col">修改后</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in pageRows"
                :key="index"
                :class="`ai-review__row--${row.kind}`"
              >
                <th scope="row" :aria-label="labels[row.kind]">{{ signs[row.kind] }}</th>
                <td>
                  <span class="ai-review__line">{{ row.oldLine }}</span>
                  <pre>{{ row.before || ' ' }}</pre>
                </td>
                <td>
                  <span class="ai-review__line">{{ row.newLine }}</span>
                  <pre>{{ row.after || ' ' }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!rows.length" class="ai-review__empty">正文没有变化</p>
        </div>
        <div v-if="rows.length > PAGE_SIZE" class="ai-review__pagination">
          <button class="ai-button" :disabled="page === 0" @click="page--">上一页</button>
          <span>{{ page + 1 }} / {{ Math.ceil(rows.length / PAGE_SIZE) }}</span>
          <button
            class="ai-button"
            :disabled="(page + 1) * PAGE_SIZE >= rows.length"
            @click="page++"
          >
            下一页
          </button>
        </div>
      </template>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <p class="ai-review__note">
        取消后仍可从对话中的“审阅修改”重新打开。原文件变化时，旧建议不会覆盖新内容。
      </p>
    </div>
    <template #footer>
      <div class="ai-actions">
        <button class="ai-button" :disabled="applying" @click="emit('close')">
          {{ review?.status === 'applied' ? '关闭' : '取消' }}
        </button>
        <button
          v-if="review?.status !== 'applied'"
          class="ai-button ai-button--primary"
          :disabled="applying || !canApply"
          :aria-busy="applying"
          @click="emit('apply')"
        >
          {{ applying ? '正在应用…' : '应用并保存' }}
        </button>
      </div>
    </template>
  </VoexModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VoexModal from '@/plugins/voex-modal/VoexModal.vue';
import { diffLines } from '@/agent/diff';
import type { ReviewSnapshot } from '@/agent/types';
import './ai.styl';

const props = defineProps<{
  review: ReviewSnapshot | null;
  applying: boolean;
  error: string;
  canApply: boolean;
}>();
const emit = defineEmits<{ close: []; apply: [] }>();
const selected = ref(0);
const onlyChanges = ref(true);
const page = ref(0);
const PAGE_SIZE = 200;
const signs = { same: ' ', add: '+', delete: '−', modify: '~' };
const labels = { same: '未改变', add: '新增', delete: '删除', modify: '修改' };
const change = computed(() => props.review?.changes[selected.value]);
const allRows = computed(() =>
  change.value ? diffLines(change.value.before_content, change.value.after_content) : []
);
const rows = computed(() => {
  if (!onlyChanges.value) return allRows.value;
  const visible = new Set<number>();
  allRows.value.forEach((row, index) => {
    if (row.kind !== 'same')
      for (let offset = -3; offset <= 3; offset++) visible.add(index + offset);
  });
  return allRows.value.filter((_, index) => visible.has(index));
});
const pageRows = computed(() =>
  rows.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE)
);
watch(
  () => props.review?.id,
  () => {
    selected.value = 0;
    page.value = 0;
  }
);
watch([selected, onlyChanges], () => {
  page.value = 0;
});
</script>

<style lang="stylus">
.ai-review
  display flex
  flex-direction column
  gap 14px
  color var(--color-text-primary)
  &__summary, &__controls, &__pagination
    display flex
    align-items center
    justify-content space-between
    gap 16px
    font-size 12px
    color var(--color-text-secondary)
  &__rename
    margin 0
    font-size 13px
  &__diff
    max-height 52vh
    overflow auto
    border 1px solid var(--color-border-secondary)
    border-radius 6px
    &:focus-visible
      outline 2px solid var(--color-accent)
    table
      table-layout fixed
      border-collapse collapse
      width 100%
      font-size 12px
    thead
      position sticky
      top 0
      background var(--color-bg-secondary)
      z-index 1
    th, td
      text-align left
      padding 6px 8px
      vertical-align top
      border-bottom 1px solid var(--color-border-primary)
    th:first-child
      width 48px
      white-space nowrap
    td
      border-left 1px solid var(--color-border-primary)
    pre
      display inline
      margin 0
      white-space pre-wrap
      overflow-wrap anywhere
      font-family Consolas, monospace
      line-height 1.65
  &__line
    display inline-block
    min-width 28px
    margin-right 8px
    color var(--color-text-tertiary)
    user-select none
  &__row--add td:last-child
    background unquote('color-mix(in srgb, var(--color-green) 18%, transparent)')
  &__row--delete td:nth-child(2)
    background unquote('color-mix(in srgb, var(--color-red) 18%, transparent)')
    pre
      text-decoration line-through
  &__row--modify
    td:nth-child(2)
      background unquote('color-mix(in srgb, var(--color-red) 15%, transparent)')
    td:last-child
      background unquote('color-mix(in srgb, var(--color-green) 18%, transparent)')
  &__note, &__empty
    margin 0
    color var(--color-text-tertiary)
    font-size 12px
    line-height 1.6
</style>
