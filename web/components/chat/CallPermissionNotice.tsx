'use client';

import { Loader2, MicOff, X } from 'lucide-react';

interface CallPermissionNoticeProps {
  checking?: boolean;
  onDismiss: () => void;
  onRecheck: () => void;
}

/**
 * Shown when the browser already reports camera/microphone as blocked, so the
 * user learns about it before a call fails with an "instant denial".
 */
export function CallPermissionNotice({ checking, onDismiss, onRecheck }: CallPermissionNoticeProps) {
  return (
    <div
      role="status"
      className="mx-3 mb-2 flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-[13px] leading-snug text-amber-900 dark:text-amber-200"
    >
      <MicOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Calls are blocked for this site</p>
        <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/80">
          Your browser is denying camera and microphone access. Open the site controls next to the
          address bar, allow Camera and Microphone, then reload. Messages and uploads keep working.
        </p>
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-600/30 px-2 py-1 text-[12px] font-medium text-amber-900 transition hover:bg-amber-500/15 disabled:opacity-60 dark:text-amber-100"
        >
          {checking ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          Check again
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss call permission notice"
        className="rounded-md p-1 text-amber-800/70 transition hover:bg-amber-500/15 hover:text-amber-900 dark:text-amber-200/70 dark:hover:text-amber-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
