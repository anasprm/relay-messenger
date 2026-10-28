'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';

import { CallOverlay } from './CallOverlay';
import { CallPermissionNotice } from './CallPermissionNotice';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { ContactPanel } from './ContactPanel';
import { MessageList } from './MessageList';
import { ChatLockDialog } from './ChatLockDialog';
import { ContactAliasDialog } from './ContactAliasDialog';
import { ChatLockGate } from './ChatLockGate';
import { NewChatDialog } from './NewChatDialog';
import { ProfileDialog } from './ProfileDialog';
import { Sidebar, type ConversationFilter } from './Sidebar';
import { WelcomePane } from './WelcomePane';
import { Splash } from '@/components/ui/Splash';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { API_URL, api } from '@/lib/api';
import { errorMessage, useAuth } from '@/lib/AuthProvider';
import { readAllDrafts } from '@/lib/drafts';
import { favoritesKey, pinnedKey, readIdSet, writeIdSet } from '@/lib/localSets';
import { createSocket } from '@/lib/socket';
import { useToast } from '@/lib/ToastProvider';
import { useCall } from '@/lib/useCall';
import { useMediaPermission } from '@/lib/useMediaPermission';
import { cn } from '@/lib/utils';
import type { Conversation, Message, MessageKind, Modes, SendMessagePayload } from '@/lib/types';

function activityTime(conversation: Conversation): number {
  return new Date(conversation.lastMessage?.createdAt || conversation.updatedAt).getTime();
}

function sortByActivity(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => activityTime(b) - activityTime(a));
}

export function ChatShell() {
  const router = useRouter();
  const { user, token, loading, logout, refresh } = useAuth();
  const { toast } = useToast();
  const ownerId = user?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageReloadKey, setMessageReloadKey] = useState(0);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);

  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);

  const {
    state: mediaPermission,
    refresh: refreshMediaPermission,
    checking: checkingMediaPermission,
  } = useMediaPermission();
  const [mediaNoticeDismissed, setMediaNoticeDismissed] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    { type: 'unsend'; message: Message } | { type: 'clear' } | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(() => new Set());
  const [lockDialog, setLockDialog] = useState<'set' | 'remove' | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasBusy, setAliasBusy] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeConversationRef = useRef<Conversation | null>(null);
  const activeLockedRef = useRef(false);
  const previousActiveRef = useRef<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [activeId, conversations],
  );

  const activeLocked =
    !!activeConversation?.locked && !unlockedIds.has(activeConversation.id);

  const matches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return [] as Message[];
    return messages.filter(
      (message) =>
        (message.text || '').toLowerCase().includes(needle) ||
        (message.attachment?.name || '').toLowerCase().includes(needle),
    );
  }, [messages, searchQuery]);

  const safeMatchIndex = matches.length === 0 ? 0 : Math.min(matchIndex, matches.length - 1);
  const activeMatch = matches[safeMatchIndex] || null;

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    activeLockedRef.current = activeLocked;
  }, [activeLocked]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  /* A new signed-in user gets a clean local view. */
  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    setMobileThreadOpen(false);
    setInfoOpen(false);
    setProfileOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setMatchIndex(0);
    setFilter('all');
    setUnlockedIds(new Set());
    setLockDialog(null);
    setAliasOpen(false);
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setFavorites(new Set());
      setPinned(new Set());
      setDrafts({});
      return;
    }
    setFavorites(readIdSet(favoritesKey(ownerId)));
    setPinned(readIdSet(pinnedKey(ownerId)));
    setDrafts(readAllDrafts(ownerId));
  }, [ownerId]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setMatchIndex(0);
  }, [activeId]);

  useEffect(() => {
    setMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    setMatchIndex((current) =>
      matches.length === 0 ? 0 : Math.min(current, matches.length - 1),
    );
  }, [matches.length]);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await api.get<{ conversations: Conversation[] }>('/api/conversations');
      setConversations(sortByActivity(response.conversations));
      setOnlineIds((previous) => {
        const next = new Set(previous);
        for (const conversation of response.conversations) {
          if (conversation.other?.online) next.add(conversation.other.id);
        }
        return next;
      });
    } catch {
      /* transient — the socket will refresh again */
    }
  }, []);

  /* Boot: purge stale vanish messages, then load the sidebar. */
  useEffect(() => {
    if (!token || !user) {
      setLoadingConversations(false);
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        await api.post('/api/conversations/purge-ephemeral');
      } catch {
        /* non-fatal */
      }

      try {
        const response = await api.get<{ conversations: Conversation[] }>('/api/conversations');
        if (cancelled) return;

        const list = sortByActivity(response.conversations);
        setConversations(list);
        setOnlineIds((previous) => {
          const next = new Set(previous);
          for (const conversation of list) {
            if (conversation.other?.online) next.add(conversation.other.id);
          }
          return next;
        });
        setActiveId((current) => current || list[0]?.id || null);
      } catch (error) {
        if (!cancelled) toast(errorMessage(error), 'error');
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [toast, token, user?.id]);

  /* Realtime wiring. */
  useEffect(() => {
    if (!token || !user) return;

    const client = createSocket(token);
    socketRef.current = client;
    setSocket(client);

    const onConnect = () => {
      setConnected(true);
      void refreshConversations();
    };

    const onDisconnect = () => setConnected(false);

    const onConnectError = (error: Error) => {
      if (error.message === 'unauthorized') {
        toast('Your session expired. Please sign in again.', 'error');
        logout();
        router.replace('/login');
      }
    };

    const onPresenceSnapshot = ({ online }: { online: string[] }) => {
      const ids = new Set(online);
      setOnlineIds(ids);
      setConversations((previous) =>
        previous.map((conversation) => ({
          ...conversation,
          other: { ...conversation.other, online: ids.has(conversation.other.id) },
        })),
      );
    };

    const onPresenceUpdate = ({
      userId,
      online,
      lastSeen,
    }: {
      userId: string;
      online: boolean;
      lastSeen?: string;
    }) => {
      setOnlineIds((previous) => {
        const next = new Set(previous);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.other.id === userId
            ? {
                ...conversation,
                other: {
                  ...conversation.other,
                  online,
                  lastSeen: lastSeen || conversation.other.lastSeen,
                },
              }
            : conversation,
        ),
      );
    };

    const onMessage = (message: Message) => {
      if (!message?.id || !message.conversationId) return;

      const isActive = activeIdRef.current === message.conversationId;
      if (isActive && !activeLockedRef.current) {
        setMessages((previous) =>
          previous.some((candidate) => candidate.id === message.id)
            ? previous
            : [...previous, message],
        );
        if (message.senderId && message.senderId !== user.id) {
          void api
            .post(`/api/conversations/${message.conversationId}/read`)
            .catch(() => undefined);
        }
      }

      setTyping((previous) =>
        previous[message.conversationId]
          ? { ...previous, [message.conversationId]: false }
          : previous,
      );

      setConversations((previous) => {
        if (!previous.some((conversation) => conversation.id === message.conversationId)) {
          void refreshConversations();
          return previous;
        }

        const next = previous.map((conversation) => {
          if (conversation.id !== message.conversationId) return conversation;
          const unreadCount = isActive
            ? 0
            : message.senderId !== user.id
              ? conversation.unreadCount + 1
              : conversation.unreadCount;
          if (conversation.locked) {
            return { ...conversation, updatedAt: message.createdAt, unreadCount };
          }
          return {
            ...conversation,
            lastMessage: message,
            updatedAt: message.createdAt,
            unreadCount,
          };
        });

        return sortByActivity(next);
      });
    };

    const onMessageUpdate = (message: Message) => {
      setMessages((previous) =>
        previous.map((candidate) => (candidate.id === message.id ? message : candidate)),
      );
      setConversations((previous) =>
        previous.map((conversation) =>
          !conversation.locked && conversation.lastMessage?.id === message.id
            ? { ...conversation, lastMessage: message }
            : conversation,
        ),
      );
    };

    const onMessageDeleted = ({ id }: { id: string }) => {
      setMessages((previous) => previous.filter((message) => message.id !== id));
      void refreshConversations();
    };

    const onPurged = ({ conversationId, ids }: { conversationId: string; ids: string[] }) => {
      if (!ids?.length) return;
      setMessages((previous) => previous.filter((message) => !ids.includes(message.id)));
      setConversations((previous) =>
        previous.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          if (conversation.lastMessage && ids.includes(conversation.lastMessage.id)) {
            return { ...conversation, lastMessage: null };
          }
          return conversation;
        }),
      );
      if (activeIdRef.current === conversationId) {
        toast('Vanish messages were permanently wiped.', 'success');
      }
      void refreshConversations();
    };

    const onModes = ({ conversationId, modes }: { conversationId: string; modes: Modes }) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, modes } : conversation,
        ),
      );
    };

    const onTyping = ({
      conversationId,
      typing: isTyping,
    }: {
      conversationId: string;
      typing: boolean;
    }) => {
      setTyping((previous) => ({ ...previous, [conversationId]: isTyping }));
    };

    const onConversationRefresh = () => {
      void refreshConversations();
    };

    client.on('connect', onConnect);
    client.on('disconnect', onDisconnect);
    client.on('connect_error', onConnectError);
    client.on('presence:snapshot', onPresenceSnapshot);
    client.on('presence:update', onPresenceUpdate);
    client.on('message:new', onMessage);
    client.on('message:update', onMessageUpdate);
    client.on('message:deleted', onMessageDeleted);
    client.on('messages:purged', onPurged);
    client.on('conversation:modes', onModes);
    client.on('typing:update', onTyping);
    client.on('conversation:refresh', onConversationRefresh);

    return () => {
      client.off('connect', onConnect);
      client.off('disconnect', onDisconnect);
      client.off('connect_error', onConnectError);
      client.off('presence:snapshot', onPresenceSnapshot);
      client.off('presence:update', onPresenceUpdate);
      client.off('message:new', onMessage);
      client.off('message:update', onMessageUpdate);
      client.off('message:deleted', onMessageDeleted);
      client.off('messages:purged', onPurged);
      client.off('conversation:modes', onModes);
      client.off('typing:update', onTyping);
      client.off('conversation:refresh', onConversationRefresh);
      client.disconnect();
      if (socketRef.current === client) socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [logout, refreshConversations, router, toast, token, user]);

  /* Load the active thread. */
  useEffect(() => {
    activeIdRef.current = activeId;

    if (!activeId) {
      setMessages([]);
      setMessageError(null);
      setLoadingMessages(false);
      return;
    }

    // A locked thread is not fetched until the PIN unlocks it in this session.
    if (activeLocked) {
      setMessages([]);
      setMessageError(null);
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    setMessageError(null);
    setMessages([]);

    api
      .get<{ messages: Message[]; conversation: Conversation }>(
        `/api/conversations/${activeId}/messages`,
      )
      .then((response) => {
        if (cancelled) return;
        setMessages(response.messages);
        setTyping((previous) => ({ ...previous, [activeId]: false }));
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === activeId
              ? {
                  ...conversation,
                  ...response.conversation,
                  unreadCount: 0,
                  other: {
                    ...response.conversation.other,
                    online: conversation.other.online,
                  },
                }
              : conversation,
          ),
        );
        void api.post(`/api/conversations/${activeId}/read`).catch(() => undefined);
      })
      .catch((error) => {
        if (!cancelled) setMessageError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, activeLocked, messageReloadKey]);

  /* Closing a thread destroys its vanish-mode messages on both sides. */
  useEffect(() => {
    const previous = previousActiveRef.current;
    if (previous && previous !== activeId) {
      void api.post(`/api/conversations/${previous}/purge`).catch(() => undefined);
    }
    previousActiveRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const purgeActiveThread = () => {
      const conversationId = activeIdRef.current;
      if (!conversationId || !token) return;
      try {
        void fetch(`${API_URL}/api/conversations/${conversationId}/purge`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pagehide', purgeActiveThread);
    return () => {
      window.removeEventListener('pagehide', purgeActiveThread);
      purgeActiveThread();
    };
  }, [token]);

  const handleTypingChange = useCallback((isTyping: boolean) => {
    const conversation = activeConversationRef.current;
    const client = socketRef.current;
    if (!conversation || !client) return;
    client.emit('typing', {
      conversationId: conversation.id,
      to: conversation.other.id,
      typing: isTyping,
    });
  }, []);

  const sendMessage = useCallback(
    async (payload: SendMessagePayload): Promise<boolean> => {
      const conversation = activeConversationRef.current;
      if (!conversation) return false;

      try {
        const response = await api.post<{ message: Message }>(
          `/api/conversations/${conversation.id}/messages`,
          payload,
        );

        setMessages((previous) =>
          previous.some((candidate) => candidate.id === response.message.id)
            ? previous
            : [...previous, response.message],
        );
        setConversations((previous) =>
          sortByActivity(
            previous.map((candidate) =>
              candidate.id === conversation.id
                ? {
                    ...candidate,
                    lastMessage: response.message,
                    updatedAt: response.message.createdAt,
                    unreadCount: 0,
                  }
                : candidate,
            ),
          ),
        );
        socketRef.current?.emit('typing', {
          conversationId: conversation.id,
          to: conversation.other.id,
          typing: false,
        });
        return true;
      } catch (error) {
        toast(errorMessage(error), 'error');
        return false;
      }
    },
    [toast],
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        const response = await api.post<{ message: Message }>(
          `/api/messages/${messageId}/reactions`,
          { emoji },
        );
        setMessages((previous) =>
          previous.map((message) => (message.id === messageId ? response.message : message)),
        );
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.lastMessage?.id === messageId
              ? { ...conversation, lastMessage: response.message }
              : conversation,
          ),
        );
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    },
    [toast],
  );

  const viewOnceMessage = useCallback(
    async (message: Message) => {
      try {
        const response = await api.post<{
          url: string;
          name: string;
          mime: string;
          kind: MessageKind;
        }>(`/api/messages/${message.id}/view`);
        setMessages((previous) =>
          previous.map((candidate) =>
            candidate.id === message.id
              ? { ...candidate, attachment: null, viewOnceOpened: true }
              : candidate,
          ),
        );
        return response;
      } catch (error) {
        toast(errorMessage(error), 'error');
        return null;
      }
    },
    [toast],
  );

  const confirmActionNow = useCallback(async () => {
    if (!confirmAction || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.type === 'unsend') {
        await api.delete(`/api/messages/${confirmAction.message.id}`);
        setMessages((previous) =>
          previous.filter((message) => message.id !== confirmAction.message.id),
        );
        toast('Message unsent for everyone.', 'success');
        void refreshConversations();
      } else {
        const conversation = activeConversationRef.current;
        if (conversation) {
          await api.post(`/api/conversations/${conversation.id}/clear`);
          setMessages([]);
          toast('Chat cleared from your copy.', 'success');
          void refreshConversations();
        }
      }
      setConfirmAction(null);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmAction, confirmBusy, refreshConversations, toast]);

  const unlockConversation = useCallback(async (pin: string): Promise<string | null> => {
    const conversation = activeConversationRef.current;
    if (!conversation) return 'No conversation selected.';
    try {
      await api.post(`/api/conversations/${conversation.id}/unlock`, { pin });
      setUnlockedIds((previous) => new Set(previous).add(conversation.id));
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }, []);

  const submitLockPin = useCallback(
    async (pin: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation || !lockDialog) return;

      setLockBusy(true);
      setLockError(null);
      try {
        if (lockDialog === 'set') {
          await api.put(`/api/conversations/${conversation.id}/lock`, { pin });
          setConversations((previous) =>
            previous.map((candidate) =>
              candidate.id === conversation.id
                ? { ...candidate, locked: true, lastMessage: null }
                : candidate,
            ),
          );
          setUnlockedIds((previous) => {
            const next = new Set(previous);
            next.delete(conversation.id);
            return next;
          });
          toast('Chat locked. Your PIN is required to open it.', 'success');
        } else {
          await api.delete(`/api/conversations/${conversation.id}/lock`, { pin });
          setConversations((previous) =>
            previous.map((candidate) =>
              candidate.id === conversation.id ? { ...candidate, locked: false } : candidate,
            ),
          );
          setUnlockedIds((previous) => new Set(previous).add(conversation.id));
          setMessageReloadKey((current) => current + 1);
          toast('Chat lock removed.', 'success');
        }
        setLockDialog(null);
      } catch (error) {
        setLockError(errorMessage(error));
      } finally {
        setLockBusy(false);
      }
    },
    [lockDialog, toast],
  );

  const saveAlias = useCallback(
    async (name: string) => {
      const conversation = activeConversationRef.current;
      if (!conversation) return;

      setAliasBusy(true);
      setAliasError(null);
      try {
        await api.put(`/api/users/me/aliases/${conversation.other.id}`, { name });
        await refreshConversations();
        setMessageReloadKey((key) => key + 1);
        setAliasOpen(false);
        toast(name ? 'Contact renamed for you.' : 'Contact name reset.', 'success');
      } catch (error) {
        setAliasError(errorMessage(error));
      } finally {
        setAliasBusy(false);
      }
    },
    [refreshConversations, toast],
  );

  const updateModes = useCallback(
    async (patch: Partial<Modes>) => {
      const conversation = activeConversationRef.current;
      if (!conversation) return;

      const previousModes = conversation.modes;
      setConversations((previous) =>
        previous.map((candidate) =>
          candidate.id === conversation.id
            ? { ...candidate, modes: { ...candidate.modes, ...patch } }
            : candidate,
        ),
      );

      try {
        const response = await api.patch<{ modes: Modes }>(
          `/api/conversations/${conversation.id}/modes`,
          patch,
        );
        setConversations((previous) =>
          previous.map((candidate) =>
            candidate.id === conversation.id
              ? { ...candidate, modes: response.modes }
              : candidate,
          ),
        );
        if (patch.vanish === true) {
          toast('Vanish mode on — messages sent now are wiped when you leave this thread.', 'success');
        } else if (patch.vanish === false) {
          toast('Vanish mode off — new messages are kept.');
        }
      } catch (error) {
        setConversations((previous) =>
          previous.map((candidate) =>
            candidate.id === conversation.id
              ? { ...candidate, modes: previousModes }
              : candidate,
          ),
        );
        toast(errorMessage(error), 'error');
      }
    },
    [toast],
  );

  const toggleFavorite = useCallback(
    (conversationId: string) => {
      if (!ownerId) return;
      setFavorites((previous) => {
        const next = new Set(previous);
        if (next.has(conversationId)) next.delete(conversationId);
        else next.add(conversationId);
        writeIdSet(favoritesKey(ownerId), next);
        return next;
      });
    },
    [ownerId],
  );

  const togglePin = useCallback(
    (conversationId: string) => {
      if (!ownerId) return;
      setPinned((previous) => {
        const next = new Set(previous);
        if (next.has(conversationId)) next.delete(conversationId);
        else next.add(conversationId);
        writeIdSet(pinnedKey(ownerId), next);
        return next;
      });
    },
    [ownerId],
  );

  const handleDraftChange = useCallback((conversationId: string, text: string) => {
    setDrafts((previous) => {
      const trimmed = text.trim();
      if (!trimmed) {
        if (!(conversationId in previous)) return previous;
        const next = { ...previous };
        delete next[conversationId];
        return next;
      }
      if (previous[conversationId] === text) return previous;
      return { ...previous, [conversationId]: text };
    });
  }, []);

  const startConversation = useCallback(async (username: string) => {
    const response = await api.post<{ conversation: Conversation }>('/api/conversations', {
      username,
    });
    setConversations((previous) =>
      sortByActivity([
        ...previous.filter((conversation) => conversation.id !== response.conversation.id),
        response.conversation,
      ]),
    );
    setActiveId(response.conversation.id);
    setMobileThreadOpen(true);
    setFilter('all');
    setInfoOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setMobileThreadOpen(true);
    setInfoOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const openNewChat = useCallback((query?: string) => {
    setNewChatQuery(query || '');
    setNewChatOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    setMobileThreadOpen(false);
    setInfoOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    const conversationId = activeIdRef.current;
    if (conversationId) {
      void api.post(`/api/conversations/${conversationId}/purge`).catch(() => undefined);
    }
    setActiveId(null);
    setMessages([]);
  }, []);

  const handleLogout = useCallback(() => {
    socketRef.current?.disconnect();
    logout();
    router.replace('/login');
  }, [logout, router]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setMatchIndex(0);
  }, []);

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    setSearchOpen(true);
  }, [closeSearch, searchOpen]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setMatchIndex(0);
  }, []);

  const previousMatch = useCallback(() => {
    if (matches.length === 0) return;
    setMatchIndex((current) => (current - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const nextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setMatchIndex((current) => (current + 1) % matches.length);
  }, [matches.length]);

  const retryMessages = useCallback(() => {
    setMessageReloadKey((current) => current + 1);
  }, []);

  /* Global shortcuts. Ctrl/Cmd+K is scoped to the visible surface. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const key = event.key.toLowerCase();

      if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        const narrow = window.matchMedia('(max-width: 767px)').matches;
        if (activeIdRef.current && (focusMode || (narrow && mobileThreadOpen))) {
          setSearchOpen(true);
        } else {
          setSearchFocusSignal((current) => current + 1);
        }
        return;
      }

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        setNewChatQuery('');
        setNewChatOpen(true);
        return;
      }

      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        setFocusMode((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode, mobileThreadOpen]);

  const {
    call,
    localStream,
    remoteStream,
    start: startCall,
    accept,
    decline,
    end,
    toggleMute,
    toggleCamera,
  } = useCall({
    socket,
    onError: (message) => toast(message, 'error'),
    onInfo: (message) => toast(message),
  });

  const handleAudioCall = useCallback(() => {
    setInfoOpen(false);
    if (activeConversationRef.current) {
      void startCall(activeConversationRef.current, 'audio');
    }
  }, [startCall]);

  const handleVideoCall = useCallback(() => {
    setInfoOpen(false);
    if (activeConversationRef.current) {
      void startCall(activeConversationRef.current, 'video');
    }
  }, [startCall]);

  if (loading || !user) return <Splash label="Preparing your workspace" />;

  const peerOnline = activeConversation
    ? onlineIds.has(activeConversation.other.id) || activeConversation.other.online
    : false;
  const activeTyping = activeConversation ? !!typing[activeConversation.id] : false;

  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <div
        className={cn(
          'min-h-0 w-full shrink-0 border-r border-line md:w-[340px] lg:w-[372px] xl:w-[400px]',
          focusMode ? 'hidden' : mobileThreadOpen ? 'hidden md:flex' : 'flex',
        )}
      >
        <Sidebar
          user={user}
          conversations={conversations}
          activeId={activeId}
          onlineIds={onlineIds}
          typing={typing}
          drafts={drafts}
          favorites={favorites}
          pinned={pinned}
          loading={loadingConversations}
          connected={connected}
          filter={filter}
          focusSearchSignal={searchFocusSignal}
          onFilterChange={setFilter}
          onSelect={selectConversation}
          onNewChat={openNewChat}
          onProfile={() => setProfileOpen(true)}
          onLogout={handleLogout}
          className="w-full"
        />
      </div>

      <main
        className={cn(
          'relative flex min-h-0 min-w-0 flex-1 overflow-hidden',
          focusMode ? 'flex' : mobileThreadOpen ? 'flex' : 'hidden md:flex',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeConversation ? (
            <>
              <ChatHeader
                conversation={activeConversation}
                online={peerOnline}
                typing={activeTyping}
                connected={connected}
                focusMode={focusMode}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                matchCount={matches.length}
                matchIndex={safeMatchIndex}
                onToggleSearch={toggleSearch}
                onSearchQueryChange={handleSearchQueryChange}
                onCloseSearch={closeSearch}
                onPrevMatch={previousMatch}
                onNextMatch={nextMatch}
                onStartAudio={handleAudioCall}
                onStartVideo={handleVideoCall}
                onOpenInfo={() => setInfoOpen((current) => !current)}
                onToggleFocus={() => setFocusMode((current) => !current)}
                onBack={handleBack}
                onClearChat={() => setConfirmAction({ type: 'clear' })}
                onRenameContact={() => {
                  setAliasError(null);
                  setAliasOpen(true);
                }}
                locked={!!activeConversation.locked}
                onLockChat={() => {
                  setLockError(null);
                  setLockDialog('set');
                }}
                onRemoveLock={() => {
                  setLockError(null);
                  setLockDialog('remove');
                }}
              />

              {activeLocked ? (
                <ChatLockGate
                  other={activeConversation.other}
                  online={peerOnline}
                  onUnlock={unlockConversation}
                />
              ) : (
                <div
                  className={cn(
                    'flex min-h-0 flex-1 flex-col transition-colors duration-500',
                    activeConversation.modes.vanish && 'vanish-canvas',
                  )}
                >
                  <MessageList
                    conversationId={activeConversation.id}
                    messages={messages}
                    me={user}
                    other={activeConversation.other}
                    loading={loadingMessages}
                    typing={activeTyping}
                    error={messageError}
                    searchQuery={searchQuery}
                    activeMatchId={activeMatch?.id || null}
                    onRetry={retryMessages}
                    onReact={reactToMessage}
                    onViewOnce={viewOnceMessage}
                    onUnsend={(message) => setConfirmAction({ type: 'unsend', message })}
                  />
                  {mediaPermission === 'denied' && !mediaNoticeDismissed && (
                    <CallPermissionNotice
                      checking={checkingMediaPermission}
                      onDismiss={() => setMediaNoticeDismissed(true)}
                      onRecheck={() => {
                        setMediaNoticeDismissed(false);
                        void refreshMediaPermission();
                      }}
                    />
                  )}
                  <Composer
                    key={activeConversation.id}
                    conversationId={activeConversation.id}
                    draftOwnerId={user.id}
                    vanish={activeConversation.modes.vanish}
                    anonymity={activeConversation.modes.anonymity}
                    onSend={sendMessage}
                    onTypingChange={handleTypingChange}
                    onDraftChange={handleDraftChange}
                  />
                </div>
              )}
            </>
          ) : (
            <WelcomePane onNewChat={() => openNewChat()} />
          )}
        </div>

        {infoOpen && activeConversation && (
          <>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="fixed inset-0 z-[64] bg-slate-950/45 backdrop-blur-[2px] xl:hidden"
              aria-label="Close contact details"
            />
            <ContactPanel
              conversation={activeConversation}
              messages={messages}
              online={peerOnline}
              typing={activeTyping}
              favorite={favorites.has(activeConversation.id)}
              pinned={pinned.has(activeConversation.id)}
              onClose={() => setInfoOpen(false)}
              onStartAudio={handleAudioCall}
              onStartVideo={handleVideoCall}
              onToggleAnonymity={() =>
                void updateModes({ anonymity: !activeConversation.modes.anonymity })
              }
              onToggleVanish={() =>
                void updateModes({ vanish: !activeConversation.modes.vanish })
              }
              onToggleFavorite={() => toggleFavorite(activeConversation.id)}
              onTogglePin={() => togglePin(activeConversation.id)}
              className="fixed inset-y-0 right-0 z-[65] w-[min(22rem,100vw)] max-w-full shadow-[0_30px_80px_-30px_rgba(2,6,23,0.65)] xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shadow-none"
            />
          </>
        )}
      </main>

      <NewChatDialog
        open={newChatOpen}
        initialQuery={newChatQuery}
        onClose={() => {
          setNewChatOpen(false);
          setNewChatQuery('');
        }}
        onStart={startConversation}
      />

      <ProfileDialog
        open={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onLogout={handleLogout}
        onSaved={refresh}
      />

      <ChatLockDialog
        open={!!lockDialog}
        mode={lockDialog || 'set'}
        otherName={activeConversation?.other.displayName || 'this contact'}
        busy={lockBusy}
        error={lockError}
        onClose={() => {
          if (lockBusy) return;
          setLockDialog(null);
          setLockError(null);
        }}
        onSubmit={(pin) => void submitLockPin(pin)}
      />

      <ContactAliasDialog
        open={aliasOpen}
        otherName={activeConversation?.other.displayName || 'this contact'}
        username={activeConversation?.other.username || ''}
        currentName={activeConversation?.other.displayName || ''}
        busy={aliasBusy}
        error={aliasError}
        onClose={() => {
          if (aliasBusy) return;
          setAliasOpen(false);
          setAliasError(null);
        }}
        onSubmit={(name) => void saveAlias(name)}
      />

      <CallOverlay
        call={call}
        localStream={localStream}
        remoteStream={remoteStream}
        onAccept={accept}
        onDecline={decline}
        onEnd={end}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'clear' ? 'Clear this chat?' : 'Unsend this message?'}
        description={
          confirmAction?.type === 'clear'
            ? 'This removes the history from your copy only. The other person keeps their messages, and new messages still arrive.'
            : 'This removes the message for both of you, including any attachment. This cannot be undone.'
        }
        confirmLabel={confirmAction?.type === 'clear' ? 'Clear chat' : 'Unsend'}
        destructive
        busy={confirmBusy}
        onCancel={() => {
          if (confirmBusy) return;
          setConfirmAction(null);
        }}
        onConfirm={() => void confirmActionNow()}
      />
    </div>
  );
}
