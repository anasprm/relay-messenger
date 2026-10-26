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
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_-10px_rgba(79,70,229,0.9)]',
        )}
      >
        <MessageSquareText size={20} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'text-[17px] font-semibold tracking-[-0.02em]',
              inverted ? 'text-white' : 'text-ink',
            )}
          >
            Relay
          </span>
          <span
            className={cn(
              'mt-1 text-[10px] font-medium uppercase tracking-[0.18em]',
              inverted ? 'text-indigo-200/80' : 'text-faint',
            )}
          >
            Secure Workspace
          </span>
        </span>
      )}
    </div>
  );
}
