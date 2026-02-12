'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Document } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X, ClipboardCheck } from "lucide-react";
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';

interface ContextInspectorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  source: Document | null;
  keyQuote: string | null;
}

const Highlight = ({ text, highlight }: { text: string; highlight: string | null }) => {
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = highlightRef.current;
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Apply a temporary highlight that fades
      element.classList.add('bg-yellow-200', 'transition-colors', 'duration-1000', 'ease-out');
      const timer = setTimeout(() => {
        element.classList.remove('bg-yellow-200');
      }, 2000); // Highlight stays for 2s, then fades over 1s

      return () => clearTimeout(timer);
    }
  }, [highlight, text]); // Rerun when the source text or quote changes

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
            <mark key={i} ref={highlightRef} className="bg-transparent rounded-sm px-0.5">
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
};


const ChecklistContent = ({ content, keyQuote, documentId }: { content: string; keyQuote: string | null; documentId: string }) => {
  const { toast } = useToast();
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const checklistItemRegex = /^\d+\.\s(.+)/;

  const checklistItems = lines
    .map((line, index) => ({ match: line.match(checklistItemRegex), line, index }))
    .filter(({ match }) => match)
    .map(({ match, index }) => ({ id: `step-${index}`, text: match![1] }));
  
  const [checkedState, setCheckedState] = useState<Record<string, boolean>>({});

  // Reset checked state when the document content changes
  useEffect(() => {
    setCheckedState({});
  }, [content]);

  const handleCheckChange = (id: string) => {
    setCheckedState(prev => ({...prev, [id]: !prev[id]}));
  };

  const handleLogProgress = () => {
    const completedSteps = checklistItems
      .filter(item => checkedState[item.id])
      .map(item => item.text);
    
    // For this MVP, we log to the console. In a real app, this would be sent to a backend service.
    console.log("Logging progress for operator: user-123", {
      documentId: documentId,
      completedSteps,
      timestamp: new Date().toISOString()
    });

    toast({
      title: "Progress Logged",
      description: `${completedSteps.length} step(s) have been logged for maintenance records.`
    });
  };

  const isChecklist = checklistItems.length > 0;

  return (
    <div className="space-y-4">
      {lines.map((line, index) => {
        const match = line.match(checklistItemRegex);
        if (match) {
          const id = `step-${index}`;
          const stepText = match[1];
          return (
            <div key={id} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
              <Checkbox 
                id={id} 
                className="mt-1 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                checked={!!checkedState[id]}
                onCheckedChange={() => handleCheckChange(id)}
              />
              <Label htmlFor={id} className="font-normal text-slate-800 flex-1 cursor-pointer">
                 <Highlight text={stepText} highlight={keyQuote} />
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
      {isChecklist && (
        <Button onClick={handleLogProgress} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700">
          <ClipboardCheck className="mr-2 h-4 w-4" />
          Log Progress
        </Button>
      )}
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
                   <ChecklistContent content={source.content} keyQuote={keyQuote} documentId={source.id} />
                </div>
            </ScrollArea>
        </div>
      )}
    </aside>
  );
}
