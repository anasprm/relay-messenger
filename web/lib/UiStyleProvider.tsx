'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type UiStyle = 'official' | 'minimal';

interface UiStyleContextValue {
  style: UiStyle;
  mounted: boolean;
  setStyle: (style: UiStyle) => void;
  toggleStyle: () => void;
}

const UiStyleContext = createContext<UiStyleContextValue | null>(null);

const STORAGE_KEY = 'relay.ui';

function applyUiStyle(style: UiStyle) {
  document.documentElement.dataset.ui = style;
}

/** The formal site opens flat and quiet; the WhatsApp-style site opens rounded. */
function defaultStyleForSite(): UiStyle {
  if (typeof document === 'undefined') return 'official';
  return document.documentElement.dataset.site === 'formal' ? 'minimal' : 'official';
}

export function UiStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<UiStyle>('official');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }

    const initial: UiStyle =
      stored === 'minimal' || stored === 'official' ? stored : defaultStyleForSite();
    setStyleState(initial);
    applyUiStyle(initial);
    setMounted(true);
  }, []);

  const setStyle = useCallback((next: UiStyle) => {
    setStyleState(next);
    applyUiStyle(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleStyle = useCallback(() => {
    setStyle(style === 'official' ? 'minimal' : 'official');
  }, [setStyle, style]);

  const value = useMemo(
    () => ({ style, mounted, setStyle, toggleStyle }),
    [style, mounted, setStyle, toggleStyle],
  );

  return <UiStyleContext.Provider value={value}>{children}</UiStyleContext.Provider>;
}

export function useUiStyle(): UiStyleContextValue {
  const context = useContext(UiStyleContext);
  if (!context) throw new Error('useUiStyle must be used inside UiStyleProvider');
  return context;
}
