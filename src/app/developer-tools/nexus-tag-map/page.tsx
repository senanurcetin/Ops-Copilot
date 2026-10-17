'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { readLocalNexusTagMap } from '@/lib/nexus-tag-map-file';
import type { ParsedTagMap } from '@/lib/nexus-tag-map';

/**
 * Local, read-only viewer: never uploads JSON or puts it in Firebase, model
 * prompts, browser storage, URL parameters, or telemetry. No plant control.
 */
export default function NexusTagMapViewer() {
  const [map, setMap] = useState<ParsedTagMap | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const selection = useRef(0);

  async function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow the same file to be selected after rejection or clearing.
    event.target.value = '';
    const requestId = ++selection.current;
    setMap(null);
    setFilter('');
    setError('');
    if (!file) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const parsed = await readLocalNexusTagMap(file);
      if (requestId === selection.current) setMap(parsed);
    } catch (cause) {
      if (requestId === selection.current) {
        setError(cause instanceof Error ? cause.message : 'Cannot read the JSON file.');
      }
    } finally {
      if (requestId === selection.current) setLoading(false);
    }
  }

  function clear() {
    ++selection.current;
    setLoading(false);
    setMap(null);
    setError('');
    setFilter('');
  }

  const shown = map?.tags.filter(item =>
    item.tag.toLowerCase().includes(filter.toLowerCase()) ||
    item.description.toLowerCase().includes(filter.toLowerCase())
  ) ?? [];
  const displayed = shown.slice(0, 100);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link className="text-sm text-cyan-300 underline underline-offset-4 hover:text-cyan-200" href="/">
          Back to Ops-Copilot
        </Link>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">NEXUS Tag Map v1</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Inspect a Vision2DCS-reviewed engineering concept locally. This page
            does not upload, synchronize or save the file. It does not connect
            to a plant, operate equipment or certify engineering accuracy.
          </p>
        </header>

        <section aria-labelledby="local-file-title" className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 id="local-file-title" className="font-semibold">Open a local JSON export</h2>
          <label className="block space-y-2 text-sm">
            <span className="text-slate-300">Choose a NEXUS Tag Map v1 file (maximum 1 MiB)</span>
            <input
              aria-label="NEXUS Tag Map JSON file"
              type="file"
              accept=".json,application/json"
              onChange={onSelect}
              className="block w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            />
          </label>
          <button type="button" onClick={clear} className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800">
            Clear local view
          </button>
          {loading && <p role="status" className="text-sm text-cyan-300">Checking the local file…</p>}
          {error && <p role="alert" className="text-sm text-amber-300">File rejected: {error}</p>}
        </section>

        {map && (
          <section aria-labelledby="tag-map-title" className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5">
            <div className="space-y-1">
              <h2 id="tag-map-title" className="text-xl font-semibold">{map.source.projectTitle}</h2>
              <p className="text-sm text-slate-300">
                {map.tags.length} reviewed-concept tags · {map.schema} · {map.generatedAt}
              </p>
              <p className="text-xs text-amber-300">
                Local review is a claim in the exported file, not an authenticated sign-off.
                Independently verify the diagram before using any tag.
              </p>
            </div>
            <label className="block max-w-md space-y-1 text-sm">
              <span>Filter by tag or description</span>
              <input
                type="search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-950 p-2 focus-visible:outline-2 focus-visible:outline-cyan-300"
              />
            </label>
            <p role="status" className="text-xs text-slate-300">
              Showing {displayed.length} of {shown.length} matching tags
              {shown.length > 100 ? ' (first 100; refine the search)' : ''}.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-600 text-cyan-300">
                  <tr>
                    <th scope="col" className="p-2">Tag</th>
                    <th scope="col" className="p-2">Description</th>
                    <th scope="col" className="p-2">Signal</th>
                    <th scope="col" className="p-2">PCS 7 block</th>
                    <th scope="col" className="p-2">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(tag => (
                    <tr key={tag.tag} className="border-b border-slate-800">
                      <th scope="row" className="p-2 font-medium">{tag.tag}</th>
                      <td className="p-2">{tag.description}</td>
                      <td className="p-2">{tag.signalType}</td>
                      <td className="p-2">{tag.pcs7BlockType}</td>
                      <td className="p-2">{tag.engineeringUnits || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length === 0 && <p className="text-sm text-slate-300">No matching tags.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
