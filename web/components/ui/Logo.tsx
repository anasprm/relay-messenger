import { MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({
  className,
  compact = false,
  inverted = false,
}: {
  className?: string;
  compact?: boolean;
  inverted?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="logo-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#00c298] via-[#00a884] to-[#008069] text-white shadow-[0_8px_22px_-10px_rgba(0,168,132,0.85)]">
        <MessageSquareText size={18} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'text-[17px] font-bold tracking-[-0.035em]',
              inverted ? 'text-white' : 'text-ink',
            )}
          >
            Relay
          </span>
          <span
            className={cn(
              'mt-1 text-[8.5px] font-semibold uppercase tracking-[0.2em]',
              inverted ? 'text-white/45' : 'text-faint',
            )}
          >
            Messenger
          </span>
        </span>
      )}
    </div>
  );
}
