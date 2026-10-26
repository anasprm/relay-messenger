export type Accent = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate';

export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface User {
  id: string;
  username: string;
  displayName: string;
  accent: Accent;
  online: boolean;
  lastSeen: string | null;
  anonymous?: boolean;
}

export interface Attachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  kind?: MessageKind;
  duration?: number;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  sender: User;
  kind: MessageKind;
  text: string;
  attachment: Attachment | null;
  anonymous: boolean;
  ephemeral: boolean;
  reactions: Record<string, string>;
  createdAt: string;
}

export interface Modes {
  anonymity: boolean;
  vanish: boolean;
}

export interface Conversation {
  id: string;
  participants: User[];
  other: User;
  lastMessage: Message | null;
  unreadCount: number;
  modes: Modes;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SendMessagePayload {
  text?: string;
  kind?: MessageKind;
  attachment?: Attachment | null;
}
