import type { Conversation } from './types';

/** Groups are the only threads without a single "other" participant. */
export function isGroupConversation(
  conversation: Conversation | null | undefined,
): boolean {
  return conversation?.kind === 'group';
}

/** The name shown for a thread: the group title, or the contact's name. */
export function conversationName(conversation: Conversation): string {
  if (isGroupConversation(conversation)) return conversation.title || 'Group chat';
  return conversation.other?.displayName || 'Unknown contact';
}

/** How many people in this thread are online right now. */
export function onlineMemberCount(
  conversation: Conversation,
  onlineIds: Set<string>,
): number {
  return conversation.participants.filter(
    (member) => member.online || onlineIds.has(member.id),
  ).length;
}
