import { ChatInterface } from '@/components/chat-interface';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground shadow">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold font-headline">Ops-Copilot</h1>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        <ChatInterface />
      </main>
    </div>
  );
}
