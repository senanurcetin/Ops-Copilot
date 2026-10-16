/**
 * Validate the public chat action boundary before Firestore or model calls.
 * Remote Server Action inputs are untrusted even when TypeScript types exist.
 */
export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export const MAX_QUESTION_CHARS = 4000;
export const MAX_HISTORY_TURNS = 12;
export const MAX_TURN_CHARS = 2000;

export class ChatInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatInputError';
  }
}

export function validateChatInput(
  question: unknown,
  history: unknown,
): { question: string; chatHistory: ChatHistoryItem[] } {
  if (typeof question !== 'string' || !question.trim()) {
    throw new ChatInputError('Please ask a question.');
  }
  const cleanQuestion = question.trim();
  if (cleanQuestion.length > MAX_QUESTION_CHARS) {
    throw new ChatInputError('The question is too long. Please shorten it.');
  }
  if (!Array.isArray(history)) {
    throw new ChatInputError('Invalid chat history.');
  }
  // Keep the newest turns without an unbounded transcript in the model.
  const recent = history.slice(-MAX_HISTORY_TURNS);
  const cleanHistory: ChatHistoryItem[] = recent.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ChatInputError('Invalid chat history.');
    }
    const item = entry as Record<string, unknown>;
    if ((item.role !== 'user' && item.role !== 'assistant') ||
        typeof item.content !== 'string' ||
        !item.content.trim() ||
        item.content.length > MAX_TURN_CHARS) {
      throw new ChatInputError('Invalid chat history.');
    }
    return { role: item.role, content: item.content };
  });
  return { question: cleanQuestion, chatHistory: cleanHistory };
}
