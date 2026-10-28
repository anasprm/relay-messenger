'use client';

import { useCallback, useEffect, useState } from 'react';

export type MediaPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

const NAMES = ['camera', 'microphone'] as const;

async function queryOne(name: string): Promise<MediaPermissionState> {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    return status.state as MediaPermissionState;
  } catch {
    return 'unsupported';
  }
}

/**
 * Any blocked device blocks the call, so a single denial wins. Browsers that do
 * not implement the Permissions API report "unsupported" and we stay quiet.
 */
function combine(states: MediaPermissionState[]): MediaPermissionState {
  if (states.includes('denied')) return 'denied';
  if (states.includes('granted')) return 'granted';
  if (states.every((state) => state === 'unsupported')) return 'unsupported';
  return 'prompt';
}

/**
 * Watches camera and microphone permission for the current origin. Used to warn
 * before a call is attempted, instead of only failing after the user clicks.
 */
export function useMediaPermission() {
  const [state, setState] = useState<MediaPermissionState>('prompt');
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setState(combine(await Promise.all(NAMES.map((name) => queryOne(name)))));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let statuses: PermissionStatus[] = [];

    const update = async () => {
      const next = combine(await Promise.all(NAMES.map((name) => queryOne(name))));
      if (active) setState(next);
    };

    const subscribe = async () => {
      if (!navigator.permissions?.query) return;
      for (const name of NAMES) {
        try {
          const status = await navigator.permissions.query({ name } as PermissionDescriptor);
          if (!active) return;
          statuses.push(status);
          status.addEventListener('change', update);
        } catch {
          /* this browser does not expose that device permission */
        }
      }
    };

    void update();
    void subscribe();

    return () => {
      active = false;
      for (const status of statuses) status.removeEventListener('change', update);
      statuses = [];
    };
  }, []);

  return { state, refresh, checking };
}
