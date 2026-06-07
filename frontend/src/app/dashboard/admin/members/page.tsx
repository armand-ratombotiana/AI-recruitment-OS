'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Mail,
  MoreVertical,
  Edit,
  Shield,
  Send,
  Search,
  X,
  UserCheck,
  UserX,
  AlertCircle,
  ArrowRight,
  Crown,
  RefreshCw,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { UserTypes } from '@/services/api/types';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  Modal,
  ConfirmDialog,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';
import { useAuthStore } from '@/stores';

type Role = 'admin' | 'recruiter' | 'hiring_manager' | 'member' | 'viewer';
type Status = 'active' | 'invited' | 'deactivated';

const ROLES: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_VARIANT: Record<string, 'info' | 'purple' | 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  admin: 'purple',
  recruiter: 'success',
  hiring_manager: 'warning',
  member: 'info',
  viewer: 'default',
};

const STATUS_VARIANT: Record<Status, 'success' | 'warning' | 'default'> = {
  active: 'success',
  invited: 'warning',
  deactivated: 'default',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRole(raw: string | undefined): Role {
  const r = (raw || '').toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'recruiter') return 'recruiter';
  if (r === 'hiring_manager') return 'hiring_manager';
  if (r === 'viewer' || r === 'observer') return 'viewer';
  return 'member';
}

function normalizeStatus(u: UserTypes.User): Status {
  const s = (u.status || '').toLowerCase();
  if (s === 'invited' || s === 'pending') return 'invited';
  if (s === 'deactivated' || s === 'inactive' || s === 'disabled') return 'deactivated';
  if (s === 'active') return 'active';
  return 'active';
}

function getInitials(name: string, email: string): string {
  const source = (name && name.trim()) || email || '?';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export default function AdminMembersPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const [members, setMembers] = useState<UserTypes.User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<UserTypes.User | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<UserTypes.User | null>(null);
  const [confirmResend, setConfirmResend] = useState<UserTypes.User | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { push, ToastContainer } = useToast();

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const res = await api.users.list({ page_size: '200' });
        const items = (res as { data?: UserTypes.User[] })?.data || [];
        setMembers(items);
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not load members';
        setLoadError(msg);
        setMembers([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => normalizeStatus(m) === 'active').length;
    const invited = members.filter((m) => normalizeStatus(m) === 'invited').length;
    const admins = members.filter((m) => normalizeRole(m.role) === 'admin').length;
    return { total, active, invited, admins };
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && normalizeRole(m.role) !== roleFilter) return false;
      const s = normalizeStatus(m);
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (q) {
        const hay = `${m.full_name} ${m.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, roleFilter, statusFilter]);

  const hasActiveFilters = roleFilter !== 'all' || statusFilter !== 'all' || search.trim().length > 0;

  const clearFilters = () => {
    setRoleFilter('all');
    setStatusFilter('all');
    setSearch('');
  };

  const handleInvite = useCallback(
    async (email: string, role: string) => {
      try {
        await api.users.create({ email, full_name: email.split('@')[0], role, status: 'invited' });
        push('success', t('members.invited', 'Invitation sent to {email}').replace('{email}', email));
        setInviteOpen(false);
        await load(true);
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not send invite';
        push('error', msg);
        throw err;
      }
    },
    [push, t, load]
  );

  const handleChangeRole = useCallback(
    async (member: UserTypes.User, newRole: string) => {
      try {
        await api.users.update(member.id, { role: newRole });
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)));
        push('success', t('members.roleUpdated', 'Role updated for {name}').replace('{name}', member.full_name || member.email));
        setEditingMember(null);
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update role';
        push('error', msg);
      }
    },
    [push, t]
  );

  const handleRemove = useCallback(
    async (member: UserTypes.User) => {
      try {
        await api.users.delete(member.id);
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        push('success', t('members.removed', '{name} has been removed').replace('{name}', member.full_name || member.email));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not remove member';
        push('error', msg);
      }
      setConfirmRemove(null);
    },
    [push, t]
  );

  const handleResendInvite = useCallback(
    async (member: UserTypes.User) => {
      try {
        await api.users.update(member.id, { status: 'invited' });
        push('success', t('members.resent', 'Invitation re-sent to {email}').replace('{email}', member.email));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not resend invite';
        push('error', msg);
      }
      setConfirmResend(null);
    },
    [push, t]
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6" role="alert" aria-live="assertive">
        <Breadcrumb />
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400" aria-hidden="true">
              <Shield className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('members.accessDenied', 'Admin only')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {t('members.accessDeniedDesc', 'You need administrator privileges to manage members.')}
            </p>
            <Link href="/dashboard">
              <Button variant="primary" className="mt-5">
                {t('common.dashboardHome', 'Dashboard home')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Breadcrumb />

      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                {t('members.title', 'Members')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('members.subtitle', 'Manage who has access to your tenant.')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />
            }
            onClick={() => load(true)}
            loading={refreshing}
            disabled={refreshing}
            aria-label={t('common.refresh', 'Refresh')}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              {t('common.back', 'Admin overview')}
            </Button>
          </Link>
          <Button
            variant="primary"
            leftIcon={<UserPlus className="h-4 w-4" />}
            onClick={() => setInviteOpen(true)}
          >
            {t('members.invite', 'Invite member')}
          </Button>
        </div>
      </header>

      <section aria-label="Member statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={t('members.stats.total', 'Total members')}
          value={stats.total}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          gradient="from-blue-500 to-indigo-500"
        />
        <StatCard
          label={t('members.stats.active', 'Active')}
          value={stats.active}
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatCard
          label={t('members.stats.invited', 'Invited')}
          value={stats.invited}
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          gradient="from-amber-500 to-orange-500"
        />
        <StatCard
          label={t('members.stats.admins', 'Admins')}
          value={stats.admins}
          icon={<Crown className="h-5 w-5" aria-hidden="true" />}
          gradient="from-purple-500 to-pink-500"
        />
      </section>

      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('members.searchPlaceholder', 'Search by name or email…')}
                  aria-label={t('members.searchAria', 'Search members')}
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('common.cancel', 'Clear search')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
                  aria-label={t('members.filter.role', 'Filter by role')}
                  className="rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">{t('members.filter.allRoles', 'All roles')}</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)}
                  aria-label={t('members.filter.status', 'Filter by status')}
                  className="rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">{t('members.filter.allStatuses', 'All statuses')}</option>
                  <option value="active">{t('members.status.active', 'Active')}</option>
                  <option value="invited">{t('members.status.invited', 'Invited')}</option>
                  <option value="deactivated">{t('members.status.deactivated', 'Deactivated')}</option>
                </select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
                    {t('members.clearFilters', 'Clear')}
                  </Button>
                )}
              </div>
            </div>

            {loadError && !loading && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-900 dark:text-amber-200"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{loadError}</span>
              </div>
            )}

            <div className="pt-1" role="region" aria-label="Members list">
              {loading ? (
                <MembersSkeleton />
              ) : members.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-10 w-10" aria-hidden="true" />}
                  title={t('members.empty.title', 'No members yet')}
                  description={t('members.empty.desc', 'Invite your first teammate to get started.')}
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<UserPlus className="h-4 w-4" />}
                      onClick={() => setInviteOpen(true)}
                    >
                      {t('members.inviteFirst', 'Invite first member')}
                    </Button>
                  }
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-10 w-10" aria-hidden="true" />}
                  title={t('members.noResults.title', 'No members match your filters')}
                  description={t('members.noResults.desc', 'Try a different search term or clear the filters.')}
                  action={
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      {t('members.clearFilters', 'Clear')}
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto -mx-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-surface-700">
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('members.table.member', 'Member')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('members.table.role', 'Role')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('members.table.status', 'Status')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('members.table.lastActive', 'Last active')}
                          </th>
                          <th scope="col" className="text-right font-semibold px-2 py-2.5">
                            <span className="sr-only">{t('members.table.actions', 'Actions')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
                        {filtered.map((m) => (
                          <MemberRow
                            key={m.id}
                            member={m}
                            menuOpen={openMenuId === m.id}
                            onToggleMenu={() => setOpenMenuId((p) => (p === m.id ? null : m.id))}
                            onEdit={() => {
                              setEditingMember(m);
                              setOpenMenuId(null);
                            }}
                            onRemove={() => {
                              setConfirmRemove(m);
                              setOpenMenuId(null);
                            }}
                            onResend={() => {
                              setConfirmResend(m);
                              setOpenMenuId(null);
                            }}
                            menuRef={openMenuId === m.id ? menuRef : undefined}
                            t={t}
                            locale={locale}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="md:hidden space-y-3" role="list">
                    {filtered.map((m) => (
                      <MemberCard
                        key={m.id}
                        member={m}
                        menuOpen={openMenuId === m.id}
                        onToggleMenu={() => setOpenMenuId((p) => (p === m.id ? null : m.id))}
                        onEdit={() => {
                          setEditingMember(m);
                          setOpenMenuId(null);
                        }}
                        onRemove={() => {
                          setConfirmRemove(m);
                          setOpenMenuId(null);
                        }}
                        onResend={() => {
                          setConfirmResend(m);
                          setOpenMenuId(null);
                        }}
                        menuRef={openMenuId === m.id ? menuRef : undefined}
                        t={t}
                        locale={locale}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>

            {!loading && members.length > 0 && (
              <div
                className="pt-2 border-t border-gray-100 dark:border-surface-700 text-xs text-gray-500 dark:text-gray-400"
                aria-live="polite"
              >
                {filtered.length === members.length
                  ? t('members.count.total', '{count} member(s)').replace('{count}', String(members.length))
                  : t('members.count.showing', 'Showing {shown} of {total}')
                      .replace('{shown}', String(filtered.length))
                      .replace('{total}', String(members.length))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <InviteModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
        t={t}
      />

      <EditRoleModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSave={handleChangeRole}
        t={t}
      />

      <ConfirmDialog
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={async () => {
          if (confirmRemove) await handleRemove(confirmRemove);
        }}
        title={t('members.removeTitle', 'Remove member?')}
        description={
          confirmRemove
            ? t('members.removeDesc', 'This will permanently remove {name} from your tenant. They will lose all access.')
                .replace('{name}', confirmRemove.full_name || confirmRemove.email)
            : ''
        }
        confirmLabel={t('members.remove', 'Remove')}
        variant="danger"
        destructive
      />

      <ConfirmDialog
        isOpen={!!confirmResend}
        onClose={() => setConfirmResend(null)}
        onConfirm={async () => {
          if (confirmResend) await handleResendInvite(confirmResend);
        }}
        title={t('members.resendTitle', 'Resend invitation?')}
        description={
          confirmResend
            ? t('members.resendDesc', 'A new invitation email will be sent to {email}.')
                .replace('{email}', confirmResend.email)
            : ''
        }
        confirmLabel={t('members.resend', 'Resend')}
        variant="info"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white shrink-0`}
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MembersSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading members">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <Skeleton variant="circular" width={36} height={36} />
          <div className="flex-1 space-y-1.5">
            <Skeleton width="40%" height={12} />
            <Skeleton width="25%" height={10} />
          </div>
          <Skeleton width={60} height={20} />
        </div>
      ))}
    </div>
  );
}

function MemberRow({
  member,
  menuOpen,
  onToggleMenu,
  onEdit,
  onRemove,
  onResend,
  menuRef,
  t,
  locale,
}: {
  member: UserTypes.User;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onResend: () => void;
  menuRef?: React.RefObject<HTMLDivElement>;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const initials = getInitials(member.full_name, member.email);
  const role = normalizeRole(member.role);
  const status = normalizeStatus(member);
  const lastActive = member.last_active_at
    ? formatRelativeTime(member.last_active_at, locale)
    : t('members.never', 'Never');

  return (
    <tr>
      <td className="px-2 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {member.full_name || member.email}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <Badge variant={ROLE_VARIANT[role] || 'default'} size="sm">
          {ROLES.find((r) => r.value === role)?.label || role}
        </Badge>
      </td>
      <td className="px-2 py-3">
        <Badge variant={STATUS_VARIANT[status]} size="sm" dot>
          {t(`members.status.${status}`, status)}
        </Badge>
      </td>
      <td className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{lastActive}</td>
      <td className="px-2 py-3 text-right">
        <div className="relative inline-block" ref={menuRef}>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={t('common.actions', 'Actions')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 z-20"
            >
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-surface-800"
              >
                <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                {t('members.changeRole', 'Change role')}
              </button>
              {status === 'invited' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onResend}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-surface-800"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('members.resend', 'Resend invite')}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={onRemove}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-danger-500 hover:bg-red-50 dark:hover:bg-red-500/10 focus:outline-none focus-visible:bg-red-50 dark:focus-visible:bg-red-500/10"
              >
                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                {t('members.remove', 'Remove member')}
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function MemberCard({
  member,
  menuOpen,
  onToggleMenu,
  onEdit,
  onRemove,
  onResend,
  menuRef,
  t,
  locale,
}: {
  member: UserTypes.User;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onResend: () => void;
  menuRef?: React.RefObject<HTMLDivElement>;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const initials = getInitials(member.full_name, member.email);
  const role = normalizeRole(member.role);
  const status = normalizeStatus(member);
  const lastActive = member.last_active_at
    ? formatRelativeTime(member.last_active_at, locale)
    : t('members.never', 'Never');

  return (
    <li className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 bg-white dark:bg-surface-900">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {member.full_name || member.email}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <Badge variant={ROLE_VARIANT[role] || 'default'} size="sm">
              {ROLES.find((r) => r.value === role)?.label || role}
            </Badge>
            <Badge variant={STATUS_VARIANT[status]} size="sm" dot>
              {t(`members.status.${status}`, status)}
            </Badge>
            <span className="text-xs text-gray-500 dark:text-gray-400">{lastActive}</span>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={t('common.actions', 'Actions')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 z-20"
            >
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800"
              >
                <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                {t('members.changeRole', 'Change role')}
              </button>
              {status === 'invited' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={onResend}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('members.resend', 'Resend invite')}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={onRemove}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-danger-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                {t('members.remove', 'Remove member')}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function InviteModal({
  isOpen,
  onClose,
  onSubmit,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: string) => Promise<void>;
  t: (key: string, fb?: string) => string;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('member');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setError(t('members.invalidEmail', 'Please enter a valid email address'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(email.trim().toLowerCase(), role);
    } catch {
      /* parent handles */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      title={t('members.inviteTitle', 'Invite team member')}
      description={t('members.inviteDesc', 'They will receive an email with a sign-up link.')}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} leftIcon={<Send className="h-4 w-4" />}>
            {t('members.sendInvite', 'Send invite')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('members.email', 'Email address')}
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="name@company.com"
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            autoComplete="email"
            disabled={submitting}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'invite-email-error' : undefined}
          />
          {error && (
            <p id="invite-email-error" role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('members.role', 'Role')}
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={submitting}
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('members.roleHint', 'Admins have full access. Members can create and edit content. Viewers are read-only.')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function EditRoleModal({
  member,
  onClose,
  onSave,
  t,
}: {
  member: UserTypes.User | null;
  onClose: () => void;
  onSave: (member: UserTypes.User, newRole: string) => Promise<void>;
  t: (key: string, fb?: string) => string;
}) {
  const [role, setRole] = useState<Role>('member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(normalizeRole(member.role));
    }
  }, [member]);

  if (!member) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(member, role);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!member}
      onClose={saving ? () => undefined : onClose}
      title={t('members.editTitle', 'Change role')}
      description={t('members.editDesc', 'Update the role for {name}').replace(
        '{name}',
        member.full_name || member.email
      )}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {t('common.save', 'Save changes')}
          </Button>
        </div>
      }
    >
      <div>
        <label htmlFor="edit-role" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          {t('members.role', 'Role')}
        </label>
        <select
          id="edit-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={saving}
          className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
