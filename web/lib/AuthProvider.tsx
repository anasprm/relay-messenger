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
import { api, launcherReady, readToken, refreshSession, tokenExpiresAt, writeToken, type ApiError } from './api';
import type { AuthResponse, User } from './types';

/** Renew a session once it is inside its last 10 days (of a 30-day lifetime). */
const SESSION_REFRESH_WINDOW_MS = 20 * 24 * 60 * 60 * 1000;

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string, inviteCode?: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOTICE_KEY = 'relay.authNotice';

/** One-shot message shown on the sign-in screen (e.g. "wrong workspace"). */
export function consumeAuthNotice(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(NOTICE_KEY);
    if (value) window.sessionStorage.removeItem(NOTICE_KEY);
    return value;
  } catch {
    return null;
  }
}

function writeNotice(message: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (message) window.sessionStorage.setItem(NOTICE_KEY, message);
    else window.sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      // A launcher code in the URL must be exchanged before the session is read.
      await launcherReady;
      if (!active) return;

      const stored = readToken();
      if (!stored) {
        setLoading(false);
        return;
      }

      setToken(stored);

      try {
        const response = await api.get<{ user: User }>('/api/auth/me');
        if (!active) return;
        setUser(response.user);

        // Keep an in-use device signed in without a long-lived credential.
        if (tokenExpiresAt(stored) - Date.now() < SESSION_REFRESH_WINDOW_MS) {
          const next = await refreshSession();
          if (next && active) setToken(next);
        }
      } catch (error) {
        if (!active) return;
        // Keep the reason so the sign-in screen can explain a workspace mismatch.
        if (error && typeof error === 'object' && 'message' in error) {
          writeNotice(String((error as ApiError).message));
        }
        writeToken(null);
        setToken(null);
        setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.post<AuthResponse>('/api/auth/login', { username, password });
    writeNotice(null);
    writeToken(response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const register = useCallback(
    async (username: string, password: string, inviteCode?: string) => {
      const response = await api.post<AuthResponse>('/api/auth/register', {
        username,
        password,
        ...(inviteCode ? { inviteCode } : {}),
      });
      writeNotice(null);
      writeToken(response.token);
      setToken(response.token);
      setUser(response.user);
      return response.user;
    },
    [],
  );

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const response = await api.get<{ user: User }>('/api/auth/me');
    setUser(response.user);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as ApiError).message);
  }
  return 'Something went wrong. Please try again.';
}
