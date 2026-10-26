'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import {
  Ghost,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { CallOverlay } from './CallOverlay';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { NewChatDialog } from './NewChatDialog';
import { Sidebar } from './Sidebar';
import { Splash } from '@/components/ui/Splash';
import { API_URL, api } from '@/lib/api';
import { errorMessage, useAuth } from '@/lib/AuthProvider';
import { createSocket } from '@/lib/socket';
import { useToast } from '@/lib/ToastProvider';
import { useCall } from '@/lib/useCall';
import { cn } from '@/lib/utils';
import type { Conversation, Message, Modes, SendMessagePayload } from '@/lib/types';

function activityTime(conversation: Conversation): number {
  return new Date(conversation.lastMessage?.createdAt || conversation.updatedAt).getTime();
}

function sortByActivity(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => activityTime(b) - activityTime(a));
}

function EmptyPane({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
      <div className="brand-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-accent shadow-sm">
          <MessagesSquare size={24} />
        </span>
        <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Your workspace, focused.
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Select a direct thread from the sidebar, or start a new conversation with any username in
          the workspace.
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-4 text-[12px] font-semibold text-white shadow-[0_12px_28px_-14px_rgba(79,70,229,0.9)] transition-colors hover:bg-accent-hover"
        >
          <MessageSquarePlus size={14} />
          New conversation
        </button>

        <div className="mt-9 grid gap-2 text-left text-[10.5px] text-faint">
          {[
            { icon: Zap, label: 'Realtime delivery over Socket.io' },
            { icon: ShieldCheck, label: 'Anonymity and vanish-mode controls' },
            { icon: Lock, label: 'Peer-to-peer encrypted calls' },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-2">
              <Icon size={11} className="text-accent" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatShell() {
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeConversationRef = useRef<Conversation | null>(null);
  const previousActiveRef = useRef<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [activeId, conversations],
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

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
      if (isActive) {
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
          return {
            ...conversation,
            lastMessage: message,
            updatedAt: message.createdAt,
            unreadCount: isActive
              ? 0
              : message.senderId !== user.id
                ? conversation.unreadCount + 1
                : conversation.unreadCount,
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
          conversation.lastMessage?.id === message.id
            ? { ...conversation, lastMessage: message }
            : conversation,
        ),
      );
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
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
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
        if (!cancelled) toast(errorMessage(error), 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, toast]);

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
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setMobileThreadOpen(true);
  }, []);

  const openNewChat = useCallback((query?: string) => {
    setNewChatQuery(query || '');
    setNewChatOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    setMobileThreadOpen(false);
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
    if (activeConversationRef.current) {
      void startCall(activeConversationRef.current, 'audio');
    }
  }, [startCall]);

  const handleVideoCall = useCallback(() => {
    if (activeConversationRef.current) {
      void startCall(activeConversationRef.current, 'video');
    }
  }, [startCall]);

  if (loading || !user) return <Splash label="Preparing your workspace" />;

  const peerOnline = activeConversation
    ? onlineIds.has(activeConversation.other.id) || activeConversation.other.online
    : false;

  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <div
        className={cn(
          'min-h-0 w-full shrink-0 border-r border-line md:flex md:w-[330px] lg:w-[348px]',
          mobileThreadOpen ? 'hidden' : 'flex',
        )}
      >
        <Sidebar
          user={user}
          conversations={conversations}
          activeId={activeId}
          onlineIds={onlineIds}
          typing={typing}
          loading={loadingConversations}
          connected={connected}
          onSelect={selectConversation}
          onNewChat={openNewChat}
          onLogout={handleLogout}
          className="w-full"
        />
      </div>

      <main
        className={cn(
          'min-w-0 flex-1 flex-col',
          mobileThreadOpen ? 'flex' : 'hidden md:flex',
        )}
      >
        {activeConversation ? (
          <>
            <ChatHeader
              conversation={activeConversation}
              me={user}
              online={peerOnline}
              typing={!!typing[activeConversation.id]}
              connected={connected}
              onToggleAnonymity={() =>
                void updateModes({ anonymity: !activeConversation.modes.anonymity })
              }
              onToggleVanish={() => void updateModes({ vanish: !activeConversation.modes.vanish })}
              onStartAudio={handleAudioCall}
              onStartVideo={handleVideoCall}
              onBack={handleBack}
            />

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
                typing={!!typing[activeConversation.id]}
                onReact={reactToMessage}
              />
              <Composer
                key={activeConversation.id}
                vanish={activeConversation.modes.vanish}
                anonymity={activeConversation.modes.anonymity}
                onSend={sendMessage}
                onTypingChange={handleTypingChange}
              />
            </div>
          </>
        ) : (
          <EmptyPane onNewChat={() => openNewChat()} />
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

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel/90 px-3 py-1.5 text-[9px] text-faint shadow-sm backdrop-blur md:flex">
        <Ghost size={10} />
        Privacy controls are per-thread
        <span className="h-2.5 w-px bg-line" />
        <ShieldCheck size={10} />
        Identity masking enforced server-side
      </div>
    </div>
  );
}
