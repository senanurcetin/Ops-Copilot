import { MAX_HISTORY_TURNS, MAX_TURN_CHARS } from '@/lib/chat-constraints';

export type RecentChatMessage = { id?: string; role: string; content: string };

/**
 * Firestore can contain questions longer than the maximum historical turn.
 * Preserve a bounded excerpt of prior messages so one long legitimate
 * question cannot permanently break all subsequent diagnostics requests.
 */
export function boundedChatHistory(messages: readonly RecentChatMessage[]) {
  return messages
    .filter(msg =>
      (msg.role === 'user' || msg.role === 'assistant') &&
      msg.id !== 'initial-welcome' &&
      typeof msg.content === 'string' &&
      Boolean(msg.content.trim()))
    .slice(-MAX_HISTORY_TURNS)
    .map(({ role, content }) => ({
      role: role as 'user' | 'assistant',
      content: content.slice(0, MAX_TURN_CHARS),
    }));
}
