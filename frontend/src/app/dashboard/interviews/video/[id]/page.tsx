'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Video,
  Circle,
  Play,
  Square,
  Users,
  FileText,
  ExternalLink,
  User,
  Clock,
  Calendar,
  Save,
  Trash2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  useToast,
} from '@/components';
import { RecordingPlayer } from '@/components/video/recording-player';
import type { VideoRoomTypes } from '@/services/api/types';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  active: 'success',
  completed: 'info',
  expired: 'danger',
};

export default function VideoRoomDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push, ToastContainer } = useToast();

  const [room, setRoom] = useState<VideoRoomTypes.VideoRoom | null>(null);
  const [notes, setNotes] = useState<VideoRoomTypes.VideoRoomNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.videoRooms.get(params.id);
      const detail: VideoRoomTypes.VideoRoom = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        return;
      }
      setRoom(detail);
      try {
        const notesRes: any = await api.videoRooms.listNotes(params.id);
        setNotes(Array.isArray(notesRes) ? notesRes : notesRes?.data || []);
      } catch {
        setNotes([]);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
      } else {
        setError(e?.message || t('interviews.couldntLoad', "Couldn't load interviews"));
      }
    } finally {
      setLoading(false);
    }
  }, [params.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStartRecording = async () => {
    setRecordingLoading(true);
    try {
      await api.videoRooms.startRecording(params.id);
      push('success', t('interviews.video.room.recordingStarted', 'Recording started'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('interviews.video.room.recordingFailed', 'Failed to start recording'));
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setRecordingLoading(true);
    try {
      await api.videoRooms.stopRecording(params.id);
      push('success', t('interviews.video.room.recordingStopped', 'Recording stopped and saved'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || 'Failed to stop recording');
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setNoteLoading(true);
    try {
      await api.videoRooms.addNote(params.id, newNote.trim());
      setNewNote('');
      push('success', t('common.saved', 'Saved'));
      const notesRes: any = await api.videoRooms.listNotes(params.id);
      setNotes(Array.isArray(notesRes) ? notesRes : notesRes?.data || []);
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || 'Failed to add note');
    } finally {
      setNoteLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await api.videoRooms.deleteNote(params.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      push('success', t('common.deleted', 'Deleted'));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || 'Failed to delete note');
    }
  };

  const handleDownloadRecording = useCallback(() => {
    if (room?.recording_url) {
      const a = document.createElement('a');
      a.href = room.recording_url;
      a.download = '';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [room?.recording_url]);

  const handleJoinRoom = () => {
    if (room?.room_url) {
      window.open(room.room_url, '_blank', 'noopener,noreferrer');
    }
  };

  const createdDate = useMemo(() => {
    if (!room?.created_at) return '';
    return formatDate(room.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' });
  }, [room?.created_at, locale]);

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Skeleton height={20} width={180} />
        <Card><CardContent className="p-6"><div className="flex gap-5"><Skeleton variant="circular" width={64} height={64} /><div className="flex-1 space-y-3"><Skeleton height={28} width="50%" /><Skeleton height={16} width="70%" /></div></div></CardContent></Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-6"><Skeleton height={300} /><Skeleton height={200} /></div><div className="space-y-6"><Skeleton height={180} /><Skeleton height={160} /></div></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link href="/dashboard/interviews/video" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('interviews.video.title', 'Video Interviews')}
        </Link>
        <EmptyState
          icon={<Video className="h-12 w-12" />}
          title={t('interviews.video.rooms.empty', 'No video rooms yet')}
          description={t('interviews.video.rooms.emptyDesc', 'Create your first video interview room to start interviewing candidates remotely.')}
          action={<Link href="/dashboard/interviews/video"><Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>{t('interviews.video.title', 'Video Interviews')}</Button></Link>}
        />
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Card><CardContent className="p-0"><ErrorState title={t('interviews.couldntLoad', "Couldn't load interviews")} description={error} onRetry={load} retryLabel={t('common.retry', 'Retry')} fullHeight /></CardContent></Card>
      </div>
    );
  }

  if (!room) return null;

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link href="/dashboard/interviews/video" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('interviews.video.title', 'Video Interviews')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center text-white shrink-0 ring-4 ring-purple-100 dark:ring-purple-500/20">
              <Video className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">{room.title}</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="truncate">{room.candidate_name}</span>
                {room.candidate_email && <span className="text-gray-400 dark:text-gray-500">· {room.candidate_email}</span>}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[room.status] || 'default'} dot>
                  {t(`interviews.video.rooms.status.${room.status}`, room.status)}
                </Badge>
                {room.recording_status === 'recording' && (
                  <Badge variant="danger">
                    <Circle className="h-2 w-2 fill-current animate-pulse mr-1" aria-hidden="true" />
                    {t('interviews.video.room.recordingIndicator', '● REC')}
                  </Badge>
                )}
                {room.recording_status === 'saved' && (
                  <Badge variant="success">{t('interviews.video.recordings.title', 'Recordings')}</Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {createdDate}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  {room.room_url}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-col sm:items-stretch">
              {room.status === 'active' && (
                <Button variant="primary" size="sm" leftIcon={<Video className="h-4 w-4" />} onClick={handleJoinRoom}>
                  {t('interviews.video.rooms.joinRoom', 'Join room')}
                </Button>
              )}
              {room.status === 'active' && room.recording_status !== 'recording' && (
                <Button variant="secondary" size="sm" leftIcon={<Play className="h-4 w-4" />} onClick={handleStartRecording} loading={recordingLoading}>
                  {t('interviews.video.room.startRecording', 'Start recording')}
                </Button>
              )}
              {room.recording_status === 'recording' && (
                <Button variant="danger" size="sm" leftIcon={<Square className="h-4 w-4" />} onClick={handleStopRecording} loading={recordingLoading}>
                  {t('interviews.video.room.stopRecording', 'Stop recording')}
                </Button>
              )}
            </div>
          </header>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {room.recording_status === 'saved' && room.recording_url && (
            <section aria-labelledby="recording-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Video className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="recording-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('interviews.video.recordings.title', 'Recordings')}
                    </h2>
                  </div>
                  <RecordingPlayer
                    src={room.recording_url}
                    title={room.title}
                    locale={locale}
                    onDownload={handleDownloadRecording}
                  />
                </CardContent>
              </Card>
            </section>
          )}

          {room.status === 'active' && (
            <section aria-labelledby="embed-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Video className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="embed-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('interviews.video.room.title', 'Video Interview')}
                    </h2>
                  </div>
                  <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-surface-700 bg-gray-900">
                    <iframe
                      src={room.room_url}
                      title={room.title}
                      className="w-full h-full"
                      allow="camera; microphone; fullscreen; display-capture"
                      allowFullScreen
                    />
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          <section aria-labelledby="notes-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="notes-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('interviews.fields.notes', 'Notes')}
                  </h2>
                </div>
                <div className="mb-4 flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={2}
                    placeholder={t('interviews.placeholders.notes', 'Agenda, topics to cover, or prep notes…')}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 resize-none"
                  />
                  <Button variant="primary" size="sm" leftIcon={<Save className="h-4 w-4" />} onClick={handleAddNote} loading={noteLoading} className="self-end">
                    {t('common.save', 'Save')}
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('interviews.video.rooms.empty', 'No video rooms yet')}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {notes.map((note) => (
                      <li key={note.id} className="p-3 rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</p>
                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1"><User className="h-3 w-3" aria-hidden="true" />{note.author}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{formatDate(note.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3 w-3" />} onClick={() => handleDeleteNote(note.id)} aria-label={t('common.delete', 'Delete')} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="participants-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="participants-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('interviews.video.room.participantList', 'Participants')}
                  </h2>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{room.participants?.length || 0}</span>
                </div>
                {room.participants && room.participants.length > 0 ? (
                  <ul className="space-y-2">
                    {room.participants.map((p) => {
                      const initials = p.name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <li key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-surface-700 hover:bg-gray-50 dark:hover:bg-surface-800 transition">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0" aria-hidden="true">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{p.role}</p>
                          </div>
                          {p.joined_at && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {t('interviews.video.rooms.actions.join', 'Join')}d
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('interviews.video.room.noParticipants', 'No other participants')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardContent className="p-6 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold tracking-wider">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('interviewDetail.timeline', 'Timeline')}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-500 dark:text-gray-400">{t('interviews.video.rooms.createdAt', 'Created')}</span>
                <span className="font-medium text-gray-900 dark:text-white text-right">{createdDate}</span>
              </div>
              {room.expires_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('common.expires', 'Expires')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{formatDate(room.expires_at, locale, { dateStyle: 'medium' })}</span>
                </div>
              )}
              {room.recording_duration_seconds && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('interviews.video.recordings.duration', 'Duration')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {Math.floor(room.recording_duration_seconds / 60)}:{String(room.recording_duration_seconds % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
