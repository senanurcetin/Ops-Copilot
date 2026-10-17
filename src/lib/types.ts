import { Timestamp, type FieldValue } from "firebase/firestore";

export interface Document {
  id: string;
  title: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'loading';
  content: string;
  sources?: Document[];
  keyQuote?: string;
  evidenceStatus?: 'verified-quote' | 'no-verified-quote';
  createdAt?: Timestamp | Date | FieldValue;
}
