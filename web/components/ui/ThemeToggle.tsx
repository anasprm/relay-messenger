'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, mounted, toggleTheme } = useTheme();
  const dark = mounted && theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink',
        compact ? 'h-9 w-9' : 'h-9 border border-line bg-panel px-3 text-[11.5px] font-medium',
        className,
      )}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {!compact && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
