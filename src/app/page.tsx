'use client';

import { useState } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarTrigger,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { handleUploadManual } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { ChatInterface } from '@/components/chat-interface';
import { ContextInspector } from '@/components/context-inspector';
import { SystemHealthBar } from '@/components/system-health-bar';
import { Bot, Home as HomeIcon, Upload, RotateCcw } from 'lucide-react';
import type { Document as DocumentType, ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

const initialMessage: ChatMessage = {
  id: 'initial-welcome',
  role: 'assistant',
  content: 'Welcome to Ops-Copilot! Use the sidebar to load a knowledge base, or ask a question if one is already loaded.'
};


export default function Home() {
  const [selectedSource, setSelectedSource] = useState<DocumentType | null>(null);
  const [selectedKeyQuote, setSelectedKeyQuote] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const { toast } = useToast();

  const handleSelectSource = (source: DocumentType, keyQuote?: string) => {
    setSelectedSource(source);
    setSelectedKeyQuote(keyQuote || null);
    setInspectorOpen(true);
  };

  const handleUpload = async () => {
    setIsUploading(true);
    toast({
      title: 'Ingesting...',
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
        variant: 'destructive',
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetSession = () => {
    if (window.confirm("Are you sure you want to reset this diagnostic session? All current progress will be lost.")) {
      setMessages([initialMessage]);
      setSelectedSource(null);
      setSelectedKeyQuote(null);
      setInspectorOpen(false);
      toast({
        title: "Session Cleared",
        description: "Your diagnostic session has been reset.",
      });
    }
  };

  return (
    <SidebarProvider defaultOpen>
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar collapsible="icon" className={cn("group-data-[variant=sidebar]:bg-slate-900 text-white border-r border-slate-700")}>
                <SidebarHeader>
                    <div className="flex items-center gap-3 p-2">
                        <div className="bg-indigo-600 p-2 rounded-lg">
                            <Bot className="h-6 w-6 text-white"/>
                        </div>
                        <h1 className="text-xl font-bold group-data-[collapsible=icon]:hidden">Ops-Copilot</h1>
                    </div>
                </SidebarHeader>
                <SidebarContent className="p-2 pt-0">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton isActive tooltip={{children: 'Dashboard'}}>
                                <HomeIcon />
                                <span className="group-data-[collapsible=icon]:hidden">Dashboard</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                    <SidebarGroup className="mt-4">
                        <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Knowledge Base</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <Button variant="secondary" onClick={handleUpload} disabled={isUploading} className="w-full text-slate-800 justify-start group-data-[collapsible=icon]:justify-center">
                                <Upload className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />
                                <span className="group-data-[collapsible=icon]:hidden">{isUploading ? 'Ingesting...' : 'Ingest KB'}</span>
                            </Button>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
            </Sidebar>

            <SidebarInset className="bg-slate-50 !p-0 !m-0">
                <div className="flex flex-col h-screen">
                    <header className="sticky top-0 z-10 flex h-[65px] items-center justify-between border-b bg-white px-4">
                        <div className="flex items-center gap-4">
                            <SidebarTrigger className="md:hidden" />
                            <h1 className="text-xl font-bold">Industrial Operator Dashboard</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleResetSession}
                                className="text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200"
                            >
                                <RotateCcw className="h-5 w-5" />
                                <span className="sr-only">Clear Session</span>
                            </Button>
                        </div>
                    </header>
                    <SystemHealthBar />
                    <main className="flex-1 flex overflow-hidden">
                        <div className="flex-1 flex flex-col">
                            <ChatInterface
                              messages={messages}
                              setMessages={setMessages}
                              onSelectSource={handleSelectSource}
                             />
                        </div>
                        <ContextInspector isOpen={inspectorOpen} setIsOpen={setInspectorOpen} source={selectedSource} keyQuote={selectedKeyQuote} />
                    </main>
                </div>
            </SidebarInset>
        </div>
    </SidebarProvider>
  );
}
