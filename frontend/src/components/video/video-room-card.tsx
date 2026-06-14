'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Video,
  Circle,
  Copy,
  Eye,
  Clock,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button, Badge } from '@/components';
import type { VideoRoomTypes } from '@/services/api/types';
import { translate } from '@/stores/locale-store';

interface VideoRoomCardProps {
  room: VideoRoomTypes.VideoRoom;
  locale: string;
  onJoin?: (roomId: string) => void;
  onViewRecording?: (roomId: string) => void;
  onCopyLink?: (roomUrl: string) => void;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  active: 'success',
  completed: 'info',
  expired: 'danger',
};

const RECORDING_VARIANT: Record<string, 'danger' | 'success' | 'default'> = {
  recording: 'danger',
  saved: 'success',
  none: 'default',
};

export function VideoRoomCard({
  room,
  locale,
  onJoin,
  onViewRecording,
  onCopyLink,
}: VideoRoomCardProps) {
  const t = (key: string, fb?: string) => translate(locale as any, key, fb);

  const createdDate = useMemo(() => {
    if (!room.created_at) return '';
    const d = new Date(room.created_at);
    return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [room.created_at, locale]);

  const recordingDuration = useMemo(() => {
    if (!room.recording_duration_seconds) return '';
    const mins = Math.floor(room.recording_duration_seconds / 60);
    const secs = room.recording_duration_seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, [room.recording_duration_seconds]);

  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-5 hover:border-purple-300 dark:hover:border-purple-500/40 transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shrink-0">
            <Video className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
              {room.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <User className="h-3 w-3" aria-hidden="true" />
              <span className="truncate">{room.candidate_name}</span>
            </p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[room.status] || 'default'} size="sm" dot>
          {t(`interviews.video.rooms.status.${room.status}`, room.status)}
        </Badge>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">{room.room_url}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {createdDate}
          </span>
          {room.recording_status !== 'none' && (
            <span className="inline-flex items-center gap-1">
              <Badge variant={RECORDING_VARIANT[room.recording_status] || 'default'} size="sm">
                {room.recording_status === 'recording' && (
                  <Circle className="h-2 w-2 fill-current animate-pulse mr-1" aria-hidden="true" />
                )}
                {room.recording_status === 'saved' && (
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
                )}
                {t(`interviews.video.rooms.status.${room.recording_status}`, room.recording_status)}
              </Badge>
              {recordingDuration && (
                <span className="ml-1">{recordingDuration}</span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-surface-700">
        <Link href={`/dashboard/interviews/video/${room.id}`} className="flex-1">
          <Button variant="secondary" size="sm" className="w-full" leftIcon={<Eye className="h-3.5 w-3.5" />}>
            {t('common.view', 'View')}
          </Button>
        </Link>
        {room.status === 'active' && onJoin && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Video className="h-3.5 w-3.5" />}
            onClick={() => onJoin(room.id)}
          >
            {t('interviews.video.rooms.actions.join', 'Join')}
          </Button>
        )}
        {room.recording_status === 'saved' && onViewRecording && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Eye className="h-3.5 w-3.5" />}
            onClick={() => onViewRecording(room.id)}
            aria-label={t('interviews.video.rooms.actions.viewRecording', 'View recording')}
          />
        )}
        {onCopyLink && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => onCopyLink(room.room_url)}
            aria-label={t('interviews.video.rooms.actions.copyLink', 'Copy link')}
          />
        )}
      </div>
    </div>
  );
}
