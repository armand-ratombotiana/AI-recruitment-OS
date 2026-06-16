'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  MoreVertical,
  Edit,
  Shield,
  Eye,
  Send,
  Search,
  X,
  UserCheck,
  UserX,
  AlertCircle,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  useToast,
  Modal,
  ConfirmDialog,
} from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';

type Role = 'admin' | 'member' | 'viewer';
type Status = 'active' | 'invited' | 'deactivated';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  is_active: boolean;
  created_at?: string;
  last_active_at?: string | null;
  avatar_url?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
};

const ROLE_VARIANT: Record<string, 'info' | 'purple' | 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  admin: 'purple',
  member: 'info',
  viewer: 'default',
  recruiter: 'success',
  hiring_manager: 'warning',
};

const GRADIENTS = [
  'from-blue-500 to-purple-500',
  'from-pink-500 to-rose-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-indigo-500 to-violet-500',
  'from-cyan-500 to-sky-500',
  'from-fuchsia-500 to-pink-500',
  'from-lime-500 to-green-500',
];

function normalizeRole(raw: string | undefined): Role {
  const r = (raw || '').toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'viewer' || r === 'observer') return 'viewer';
  return 'member';
}

function normalizeStatus(member: TeamMember): Status {
  if (member.status) {
    const s = member.status.toLowerCase();
    if (s === 'invited' || s === 'pending') return 'invited';
    if (s === 'deactivated' || s === 'inactive' || s === 'disabled') return 'deactivated';
    if (s === 'active') return 'active';
  }
  if (member.is_active === false) return 'deactivated';
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

function pickGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export default function TeamPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TeamMember | null>(null);
  const [confirmResend, setConfirmResend] = useState<TeamMember | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.users.list({ page_size: '200' });
      const items: TeamMember[] = (res?.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name || u.name || u.email,
        email: u.email,
        role: u.role || 'member',
        status: u.status || (u.is_active === false ? 'deactivated' : 'active'),
        is_active: u.is_active !== false,
        created_at: u.created_at,
        last_active_at: u.last_active_at || u.last_login_at || null,
        avatar_url: u.avatar_url || null,
      }));
      setMembers(items);
    } catch (err: any) {
      const msg = err instanceof APIError ? err.message : err?.message || 'Could not load team members';
      setLoadError(msg);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleInviteSuccess = (email: string) => {
    push('success', t('settings.team.invited', 'Invitation sent'));
    setInviteOpen(false);
    load();
  };

  const handleEditSuccess = () => {
    push('success', t('team.memberUpdated', 'Member updated'));
    setEditingMember(null);
    load();
  };

  const handleDeactivate = async (member: TeamMember) => {
    setConfirmDeactivate(null);
    try {
      await api.users.update(member.id, { is_active: false, status: 'deactivated' } as any);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, is_active: false, status: 'deactivated' } : m)));
      push('success', t('team.memberDeactivated', '{name} has been deactivated').replace('{name}', member.full_name));
    } catch (err: any) {
      push('error', err?.message || t('team.deactivateFailed', 'Could not deactivate member'));
    }
  };

  const handleReactivate = async (member: TeamMember) => {
    try {
      await api.users.update(member.id, { is_active: true, status: 'active' } as any);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, is_active: true, status: 'active' } : m)));
      push('success', t('team.memberReactivated', '{name} has been reactivated').replace('{name}', member.full_name));
    } catch (err: any) {
      push('error', err?.message || t('team.reactivateFailed', 'Could not reactivate member'));
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    setConfirmResend(null);
    try {
      await api.users.update(member.id, { status: 'invited' } as any);
      push('success', t('team.inviteResent', 'Invitation re-sent to {email}').replace('{email}', member.email));
    } catch (err: any) {
      push('error', err?.message || t('team.resendFailed', 'Could not resend invitation'));
    }
  };

  return (
    <div className="space-y-6"><Breadcrumb />

      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                {t('team.title', 'Team')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('team.subtitle', 'Manage who has access to your workspace.')}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus className="h-4 w-4" />}
          onClick={() => setInviteOpen(true)}
        >
          {t('team.inviteMember', 'Invite member')}
        </Button>
      </header>

      <section aria-label="Team statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={t('team.stats.total', 'Total members')}
          value={stats.total}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          gradient="from-blue-500 to-indigo-500"
        />
        <StatCard
          label={t('team.stats.active', 'Active')}
          value={stats.active}
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <StatCard
          label={t('team.stats.invited', 'Invited')}
          value={stats.invited}
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          gradient="from-amber-500 to-orange-500"
        />
        <StatCard
          label={t('team.stats.admins', 'Admins')}
          value={stats.admins}
          icon={<Shield className="h-5 w-5" aria-hidden="true" />}
          gradient="from-purple-500 to-pink-500"
        />
      </section>

      <Card>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('team.searchPlaceholder', 'Search by name or email…')}
                  aria-label={t('team.searchAria', 'Search team members')}
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('team.clearSearch', 'Clear search')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <SelectPill
                  label={t('team.filter.role', 'Role')}
                  value={roleFilter}
                  onChange={(v) => setRoleFilter(v as 'all' | Role)}
                  options={[
                    { value: 'all', label: t('team.filter.allRoles', 'All roles') },
                    { value: 'admin', label: t('team.roles.admin', 'Admin') },
                    { value: 'member', label: t('team.roles.member', 'Member') },
                    { value: 'viewer', label: t('team.roles.viewer', 'Viewer') },
                  ]}
                />
                <SelectPill
                  label={t('team.filter.status', 'Status')}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as 'all' | Status)}
                  options={[
                    { value: 'all', label: t('team.filter.allStatuses', 'All statuses') },
                    { value: 'active', label: t('team.statuses.active', 'Active') },
                    { value: 'invited', label: t('team.statuses.invited', 'Invited') },
                    { value: 'deactivated', label: t('team.statuses.deactivated', 'Deactivated') },
                  ]}
                />
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
                    {t('team.clearFilters', 'Clear')}
                  </Button>
                )}
              </div>
            </div>

            {loadError && !loading && (
              <div role="alert" className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-900 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {loadError}. {t('team.errorHint', 'Showing an empty list — try refreshing once the service is back.')}
                </span>
              </div>
            )}

            <div className="pt-1" role="region" aria-label="Team members list">
              {loading ? (
                <TeamSkeleton />
              ) : members.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-10 w-10" aria-hidden="true" />}
                  title={t('team.empty.title', 'No team members yet')}
                  description={t('team.empty.desc', 'Invite recruiters, hiring managers, and admins to start collaborating.')}
                  action={
                    <Button variant="primary" size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                      {t('team.inviteFirst', 'Invite your first member')}
                    </Button>
                  }
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-10 w-10" aria-hidden="true" />}
                  title={t('team.noResults.title', 'No members match your filters')}
                  description={t('team.noResults.desc', 'Try a different search term or clear the filters.')}
                  action={
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      {t('team.clearFilters', 'Clear')}
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
                            {t('team.table.member', 'Member')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('team.table.role', 'Role')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('team.table.status', 'Status')}
                          </th>
                          <th scope="col" className="text-left font-semibold px-2 py-2.5">
                            {t('team.table.lastActive', 'Last active')}
                          </th>
                          <th scope="col" className="text-right font-semibold px-2 py-2.5">
                            <span className="sr-only">{t('team.table.actions', 'Actions')}</span>
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
                            onDeactivate={() => {
                              setConfirmDeactivate(m);
                              setOpenMenuId(null);
                            }}
                            onReactivate={() => {
                              handleReactivate(m);
                              setOpenMenuId(null);
                            }}
                            onResendInvite={() => {
                              setConfirmResend(m);
                              setOpenMenuId(null);
                            }}
                            menuRef={openMenuId === m.id ? menuRef : undefined}
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
                        onDeactivate={() => {
                          setConfirmDeactivate(m);
                          setOpenMenuId(null);
                        }}
                        onReactivate={() => {
                          handleReactivate(m);
                          setOpenMenuId(null);
                        }}
                        onResendInvite={() => {
                          setConfirmResend(m);
                          setOpenMenuId(null);
                        }}
                        menuRef={openMenuId === m.id ? menuRef : undefined}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>

            {!loading && members.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-surface-700 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
                {filtered.length === members.length
                  ? t('team.count.total', '{count} member(s)').replace('{count}', String(members.length))
                  : t('team.count.showing', 'Showing {shown} of {total}').replace('{shown}', String(filtered.length)).replace('{total}', String(members.length))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <InviteModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={handleInviteSuccess}
      />

      <EditMemberModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSuccess={handleEditSuccess}
      />

      <ConfirmDialog
        isOpen={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={async () => {
          if (confirmDeactivate) await handleDeactivate(confirmDeactivate);
        }}
        title={t('team.confirm.deactivateTitle', 'Deactivate member?')}
        description={
          confirmDeactivate
            ? t(
                'team.confirm.deactivateDesc',
                '{name} will lose access to the workspace. You can reactivate them later.'
              ).replace('{name}', confirmDeactivate.full_name)
            : ''
        }
        confirmLabel={t('team.confirm.deactivate', 'Deactivate')}
        cancelLabel={t('common.cancel', 'Cancel')}
        destructive
      />

      <ConfirmDialog
        isOpen={!!confirmResend}
        onClose={() => setConfirmResend(null)}
        onConfirm={async () => {
          if (confirmResend) await handleResendInvite(confirmResend);
        }}
        title={t('team.confirm.resendTitle', 'Resend invitation?')}
        description={
          confirmResend
            ? t('team.confirm.resendDesc', 'A new invite email will be sent to {email}.')
                .replace('{email}', confirmResend.email)
            : ''
        }
        confirmLabel={t('team.confirm.resend', 'Resend invite')}
        cancelLabel={t('common.cancel', 'Cancel')}
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
      <CardContent className="!p-4 sm:!p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white shrink-0`} aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `select-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading team members">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="60%" />
          </div>
          <Skeleton variant="rounded" width={80} height={24} />
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
  onDeactivate,
  onReactivate,
  onResendInvite,
  menuRef,
}: {
  member: TeamMember;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResendInvite: () => void;
  menuRef?: React.RefObject<HTMLDivElement>;
}) {
  const status = normalizeStatus(member);
  const role = normalizeRole(member.role);
  const statusBadge = getStatusBadge(status);
  const roleBadgeVariant = ROLE_VARIANT[role] || ROLE_VARIANT[member.role] || 'default';

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-surface-800/50 transition-colors">
      <td className="px-2 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar member={member} />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{member.full_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{member.email}</span>
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        <RoleBadge role={role} rawRole={member.role} variant={roleBadgeVariant} />
      </td>
      <td className="px-2 py-3">
        <Badge variant={statusBadge.variant} size="sm" dot>
          {statusBadge.label}
        </Badge>
      </td>
      <td className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {member.last_active_at ? formatRelativeTime(member.last_active_at, 'en') : <span aria-label="Never active">—</span>}
      </td>
      <td className="px-2 py-3 text-right">
        <ActionMenu
          member={member}
          status={status}
          open={menuOpen}
          onToggle={onToggleMenu}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
          onResendInvite={onResendInvite}
          menuRef={menuRef}
        />
      </td>
    </tr>
  );
}

function MemberCard({
  member,
  menuOpen,
  onToggleMenu,
  onEdit,
  onDeactivate,
  onReactivate,
  onResendInvite,
  menuRef,
}: {
  member: TeamMember;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResendInvite: () => void;
  menuRef?: React.RefObject<HTMLDivElement>;
}) {
  const status = normalizeStatus(member);
  const role = normalizeRole(member.role);
  const statusBadge = getStatusBadge(status);
  const roleBadgeVariant = ROLE_VARIANT[role] || ROLE_VARIANT[member.role] || 'default';

  return (
    <li className="p-3 rounded-lg border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900">
      <div className="flex items-start gap-3">
        <Avatar member={member} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{member.full_name}</p>
            <ActionMenu
              member={member}
              status={status}
              open={menuOpen}
              onToggle={onToggleMenu}
              onEdit={onEdit}
              onDeactivate={onDeactivate}
              onReactivate={onReactivate}
              onResendInvite={onResendInvite}
              menuRef={menuRef}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mt-0.5">
            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{member.email}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RoleBadge role={role} rawRole={member.role} variant={roleBadgeVariant} />
            <Badge variant={statusBadge.variant} size="sm" dot>{statusBadge.label}</Badge>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {member.last_active_at ? formatRelativeTime(member.last_active_at, 'en') : '—'}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function Avatar({ member }: { member: TeamMember }) {
  if (member.avatar_url) {
    return (
      <div className="h-10 w-10 rounded-full overflow-hidden shrink-0">
        <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  const initials = getInitials(member.full_name, member.email);
  const gradient = pickGradient(member.id);
  return (
    <div
      className={`h-10 w-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold shrink-0 select-none`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function RoleBadge({
  role,
  rawRole,
  variant,
}: {
  role: Role;
  rawRole: string;
  variant: 'info' | 'purple' | 'default' | 'success' | 'warning' | 'danger' | 'outline' | 'pink' | 'indigo' | 'teal' | 'orange';
}) {
  const label = ROLE_LABELS[rawRole] || ROLE_LABELS[role] || rawRole;
  return (
    <Badge variant={variant} size="sm" className="capitalize">
      <span className="inline-flex items-center gap-1">
        <RoleIcon role={role} />
        {label}
      </span>
    </Badge>
  );
}

function RoleIcon({ role }: { role: Role }) {
  if (role === 'admin') return <Shield className="h-3 w-3" aria-hidden="true" />;
  if (role === 'viewer') return <Eye className="h-3 w-3" aria-hidden="true" />;
  return <UserCheck className="h-3 w-3" aria-hidden="true" />;
}

function getStatusBadge(status: Status): { label: string; variant: 'success' | 'warning' | 'default' | 'danger' } {
  if (status === 'active') return { label: 'Active', variant: 'success' };
  if (status === 'invited') return { label: 'Invited', variant: 'warning' };
  if (status === 'deactivated') return { label: 'Deactivated', variant: 'default' };
  return { label: status, variant: 'default' };
}

function ActionMenu({
  member,
  status,
  open,
  onToggle,
  onEdit,
  onDeactivate,
  onReactivate,
  onResendInvite,
  menuRef,
}: {
  member: TeamMember;
  status: Status;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResendInvite: () => void;
  menuRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${member.full_name}`}
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${member.full_name}`}
          className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 origin-top-right"
        >
          <MenuItem onClick={onEdit} icon={<Edit className="h-3.5 w-3.5" />} label="Edit member" />
          {status === 'deactivated' ? (
            <MenuItem onClick={onReactivate} icon={<UserCheck className="h-3.5 w-3.5" />} label="Reactivate" />
          ) : (
            <MenuItem onClick={onDeactivate} icon={<UserX className="h-3.5 w-3.5" />} label="Deactivate" destructive />
          )}
          {(status === 'invited' || status === 'deactivated') && (
            <MenuItem onClick={onResendInvite} icon={<Send className="h-3.5 w-3.5" />} label="Resend invite" />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  destructive,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors focus:outline-none ${
        destructive
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

function InviteModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setFullName('');
      setRole('member');
      setError(null);
    }
  }, [isOpen]);

  const submit = async () => {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await api.users.create({
        email: email.trim(),
        full_name: fullName.trim() || email.split('@')[0],
        role,
        status: 'invited',
      } as any);
      onSuccess(email.trim());
    } catch (err: any) {
      const msg = err instanceof APIError ? err.message : err?.message || 'Could not send invitation';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite team member" description="Send an invitation email with a sign-up link." size="md">
      <div className="space-y-3">
        <Field
          id="invite-email"
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@company.com"
          required
          autoComplete="email"
        />
        <Field
          id="invite-name"
          label="Full name (optional)"
          value={fullName}
          onChange={setFullName}
          placeholder="Jane Doe"
          autoComplete="name"
        />
        <div>
          <label htmlFor="invite-role" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-900 dark:text-gray-100"
          >
            <option value="admin">Admin — full access</option>
            <option value="member">Member — can manage candidates and jobs</option>
            <option value="viewer">Viewer — read-only access</option>
          </select>
        </div>
        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={submitting}
            disabled={submitting || !email.trim()}
            leftIcon={!submitting ? <Send className="h-4 w-4" /> : undefined}
          >
            Send invite
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSuccess,
}: {
  member: TeamMember | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setFullName(member.full_name);
      setRole(normalizeRole(member.role));
      setError(null);
    }
  }, [member]);

  if (!member) return null;

  const submit = async () => {
    if (!fullName.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.users.update(member.id, {
        full_name: fullName.trim(),
        role,
      } as any);
      onSuccess();
    } catch (err: any) {
      const msg = err instanceof APIError ? err.message : err?.message || 'Could not update member';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={!!member} onClose={onClose} title="Edit member" description={`Update ${member.email}'s details.`} size="md">
      <div className="space-y-3">
        <Field id="edit-name" label="Full name" value={fullName} onChange={setFullName} required />
        <div>
          <label htmlFor="edit-role" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Role
          </label>
          <select
            id="edit-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-900 dark:text-gray-100"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Mail className="h-3 w-3" aria-hidden="true" />
          {member.email}
        </p>
        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={submitting || !fullName.trim()}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        aria-required={required || undefined}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-900 dark:text-gray-100"
      />
    </div>
  );
}
