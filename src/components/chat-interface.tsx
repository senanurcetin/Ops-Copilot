
'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

import type { ChatMessage as ChatMessageType, Document } from '@/lib/types';
import { handleUserMessage } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from './ui/textarea';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSelectSource: (source: Document, keyQuote?: string) => void;
  isLoading: boolean;
  onDeleteMessage: (messageId: string) => void;
}

export function ChatInterface({ messages, onSelectSource, isLoading, onDeleteMessage }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const viewportRef = useRef<HTMLDivElement>(null);

  const { user } = useUser();
  const firestore = useFirestore();

  const quickActionChips = ["SF LED Error", "Motion Control 16#800D", "Duplicate IP Address", "PID Tuning"];

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const sendMessage = async (messageContent: string) => {
    const question = messageContent.trim();
    if (!question || isSending || !user || !firestore) return;

    setIsSending(true);

    const userMessage: Omit<ChatMessageType, 'id'> = { 
      role: 'user', 
      content: question,
      createdAt: serverTimestamp() as any
    };
    
    const messagesCollection = collection(firestore, `users/${user.uid}/messages`);
    
    // Save user message (fire-and-forget with error handling)
    addDoc(messagesCollection, userMessage).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `users/${user.uid}/messages`,
        operation: 'create',
        requestResourceData: userMessage,
      }));
    });

    try {
      // Prepare history for AI, including the new question
      const historyForAI = messages
        .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.id !== 'initial-welcome')
        .map(({ role, content }) => ({ role: role as 'user' | 'assistant', content }));
      historyForAI.push({ role: 'user', content: question });

      const { answer, sources, keyQuote } = await handleUserMessage(question, historyForAI);

      // Save assistant message (fire-and-forget with error handling)
      const assistantMessage: Omit<ChatMessageType, 'id'> = { 
        role: 'assistant', 
        content: answer, 
        sources, 
        keyQuote,
        createdAt: serverTimestamp() as any 
      };
      addDoc(messagesCollection, assistantMessage).catch(async (serverError) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `users/${user.uid}/messages`,
          operation: 'create',
          requestResourceData: assistantMessage,
        }));
      });

    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not get a response from the AI.",
      });
      // Save an error message to Firestore
      const errorMessage: Omit<ChatMessageType, 'id'> = {
        role: 'assistant',
        content: "I'm sorry, an error occurred. Please try again.",
        createdAt: serverTimestamp() as any
      };
      addDoc(messagesCollection, errorMessage).catch(serverError => {
        console.error("Failed to save error message to firestore", serverError);
      });

    } finally {
      setIsSending(false);
    }
  };

  const handleChipClick = async (chipText: string) => {
    await sendMessage(chipText);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
    setInput('');
  };

  const isPending = isSending || isLoading;

  return (
    <div className="flex-1 flex flex-col h-full w-full max-w-4xl mx-auto py-6 px-4">
      <div className="flex-1 bg-transparent flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" viewportRef={viewportRef}>
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onSelectSource={onSelectSource} onDeleteMessage={onDeleteMessage} />
            ))}
            {isSending && <ChatMessage message={{id: 'sending', role: 'loading', content: '...'}} onSelectSource={() => {}} onDeleteMessage={() => {}} />}
          </div>
          {isLoading && messages.length <= 1 && (
             <div className="flex items-center justify-center pt-10">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
             </div>
          )}
        </ScrollArea>
        <div className="p-4 bg-transparent">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Sparkles className="h-5 w-5 text-slate-400" />
            <span className="text-sm font-medium text-slate-500">Quick Diagnostics:</span>
            {quickActionChips.map(chip => (
              <Button key={chip} variant="outline" size="sm" onClick={() => handleChipClick(chip)} disabled={isPending}>
                {chip}
              </Button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Ask a question about your operations..."
              disabled={isPending}
              className="text-base pr-16 min-h-[48px] rounded-lg shadow-sm"
              rows={1}
            />
            <Button type="submit" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-indigo-600 hover:bg-indigo-700" disabled={!input.trim() || isPending}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
