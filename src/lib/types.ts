export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'loading';
  content: string;
}
