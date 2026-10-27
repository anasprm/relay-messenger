'use client';

import { LogOut, MonitorSmartphone, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UiStyleToggle } from '@/components/ui/UiStyleToggle';
import type { User } from '@/lib/types';

interface ProfileDialogProps {
  open: boolean;
  user: User;
  onClose: () => void;
  onLogout: () => void;
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted">
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-ink">{value}</span>
      </span>
    </div>
  );
}

export function ProfileDialog({ open, user, onClose, onLogout }: ProfileDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your profile"
      description="Account details and appearance preferences for this browser."
      className="max-w-md"
    >
      <div className="p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar user={user} size="2xl" online />
          <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {user.displayName}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-faint">@{user.username}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent">
            <ShieldCheck size={10} />
            Signed in
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-panel-2/50 p-1">
          <Row icon={UserRound} label="Display name" value={user.displayName} />
          <Row icon={MonitorSmartphone} label="Username" value={`@${user.username}`} />
        </div>

        <section className="mt-5" aria-labelledby="appearance-heading">
          <h4
            id="appearance-heading"
            className="flex items-center gap-1.5 px-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
          >
            <Palette size={11} />
            Appearance
          </h4>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2.5">
            <div>
              <p className="text-[12px] font-semibold text-ink">Theme</p>
              <p className="text-[10.5px] text-muted">Follows your system until you choose.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2.5">
            <div>
              <p className="text-[12px] font-semibold text-ink">Interface style</p>
              <p className="text-[10.5px] text-muted">Official or the quieter Minimal layout.</p>
            </div>
            <UiStyleToggle />
          </div>
        </section>

        <p className="mt-4 rounded-xl bg-panel-2 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
          Your display name, avatar color, and username come from your Relay account. Profile
          editing is not available in this workspace yet. Favorites, pinned chats, and drafts are
          saved on this device only.
        </p>

        <button
          type="button"
          onClick={() => {
            onClose();
            onLogout();
          }}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger/5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </Modal>
  );
}
