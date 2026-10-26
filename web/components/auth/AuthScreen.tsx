'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MessageSquareText,
  Paperclip,
  PhoneCall,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { errorMessage, useAuth } from '@/lib/AuthProvider';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UiStyleToggle } from '@/components/ui/UiStyleToggle';
import { Avatar } from '@/components/ui/Avatar';
import { Splash } from '@/components/ui/Splash';

const DEMO_ACCOUNTS = [
  { username: 'demo', password: 'demo123', name: 'Avery Quinn', accent: 'violet' as const },
  { username: 'alice', password: 'alice123', name: 'Alice Morgan', accent: 'indigo' as const },
  { username: 'bob', password: 'bob123', name: 'Bob Chen', accent: 'emerald' as const },
];

interface AuthScreenProps {
  mode: 'login' | 'register';
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const { user, loading, login, register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  useEffect(() => {
    if (!loading && user) router.replace('/chat');
  }, [loading, router, user]);

  if (loading || user) return <Splash label={user ? 'Opening your workspace' : 'Preparing your workspace'} />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Enter both your username and password.');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) await register(cleanUsername, password);
      else await login(cleanUsername, password);
      router.replace('/chat');
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  }

  function useDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(account.username);
    setPassword(account.password);
    setConfirm(account.password);
    setError(null);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <div className="grid flex-1 lg:grid-cols-[1.06fr_1fr]">
        {/* Brand / marketing rail */}
        <aside className="relative hidden overflow-hidden bg-[#080c19] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
          <div className="brand-grid absolute inset-0 opacity-60" />
          <div className="absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-indigo-600/25 blur-[110px]" />
          <div className="absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-violet-600/20 blur-[130px]" />
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-indigo-400/25 to-transparent" />

          <div className="relative">
            <Logo inverted />
          </div>

          <div className="relative mt-10 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Private workspace messaging
            </div>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-white xl:text-[46px]">
              Communication,
              <br />
              without the noise.
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-slate-400">
              Direct threads, real-time presence, and peer-to-peer calls — wrapped in a calm,
              enterprise-grade interface built for focused teams.
            </p>

            <ul className="mt-8 grid gap-3 text-[13px] text-slate-300">
              {[
                { icon: MessageSquareText, label: 'Direct threads with instant delivery' },
                { icon: PhoneCall, label: 'Peer-to-peer audio and video calls' },
                { icon: Paperclip, label: 'Voice notes, video clips, and file transfer' },
                { icon: ShieldCheck, label: 'Anonymity and vanish-mode privacy controls' },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-indigo-300">
                    <Icon size={14} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>

            {/* Product preview */}
            <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                <span className="ml-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Alice Morgan · Online
                </span>
              </div>
              <div className="space-y-2.5 px-4 py-4">
                <div className="flex items-center gap-2">
                  <Avatar
                    user={{ displayName: 'Alice Morgan', accent: 'indigo' }}
                    size="xs"
                  />
                  <div className="max-w-[78%] rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] text-slate-200">
                    The wireframes are ready for review.
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-[12px] text-white shadow-lg shadow-indigo-950/40">
                    Opening them now — this layout finally breathes.
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-500">
                  <Lock size={10} />
                  Vanish mode ready · messages wipe on exit
                  <span className="ml-auto inline-flex items-center gap-1 text-emerald-300/90">
                    <Check size={10} /> Encrypted
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="relative mt-10 text-[11px] text-slate-600">
            © 2026 Relay Systems · Session-based access · No external identity providers
          </p>
        </aside>

        {/* Form */}
        <main className="relative flex flex-col">
          <div className="flex items-center justify-between p-5 sm:px-8">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <UiStyleToggle compact />
              <ThemeToggle compact />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 pb-14 pt-2 sm:px-8">
            <div className="w-full max-w-[404px]">
              <div className="mb-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Workspace online
                </div>
                <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.02em] text-ink">
                  {isRegister ? 'Create your account' : 'Sign in to Relay'}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {isRegister
                    ? 'Pick a unique username. Teammates can start a thread with you instantly.'
                    : 'Enter your credentials to continue to your conversations.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="username"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <UserRound
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      id="username"
                      name="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="e.g. avery_quinn"
                      className="h-11 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-3.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
                    />
                  </div>
                  {isRegister && (
                    <p className="mt-1.5 text-[11px] text-faint">
                      3–20 characters · letters, numbers, underscores
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      placeholder={isRegister ? 'At least 6 characters' : 'Your password'}
                      className="h-11 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-11 text-sm text-ink placeholder:text-faint transition-colors focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-faint transition-colors hover:text-ink"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label
                      htmlFor="confirm"
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
                    >
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                      />
                      <input
                        id="confirm"
                        name="confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        autoComplete="new-password"
                        placeholder="Repeat your password"
                        className="h-11 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-3.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-accent focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className={cn(
                    'group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white shadow-[0_14px_30px_-14px_rgba(79,70,229,0.9)] transition-all hover:bg-accent-hover',
                    submitting && 'opacity-80',
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {isRegister ? 'Creating account…' : 'Signing in…'}
                    </>
                  ) : (
                    <>
                      {isRegister ? 'Create account' : 'Continue'}
                      <ArrowRight
                        size={15}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-[13px] text-muted">
                {isRegister ? 'Already have an account?' : 'New to Relay?'}{' '}
                <Link
                  href={isRegister ? '/login' : '/register'}
                  className="font-semibold text-accent transition-colors hover:text-accent-hover"
                >
                  {isRegister ? 'Sign in' : 'Create an account'}
                </Link>
              </p>

              <div className="mt-8 rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Demo workspace
                  </p>
                  <span className="text-[10px] text-faint">Click to autofill</span>
                </div>
                <div className="mt-3 grid gap-1.5">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => useDemo(account)}
                      className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-panel-2"
                    >
                      <Avatar user={{ displayName: account.name, accent: account.accent }} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">
                          {account.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-faint">
                          {account.username} / {account.password}
                        </span>
                      </span>
                      <ArrowRight size={13} className="text-faint" />
                    </button>
                  ))}
                </div>
                <p className="mt-2 px-2 text-[10px] leading-relaxed text-faint">
                  Open a second browser profile as Alice or Bob to test realtime delivery and calls.
                </p>
              </div>

              <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-faint">
                <Lock size={11} />
                Stateless session · no email verification · no third-party login
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
