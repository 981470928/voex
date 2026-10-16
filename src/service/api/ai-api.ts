import http from './https';
import type { ApiError } from './index';
import type {
  AIModel,
  AIConversationSession,
  ConversationSessionPage,
  ChatMessage,
  ConversationPage,
  ReviewSnapshot,
  TurnResponseInput,
} from '@/agent/types';

export function listAIModels(signal?: AbortSignal) {
  return http.get<ApiError, AIModel[]>('/ai/models', { signal });
}

export function saveAIModel(model: Omit<AIModel, 'has_key'> & { api_key: string }) {
  const { id, ...body } = model;
  return http.put<ApiError, AIModel>(`/ai/models/${encodeURIComponent(id)}`, body);
}

export function deleteAIModel(id: string) {
  return http.delete<ApiError, { success: boolean }>(`/ai/models/${encodeURIComponent(id)}`);
}

export function requestAIChat(id: string, body: unknown, signal: AbortSignal) {
  return http.post<ApiError, unknown>(`/ai/models/${encodeURIComponent(id)}/chat`, body, {
    signal,
    timeout: 125000,
  });
}

export interface AppliedDocument {
  file_key: string;
  file_name: string;
  revision: number;
  replayed?: boolean;
}

export function applyAIReview(review: ReviewSnapshot) {
  return http.post<ApiError, AppliedDocument[]>(
    `/ai/reviews/${encodeURIComponent(review.id)}/apply`,
    {}
  );
}

export function listAIConversations(fileKey: string, before = '', signal?: AbortSignal) {
  return http.get<ApiError, ConversationSessionPage>(
    `/ai/conversations/${encodeURIComponent(fileKey)}/sessions`,
    { signal, params: before ? { before } : undefined }
  );
}

export function createAIConversation(fileKey: string, id: string, signal?: AbortSignal) {
  return http.put<ApiError, AIConversationSession>(
    `/ai/conversations/${encodeURIComponent(fileKey)}/sessions/${encodeURIComponent(id)}`,
    {},
    { signal }
  );
}

export function getAIConversation(
  fileKey: string,
  sessionId: string,
  before = '',
  signal?: AbortSignal
) {
  return http.get<ApiError, ConversationPage>(`/ai/conversations/${encodeURIComponent(fileKey)}`, {
    signal,
    params: { session_id: sessionId, ...(before ? { before } : {}) },
  });
}

export function beginAITurn(
  fileKey: string,
  sessionId: string,
  id: string,
  modelId: string,
  prompt: string,
  signal: AbortSignal
) {
  return http.put<ApiError, ChatMessage[]>(
    `/ai/conversations/${encodeURIComponent(fileKey)}/turns/${encodeURIComponent(id)}`,
    { session_id: sessionId, model_id: modelId, prompt },
    { signal }
  );
}

export function finishAITurn(
  fileKey: string,
  id: string,
  input: TurnResponseInput,
  signal: AbortSignal
) {
  return http.put<ApiError, ChatMessage[]>(
    `/ai/conversations/${encodeURIComponent(fileKey)}/turns/${encodeURIComponent(id)}/response`,
    input,
    { signal }
  );
}

export function getAIReview(id: string, signal?: AbortSignal) {
  return http.get<ApiError, ReviewSnapshot>(`/ai/reviews/${encodeURIComponent(id)}`, { signal });
}
