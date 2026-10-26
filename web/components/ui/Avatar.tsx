import { Shield } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import type { Accent, User } from '@/lib/types';

const ACCENTS: Record<Accent, string> = {
  indigo: 'from-indigo-500 to-indigo-700',
  violet: 'from-violet-500 to-purple-700',
  emerald: 'from-emerald-500 to-teal-700',
  amber: 'from-amber-400 to-orange-600',
  rose: 'from-rose-500 to-pink-700',
  cyan: 'from-cyan-500 to-sky-700',
  slate: 'from-slate-500 to-slate-700',
};

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
} as const;

export type AvatarSize = keyof typeof SIZES;

interface AvatarProps {
  user: Pick<User, 'displayName' | 'accent'> & { anonymous?: boolean };
  size?: AvatarSize;
  online?: boolean;
  className?: string;
  ring?: boolean;
}

export function Avatar({ user, size = 'md', online, className, ring }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-gradient-to-br font-semibold uppercase tracking-wide text-white shadow-sm',
          ACCENTS[user.accent] || ACCENTS.slate,
          SIZES[size],
          ring && 'ring-2 ring-panel',
        )}
        aria-hidden="true"
      >
        {user.anonymous ? <Shield size={size === '2xl' ? 34 : size === 'xl' ? 24 : 14} /> : initials(user.displayName)}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel',
            online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600',
          )}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}
