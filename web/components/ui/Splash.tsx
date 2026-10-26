import { Logo } from './Logo';

export function Splash({ label = 'Preparing your workspace' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-app">
      <div className="animate-pulse">
        <Logo />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        {label}
      </div>
    </div>
  );
}
