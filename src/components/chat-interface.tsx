'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import type { ChatMessage as ChatMessageType, Document } from '@/lib/types';
import { handleUserMessage } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from './ui/textarea';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  setMessages: (update: React.SetStateAction<ChatMessageType[]>) => void;
  onSelectSource: (source: Document, keyQuote?: string) => void;
}

export function ChatInterface({ messages, setMessages, onSelectSource }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const viewportRef = useRef<HTMLDivElement>(null);

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
    if (!question || isPending) return;

    const userMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'user', content: question };
    const loadingMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'loading', content: '...' };

    // Prepare chat history for the AI. This should include all messages before the current one.
    const historyForAI = messages
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.id !== 'initial-welcome')
      .map(({ role, content }) => ({ role: role as 'user' | 'assistant', content }));

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setIsPending(true);

    try {
      const { answer, sources, keyQuote } = await handleUserMessage(question, historyForAI);
      const assistantMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'assistant', content: answer, sources, keyQuote };
      setMessages(prev => [...prev.slice(0, -1), assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'assistant', content: "I'm sorry, an error occurred. Please try again." };
      setMessages(prev => [...prev.slice(0, -1), errorMessage]);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not get a response from the AI.",
      });
    } finally {
      setIsPending(false);
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

  return (
    <div className="flex-1 flex flex-col h-full w-full max-w-4xl mx-auto py-6 px-4">
      <div className="flex-1 bg-transparent flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" viewportRef={viewportRef}>
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onSelectSource={onSelectSource} />
            ))}
          </div>
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
