import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square';
  className?: string;
  status?: 'online' | 'offline' | 'away' | 'busy';
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
};

const statusSizeMap = {
  xs: 'h-1.5 w-1.5 ring-1',
  sm: 'h-2 w-2 ring-1',
  md: 'h-2.5 w-2.5 ring-2',
  lg: 'h-3 w-3 ring-2',
  xl: 'h-4 w-4 ring-2',
  '2xl': 'h-5 w-5 ring-2',
};

const statusColorMap = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  away: 'bg-amber-500',
  busy: 'bg-red-500',
};

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColorFromName(name?: string): string {
  if (!name) return 'from-gray-400 to-gray-500';
  const colors = [
    'from-blue-500 to-blue-600',
    'from-purple-500 to-purple-600',
    'from-pink-500 to-pink-600',
    'from-indigo-500 to-indigo-600',
    'from-cyan-500 to-cyan-600',
    'from-teal-500 to-teal-600',
    'from-emerald-500 to-emerald-600',
    'from-orange-500 to-orange-600',
    'from-rose-500 to-rose-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({
  src,
  name,
  size = 'md',
  shape = 'circle',
  className,
  status,
}: AvatarProps) {
  const initials = getInitials(name);
  const gradient = getColorFromName(name);

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || 'Avatar'}
          className={cn(
            sizeMap[size],
            shape === 'circle' ? 'rounded-full' : 'rounded-md',
            'object-cover ring-1 ring-gray-200'
          )}
        />
      ) : (
        <div
          aria-label={name || 'Avatar'}
          title={name}
          className={cn(
            sizeMap[size],
            shape === 'circle' ? 'rounded-full' : 'rounded-md',
            'flex items-center justify-center bg-gradient-to-br font-semibold text-white ring-1 ring-white/20',
            gradient
          )}
        >
          {initials}
        </div>
      )}
      {status && (
        <span
          aria-label={`Status: ${status}`}
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-white',
            statusSizeMap[size],
            statusColorMap[status]
          )}
        />
      )}
    </div>
  );
}

interface AvatarGroupProps {
  users: Array<{ name?: string; src?: string | null }>;
  size?: AvatarProps['size'];
  max?: number;
  className?: string;
}

export function AvatarGroup({ users, size = 'sm', max = 4, className }: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const remaining = users.length - visible.length;
  return (
    <div className={cn('flex -space-x-2', className)}>
      {visible.map((u, i) => (
        <div key={i} className="ring-2 ring-white rounded-full">
          <Avatar name={u.name} src={u.src} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            sizeMap[size],
            'flex items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-2 ring-white font-semibold'
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
