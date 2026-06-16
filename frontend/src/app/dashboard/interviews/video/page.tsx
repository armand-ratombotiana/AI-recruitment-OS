'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Video,
  Filter,
  CalendarDays,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  EmptyState,
  Skeleton,
  Modal,
  Breadcrumb,
  useToast,
} from '@/components';
import { VideoRoomCard } from '@/components/video/video-room-card';
import type { VideoRoomTypes } from '@/services/api/types';
import { useLocaleStore, translate } from '@/stores/locale-store';

type StatusFilter = 'all' | 'active' | 'completed' | 'expired';

export default function VideoInterviewsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push } = useToast();

  const [rooms, setRooms] = useState<VideoRoomTypes.VideoRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCandidate, setFormCandidate] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search) params.search = search;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res: any = await api.videoRooms.list(params);
      setRooms(res?.data || (Array.isArray(res) ? res : []));
    } catch (err) {
      const e = err as APIError;
      setError(e?.message || t('interviews.video.rooms.empty', 'No video rooms yet'));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, dateFrom, dateTo, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formCandidate.trim()) {
      push('error', t('interviews.video.rooms.roomName', 'Room name') + ' & ' + t('interviews.candidate', 'Candidate') + ' required');
      return;
    }
    setSubmitting(true);
    try {
      await api.videoRooms.create({
        title: formTitle.trim(),
        candidate_name: formCandidate.trim(),
        candidate_email: formEmail.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      push('success', t('interviews.video.rooms.createRoom', 'Create room') + ' ✓');
      setCreateOpen(false);
      setFormTitle('');
      setFormCandidate('');
      setFormEmail('');
      setFormNotes('');
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || 'Failed to create room');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = useCallback((roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room?.room_url) {
      window.open(room.room_url, '_blank', 'noopener,noreferrer');
    }
  }, [rooms]);

  const handleCopyLink = useCallback((roomUrl: string) => {
    navigator.clipboard.writeText(roomUrl).then(
      () => push('success', t('interviews.video.room.copiedLink', 'Room link copied to clipboard')),
      () => push('error', t('interviews.video.room.copyLinkFailed', 'Failed to copy link')),
    );
  }, [push, t]);

  const handleViewRecording = useCallback((roomId: string) => {
    window.location.href = `/dashboard/interviews/video/${roomId}`;
  }, []);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.title.toLowerCase().includes(q) &&
          !r.candidate_name.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rooms, statusFilter, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rooms.length, active: 0, completed: 0, expired: 0 };
    rooms.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return counts;
  }, [rooms]);

  return (
    <div className="space-y-6"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('interviews.video.title', 'Video Interviews')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('interviews.video.subtitle', 'Manage video interview rooms and recordings')}
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreateOpen(true)}
        >
          {t('interviews.video.rooms.createRoom', 'Create room')}
        </Button>
      </div>

      <Breadcrumb />

      <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('interviews.search', 'Search interviews...')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
              aria-label={t('interviews.searchAria', 'Search interviews')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" />
            {(['all', 'active', 'completed', 'expired'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  statusFilter === s
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-800'
                }`}
              >
                {s === 'all'
                  ? t('candidates.allStatuses', 'All statuses')
                  : t(`interviews.video.rooms.status.${s}`, s)}
                <span className="ml-1 opacity-60">({statusCounts[s] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <label className="text-xs text-gray-500 dark:text-gray-400">
              {t('interviews.fields.date', 'Date')}
            </label>
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
          />
          <span className="text-gray-400 text-sm self-center">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-5 space-y-3">
              <Skeleton height={20} width="60%" />
              <Skeleton height={14} width="40%" />
              <Skeleton height={14} width="80%" />
              <Skeleton height={36} />
            </div>
          ))}
        </div>
      ) : error && rooms.length === 0 ? (
        <EmptyState
          icon={<Video className="h-12 w-12" />}
          title={t('interviews.couldntLoad', "Couldn't load interviews")}
          description={error}
          action={
            <Button variant="primary" onClick={load}>
              {t('common.retry', 'Retry')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Video className="h-12 w-12" />}
          title={t('interviews.video.rooms.empty', 'No video rooms yet')}
          description={t('interviews.video.rooms.emptyDesc', 'Create your first video interview room to start interviewing candidates remotely.')}
          action={
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              {t('interviews.video.rooms.createRoom', 'Create room')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((room) => (
            <VideoRoomCard
              key={room.id}
              room={room}
              locale={locale}
              onJoin={handleJoin}
              onViewRecording={handleViewRecording}
              onCopyLink={handleCopyLink}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => { if (!submitting) setCreateOpen(false); }}
        title={t('interviews.video.rooms.createRoom', 'Create room')}
        description={t('interviews.video.rooms.emptyDesc', 'Create your first video interview room to start interviewing candidates remotely.')}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="room-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('interviews.video.rooms.roomName', 'Room name')}
            </label>
            <input
              id="room-title"
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('interviews.video.rooms.roomNamePlaceholder', 'e.g. Senior Engineer Interview')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="room-candidate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('interviews.fields.candidateName', 'Candidate name *')}
            </label>
            <input
              id="room-candidate"
              type="text"
              value={formCandidate}
              onChange={(e) => setFormCandidate(e.target.value)}
              placeholder={t('interviews.fields.candidateName', 'Candidate name *')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="room-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              id="room-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="candidate@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="room-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('interviews.fields.notes', 'Notes')}
            </label>
            <textarea
              id="room-notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={3}
              placeholder={t('interviews.placeholders.notes', 'Agenda, topics to cover, or prep notes…')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" onClick={handleCreate} loading={submitting}>
              {t('interviews.video.rooms.createRoom', 'Create room')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
