<template>
  <aside
    class="ai-panel"
    aria-label="AI 文档助手"
    :aria-busy="loadingModels || conversationList.loading || history.loading"
  >
    <header class="ai-panel__header">
      <span><SvgIcon name="ai" :size="18" /> AI 文档助手</span>
      <button
        class="edit-page__icon-button"
        type="button"
        title="关闭 AI 助手"
        aria-label="关闭 AI 助手"
        @click="emit('close')"
      >
        <SvgIcon name="close" :size="18" />
      </button>
    </header>
    <div class="ai-panel__conversations">
      <div class="ai-panel__conversation-controls">
        <label class="ai-field" for="ai-active-conversation">
          当前对话
          <select
            id="ai-active-conversation"
            :value="conversationId"
            :title="activeConversation?.title"
            :disabled="conversationLocked || !conversations.length"
            @change="switchConversation"
          >
            <option v-if="!conversationId" value="">
              {{ conversationList.loading ? '正在加载对话…' : '尚无对话' }}
            </option>
            <option v-for="session in conversations" :key="session.id" :value="session.id">
              {{ conversationLabel(session) }}
            </option>
          </select>
        </label>
        <button
          class="ai-button"
          type="button"
          :disabled="conversationLocked || !conversationList.loaded || !!conversationList.error"
          :aria-busy="conversationList.creating"
          @click="newConversation"
        >
          新建对话
        </button>
      </div>
      <button
        v-if="conversationList.nextCursor"
        class="ai-button"
        type="button"
        :disabled="conversationLocked"
        @click="agentStore.loadConversations(documentKey, true)"
      >
        加载更多对话
      </button>
      <p v-if="conversationList.creating" class="ai-panel__conversation-status" role="status">
        正在新建对话…
      </p>
      <p v-else-if="conversationList.loading" class="ai-panel__conversation-status" role="status">
        正在加载对话列表…
      </p>
      <p v-if="conversationList.error" class="ai-error" role="alert">
        {{ conversationList.error }}
        <button class="ai-button" type="button" @click="loadConversations">重试加载</button>
      </p>
      <p v-if="conversationList.createError" class="ai-error" role="alert">
        {{ conversationList.createError }}
        <button
          class="ai-button"
          type="button"
          :disabled="conversationLocked"
          @click="newConversation"
        >
          重试新建
        </button>
      </p>
    </div>
    <p v-if="modelsError" class="ai-error ai-panel__notice" role="alert">
      {{ modelsError }} <button class="ai-button" @click="loadModels">重试</button>
    </p>
    <p v-if="history.error" class="ai-error ai-panel__notice" role="alert">
      {{ history.error }}
      <button class="ai-button" type="button" @click="agentStore.load(documentKey, conversationId)">
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
      <LoadingSkeleton
        v-if="
          (history.loading || !conversationList.loaded) &&
          !conversationList.error &&
          !messages.length
        "
        variant="ai-messages"
        label="正在加载 AI 对话"
      />
      <p v-else-if="history.loading" class="ai-panel__status" role="status">正在加载对话…</p>
      <button
        v-if="history.nextCursor"
        type="button"
        class="ai-button"
        :disabled="history.loading"
        @click="loadOlder"
      >
        加载更早的消息
      </button>
      <div v-if="conversationReady && !history.loading && !messages.length" class="ai-panel__empty">
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
      <div class="ai-panel__input-box">
        <label class="ai-panel__sr-only" for="ai-message">发送指令</label>
        <textarea
          id="ai-message"
          ref="input"
          v-model="prompt"
          class="ai-panel__input"
          rows="4"
          style="resize: none"
          placeholder="例如：续写下一节，并在结尾添加流程图"
          :disabled="applying"
          @keydown="onInputKeydown"
        />
        <div class="ai-panel__toolbar">
          <LoadingSkeleton
            v-if="loadingModels"
            class="ai-panel__model-loading"
            variant="ai-models"
            label="正在加载 AI 模型"
          />
          <VoexTrigger
            v-else
            v-model:popup-visible="modelMenuOpen"
            trigger="click"
            position="top-start"
            strategy="fixed"
            :popup-offset="8"
            :disabled="running || applying"
            auto-fit-popup-width
            content-class="ai-panel__model-popup"
            role="dialog"
            aria-label="选择 AI 模型"
            @show="focusSelectedModel"
          >
            <button
              ref="modelTrigger"
              class="ai-panel__control ai-panel__model-trigger"
              type="button"
              :title="selectedModel ? selectedModel.name + ' · ' + selectedModel.model : '选择模型'"
              :aria-label="selectedModel ? '当前模型：' + selectedModel.name : '选择模型'"
              aria-haspopup="dialog"
              :disabled="running || applying"
              @keydown.down.prevent="modelMenuOpen = true"
              @keydown.up.prevent="modelMenuOpen = true"
            >
              <span>{{ selectedModel?.name || '选择模型' }}</span>
              <SvgIcon
                name="chevron-right"
                :size="14"
                class="ai-panel__model-chevron"
                :class="{ 'ai-panel__model-chevron--open': modelMenuOpen }"
              />
            </button>
            <template #content>
              <div ref="modelMenu" class="ai-panel__model-menu" @keydown.tab="onModelMenuTab">
                <fieldset v-if="models.length" class="ai-panel__model-options">
                  <legend class="ai-panel__sr-only">可用模型</legend>
                  <label
                    v-for="model in models"
                    :key="model.id"
                    class="ai-panel__model-option"
                    :class="{ 'ai-panel__model-option--selected': selectedId === model.id }"
                  >
                    <input
                      v-model="selectedId"
                      type="radio"
                      :name="modelGroupName"
                      :value="model.id"
                      @click="selectModel(model.id)"
                      @keydown.enter.prevent="selectModel(model.id)"
                    />
                    <span>
                      <strong>{{ model.name }}</strong>
                      <small>{{ model.model }}</small>
                    </span>
                  </label>
                </fieldset>
                <p v-else class="ai-panel__model-empty">暂无模型，请先配置</p>
                <button
                  ref="modelSettingsButton"
                  class="ai-panel__control ai-panel__model-settings"
                  type="button"
                  @click="openModelSettings"
                >
                  <SvgIcon name="setting" :size="16" />
                  配置模型
                </button>
              </div>
            </template>
          </VoexTrigger>
          <button
            ref="exportButton"
            class="ai-panel__control ai-panel__icon-button"
            :class="{ 'ai-panel__icon-button--active': allowExport }"
            type="button"
            aria-label="允许本轮导出已保存文档"
            :title="allowExport ? '本轮已允许导出已保存文档（点击关闭）' : '允许本轮导出已保存文档'"
            :aria-pressed="allowExport"
            :disabled="running || applying"
            @click="allowExport = !allowExport"
          >
            <SvgIcon name="download" :size="18" />
          </button>
          <button
            v-if="running"
            type="button"
            class="ai-panel__control ai-panel__icon-button ai-panel__send"
            aria-label="停止生成"
            title="停止生成"
            @click="stop"
          >
            <SvgIcon name="close" :size="18" />
          </button>
          <button
            v-else
            type="submit"
            class="ai-panel__control ai-panel__icon-button ai-panel__send"
            aria-label="发送"
            title="发送"
            :disabled="!canSend"
          >
            <SvgIcon name="send" :size="18" />
          </button>
        </div>
      </div>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import LoadingSkeleton from '@/components/LoadingSkeleton.vue';
import { VoexTrigger } from '@/plugins/trigger';
import { useDialog } from '@/composables/useDialog';
import { ModalType } from '@/stores/modal';
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
  AIConversationSession,
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
const modelMenuOpen = ref(false);
const modelGroupName = useId() + '-ai-model';
const modelTrigger = ref<HTMLButtonElement>();
const modelMenu = ref<HTMLElement>();
const modelSettingsButton = ref<HTMLButtonElement>();
const exportButton = ref<HTMLButtonElement>();
const agentStore = useAgentStore();
const conversationId = computed(() => agentStore.selectedSessions[props.documentKey] ?? '');
const conversations = computed(() => agentStore.conversations[props.documentKey] ?? []);
const activeConversation = computed(() =>
  conversations.value.find((session) => session.id === conversationId.value)
);
const conversationList = computed(() => agentStore.listState(props.documentKey));
const messages = computed(() => agentStore.messages(props.documentKey, conversationId.value));
const hasUnsavedResponse = computed(() => messages.value.some((message) => !!message.persistence));
const history = computed(() => agentStore.state(props.documentKey, conversationId.value));
const conversationReady = computed(
  () => conversationList.value.loaded && (!conversationId.value || history.value.loaded)
);
const prompt = computed({
  get: () => agentStore.draft(props.documentKey, conversationId.value),
  set: (value: string) => agentStore.setDraft(props.documentKey, conversationId.value, value),
});
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
const conversationLocked = computed(
  () =>
    running.value ||
    applying.value ||
    conversationList.value.loading ||
    conversationList.value.creating ||
    !!reviewLoadingId.value ||
    messages.value.some((message) => message.persistence === 'saving')
);
const canSend = computed(
  () =>
    !!prompt.value.trim() &&
    !!selectedModel.value &&
    !!props.documentKey &&
    !props.busy &&
    !conversationLocked.value &&
    conversationReady.value &&
    !history.value.loading &&
    !history.value.error &&
    !conversationList.value.error &&
    !hasUnsavedResponse.value
);
useDialog(ModalType.AI_MODEL_DIALOG, {
  visible: () => settingsOpen.value,
  props: () => ({ models: models.value, selectedId: selectedId.value, onSaved: modelSaved }),
  onClose: () => {
    settingsOpen.value = false;
  },
});
useDialog(ModalType.AI_REVIEW_DIALOG, {
  visible: () => !!review.value,
  props: () => ({
    review: review.value,
    applying: applying.value,
    error: reviewError.value,
    canApply: props.canWrite && !props.busy && !running.value,
    onApply: applyReview,
  }),
  onClose: closeReview,
});
function conversationLabel(session: AIConversationSession) {
  const date = new Date(session.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${session.title} · ${date}`;
}
async function loadConversations() {
  const key = props.documentKey;
  const user = authUser.value?.id;
  await agentStore.loadConversations(key);
  if (disposed || key !== props.documentKey || user !== authUser.value?.id) return;
  const id = agentStore.selectedSessions[key];
  if (id) await agentStore.load(key, id);
  void scrollEnd();
}
async function newConversation() {
  if (conversationLocked.value || !conversationList.value.loaded || conversationList.value.error)
    return;
  const key = props.documentKey;
  const user = authUser.value?.id;
  try {
    await agentStore.createConversation(key);
    if (disposed || key !== props.documentKey || user !== authUser.value?.id) return;
    await nextTick();
    input.value?.focus();
  } catch {
    // The list keeps a retry action with the same creation ID.
  }
}
async function switchConversation(event: Event) {
  if (conversationLocked.value) return;
  const id = (event.target as HTMLSelectElement).value;
  const key = props.documentKey;
  agentStore.selectConversation(key, id);
  await agentStore.load(key, id);
  if (key === props.documentKey && id === conversationId.value) void scrollEnd();
}

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
  const sessionId = conversationId.value;
  const element = scroller.value;
  const height = element?.scrollHeight ?? 0;
  const top = element?.scrollTop ?? 0;
  await agentStore.load(key, sessionId, true);
  await nextTick();
  if (
    key === props.documentKey &&
    sessionId === conversationId.value &&
    element &&
    element === scroller.value
  )
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
function focusSelectedModel() {
  if (!modelMenuOpen.value) return;
  const selected = modelMenu.value?.querySelector<HTMLInputElement>('input:checked');
  (selected ?? modelSettingsButton.value)?.focus({ preventScroll: true });
}
function selectModel(id: string) {
  if (running.value || applying.value) return;
  selectedId.value = id;
  modelMenuOpen.value = false;
  modelTrigger.value?.focus({ preventScroll: true });
}
async function openModelSettings() {
  modelMenuOpen.value = false;
  modelTrigger.value?.focus({ preventScroll: true });
  await nextTick();
  settingsOpen.value = true;
}
function onModelMenuTab(event: KeyboardEvent) {
  const atStart = event.target instanceof HTMLInputElement || !models.value.length;
  if (event.shiftKey && atStart) {
    event.preventDefault();
    modelMenuOpen.value = false;
    modelTrigger.value?.focus({ preventScroll: true });
  } else if (!event.shiftKey && event.target === modelSettingsButton.value) {
    event.preventDefault();
    modelMenuOpen.value = false;
    exportButton.value?.focus({ preventScroll: true });
  }
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
  const sessionId = conversationId.value;
  const user = authUser.value?.id;
  reviewLoadingId.value = summary.id;
  reviewLoadError.value = '';
  try {
    const snapshot = await getAIReview(summary.id, request.signal);
    if (
      disposed ||
      request.signal.aborted ||
      key !== props.documentKey ||
      sessionId !== conversationId.value ||
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
  if (!model || !canSend.value) return;
  const sourceKey = props.documentKey;
  const originalSessionId = conversationId.value;
  let sessionId = originalSessionId;
  const user = authUser.value?.id;
  const request = new AbortController();
  controller = request;
  running.value = true;
  progress.value = '准备文档…';
  sendError.value = '';
  review.value = null;
  let draft: AgentDraft | undefined;
  let assistant: ChatMessage | undefined;
  const submittedDraft = prompt.value;
  const text = submittedDraft.trim();
  const exportGranted = allowExport.value;
  try {
    const source = await props.prepare();
    request.signal.throwIfAborted();
    if (source.file_key !== sourceKey) throw new Error('文档已切换，请重新发送');
    if (!sessionId) {
      progress.value = '正在新建对话…';
      sessionId = (await agentStore.createConversation(sourceKey)).id;
      request.signal.throwIfAborted();
      const createdHistory = agentStore.state(sourceKey, sessionId);
      if (!createdHistory.loaded || createdHistory.error)
        throw new Error(createdHistory.error || '对话历史尚未加载，请重试加载');
    }
    progress.value = '正在保存指令…';
    assistant = await agentStore.begin(sourceKey, sessionId, model.id, text, request.signal);
    activeTurnId.value = assistant.id;
    request.signal.throwIfAborted();
    if (sourceKey !== props.documentKey || user !== authUser.value?.id)
      throw new Error('文档或账号已切换');
    const conversation = agentStore
      .messages(sourceKey, sessionId)
      .filter((message) => message.id !== assistant!.id);
    for (const id of new Set([originalSessionId, sessionId])) {
      if (agentStore.draft(sourceKey, id) === submittedDraft)
        agentStore.setDraft(sourceKey, id, '');
    }
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
        await agentStore.save(sourceKey, sessionId, assistant.id, {
          text: assistant.text,
          activity: assistant.activity ?? [],
          error: assistant.error ?? '',
          review: snapshot ? { id: snapshot.id, changes: snapshot.changes } : undefined,
        });
        if (
          assistant.review &&
          !request.signal.aborted &&
          props.documentKey === sourceKey &&
          conversationId.value === sessionId &&
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
  const sessionId = conversationId.value;
  const user = authUser.value?.id;
  try {
    await agentStore.retry(message.id);
    if (
      message.review &&
      !disposed &&
      key === props.documentKey &&
      sessionId === conversationId.value &&
      user === authUser.value?.id
    )
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
    allowExport.value = false;
    modelMenuOpen.value = false;
    reviewLoadError.value = '';
  }
);
watch(conversationId, () => {
  reviewController?.abort();
  review.value = null;
  reviewLoadError.value = '';
  sendError.value = '';
  allowExport.value = false;
  modelMenuOpen.value = false;
  followScroll = true;
  void scrollEnd();
});
watch(
  () => authUser.value?.id,
  (id) => {
    stop();
    modelController?.abort();
    reviewController?.abort();
    models.value = [];
    selectedId.value = '';
    settingsOpen.value = false;
    modelMenuOpen.value = false;
    review.value = null;
    if (id) void loadModels();
  },
  { immediate: true }
);
watch(
  [() => props.documentKey, () => authUser.value?.id],
  ([key, id]) => {
    if (key && id) void loadConversations();
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
  width 100%
  min-width 0
  flex-shrink 0
  display flex
  flex-direction column
  min-height 0
  height 100%
  background transparent
  color var(--color-text-primary)
  &__header
    height 56px
    flex-shrink 0
    padding 0 16px
    display flex
    align-items center
    justify-content space-between
    font-size 14px
    > span
      display flex
      align-items center
      gap 8px
  &__conversations
    flex-shrink 0
    padding 4px 16px 8px
    display flex
    flex-direction column
    align-items flex-start
    gap 8px
    > .ai-error
      margin 0
  &__conversation-controls
    display flex
    align-items flex-end
    gap 8px
    width 100%
    .ai-field
      flex 1
    select
      cursor pointer
      text-overflow ellipsis
      &:disabled
        cursor not-allowed
        opacity .6
    .ai-button
      flex-shrink 0
      height 37px
  &__conversation-status
    margin 0
    font-size 12px
    color var(--color-text-secondary)
  &__messages
    min-height 0
    flex 1
    overflow-y auto
    overscroll-behavior contain
    padding 16px
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
    padding 12px 16px 16px
  &__input-box
    border 1px solid var(--color-border-secondary)
    border-radius var(--border-radius-item-m, 8px)
    background var(--color-bg-secondary)
    &:focus-within
      border-color var(--color-accent)
  &__input
    display block
    box-sizing border-box
    width 100%
    min-height 104px
    padding 12px
    border 0
    border-radius inherit
    background transparent
    color var(--color-text-primary)
    font inherit
    font-size 13px
    line-height 1.6
    resize none
    &:focus-visible
      outline none
    &::placeholder
      color var(--color-text-tertiary)
    &:disabled
      opacity .5
      cursor not-allowed
  &__toolbar
    display flex
    align-items center
    gap 6px
    padding 6px 8px 8px
  &__control
    display inline-flex
    align-items center
    justify-content center
    min-height 32px
    padding 6px
    border 0
    border-radius var(--border-radius-item-s, 6px)
    background transparent
    color var(--color-text-secondary)
    font inherit
    font-size 12px
    cursor pointer
    &:hover:not(:disabled)
      background var(--color-bg-tertiary)
      color var(--color-text-primary)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:active:not(:disabled)
      transform translateY(1px)
    &:disabled
      opacity .4
      cursor not-allowed
  &__model-trigger
    flex 1
    min-width 0
    justify-content space-between
    gap 6px
    padding-inline 8px
    span
      overflow hidden
      text-overflow ellipsis
      white-space nowrap
  &__model-chevron
    flex-shrink 0
    transform rotate(-90deg)
    &--open
      transform rotate(90deg)
  &__model-loading
    flex 1
    min-width 0
    width auto
    padding 0
    .loading-skeleton__bar--label, .loading-skeleton__bar--button
      display none
    .loading-skeleton__bar--control
      width 100%
      height 32px
      margin-top 0
  &__model-popup
    border 1px solid var(--color-border-secondary)
  &__model-menu
    display flex
    flex-direction column
    max-height unquote('min(320px, var(--voex-trigger-available-height, 320px))')
    padding 4px
  &__model-options
    min-width 0
    min-height 0
    margin 0
    padding 0
    border 0
    overflow-y auto
    overscroll-behavior contain
  &__model-option
    display flex
    align-items center
    gap 8px
    padding 9px 8px
    border-radius var(--border-radius-item-s, 6px)
    cursor pointer
    &:hover
      background var(--color-bg-tertiary)
    &:focus-within
      outline 2px solid var(--color-accent)
      outline-offset -2px
    &:active
      background var(--color-bg-tertiary)
    &--selected
      background var(--color-selection-dim)
    input
      flex-shrink 0
      width 14px
      height 14px
      margin 0
      accent-color var(--color-accent)
      cursor pointer
    span
      min-width 0
      overflow-wrap anywhere
    strong, small
      display block
    strong
      color var(--color-text-primary)
      font-size 12px
      font-weight 500
    small
      margin-top 3px
      color var(--color-text-tertiary)
      font-size 11px
  &__model-empty
    margin 0
    padding 12px 8px
    color var(--color-text-tertiary)
    font-size 12px
  &__model-settings
    flex-shrink 0
    justify-content flex-start
    gap 8px
    width 100%
    margin-top 4px
    padding 10px 8px
    border-top 1px solid var(--color-border-secondary)
  &__icon-button
    flex-shrink 0
    width 32px
    height 32px
    &--active
      background var(--color-selection-dim)
      color var(--color-accent-hover)
      box-shadow inset 0 0 0 1px var(--color-accent)
      &:hover:not(:disabled)
        background var(--color-selection-bg)
        color var(--color-brand-text)
  &__send
    background var(--color-brand-bg)
    color var(--color-brand-text)
    &:hover:not(:disabled)
      background var(--color-accent)
      color var(--color-brand-text)
  &__sr-only
    position absolute
    width 1px
    height 1px
    padding 0
    margin -1px
    overflow hidden
    clip-path inset(50%)
    white-space nowrap
    border 0
</style>
