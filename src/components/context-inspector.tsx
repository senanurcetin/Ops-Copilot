'use client';

import { useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Document } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

interface ContextInspectorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  source: Document | null;
  keyQuote: string | null;
}

const Highlight = ({ text, highlight }: { text: string; highlight: string | null }) => {
  const highlightRef = useRef<HTMLSpanElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (highlightRef.current && !scrolled.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolled.current = true;
    }
  }, [highlight]);

  // Reset scrolled ref when source changes
  useEffect(() => {
    scrolled.current = false;
  }, [text]);

  if (!highlight || !text.toLowerCase().includes(highlight.toLowerCase())) {
    return <>{text}</>;
  }
  
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  let firstMatch = true;

  return (
    <>
      {parts.map((part, i) => {
        if (firstMatch && part.toLowerCase() === highlight.toLowerCase()) {
          firstMatch = false;
          return (
            <mark key={i} ref={highlightRef} className="bg-emerald-200/70 rounded px-1">
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
};


const ChecklistContent = ({ content, keyQuote }: { content: string; keyQuote: string | null }) => {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const checklistItemRegex = /^\d+\.\s(.+)/;

  return (
    <div className="space-y-4">
      {lines.map((line, index) => {
        const match = line.match(checklistItemRegex);
        if (match) {
          const id = `step-${index}`;
          return (
            <div key={id} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
              <Checkbox id={id} className="mt-1" />
              <Label htmlFor={id} className="font-normal text-slate-800 flex-1 cursor-pointer">
                 <Highlight text={match[1]} highlight={keyQuote} />
              </Label>
            </div>
          );
        }
        return (
          <p key={index} className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
             <Highlight text={line} highlight={keyQuote} />
          </p>
        );
      })}
    </div>
  );
};


export function ContextInspector({ isOpen, setIsOpen, source, keyQuote }: ContextInspectorProps) {
    
  return (
    <aside
      className={cn(
        "flex-shrink-0 bg-white border-l transition-all duration-300 ease-in-out overflow-hidden",
        isOpen ? "w-[450px]" : "w-0"
      )}
    >
      {isOpen && source && (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Context Inspector</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold text-indigo-600">{source.title}</h3>
                    <p className="text-xs text-gray-500">ID: {source.id}</p>
                  </div>
                   <ChecklistContent content={source.content} keyQuote={keyQuote} />
                </div>
            </ScrollArea>
        </div>
      )}
    </aside>
  );
}
