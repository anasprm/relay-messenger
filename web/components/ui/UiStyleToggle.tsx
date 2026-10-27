'use client';

import { Building2, Minus } from 'lucide-react';
import { useUiStyle, type UiStyle } from '@/lib/UiStyleProvider';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: UiStyle; label: string; hint: string; Icon: typeof Building2 }> = [
  {
    value: 'official',
    label: 'Official',
    hint: 'Official UI — structured, polished workspace',
    Icon: Building2,
  },
  {
    value: 'minimal',
    label: 'Minimal',
    hint: 'Minimal UI — quieter surfaces, flatter details',
    Icon: Minus,
  },
];

export function UiStyleToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { style, mounted, setStyle } = useUiStyle();
  const active = mounted ? style : 'official';

  return (
    <div
      role="group"
      aria-label="Interface style"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, hint, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setStyle(value)}
          aria-pressed={active === value}
          aria-label={hint}
          title={hint}
          className={cn(
            'inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-[10.5px] font-medium transition-colors',
            compact ? 'w-7 px-0' : 'px-2',
            active === value
              ? 'bg-accent-soft text-accent shadow-sm'
              : 'text-faint hover:text-ink',
          )}
        >
          <Icon size={12} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
