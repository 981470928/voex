import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { authUser } from '@/service/auth-session';
import { beginAITurn, finishAITurn, getAIConversation } from '@/service/api/ai-api';
import { errorMessage } from '@/utils/error';
import type { ChatMessage, TurnResponseInput } from '@/agent/types';

interface HistoryState {
  loaded: boolean;
  loading: boolean;
  error: string;
  nextCursor: string;
}

// A cache of account-scoped server history, never the source of applied status or snapshots.
export const useAgentStore = defineStore('agent', () => {
  const sessions = reactive<Record<string, ChatMessage[]>>({});
  const states = reactive<Record<string, HistoryState>>({});
  const reads = new Map<string, AbortController>();
  const writes = new Set<AbortController>();
  const versions = new Map<string, number>();
  const pending = new Map<string, { fileKey: string; input: TurnResponseInput }>();
  const inFlight = new Map<string, Promise<ChatMessage[]>>();
  const pendingCount = ref(0);
  const hasUnpersisted = computed(() => pendingCount.value > 0);
  let epoch = 0;

  function state(fileKey: string): HistoryState {
    return (
      states[fileKey] ??
      (states[fileKey] = { loaded: false, loading: false, error: '', nextCursor: '' })
    );
  }

  function merge(fileKey: string, messages: ChatMessage[], completedTurn?: string) {
    const session = sessions[fileKey] ?? (sessions[fileKey] = []);
    for (const message of messages) {
      const existing = session.find((item) => item.id === message.id);
      if (existing && existing.persistence && message.turnId !== completedTurn) continue;
      if (
        existing?.review?.id === message.review?.id &&
        existing?.review?.status === 'applied' &&
        message.review
      )
        message.review.status = 'applied';
      if (existing) {
        Object.assign(existing, message);
        if (message.turnId === completedTurn) {
          delete existing.persistence;
          delete existing.persistenceError;
        }
      } else session.push(message);
    }
    session.sort(
      (a, b) => a.sequence - b.sequence || (a.role === b.role ? 0 : a.role === 'user' ? -1 : 1)
    );
  }

  function changed(fileKey: string) {
    versions.set(fileKey, (versions.get(fileKey) ?? 0) + 1);
  }

  async function load(fileKey: string, older = false) {
    if (!fileKey || !authUser.value) return;
    const current = epoch;
    const version = versions.get(fileKey) ?? 0;
    const info = state(fileKey);
    if (older && (!info.nextCursor || info.loading)) return;
    reads.get(fileKey)?.abort();
    const controller = new AbortController();
    reads.set(fileKey, controller);
    info.loading = true;
    info.error = '';
    try {
      const page = await getAIConversation(
        fileKey,
        older ? info.nextCursor : '',
        controller.signal
      );
      if (
        epoch !== current ||
        controller.signal.aborted ||
        (versions.get(fileKey) ?? 0) !== version
      )
        return;
      if (!older)
        sessions[fileKey] = (sessions[fileKey] ?? []).filter((message) => !!message.persistence);
      merge(fileKey, page.messages);
      info.nextCursor = page.nextCursor;
      info.loaded = true;
    } catch (cause) {
      if (epoch === current && !controller.signal.aborted)
        info.error = errorMessage(cause, '对话历史加载失败，请重试');
    } finally {
      if (reads.get(fileKey) === controller) {
        reads.delete(fileKey);
        info.loading = false;
      }
    }
  }

  async function begin(fileKey: string, modelId: string, prompt: string, signal: AbortSignal) {
    const current = epoch;
    const id = crypto.randomUUID();
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    writes.add(controller);
    try {
      const messages = await beginAITurn(fileKey, id, modelId, prompt, controller.signal);
      if (current !== epoch) throw new Error('账号已切换');
      changed(fileKey);
      merge(fileKey, messages);
      const message = sessions[fileKey]!.find((item) => item.id === id)!;
      message.persistence = 'saving';
      return message;
    } finally {
      writes.delete(controller);
      signal.removeEventListener('abort', stop);
    }
  }

  function save(fileKey: string, id: string, input: TurnResponseInput) {
    // Retrying always sends the exact same finalized payload, even after another tab applies it.
    if (!pending.has(id))
      pending.set(id, { fileKey, input: JSON.parse(JSON.stringify(input)) as TurnResponseInput });
    pendingCount.value = pending.size;
    return retry(id);
  }

  function retry(id: string): Promise<ChatMessage[]> {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const entry = pending.get(id);
    if (!entry) return Promise.reject(new Error('没有待重试的对话'));
    const current = epoch;
    const controller = new AbortController();
    writes.add(controller);
    const message = sessions[entry.fileKey]?.find((item) => item.id === id);
    if (message) {
      message.persistence = 'saving';
      message.persistenceError = '';
    }
    const request = finishAITurn(entry.fileKey, id, entry.input, controller.signal)
      .then((messages) => {
        if (epoch !== current) throw new Error('账号已切换');
        pending.delete(id);
        pendingCount.value = pending.size;
        changed(entry.fileKey);
        merge(entry.fileKey, messages, id);
        return messages;
      })
      .catch((cause: unknown) => {
        if (epoch === current && message) {
          message.persistence = 'failed';
          message.persistenceError = errorMessage(
            cause,
            '回复尚未保存，请重试；刷新会丢失这份回复'
          );
        }
        throw cause;
      })
      .finally(() => {
        writes.delete(controller);
        if (inFlight.get(id) === request) inFlight.delete(id);
      });
    inFlight.set(id, request);
    return request;
  }

  function markApplied(id: string) {
    for (const [fileKey, messages] of Object.entries(sessions))
      for (const message of messages)
        if (message.review?.id === id) {
          message.review.status = 'applied';
          changed(fileKey);
        }
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnpersisted.value && !writes.size) return;
    event.preventDefault();
    event.returnValue = '';
  }
  window.addEventListener('beforeunload', beforeUnload);
  onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload));
  watch(
    () => authUser.value?.id,
    () => {
      epoch++;
      reads.forEach((controller) => controller.abort());
      writes.forEach((controller) => controller.abort());
      reads.clear();
      versions.clear();
      writes.clear();
      pending.clear();
      inFlight.clear();
      pendingCount.value = 0;
      for (const key of Object.keys(sessions)) delete sessions[key];
      for (const key of Object.keys(states)) delete states[key];
    },
    { flush: 'sync' }
  );
  return { sessions, state, load, begin, save, retry, markApplied, hasUnpersisted };
});
