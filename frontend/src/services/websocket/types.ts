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

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  color: string;
  status: 'active' | 'idle';
  last_activity?: string;
  cursor?: { x: number; y: number } | null;
  selection?: { start: number; end: number; text: string } | null;
}

export interface PresenceJoinPayload {
  user: CollaborationUser;
  room: string;
}

export interface PresenceLeavePayload {
  user_id: string;
  room: string;
}

export interface PresenceListPayload {
  room: string;
  users: CollaborationUser[];
}

export interface CursorMovePayload {
  user: CollaborationUser;
  x: number;
  y: number;
  room: string;
}

export interface SelectionChangePayload {
  user: CollaborationUser;
  selection: { start: number; end: number; text: string } | null;
  room: string;
}

export interface RoomJoinPayload {
  room: string;
  user: CollaborationUser;
}

export interface RoomLeavePayload {
  room: string;
  user_id: string;
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
  'presence.join': PresenceJoinPayload;
  'presence.leave': PresenceLeavePayload;
  'presence.list': PresenceListPayload;
  'cursor.move': CursorMovePayload;
  'selection.change': SelectionChangePayload;
  'room.join': RoomJoinPayload;
  'room.leave': RoomLeavePayload;
  [key: string]: unknown;
};
