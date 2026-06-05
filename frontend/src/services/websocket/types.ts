export type WSState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'reconnecting'
  | 'error';

export interface WSMessage<T = unknown> {
  type?: string;
  event?: string;
  channel?: string;
  data?: T;
  payload?: T;
  timestamp?: string;
  [key: string]: unknown;
}

export interface WSStateInfo {
  error?: string;
  reconnectAttempt?: number;
  nextRetryMs?: number;
  lastErrorAt?: number;
}

export type WSEventName = string;

export type WSMessageListener<T = unknown> = (data: T, message: WSMessage) => void;
export type WSStateListener = (state: WSState, info: WSStateInfo) => void;

export interface WebSocketClientConfig {
  url?: string;
  baseReconnectDelay?: number;
  maxReconnectDelay?: number;
  pingInterval?: number;
  maxReconnectAttempts?: number;
}

export interface CandidateCreatedPayload {
  candidate: Record<string, unknown>;
}

export interface CandidateUpdatedPayload {
  candidate: Record<string, unknown>;
}

export interface CandidateDeletedPayload {
  id: string;
}

export interface PipelineMovedPayload {
  candidate_id: string;
  from?: string;
  to: string;
  candidate?: Record<string, unknown>;
  moved_by?: string;
  moved_at?: string;
}

export interface InterviewScheduledPayload {
  interview: Record<string, unknown>;
}

export interface InterviewUpdatedPayload {
  interview: Record<string, unknown>;
}

export interface InterviewLifecyclePayload {
  interview_id: string;
}

export type WSEventPayloadMap = {
  'candidate.created': CandidateCreatedPayload;
  'candidate.updated': CandidateUpdatedPayload;
  'candidate.deleted': CandidateDeletedPayload;
  'pipeline.moved': PipelineMovedPayload;
  'interview.scheduled': InterviewScheduledPayload;
  'interview.updated': InterviewUpdatedPayload;
  'interview.started': InterviewLifecyclePayload;
  'interview.completed': InterviewLifecyclePayload;
  'interview.cancelled': InterviewLifecyclePayload;
  'notification': Record<string, unknown>;
  'ping': Record<string, never>;
  'pong': Record<string, never>;
  [key: string]: unknown;
};
