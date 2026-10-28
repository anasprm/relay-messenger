'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Palette,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { DeveloperCard } from '@/components/marketing/DeveloperCard';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UiStyleToggle } from '@/components/ui/UiStyleToggle';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/AuthProvider';
import { useToast } from '@/lib/ToastProvider';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;

/**
 * Downscale the chosen photo to a small square JPEG data URL. Keeping it inline
 * means the avatar survives server restarts even when object storage is absent.
 */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read that image.');

  const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (AVATAR_SIZE - width) / 2, (AVATAR_SIZE - height) / 2, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', 0.85);
}

interface ProfileDialogProps {
  open: boolean;
  user: User;
  onClose: () => void;
  onLogout: () => void;
  onSaved: () => Promise<void> | void;
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

export function ProfileDialog({ open, user, onClose, onLogout, onSaved }: ProfileDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null);
  const [discoverable, setDiscoverable] = useState(user.discoverable !== false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(user.displayName);
    setAvatarUrl(user.avatarUrl || null);
    setDiscoverable(user.discoverable !== false);
    setError(null);
  }, [open, user]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Choose an image file for your profile photo.', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast('Profile photos are limited to 5 MB.', 'error');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      setAvatarUrl(await toAvatarDataUrl(file));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (saving) return;
    const name = displayName.trim();
    if (name.length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.patch<{ user: User }>('/api/users/me', {
        displayName: name,
        avatarUrl,
        discoverable,
      });
      await onSaved();
      toast('Profile updated.', 'success');
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const preview: User = { ...user, displayName: displayName || user.displayName, avatarUrl };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your profile"
      description="Photo, display name, and privacy for this account."
      className="max-w-md"
    >
      <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-5 scrollbar-thin">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar user={preview} size="2xl" online />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elevated text-muted shadow-sm transition-colors hover:text-ink disabled:opacity-60"
              aria-label="Upload profile photo"
              title="Upload profile photo"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void pickPhoto(event.target.files?.[0])}
            />
          </div>
          <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {displayName || user.displayName}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-faint">@{user.username}</p>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-danger transition-colors hover:text-danger/80"
            >
              <Trash2 size={11} />
              Remove photo
            </button>
          )}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent">
            <ShieldCheck size={10} />
            Signed in
          </span>
        </div>

        <div className="mt-5 space-y-2">
          <label htmlFor="profile-display-name" className="block px-1 text-[10.5px] font-medium text-muted">
            Display name
          </label>
          <input
            id="profile-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            className="h-10 w-full rounded-xl border border-line bg-panel-2 px-3 text-[13px] text-ink outline-none transition-colors focus:border-accent focus:bg-panel focus:ring-4 focus:ring-accent/10"
          />
        </div>

        <div className="mt-4 rounded-xl border border-line bg-panel-2/50 p-1">
          <Row icon={MonitorSmartphone} label="Username" value={`@${user.username}`} />
        </div>

        <section className="mt-4" aria-labelledby="privacy-heading">
          <h4
            id="privacy-heading"
            className="flex items-center gap-1.5 px-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
          >
            <Eye size={11} />
            Privacy
          </h4>
          <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-line p-2.5">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink">Show me in the directory</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                {discoverable
                  ? 'Anyone in this workspace can find you when they start a new chat.'
                  : 'You are hidden from the directory. People can still reach you by typing your exact username.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={discoverable}
              onClick={() => setDiscoverable((current) => !current)}
              className={cn(
                'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                discoverable ? 'bg-accent' : 'bg-line-strong',
              )}
              aria-label="Show me in the directory"
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform',
                  discoverable ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}
              >
                {discoverable ? (
                  <Eye size={11} className="text-accent" />
                ) : (
                  <EyeOff size={11} className="text-slate-500" />
                )}
              </span>
            </button>
          </div>
        </section>

        <section className="mt-4" aria-labelledby="appearance-heading">
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

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || uploading}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[12px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onLogout();
          }}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger/5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={15} />
          Sign out
        </button>

        <div className="mt-4">
          <DeveloperCard variant="compact" />
        </div>
      </div>
    </Modal>
  );
}
