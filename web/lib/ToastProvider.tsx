'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'default' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-elevated px-4 py-3 text-sm shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] animate-slide-in',
              item.tone === 'error' && 'border-red-200 dark:border-red-900/60',
              item.tone === 'success' && 'border-emerald-200 dark:border-emerald-900/60',
            )}
            role="status"
          >
            <span
              className={cn(
                'mt-0.5 shrink-0',
                item.tone === 'error' && 'text-red-500',
                item.tone === 'success' && 'text-emerald-500',
                item.tone === 'default' && 'text-accent',
              )}
            >
              {item.tone === 'error' ? (
                <AlertCircle size={16} />
              ) : item.tone === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <p className="flex-1 leading-snug text-ink">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-md p-0.5 text-faint transition-colors hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
