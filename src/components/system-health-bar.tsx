'use client';

import { ShieldCheck, Database, GitBranch, Circle } from 'lucide-react';

export function SystemHealthBar() {
  return (
    <div className="bg-white border-b">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center justify-start gap-8 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <span>AI Model:</span>
            <span className="font-semibold text-slate-800">Gemini Pro</span>
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            <span className="text-emerald-500 font-semibold">Active</span>
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-500" />
            <span>DB Latency:</span>
            <span className="font-semibold text-slate-800">120ms</span>
          </div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-500" />
            <span>KB Version:</span>
            <span className="font-semibold text-slate-800">v1.0.4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
