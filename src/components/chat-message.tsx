'use client';

import type { ChatMessage as ChatMessageType, Document } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Loader2, Download, BookText } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';

interface ChatMessageProps {
  message: ChatMessageType;
  onSelectSource: (source: Document, keyQuote?: string) => void;
}

export function ChatMessage({ message, onSelectSource }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isLoading = message.role === 'loading';
  const isAssistant = message.role === 'assistant';

  const handleDownload = () => {
    const blob = new Blob([message.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ops-copilot-report-${message.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('flex items-start gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <Avatar className="w-8 h-8 border">
          <AvatarFallback className="bg-slate-900 text-white">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="group relative">
        <div
          className={cn(
            'max-w-2xl rounded-xl p-3 text-sm shadow-sm',
            isUser
              ? 'bg-indigo-600 text-white rounded-br-none'
              : 'bg-white text-slate-800 rounded-bl-none border',
            isLoading && 'p-0 bg-transparent shadow-none border-none'
          )}
        >
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
        
        {isAssistant && !isLoading && (
            <div className="absolute top-0 -right-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                </Button>
            </div>
        )}

        {isAssistant && message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.sources.map((source) => (
              <Button
                key={source.id}
                variant="outline"
                size="sm"
                className="text-xs h-7 bg-white"
                onClick={() => onSelectSource(source, message.keyQuote)}
              >
                <BookText className="mr-1.5 h-3 w-3" />
                Reference: {source.title.length > 20 ? `${source.title.substring(0, 20)}...` : source.title}
              </Button>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-slate-200 text-slate-600">
            <User className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
