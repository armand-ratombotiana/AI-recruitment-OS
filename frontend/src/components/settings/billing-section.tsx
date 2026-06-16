import { useCallback, useEffect, useState } from 'react';
import { Copy, Key, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { AuthTypes } from '@/services/api/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  InputField,
  Modal,
  Skeleton,
  useNotification,
} from '@/components';
import { useToast } from '@/components/ui/toast';

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

interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  created_at?: string;
  last_used_at?: string | null;
  scopes?: string[];
  expires_at?: string | null;
}

export function BillingSection({ tt }: { tt: TFunc }) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState<{ id: string; name: string; full: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string>('read');
  const [newExpiry, setNewExpiry] = useState<string>('90');
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyEntry | null>(null);
  const { success, error: errorNotify } = useNotification();
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.auth.listApiKeys();
      const list: ApiKeyEntry[] = (Array.isArray(data) ? data : []).map((k: AuthTypes.APIKey) => ({
        id: k.id,
        name: k.name,
        prefix: k.key ? `${k.key.slice(0, 8)}…` : '',
        created_at: k.created_at,
        last_used_at: null,
        scopes: k.scopes,
        expires_at: k.expires_at,
      }));
      setKeys(list);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!newName.trim()) {
      errorNotify(
        tt('api.nameRequired', 'Name required'),
        tt('api.nameRequiredDesc', 'Please give the key a name.')
      );
      return;
    }
    setCreating(true);
    try {
      const r = await api.auth.createApiKey({
        name: newName.trim(),
        scopes: newScopes.split(',').map((s) => s.trim()).filter(Boolean),
        expires_in_days: newExpiry === 'never' ? null : Number(newExpiry),
      });
      const full = (r as AuthTypes.APIKey).key || '';
      setReveal({
        id: r.id || `local-${Date.now()}`,
        name: r.name || newName.trim(),
        full,
      });
      setNewName('');
      setNewScopes('read');
      setNewExpiry('90');
      setCreateOpen(false);
      success(
        tt('api.created', 'Key created'),
        tt('api.createdDesc', "Save this key now — you won't see it again.")
      );
      load();
    } catch (err: unknown) {
      errorNotify(
        tt('api.createFailed', 'Create failed'),
        err instanceof APIError ? err.message : 'Could not create the API key'
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (k: ApiKeyEntry) => {
    setRevokeId(k.id);
    try {
      await api.auth.revokeApiKey(k.id);
      setKeys((prev) => prev.filter((x) => x.id !== k.id));
      success(
        tt('api.revoked', 'Key revoked'),
        tt('api.revokedDesc', 'This key can no longer be used.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('api.revokeFailed', 'Revoke failed'),
        err instanceof APIError ? err.message : 'Could not revoke the key'
      );
    } finally {
      setRevokeId(null);
      setConfirmRevoke(null);
    }
  };

  const copy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      push('success', tt('api.copied', 'Copied to clipboard'));
    }
  };

  return (
    <div className="space-y-6">
      <Section
        title={tt('api.keys', 'API keys')}
        description={tt(
          'api.keysDesc',
          'Use these keys to access the AI-ROS API from your own tools. Keep them secret.'
        )}
        action={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            {tt('api.newKey', 'New key')}
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={50} />
            <Skeleton height={50} />
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10" />}
            title={tt('api.noKeys', 'No API keys yet')}
            description={tt(
              'api.noKeysDesc',
              'Create your first key to start integrating AI-ROS with your own systems.'
            )}
            action={
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setCreateOpen(true)}
              >
                {tt('api.createKey', 'Create key')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-300">
                  <Key className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {k.name}
                    </p>
                    {k.scopes && k.scopes.length > 0 && (
                      <Badge variant="default" size="sm">
                        {k.scopes.join(', ')}
                      </Badge>
                    )}
                    {k.expires_at && (
                      <Badge variant="outline" size="sm">
                        {tt('api.expires', 'Expires')}{' '}
                        {new Date(k.expires_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <code className="font-mono">{k.prefix}</code>
                    {k.created_at && <span>· {tt('api.createdAt', 'Created')} {new Date(k.created_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={revokeId === k.id}
                  disabled={revokeId === k.id}
                  onClick={() => setConfirmRevoke(k)}
                >
                  {tt('api.revoke', 'Revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal isOpen={!!reveal} onClose={() => setReveal(null)} title={tt('api.yourKey', 'Your new API key')} size="md">
        {reveal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {tt('api.saveWarning', "Save this key now — you won't see it again.")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-900 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100">
                {reveal.full}
              </code>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => copy(reveal.full)}
              >
                {tt('api.copy', 'Copy')}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setReveal(null)}>
                {tt('api.savedIt', "I've saved it")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => (creating ? undefined : setCreateOpen(false))}
        title={tt('api.createKeyTitle', 'Generate API key')}
        size="md"
      >
        <div className="space-y-3">
          <InputField
            label={tt('api.keyName', 'Key name')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={tt('api.keyNamePlaceholder', 'e.g. Production')}
            required
          />
          <InputField
            label={tt('api.scopes', 'Scopes')}
            value={newScopes}
            onChange={(e) => setNewScopes(e.target.value)}
            placeholder="read, write"
            helpText={tt('api.scopesHelp', 'Comma-separated list of permissions.')}
          />
          <div>
            <label
              htmlFor="apikey-expiry"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {tt('api.expiresIn', 'Expires in')}
            </label>
            <select
              id="apikey-expiry"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            >
              <option value="30">30 {tt('api.days', 'days')}</option>
              <option value="90">90 {tt('api.days', 'days')}</option>
              <option value="180">180 {tt('api.days', 'days')}</option>
              <option value="365">365 {tt('api.days', 'days')}</option>
              <option value="never">{tt('api.never', 'Never')}</option>
            </select>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tt('api.keyNameDesc', 'Give the key a clear name so you can identify it later.')}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {tt('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={create}
              loading={creating}
              disabled={creating || !newName.trim()}
            >
              {tt('api.create', 'Create')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={async () => { if (confirmRevoke) await revoke(confirmRevoke); }}
        title={tt('api.revokeConfirmTitle', 'Revoke API key?')}
        description={
          confirmRevoke
            ? tt(
                'api.revokeConfirmDesc',
                'Revoke "{name}"? Any application using this key will stop working immediately.'
              ).replace('{name}', confirmRevoke.name)
            : ''
        }
        confirmLabel={tt('api.revoke', 'Revoke')}
        cancelLabel={tt('common.cancel', 'Cancel')}
        destructive
        loading={revokeId === confirmRevoke?.id}
      />
    </div>
  );
}
