'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '@/lib/types';
import { handleUserMessage, handleUploadManual } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Upload, Play } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { useToast } from '@/hooks/use-toast';

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (viewportRef.current) {
        viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);
  
  const sendMessage = async (messageContent: string) => {
    const question = messageContent.trim();
    if (!question || isPending || isUploading) return;

    const userMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'user', content: question };
    const loadingMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'loading', content: '...' };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setIsPending(true);

    try {
      const answer = await handleUserMessage(question);
      const assistantMessage: ChatMessageType = { id: crypto.randomUUID(), role: 'assistant', content: answer };
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
    setInput('');
  };

  const handleSimulate = async () => {
    const simulatedQuestion = "What does error code 16#8090 on a PLC 1200 mean?";
    await sendMessage(simulatedQuestion);
  };

  const handleUpload = async () => {
    setIsUploading(true);
    toast({
      title: 'Uploading...',
      description: 'Ingesting knowledge base. This may take a moment.',
    });
    try {
      const result = await handleUploadManual();
      if (result.success) {
        toast({
          title: 'Success!',
          description: result.message,
        });
        setMessages([
          { id: crypto.randomUUID(), role: 'assistant', content: 'Knowledge base loaded. How can I help you today?' }
        ]);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  useEffect(() => {
    // Initial message
    setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: 'Welcome to Ops-Copilot! Upload a knowledge base or ask me a question if one is already loaded.' }]);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full w-full max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center justify-end mb-4 gap-2">
        <Button onClick={handleSimulate} disabled={isUploading || isPending}>
          <Play className="mr-2 h-4 w-4" />
          Run Simulation
        </Button>
        <Button onClick={handleUpload} disabled={isUploading || isPending}>
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? 'Uploading...' : 'Upload Manual'}
        </Button>
      </div>
      <div className="flex-1 bg-card border rounded-lg shadow-sm flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" viewportRef={viewportRef}>
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        </ScrollArea>
        <div className="p-4 bg-background/80 backdrop-blur-sm border-t">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your operations..."
              disabled={isPending || isUploading}
              className="text-base"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isPending || isUploading}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
