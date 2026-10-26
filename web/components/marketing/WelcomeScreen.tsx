'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  FileText,
  Ghost,
  Lock,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Paperclip,
  PhoneCall,
  ShieldCheck,
  Video,
  Wifi,
  Zap,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UiStyleToggle } from '@/components/ui/UiStyleToggle';
import { useAuth } from '@/lib/AuthProvider';

const FEATURES = [
  {
    icon: MessagesSquare,
    title: 'Realtime direct threads',
    copy: 'One-to-one conversations with instant delivery, presence, typing indicators, and unread counts.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy by default',
    copy: 'Anonymity masks your identity on delivery. Vanish mode wipes messages from both sides when the thread closes.',
  },
  {
    icon: Mic,
    title: 'Voice and video notes',
    copy: 'Record a voice note or a short camera clip and send it without leaving the conversation.',
  },
  {
    icon: PhoneCall,
    title: 'Peer-to-peer calls',
    copy: 'Audio and video calls over WebRTC, signalled through Relay instead of a third-party calling SDK.',
  },
  {
    icon: FileText,
    title: 'Files and images',
    copy: 'Share images, documents, and attachments up to 30 MB, with inline previews and download links.',
  },
  {
    icon: Zap,
    title: 'Your interface, your way',
    copy: 'Choose the Official or Minimal UI style, and switch between light and dark themes at any time.',
  },
];

const PRIVACY_POINTS = [
  'Anonymous Operator replaces your name and profile for the other participant.',
  'Vanish messages are removed from the store and the open thread in realtime.',
  'Identity masking is applied on the server — recipients never receive the raw sender ID.',
];

export function WelcomeScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace('/chat');
  }, [loading, router, user]);

  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <header className="sticky top-0 z-40 border-b border-line bg-app/85 backdrop-blur supports-[backdrop-filter]:bg-app/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Relay home">
            <Logo />
          </Link>

          <nav className="ml-6 hidden items-center gap-6 text-[12px] font-medium text-muted lg:flex">
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <a href="#privacy" className="transition-colors hover:text-ink">
              Privacy
            </a>
            <a href="#workspace" className="transition-colors hover:text-ink">
              Workspace
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <UiStyleToggle compact />
            <ThemeToggle compact />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-[12px] font-medium text-muted transition-colors hover:bg-panel-2 hover:text-ink sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover sm:px-3.5"
            >
              Create account
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="ui-decor brand-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]" />
          <div className="ui-decor absolute -left-32 top-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-[110px]" />
          <div className="ui-decor absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-violet-500/10 blur-[120px]" />

          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14 lg:py-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Private workspace messaging
              </div>

              <h1 className="text-balance mt-5 text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[46px] lg:text-[52px]">
                Communication,
                <br />
                without the noise.
              </h1>

              <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-muted">
                Relay brings direct threads, realtime presence, voice and video notes, peer-to-peer
                calls, and server-side privacy controls into one calm workspace.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  Create your account
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center rounded-lg border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-2"
                >
                  Sign in
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-faint">
                <span>
                  Demo workspace ·{' '}
                  <span className="font-mono text-muted">demo / demo123</span>
                </span>
                <span className="hidden h-3 w-px bg-line sm:block" />
                <span>No email required</span>
              </div>

              <ul className="mt-8 grid gap-2 text-[11.5px] text-muted sm:grid-cols-2">
                {[
                  'Server-side anonymity and vanish mode',
                  'Realtime delivery over Socket.io',
                  'Light, dark, Official and Minimal styles',
                  'Works on desktop and mobile',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check size={12} className="shrink-0 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product preview */}
            <div className="relative">
              <div className="ui-decor absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10 blur-2xl" />

              <div className="relative overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-46px_rgba(15,23,42,0.55)]">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-panel-2/60 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar
                      user={{ displayName: 'Alice Morgan', accent: 'indigo' }}
                      size="sm"
                      online
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-ink">Alice Morgan</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        Online · typing…
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent">
                      <ShieldCheck size={9} />
                      Anon
                    </span>
                    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-violet-300/50 bg-violet-50 px-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-violet-600 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                      <Ghost size={9} />
                      Vanish
                    </span>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-5">
                  <div className="flex items-end gap-2">
                    <Avatar
                      user={{ displayName: 'Alice Morgan', accent: 'indigo' }}
                      size="xs"
                    />
                    <div className="max-w-[80%] rounded-xl rounded-bl-sm border border-line bg-panel-2 px-3 py-2 text-[11.5px] leading-relaxed text-ink">
                      The wireframes are ready for review.
                      <span className="mt-1 block text-[9px] text-faint">9:42 AM</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-xl rounded-br-sm bg-accent px-3 py-2 text-[11.5px] leading-relaxed text-white">
                      Opening them now — this layout finally breathes.
                      <span className="mt-1 block text-[9px] text-white/65">9:44 AM</span>
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <Avatar
                      user={{ displayName: 'Alice Morgan', accent: 'indigo' }}
                      size="xs"
                    />
                    <div className="flex w-full max-w-[80%] items-center gap-2 rounded-xl rounded-bl-sm border border-line bg-panel-2 px-3 py-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <Mic size={12} />
                      </span>
                      <span className="flex flex-1 items-center gap-[2px]">
                        {[5, 9, 14, 8, 17, 11, 6, 13, 9, 15, 7, 11, 5, 8].map((height, index) => (
                          <span
                            key={index}
                            className="w-[2px] rounded-full bg-accent/50"
                            style={{ height }}
                          />
                        ))}
                      </span>
                      <span className="text-[9px] text-faint">0:04</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="flex items-center gap-2 rounded-xl rounded-br-sm border border-line bg-panel px-3 py-2 text-[11px] text-muted">
                      <FileText size={12} className="text-accent" />
                      Q4-communications-plan.txt
                      <span className="text-[9px] text-faint">18 KB</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[10.5px] text-faint">
                    <span className="flex-1">Write a message…</span>
                    <Paperclip size={12} />
                    <Mic size={12} />
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-white">
                      <ArrowRight size={11} />
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[9px] text-faint">
                    <Wifi size={9} className="text-emerald-500" />
                    Realtime delivery · typing indicators · presence
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-line bg-panel/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-18">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                Built for focused teams
              </p>
              <h2 className="text-balance mt-3 text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[32px]">
                Everything you need. Nothing you don&apos;t.
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Relay keeps the essentials close: direct conversations, rich media, clear calls,
                and privacy that is enforced where it matters — on the server.
              </p>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, copy }) => (
                <article
                  key={title}
                  className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-accent-soft text-accent">
                    <Icon size={16} />
                  </span>
                  <h3 className="mt-4 text-[13px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-18">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                Privacy by default
              </p>
              <h2 className="text-balance mt-3 text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[32px]">
                Your identity is yours to share.
              </h2>
              <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted">
                Privacy controls are per person and per thread. Toggle them without changing the
                conversation, and let the server handle the rest.
              </p>

              <ul className="mt-6 grid gap-3">
                {PRIVACY_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[12px] text-muted">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Check size={11} />
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-panel p-4">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">
                  <ShieldCheck size={10} />
                  Anonymity on
                </div>
                <div className="mt-4 flex items-start gap-2">
                  <Avatar user={{ displayName: 'Anonymous', accent: 'slate', anonymous: true }} size="sm" />
                  <div>
                    <p className="text-[11px] font-semibold text-ink">Anonymous Operator</p>
                    <p className="mt-0.5 text-[9px] text-faint">Identity hidden</p>
                    <div className="mt-2 rounded-lg rounded-tl-sm border border-line bg-panel-2 px-3 py-2 text-[11px] leading-relaxed text-ink">
                      Sender details are replaced before this reaches you.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-violet-300/70 bg-violet-50/40 p-4 dark:border-violet-800/60 dark:bg-violet-950/15">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300">
                  <Ghost size={10} />
                  Vanish on
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-ink">
                  This message disappears when you leave the thread.
                </p>
                <p className="mt-2 flex items-center gap-1 text-[9px] text-faint">
                  <Lock size={9} />
                  Purged from the store and both clients
                </p>
              </div>

              <div className="sm:col-span-2 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2/60 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel text-accent">
                  <ShieldCheck size={15} />
                </span>
                <p className="text-[11px] leading-relaxed text-muted">
                  Masking happens in the API, not in the browser. The other participant never
                  receives the original sender ID or profile.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace strip */}
        <section id="workspace" className="border-b border-line bg-panel/40">
          <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {[
              {
                icon: MessageSquareText,
                title: 'Start with a username',
                copy: 'Open a direct thread with anyone in the workspace directory.',
              },
              {
                icon: Video,
                title: 'Talk or call',
                copy: 'Send a voice note, a video clip, or start an audio or video call.',
              },
              {
                icon: Ghost,
                title: 'Leave no trace',
                copy: 'Turn on vanish mode when a conversation should not stay behind.',
              },
            ].map(({ icon: Icon, title, copy }) => (
              <div
                key={title}
                className="flex items-start gap-3 rounded-xl border border-line bg-panel p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={15} />
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden">
          <div className="ui-decor brand-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-18">
            <div className="rounded-2xl border border-line bg-panel px-6 py-10 text-center shadow-sm sm:px-10">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
                <MessageSquareText size={20} />
              </span>
              <h2 className="text-balance mt-5 text-[26px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
                Ready when you are.
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
                Create an account in seconds, or sign in to the demo workspace and look around.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  Create account
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center rounded-lg border border-line bg-panel px-4 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-2"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-[10.5px] text-faint">
                Demo credentials: <span className="font-mono text-muted">demo / demo123</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo compact />
            <p className="text-[10.5px] text-faint">
              © 2026 Relay · Secure workspace messaging
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <a href="#privacy" className="transition-colors hover:text-ink">
              Privacy
            </a>
            <Link href="/login" className="transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link href="/register" className="transition-colors hover:text-ink">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
