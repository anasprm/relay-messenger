'use client';

import {
  Focus,
  Keyboard,
  Lock,
  MessageSquarePlus,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const HIGHLIGHTS = [
  {
    icon: Search,
    title: 'Find anything in a thread',
    copy: 'Search the messages loaded in the open conversation, then jump between matches.',
  },
  {
    icon: Star,
    title: 'Keep important chats close',
    copy: 'Favorite or pin conversations. Drafts and these choices stay on this device.',
  },
  {
    icon: Focus,
    title: 'Focus when it matters',
    copy: 'Hide the conversation list and give the open thread the whole window.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy is per thread',
    copy: 'Anonymity and vanish mode are enforced by the Relay API, not just the interface.',
  },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'Search chats' },
  { keys: ['Ctrl', 'N'], label: 'New conversation' },
  { keys: ['Ctrl', 'Shift', 'F'], label: 'Toggle focus mode' },
];

export function WelcomePane({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-app">
      <div className="ui-decor brand-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Logo />
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
            Direct messages
          </span>
        </div>

        <h1 className="text-balance mt-6 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[34px]">
          Your conversations,
          <br />
          in one calm place.
        </h1>
        <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted">
          Pick a thread from the list, or start a new one with any username in the workspace.
          Messages, voice notes, files, and calls all stay in the same conversation.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-ink shadow-[0_14px_30px_-16px_rgba(0,168,132,0.9)] transition-colors hover:bg-accent-hover"
          >
            <MessageSquarePlus size={15} />
            New conversation
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[10.5px] text-faint">
            <Zap size={11} className="text-accent" />
            Realtime delivery over Socket.IO
          </span>
        </div>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {HIGHLIGHTS.map(({ icon: Icon, title, copy }) => (
            <article
              key={title}
              className="rounded-xl border border-line bg-panel p-3.5 transition-colors hover:border-line-strong"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon size={15} />
              </span>
              <h2 className="mt-2.5 text-[12px] font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{copy}</p>
            </article>
          ))}
        </div>

        <section
          aria-labelledby="welcome-shortcuts"
          className="mt-6 rounded-xl border border-line bg-panel/80 p-4"
        >
          <h2
            id="welcome-shortcuts"
            className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
          >
            <Keyboard size={11} />
            Keyboard shortcuts
          </h2>
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
            {SHORTCUTS.map(({ keys, label }) => (
              <li key={label} className="flex items-center gap-1.5 text-[10.5px] text-muted">
                <span className="flex items-center gap-0.5">
                  {keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded border border-line bg-panel-2 px-1 py-0.5 font-sans text-[9px] font-medium text-ink"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[9.5px] text-faint">
            On macOS use Command instead of Ctrl.
          </p>
        </section>

        <p className="mt-6 flex items-center gap-1.5 text-[10px] text-faint">
          <Lock size={10} />
          Private to the people in each thread · no third-party identity provider
        </p>
      </div>
    </div>
  );
}
