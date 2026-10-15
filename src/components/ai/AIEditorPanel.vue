<template>
  <aside class="ai-panel" aria-label="AI 文档助手">
    <header class="ai-panel__header">
      <span><SvgIcon name="ai" :size="18" /> AI 文档助手</span>
      <button class="ai-button" type="button" aria-label="关闭 AI 助手" @click="emit('close')">
        关闭
      </button>
    </header>
    <div class="ai-panel__model">
      <label class="ai-field" for="ai-active-model"
        >当前模型
        <select id="ai-active-model" v-model="selectedId" :disabled="running || loadingModels">
          <option value="">{{ loadingModels ? '正在加载模型…' : '请选择模型' }}</option>
          <option v-for="model in models" :key="model.id" :value="model.id">
            {{ model.name }} · {{ model.model }}
          </option>
        </select>
      </label>
      <button
        class="ai-button"
        type="button"
        :disabled="running || applying || loadingModels"
        @click="settingsOpen = true"
      >
        配置模型
      </button>
    </div>
    <p v-if="modelsError" class="ai-error ai-panel__notice" role="alert">
      {{ modelsError }} <button class="ai-button" @click="loadModels">重试</button>
    </p>
    <p class="ai-panel__context" :title="documentName">
      当前文档：{{ documentName || '正在加载…' }}
    </p>
    <p v-if="history.error" class="ai-error ai-panel__notice" role="alert">
      {{ history.error }}
      <button class="ai-button" type="button" @click="agentStore.load(documentKey)">
        重试加载
      </button>
    </p>
    <p v-if="reviewLoadError" class="ai-error ai-panel__notice" role="alert">
      {{ reviewLoadError }}
    </p>
    <div
      ref="scroller"
      class="ai-panel__messages"
      tabindex="0"
      aria-label="对话记录"
      @scroll="onScroll"
    >
      <p v-if="history.loading" class="ai-panel__status" role="status">正在加载对话历史…</p>
      <button
        v-if="history.nextCursor"
        type="button"
        class="ai-button"
        :disabled="history.loading"
        @click="loadOlder"
      >
        加载更早的对话
      </button>
      <div v-if="history.loaded && !messages.length" class="ai-panel__empty">
        <SvgIcon name="ai-writing" :size="28" />
        <p>续写文章、整理排版，或添加公式和流程图。</p>
        <p>修改会先供你审阅，应用后才保存。</p>
        <button
          v-if="!models.length && !loadingModels"
          class="ai-button ai-button--primary"
          @click="settingsOpen = true"
        >
          添加第一个模型
        </button>
      </div>
      <article
        v-for="message in messages"
        :key="message.id"
        class="ai-panel__message"
        :class="`ai-panel__message--${message.role}`"
      >
        <div class="ai-panel__speaker">{{ message.role === 'user' ? '你' : 'AI' }}</div>
        <p v-if="message.text" class="ai-panel__text">{{ message.text }}</p>
        <details v-if="message.activity?.length" class="ai-panel__activity">
          <summary>操作记录（{{ message.activity.length }}）</summary>
          <ol>
            <li v-for="(item, index) in message.activity" :key="index">{{ item }}</li>
          </ol>
        </details>
        <p v-if="message.error" class="ai-error">{{ message.error }}</p>
        <p
          v-if="
            message.state === 'incomplete' && !message.persistence && message.id !== activeTurnId
          "
          class="ai-panel__saved-state"
        >
          该轮生成尚未完成，已保留你的指令。可以发送新指令继续。
        </p>
        <p
          v-if="message.persistence === 'saving' && message.id !== activeTurnId"
          class="ai-panel__saved-state"
          role="status"
        >
          正在保存回复…
        </p>
        <div v-if="message.persistence === 'failed'" class="ai-error" role="alert">
          <p>回复尚未保存，刷新会丢失这份回复。{{ message.persistenceError }}</p>
          <button type="button" class="ai-button" @click="retryMessage(message)">
            重试保存回复
          </button>
        </div>
        <button
          v-if="message.review"
          class="ai-button ai-panel__review"
          :disabled="applying || running || !!reviewLoadingId"
          @click="openReview(message.review)"
        >
          {{
            reviewLoadingId === message.review.id
              ? '正在读取审阅…'
              : message.review.status === 'applied'
                ? '查看已应用修改'
                : '审阅修改'
          }}
          · {{ message.review.fileCount }} 个文件
        </button>
      </article>
    </div>
    <p v-if="running" class="ai-panel__status" role="status">{{ progress }}</p>
    <p v-if="sendError" class="ai-error ai-panel__notice" role="alert">{{ sendError }}</p>
    <form class="ai-panel__composer" novalidate @submit.prevent="send">
      <label class="ai-field" for="ai-message"
        >发送指令
        <textarea
          id="ai-message"
          ref="input"
          v-model="prompt"
          rows="4"
          style="resize: none"
          placeholder="例如：续写下一节，并在结尾添加流程图"
          :disabled="applying"
          @keydown="onInputKeydown"
        />
      </label>
      <label class="ai-panel__export"
        ><input v-model="allowExport" type="checkbox" :disabled="running || applying" />
        允许本轮导出已保存文档</label
      >
      <div class="ai-panel__footer">
        <span>Enter 发送 · Shift + Enter 换行</span>
        <button v-if="running" type="button" class="ai-button" @click="stop">停止</button>
        <button
          v-else
          type="submit"
          class="ai-button ai-button--primary"
          :disabled="
            !prompt.trim() ||
            !selectedModel ||
            !documentKey ||
            busy ||
            applying ||
            !history.loaded ||
            history.loading ||
            !!history.error ||
            hasUnsavedResponse
          "
        >
          发送
        </button>
      </div>
    </form>
    <AIModelDialog
      v-model="settingsOpen"
      :models="models"
      :selected-id="selectedId"
      @saved="modelSaved"
    />
    <AIReviewDialog
      :review="review"
      :applying="applying"
      :error="reviewError"
      :can-apply="canWrite && !busy && !running"
      @close="closeReview"
      @apply="applyReview"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import AIModelDialog from './AIModelDialog.vue';
import AIReviewDialog from './AIReviewDialog.vue';
import { getAIReview, listAIModels } from '@/service/api/ai-api';
import { authUser } from '@/service/auth-session';
import { useAgentStore } from '@/stores/agent';
import { errorMessage } from '@/utils/error';
import { AgentDraft } from '@/agent/draft';
import { AgentToolRegistry } from '@/agent/registry';
import {
  registerEditorTools,
  registerFileTools,
  type FileCapabilities,
} from '@/agent/editor-tools';
import { runAgent } from '@/agent/run';
import type {
  AIModel,
  ChatMessage,
  DocumentSnapshot,
  ReviewSnapshot,
  ReviewSummary,
} from '@/agent/types';
import './ai.styl';

const props = defineProps<{
  documentKey: string;
  documentName: string;
  canWrite: boolean;
  busy: boolean;
  prepare: () => Promise<DocumentSnapshot>;
  apply: (review: ReviewSnapshot) => Promise<void>;
  normalize: (content: string) => string;
  capabilities: FileCapabilities;
}>();
const emit = defineEmits<{ close: [] }>();
const models = ref<AIModel[]>([]);
const selectedId = ref('');
const selectedModel = computed(() => models.value.find((model) => model.id === selectedId.value));
const loadingModels = ref(false);
const modelsError = ref('');
const settingsOpen = ref(false);
const agentStore = useAgentStore();
const { sessions } = agentStore;
const messages = computed(() => sessions[props.documentKey] ?? []);
const hasUnsavedResponse = computed(() => messages.value.some((message) => !!message.persistence));
const history = computed(() => agentStore.state(props.documentKey));
const prompt = ref('');
const allowExport = ref(false);
const running = ref(false);
const progress = ref('');
const sendError = ref('');
const review = ref<ReviewSnapshot | null>(null);
const reviewError = ref('');
const applying = ref(false);
const activeTurnId = ref('');
const reviewLoadingId = ref('');
const reviewLoadError = ref('');
const scroller = ref<HTMLElement>();
const input = ref<HTMLTextAreaElement>();
let followScroll = true;
let controller: AbortController | undefined;
let modelController: AbortController | undefined;
let reviewController: AbortController | undefined;
let disposed = false;

function onScroll() {
  const element = scroller.value;
  if (element) followScroll = element.scrollHeight - element.scrollTop - element.clientHeight < 70;
}
async function scrollEnd() {
  await nextTick();
  if (followScroll && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}
async function loadOlder() {
  const key = props.documentKey;
  const element = scroller.value;
  const height = element?.scrollHeight ?? 0;
  const top = element?.scrollTop ?? 0;
  await agentStore.load(key, true);
  await nextTick();
  if (key === props.documentKey && element && element === scroller.value)
    element.scrollTop = element.scrollHeight - height + top;
}
async function loadModels() {
  modelController?.abort();
  const request = new AbortController();
  modelController = request;
  loadingModels.value = true;
  modelsError.value = '';
  try {
    const result = await listAIModels(request.signal);
    if (request.signal.aborted || disposed) return;
    models.value = result;
    if (!result.some((model) => model.id === selectedId.value))
      selectedId.value = result[0]?.id ?? '';
  } catch (cause) {
    if (!request.signal.aborted) modelsError.value = errorMessage(cause, '模型配置加载失败');
  } finally {
    if (modelController === request) loadingModels.value = false;
  }
}
function modelSaved(model: AIModel) {
  models.value = [...models.value.filter((item) => item.id !== model.id), model];
  selectedId.value = model.id;
}
function onInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!running.value) void send();
}
function stop() {
  controller?.abort();
}
async function openReview(summary: ReviewSummary) {
  reviewController?.abort();
  const request = new AbortController();
  reviewController = request;
  const key = props.documentKey;
  const user = authUser.value?.id;
  reviewLoadingId.value = summary.id;
  reviewLoadError.value = '';
  try {
    const snapshot = await getAIReview(summary.id, request.signal);
    if (
      disposed ||
      request.signal.aborted ||
      key !== props.documentKey ||
      user !== authUser.value?.id
    )
      return;
    for (const change of snapshot.changes) Object.freeze(change);
    Object.freeze(snapshot.changes);
    if (snapshot.status === 'applied') agentStore.markApplied(snapshot.id);
    review.value = snapshot;
    reviewError.value = '';
  } catch (cause) {
    if (!request.signal.aborted)
      reviewLoadError.value = errorMessage(cause, '审阅读取失败，请点击审阅按钮重试');
  } finally {
    if (reviewController === request) {
      reviewLoadingId.value = '';
      reviewController = undefined;
    }
  }
}
function closeReview() {
  if (!applying.value) review.value = null;
}

async function send() {
  const model = selectedModel.value;
  if (
    !model ||
    running.value ||
    applying.value ||
    props.busy ||
    !prompt.value.trim() ||
    !history.value.loaded ||
    history.value.loading ||
    history.value.error ||
    hasUnsavedResponse.value
  )
    return;
  const sourceKey = props.documentKey;
  const user = authUser.value?.id;
  const request = new AbortController();
  controller = request;
  running.value = true;
  progress.value = '准备文档…';
  sendError.value = '';
  review.value = null;
  let draft: AgentDraft | undefined;
  let assistant: ChatMessage | undefined;
  const text = prompt.value.trim();
  const exportGranted = allowExport.value;
  try {
    const source = await props.prepare();
    request.signal.throwIfAborted();
    if (source.file_key !== sourceKey) throw new Error('文档已切换，请重新发送');
    progress.value = '正在保存指令…';
    assistant = await agentStore.begin(sourceKey, model.id, text, request.signal);
    activeTurnId.value = assistant.id;
    request.signal.throwIfAborted();
    if (sourceKey !== props.documentKey || user !== authUser.value?.id)
      throw new Error('文档或账号已切换');
    const conversation = [...sessions[sourceKey]!].filter(
      (message) => message.id !== assistant!.id
    );
    prompt.value = '';
    allowExport.value = false;
    followScroll = true;
    void scrollEnd();
    draft = new AgentDraft(source);
    const registry = new AgentToolRegistry();
    registerEditorTools(
      registry,
      draft,
      getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim()
    );
    registerFileTools(registry, draft, props.capabilities);
    await runAgent({
      model,
      registry,
      context: {
        document: source,
        userRequest: text,
        allowExport: exportGranted,
        signal: request.signal,
      },
      history: conversation,
      onText: (text) => {
        assistant!.text = text;
        void scrollEnd();
      },
      onActivity: (text) => {
        progress.value = text;
        assistant!.activity!.push(text);
        void scrollEnd();
      },
    });
    if (!assistant.text) assistant.text = '本轮操作已完成，请查看修改建议。';
  } catch (cause) {
    const message = request.signal.aborted
      ? '已停止；完成的草稿仍可审阅。'
      : errorMessage(cause, 'AI 请求失败，请检查配置后重试');
    if (assistant) assistant.error = message;
    else sendError.value = message;
  } finally {
    try {
      if (assistant && user === authUser.value?.id) {
        let snapshot = draft?.snapshot();
        if (snapshot && !disposed && props.documentKey === sourceKey) {
          try {
            for (const change of snapshot.changes) {
              if (change.kind === 'create' || change.after_content !== change.before_content)
                change.after_content = props.normalize(change.after_content);
            }
          } catch {
            assistant.error = '生成的文档格式无法解析，请调整指令后重新生成。';
            snapshot = undefined;
          }
        }
        progress.value = '正在保存回复和审阅…';
        await agentStore.save(sourceKey, assistant.id, {
          text: assistant.text,
          activity: assistant.activity ?? [],
          error: assistant.error ?? '',
          review: snapshot ? { id: snapshot.id, changes: snapshot.changes } : undefined,
        });
        if (
          assistant.review &&
          !request.signal.aborted &&
          props.documentKey === sourceKey &&
          !disposed
        )
          await openReview(assistant.review);
      }
    } catch {
      // The store keeps the exact unsaved payload and an explicit retry action.
    } finally {
      if (controller === request) {
        running.value = false;
        controller = undefined;
      }
      activeTurnId.value = '';
      void scrollEnd();
    }
  }
}

async function retryMessage(message: ChatMessage) {
  const key = props.documentKey;
  const user = authUser.value?.id;
  try {
    await agentStore.retry(message.id);
    if (message.review && !disposed && key === props.documentKey && user === authUser.value?.id)
      await openReview(message.review);
  } catch {
    /* The message keeps its persistence error and retry button. */
  }
}

async function applyReview() {
  const snapshot = review.value;
  if (!snapshot || snapshot.status === 'applied' || applying.value || running.value) return;
  applying.value = true;
  const user = authUser.value?.id;
  reviewError.value = '';
  try {
    await props.apply(snapshot);
    snapshot.status = 'applied';
    review.value = null;
  } catch (cause) {
    reviewError.value = errorMessage(cause, '应用失败，修改建议已保留，可重试');
  } finally {
    if (snapshot.status === 'applied' && user === authUser.value?.id)
      agentStore.markApplied(snapshot.id);
    applying.value = false;
  }
}
watch(
  () => props.documentKey,
  () => {
    stop();
    reviewController?.abort();
    review.value = null;
    sendError.value = '';
    prompt.value = '';
    allowExport.value = false;
    reviewLoadError.value = '';
  }
);
watch(
  () => authUser.value?.id,
  (id) => {
    stop();
    modelController?.abort();
    reviewController?.abort();
    models.value = [];
    selectedId.value = '';
    settingsOpen.value = false;
    review.value = null;
    if (id) void loadModels();
  },
  { immediate: true }
);
watch(
  [() => props.documentKey, () => authUser.value?.id],
  ([key, id]) => {
    if (key && id) void agentStore.load(key);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  stop();
  modelController?.abort();
  reviewController?.abort();
});
</script>

<style lang="stylus">
.ai-panel
  width 380px
  min-width 320px
  max-width 42vw
  flex-shrink 0
  display flex
  flex-direction column
  min-height 0
  height 100%
  border-left 1px solid var(--color-border-primary)
  background var(--color-bg-panel)
  color var(--color-text-primary)
  &__header
    height 56px
    flex-shrink 0
    padding 0 16px
    display flex
    align-items center
    justify-content space-between
    border-bottom 1px solid var(--color-border-primary)
    font-size 14px
    > span
      display flex
      align-items center
      gap 8px
  &__model
    display flex
    align-items flex-end
    gap 8px
    padding 16px 16px 8px
    .ai-field
      flex 1
    .ai-button
      flex-shrink 0
      height 37px
  &__context
    margin 0
    padding 4px 16px 12px
    font-size 12px
    color var(--color-text-tertiary)
    overflow hidden
    text-overflow ellipsis
    white-space nowrap
  &__messages
    min-height 0
    flex 1
    overflow-y auto
    overscroll-behavior contain
    padding 16px
    border-top 1px solid var(--color-border-primary)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset -2px
  &__empty
    padding 32px 8px
    color var(--color-text-tertiary)
    font-size 13px
    line-height 1.8
  &__message
    margin-bottom 22px
    font-size 13px
    line-height 1.75
    overflow-wrap anywhere
    &--user
      padding 10px 12px
      border-radius 6px
      background var(--color-bg-secondary)
  &__speaker
    font-size 12px
    font-weight 600
    color var(--color-text-tertiary)
  &__saved-state
    color var(--color-text-tertiary)
    font-size 12px
  &__text
    margin 4px 0 8px
    white-space pre-wrap
  &__activity
    color var(--color-text-tertiary)
    font-size 12px
    summary
      cursor pointer
    ol
      padding-left 20px
      max-height 180px
      overflow auto
  &__review
    margin-top 10px
    width 100%
    text-align left
    border-color var(--color-accent)
  &__status, &__notice
    margin 0
    padding 8px 16px
    font-size 12px
  &__status
    color var(--color-text-secondary)
  &__composer
    flex-shrink 0
    display flex
    flex-direction column
    gap 10px
    padding 12px 16px 16px
    border-top 1px solid var(--color-border-primary)
  &__export
    font-size 12px
    color var(--color-text-secondary)
  &__footer
    display flex
    justify-content space-between
    align-items center
    gap 8px
    span
      font-size 11px
      color var(--color-text-tertiary)
</style>
