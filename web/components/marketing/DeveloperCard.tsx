'use client';

import { AtSign, Code2, Globe, Mail, MapPin, Sparkles } from 'lucide-react';
import { DEVELOPER } from '@/lib/developer';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

interface DeveloperCardProps {
  /** `panel` sits on a page section, `compact` fits inside dialogs. */
  variant?: 'panel' | 'compact';
}

/**
 * "Built by" card. Every optional field comes from lib/developer.ts and is
 * hidden until it is filled in.
 */
export function DeveloperCard({ variant = 'panel' }: DeveloperCardProps) {
  const links = [
    { href: DEVELOPER.website, label: 'Website', icon: Globe },
    { href: DEVELOPER.github, label: 'GitHub', icon: Code2 },
    { href: DEVELOPER.instagram, label: 'Instagram', icon: AtSign },
    { href: DEVELOPER.email ? `mailto:${DEVELOPER.email}` : '', label: 'Email', icon: Mail },
  ].filter((link) => link.href);

  const compact = variant === 'compact';

  return (
    <div
      className={
        compact
          ? 'flex items-start gap-3 rounded-xl border border-line bg-panel-2/60 p-3'
          : 'flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6'
      }
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={
            compact
              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink'
              : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink'
          }
        >
          {initials(DEVELOPER.name)}
        </span>

        <div className="min-w-0">
          <p
            className={
              compact
                ? 'text-[12px] font-semibold leading-tight text-ink'
                : 'text-[14px] font-semibold leading-tight text-ink'
            }
          >
            {DEVELOPER.name}
          </p>
          <p
            className={
              compact
                ? 'mt-0.5 text-[10.5px] text-muted'
                : 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted'
            }
          >
            <span>{DEVELOPER.role}</span>
            {DEVELOPER.location && (
              <span className="inline-flex items-center gap-1 text-faint">
                <MapPin size={10} />
                {DEVELOPER.location}
              </span>
            )}
          </p>

          {DEVELOPER.bio && (
            <p
              className={
                compact
                  ? 'mt-1.5 text-[11px] leading-relaxed text-muted'
                  : 'mt-2 max-w-xl text-[12px] leading-relaxed text-muted'
              }
            >
              {DEVELOPER.bio}
            </p>
          )}

          {links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith('http') ? '_blank' : undefined}
                  rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10.5px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
                >
                  <link.icon size={11} />
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="flex items-center gap-2 self-start rounded-full bg-accent-soft px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent sm:self-auto">
          <Sparkles size={11} />
          Built by
        </div>
      )}
    </div>
  );
}
