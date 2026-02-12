'use client';

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Document } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ContextInspectorProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  source: Document | null;
}

export function ContextInspector({ isOpen, setIsOpen, source }: ContextInspectorProps) {
  return (
    <aside
      className={cn(
        "flex-shrink-0 bg-white border-l transition-all duration-300 ease-in-out overflow-hidden",
        isOpen ? "w-96" : "w-0"
      )}
    >
      {isOpen && source && (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Context Inspector</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold text-indigo-600">Source: {source.title}</h3>
                    <p className="text-xs text-gray-500">ID: {source.id}</p>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{source.content}</p>
                </div>
            </ScrollArea>
        </div>
      )}
    </aside>
  );
}
