'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/ThemeProvider';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { theme, mounted, toggleTheme } = useTheme();
  const dark = mounted && theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-panel text-muted transition-all hover:border-line-strong hover:text-ink',
        compact ? 'h-8 w-8' : 'h-9 px-3 text-xs font-medium',
        className,
      )}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {!compact && <span>{dark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
