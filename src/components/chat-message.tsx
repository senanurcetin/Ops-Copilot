
'use client';

import type { ChatMessage as ChatMessageType, Document } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Loader2, Trash2, BookText } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';

interface ChatMessageProps {
  message: ChatMessageType;
  onSelectSource: (source: Document, keyQuote?: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

export function ChatMessage({ message, onSelectSource, onDeleteMessage }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isLoading = message.role === 'loading';
  const isAssistant = message.role === 'assistant';
  const canBeDeleted = (isUser || isAssistant) && message.id !== 'initial-welcome';

  return (
    <div className={cn('group flex w-full items-start gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <Avatar className="h-8 w-8 border">
          <AvatarFallback className="bg-slate-900 text-white">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      )}

      {canBeDeleted && isUser && (
        <div className="flex h-full items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-500"
            onClick={() => onDeleteMessage(message.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="max-w-2xl">
        <div
          className={cn(
            'rounded-xl p-3 text-sm shadow-sm',
            isUser ? 'rounded-br-none bg-indigo-600 text-white' : 'rounded-bl-none border bg-white text-slate-800',
            isLoading && 'border-none bg-transparent p-0 shadow-none'
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

        {isAssistant && message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.sources.map((source) => (
              <Button
                key={source.id}
                variant="outline"
                size="sm"
                className="h-7 bg-white text-xs"
                onClick={() => onSelectSource(source, message.keyQuote)}
              >
                <BookText className="mr-1.5 h-3 w-3" />
                Reference: {source.title.length > 20 ? `${source.title.substring(0, 20)}...` : source.title}
              </Button>
            ))}
          </div>
        )}
      </div>

      {canBeDeleted && isAssistant && (
         <div className="flex h-full items-center opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-500"
            onClick={() => onDeleteMessage(message.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isUser && (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-slate-200 text-slate-600">
            <User className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
