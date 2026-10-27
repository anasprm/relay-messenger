'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'relay.emoji.recent';

const GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🙂', '🙃', '😉', '😊', '😇',
      '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝',
      '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
      '😬', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵',
      '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥺', '😢', '😭', '😤', '😡', '🤬',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜',
      '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🫶',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '✨', '⭐', '🌟', '🔥', '🎉',
      '🎊', '🥂', '🍻', '☕', '🌹', '🌸', '🌈', '☀️',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '📎', '📷', '🎥', '🎙️', '🎧', '🎵', '📝', '📌', '📍', '🔒', '🔑', '💡',
      '🚀', '⚡', '✅', '❌', '⚠️', '💬', '📱', '💻', '🖥️', '⌚', '📅', '⏰',
      '🎯', '🏆', '🎁', '🍕', '🍔', '🍰', '🍎', '🥳',
    ],
  },
];

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(RECENT_KEY);
    const parsed = value ? (JSON.parse(value) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 16) : [];
  } catch {
    return [];
  }
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  className?: string;
}

export function EmojiPicker({ onSelect, onClose, align = 'left', className }: EmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    if (recent.length === 0) return GROUPS;
    return [{ label: 'Recent', emojis: recent }, ...GROUPS];
  }, [recent]);

  function choose(emoji: string) {
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 16);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage is optional */
    }
    onSelect(emoji);
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Choose an emoji"
      className={cn(
        'absolute bottom-full z-50 mb-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-elevated shadow-[0_20px_55px_-20px_rgba(15,23,42,0.45)] animate-pop-in',
        align === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          Emoji
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:bg-panel-2 hover:text-ink"
          aria-label="Close emoji picker"
        >
          <X size={13} />
        </button>
      </div>
      <div className="scrollbar-thin max-h-[248px] overflow-y-auto px-2 pb-2 pt-1">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className="px-1 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
              {group.label}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => (
                <button
                  key={`${group.label}-${emoji}`}
                  type="button"
                  onClick={() => choose(emoji)}
                  aria-label={emoji}
                  title={emoji}
                  className="flex h-8 w-full items-center justify-center rounded-md text-[18px] leading-none transition-colors hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
