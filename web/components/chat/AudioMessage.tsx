'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { mediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/types';

function waveformBars(seed: string, count = 40): number[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Array.from({ length: count }, (_, index) => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const base = 28 + (Math.abs(hash) % 58);
    const shape = Math.sin((index / count) * Math.PI) * 12;
    return Math.min(98, base + shape);
  });
}

export function AudioMessage({
  attachment,
  mine,
  messageId,
}: {
  attachment: Attachment;
  mine: boolean;
  messageId: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(attachment.duration || 0);
  const bars = useMemo(() => waveformBars(messageId), [messageId]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const onTime = () => setCurrent(element.currentTime || 0);
    const onMetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        setDuration(element.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);

    element.addEventListener('timeupdate', onTime);
    element.addEventListener('loadedmetadata', onMetadata);
    element.addEventListener('durationchange', onMetadata);
    element.addEventListener('ended', onEnd);
    element.addEventListener('pause', onPause);
    element.addEventListener('play', onPlay);

    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('loadedmetadata', onMetadata);
      element.removeEventListener('durationchange', onMetadata);
      element.removeEventListener('ended', onEnd);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('play', onPlay);
    };
  }, []);

  function toggle() {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => undefined);
    else element.pause();
  }

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    const element = audioRef.current;
    if (!element || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const percentage = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    element.currentTime = percentage * duration;
    setCurrent(percentage * duration);
  }

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div className="flex w-[252px] max-w-full items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
          mine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-accent text-white hover:bg-accent-hover',
        )}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <button
        type="button"
        onClick={seek}
        aria-label="Seek voice message"
        className="flex h-9 flex-1 items-center gap-[2px]"
      >
        {bars.map((height, index) => {
          const filled = index / bars.length <= progress;
          return (
            <span
              key={index}
              style={{ height: `${height}%` }}
              className={cn(
                'flex-1 rounded-full transition-colors duration-150',
                filled
                  ? mine
                    ? 'bg-white'
                    : 'bg-accent'
                  : mine
                    ? 'bg-white/30'
                    : 'bg-line-strong',
              )}
            />
          );
        })}
      </button>

      <span
        className={cn(
          'w-16 shrink-0 text-right text-[10px] tabular-nums',
          mine ? 'text-white/70' : 'text-faint',
        )}
      >
        {formatDuration(playing || current > 0 ? current : duration)}
      </span>

      <audio ref={audioRef} src={mediaUrl(attachment.url)} preload="metadata" />
    </div>
  );
}
