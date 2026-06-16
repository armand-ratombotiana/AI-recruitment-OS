import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Plus, Save, X } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { AuthTypes } from '@/services/api/types';
import {
  Avatar,
  Button,
  InputField,
  Skeleton,
  TextareaField,
  useNotification,
} from '@/components';

type TFunc = (key: string, fallback?: string) => string;

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface ProfileState {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  avatar?: string;
  role?: string;
}

export function ProfileSection({ tt }: { tt: TFunc }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileState>({
    full_name: '',
    email: '',
    phone: '',
    bio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.auth
      .getMe()
      .then((me: AuthTypes.MeResponse) => {
        if (cancelled || !me) return;
        setProfile({
          full_name: me.full_name || '',
          email: me.email || '',
          phone: me.phone || '',
          bio: '',
          avatar: me.avatar_url || undefined,
          role: me.role,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof APIError ? err.message : 'Could not load profile');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfile((p) => ({ ...p, avatar: reader.result as string }));
      }
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    if (!profile.full_name.trim()) {
      errorNotify(tt('profile.saveFailed', 'Save failed'), 'Please enter your full name');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.auth.updateMyProfile({
        full_name: profile.full_name.trim(),
        phone: profile.phone.trim() || null,
        avatar_url: profile.avatar || null,
      });
      setProfile((p) => ({
        ...p,
        full_name: updated.full_name ?? p.full_name,
        email: updated.email ?? p.email,
        phone: updated.phone ?? p.phone,
        avatar: updated.avatar_url ?? p.avatar,
      }));
      success(
        tt('profile.saved', 'Profile saved'),
        tt('profile.savedDesc', 'Your changes have been updated.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('profile.saveFailed', 'Save failed'),
        err instanceof APIError ? err.message : 'Could not save your profile'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {loadError}.{' '}
            {tt(
              'profile.offlineHint',
              'You can still update your profile — changes will sync when the API is reachable.'
            )}
          </span>
        </div>
      )}

      <Section
        title={tt('profile.picture', 'Profile picture')}
        description={tt('profile.pictureDesc', 'A square image works best, max 2MB.')}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Avatar src={profile.avatar} name={profile.full_name || profile.email} size="2xl" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => fileRef.current?.click()}
            >
              {tt('profile.upload', 'Upload')}
            </Button>
            {profile.avatar && (
              <Button
                variant="ghost"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => {
                  setAvatarError(null);
                  setProfile((p) => ({ ...p, avatar: undefined }));
                }}
              >
                {tt('profile.remove', 'Remove')}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              aria-label={tt('profile.upload', 'Upload avatar')}
            />
          </div>
        </div>
        {avatarError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {avatarError}
          </p>
        )}
      </Section>

      <Section title={tt('profile.personal', 'Personal info')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            label={tt('profile.fullName', 'Full name')}
            required
            value={profile.full_name}
            onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
            autoComplete="name"
          />
          <InputField
            label={tt('profile.email', 'Email')}
            type="email"
            value={profile.email}
            disabled
            helpText={tt('profile.emailDisabledHint', 'Email is managed by your account.')}
          />
          <InputField
            label={tt('profile.phone', 'Phone')}
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+1 (555) 000-0000"
            autoComplete="tel"
          />
          <InputField
            label={tt('profile.role', 'Role / Title')}
            value={profile.role || ''}
            onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
            placeholder="Senior Recruiter"
          />
        </div>
        <div className="mt-3">
          <TextareaField
            id="profile-bio"
            label={tt('profile.bio', 'Bio')}
            value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            placeholder={tt(
              'profile.bioPlaceholder',
              'A short bio to introduce yourself to candidates.'
            )}
            maxLength={500}
            rows={4}
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          onClick={save}
          loading={saving}
        >
          {saving ? tt('profile.saving', 'Saving…') : tt('profile.save', 'Save changes')}
        </Button>
      </div>
    </div>
  );
}
