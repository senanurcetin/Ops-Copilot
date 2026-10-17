'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, deleteDoc, getDocs, doc } from 'firebase/firestore';

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
import { UserNav } from '@/components/user-nav';
import { HomeIcon, Upload, Loader2, RotateCcw, FileJson } from 'lucide-react';
import type { Document as DocumentType, ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const initialMessage: ChatMessage = {
  id: 'initial-welcome',
  role: 'assistant',
  content:
    'Welcome to Ops-Copilot! Load the sample knowledge base from the sidebar, then ask a diagnostic question.',
};

export function OpsDashboard() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedSource, setSelectedSource] = useState<DocumentType | null>(null);
  const [selectedKeyQuote, setSelectedKeyQuote] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const messagesQuery = useMemo(() => {
    if (!user || !firestore) return null;
    return query(collection(firestore, `users/${user.uid}/messages`), orderBy('createdAt', 'asc'));
  }, [user, firestore]);

  const { data: messagesData, loading: messagesLoading } = useCollection(messagesQuery);

  const messages: ChatMessage[] = useMemo(() => {
    if (messagesLoading || !messagesData) return [initialMessage];
    const formattedMessages = messagesData.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    })) as ChatMessage[];
    return formattedMessages.length > 0 ? formattedMessages : [initialMessage];
  }, [messagesData, messagesLoading]);

  const handleSelectSource = useCallback((source: DocumentType, keyQuote?: string) => {
    setSelectedSource(source);
    setSelectedKeyQuote(keyQuote || null);
    setInspectorOpen(true);
  }, []);

  const handleUpload = useCallback(async () => {
    setIsUploading(true);
    toast({
      title: 'Loading sample manual...',
      description: 'The sample knowledge base is being stored for your workspace.',
    });

    try {
      const result = await handleUploadManual();
      if (result.success) {
        toast({
          title: 'Knowledge base ready',
          description: result.message,
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Knowledge Base Load Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const handleResetSession = useCallback(async () => {
    if (!window.confirm('Reset this diagnostic session? All current chat messages will be deleted.')) return;
    if (!user || !firestore) return;

    toast({ title: 'Clearing session...', description: 'Deleting chat messages from your workspace.' });
    try {
      const messagesSnapshot = await getDocs(collection(firestore, `users/${user.uid}/messages`));
      const results = await Promise.allSettled(messagesSnapshot.docs.map((snapshot) => deleteDoc(snapshot.ref)));
      let failures = 0;
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return;
        failures += 1;
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: messagesSnapshot.docs[index].ref.path,
          operation: 'delete',
        }));
      });
      if (failures > 0) {
        toast({
          variant: 'destructive',
          title: 'Session only partially cleared',
          description: `${failures} message(s) could not be removed. Recheck your session and permissions.`,
        });
        return;
      }
      setSelectedSource(null);
      setSelectedKeyQuote(null);
      setInspectorOpen(false);
      toast({ title: 'Session cleared', description: 'All messages in this diagnostic session were deleted.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Session reset failed',
        description: 'Could not read or remove the chat history. No successful reset is claimed.',
      });
    }
  }, [user, firestore, toast]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!user || !firestore) return;
    const messageRef = doc(firestore, `users/${user.uid}/messages`, messageId);
    try {
      await deleteDoc(messageRef);
      toast({ title: 'Message deleted', description: 'The message was removed from the session.' });
    } catch {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: messageRef.path, operation: 'delete',
      }));
      toast({
        variant: 'destructive',
        title: 'Message not deleted',
        description: 'The delete operation failed. Check your permissions and try again.',
      });
    }
  }, [user, firestore, toast]);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login');
    }
  }, [user, userLoading, router]);

  if (userLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="ops-workspace flex min-h-screen bg-slate-950">
        <Sidebar
          collapsible="icon"
          className={cn('group-data-[variant=sidebar]:bg-slate-900 text-white border-r border-slate-700')}
        >
          <SidebarHeader>
            <div className="flex items-center gap-3 p-2">
              <div className="ops-brand-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                <Image src="/nexus-x.svg" width={36} height={36} alt="" aria-hidden="true" unoptimized />
              </div>
              <div className="group-data-[collapsible=icon]:hidden min-w-0">
                <Image src="/nexus-wordmark.svg" width={100} height={30} alt="NEXUS" unoptimized className="h-7 w-auto" />
                <p className="text-xs font-semibold tracking-wide text-slate-200">Ops-Copilot</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2 pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive tooltip={{ children: 'Dashboard' }}>
                  <HomeIcon />
                  <span className="group-data-[collapsible=icon]:hidden">Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroup className="mt-4">
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Industrial Interoperability</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={{ children: 'NEXUS Tag Map viewer' }}>
                      <Link href="/developer-tools/nexus-tag-map">
                        <FileJson className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">NEXUS Tag Map</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="mt-4">
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Knowledge Base</SidebarGroupLabel>
              <SidebarGroupContent>
                <Button
                  variant="secondary"
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full justify-start text-slate-100 group-data-[collapsible=icon]:justify-center"
                >
                  <Upload className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {isUploading ? 'Loading...' : 'Load Sample KB'}
                  </span>
                </Button>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="ops-shell bg-slate-950 !p-0 !m-0">
          <div className="flex flex-col h-screen">
            <header className="ops-topbar sticky top-0 z-10 flex h-[65px] items-center justify-between border-b bg-white px-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden" />
                <h1 className="text-xl font-bold">Industrial Operator Dashboard</h1>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetSession}
                  className="border border-slate-600 text-slate-200 hover:border-rose-400 hover:bg-rose-900/30 hover:text-rose-200"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span className="sr-only">Clear Session</span>
                </Button>
                <UserNav />
              </div>
            </header>
            <SystemHealthBar />
            <main className="ops-main flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col">
                <ChatInterface
                  messages={messages}
                  onSelectSource={handleSelectSource}
                  isLoading={messagesLoading}
                  onDeleteMessage={handleDeleteMessage}
                />
              </div>
              <ContextInspector
                isOpen={inspectorOpen}
                setIsOpen={setInspectorOpen}
                source={selectedSource}
                keyQuote={selectedKeyQuote}
              />
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
