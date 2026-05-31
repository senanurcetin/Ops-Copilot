'use client';

import { ShieldCheck, Database, FolderKanban, Circle } from 'lucide-react';

export function SystemHealthBar() {
  return (
    <div className="bg-white border-b">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center justify-start gap-8 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <span>AI Model:</span>
            <span className="font-semibold text-slate-800">Gemini 2.5 Flash</span>
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            <span className="text-emerald-500 font-semibold">Configured</span>
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-500" />
            <span>Knowledge Store:</span>
            <span className="font-semibold text-slate-800">Firestore-backed</span>
          </div>
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-slate-500" />
            <span>Workspace Scope:</span>
            <span className="font-semibold text-slate-800">Per-user sample KB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
