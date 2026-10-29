import { Shield, Users } from 'lucide-react';
import { mediaUrl } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import type { Accent, User } from '@/lib/types';

const ACCENTS: Record<Accent, string> = {
  indigo: 'from-sky-500 to-indigo-600',
  violet: 'from-fuchsia-500 to-violet-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-400 to-orange-500',
  rose: 'from-rose-500 to-pink-600',
  cyan: 'from-cyan-500 to-sky-600',
  slate: 'from-slate-500 to-slate-700',
};

const SIZES = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-[11px]',
  lg: 'h-12 w-12 text-[13px]',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
} as const;

export type AvatarSize = keyof typeof SIZES;

interface AvatarProps {
  user: Pick<User, 'displayName' | 'accent'> & {
    avatarUrl?: string | null;
    anonymous?: boolean;
  };
  size?: AvatarSize;
  online?: boolean;
  className?: string;
  ring?: boolean;
}

export function Avatar({ user, size = 'md', online, className, ring }: AvatarProps) {
  const iconSize = size === '2xl' ? 34 : size === 'xl' ? 24 : size === 'lg' ? 17 : 14;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold uppercase tracking-wide text-white shadow-sm',
          ACCENTS[user.accent] || ACCENTS.slate,
          SIZES[size],
          ring && 'ring-2 ring-panel',
        )}
        aria-hidden="true"
        title={user.displayName}
      >
        {user.anonymous ? (
          <Shield size={iconSize} />
        ) : user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(user.avatarUrl)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          initials(user.displayName)
        )}
      </span>
      {online === true && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel bg-emerald-500"
          title="Online"
          aria-label="Online"
        />
      )}
    </span>
  );
}

interface GroupAvatarProps {
  size?: AvatarSize;
  accent?: Accent;
  label?: string;
  className?: string;
}

/** Group threads share one tile with a people glyph, never a single face. */
export function GroupAvatar({
  size = 'md',
  accent = 'emerald',
  label = 'Group chat',
  className,
}: GroupAvatarProps) {
  const iconSize = size === '2xl' ? 34 : size === 'xl' ? 24 : size === 'lg' ? 17 : 14;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm',
        ACCENTS[accent] || ACCENTS.emerald,
        SIZES[size],
        className,
      )}
      aria-hidden="true"
      title={label}
    >
      <Users size={iconSize} />
    </span>
  );
}
